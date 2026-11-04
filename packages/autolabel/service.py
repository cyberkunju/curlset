"""
Autonomous labelling engine.

Everything the manual wizard does can also be done by models, with humans only where the models
disagree. For each record the engine asks N classifiers, then routes the result:

* **agree** on one label and the mean confidence clears the threshold  -> annotation is created with
  ``origin=ensemble``/``model`` and moved to ``approved`` through an explicit review transition
  (actor ``auto-labeler``, reason recorded). Provenance stays machine-readable; it is *never* labelled
  as human work.
* **disagree** or low confidence -> annotation is created at ``pending_review`` and the record is
  handed to a human (the manual path).

The engine runs on the same job record as generation (``kind="auto_label"``), so it inherits progress,
measured ETA, cancel, heartbeat/staleness and restart recovery.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.annotation_selector import select_active_annotation
from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus, TaskType
from packages.dataset_core.db.models import (
    AnnotationModel,
    AssetModel,
    DatasetModel,
    DatasetRecordModel,
    GenerationJobModel,
    RecordAssetModel,
)
from packages.dataset_core.db.session import get_db_session
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_io.storage import get_storage_backend
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import ProviderError, ProviderRequest

ETA_WINDOW = 20
ETA_MIN_SAMPLES = 5
AUTO_LABELER_ACTOR = "auto-labeler"

_ACTIVE_LOCK = threading.Lock()
_ACTIVE: dict[str, threading.Thread] = {}


@dataclass
class AutoLabelDecision:
    label: str
    agreement: bool
    confidence: float
    n_models: int
    band: str            # auto_accept | human_review
    votes: dict[str, str] = field(default_factory=dict)


def decide(
    labels: list[str],
    confidences: list[float],
    *,
    auto_accept_confidence: float = 0.9,
    require_unanimous: bool = True,
) -> AutoLabelDecision | None:
    """Turn per-model votes into a routing decision (pure function, unit-tested)."""
    pairs = [(str(label), float(conf)) for label, conf in zip(labels, confidences, strict=False) if label]
    if not pairs:
        return None
    tally: dict[str, list[float]] = {}
    for label, confidence in pairs:
        tally.setdefault(label, []).append(confidence)
    winner = max(tally.items(), key=lambda item: (len(item[1]), sum(item[1])))[0]
    agreement = len(tally) == 1 if require_unanimous else len(tally[winner]) > len(pairs) / 2
    confidence = sum(tally[winner]) / len(tally[winner])
    band = "auto_accept" if (agreement and confidence >= auto_accept_confidence) else "human_review"
    votes = {str(index): label for index, (label, _conf) in enumerate(pairs)}
    return AutoLabelDecision(
        label=winner,
        agreement=agreement,
        confidence=round(confidence, 6),
        n_models=len(pairs),
        band=band,
        votes=votes,
    )


def _labels(dataset: DatasetModel) -> list[str]:
    schema = dataset.label_schema or {}
    return [str(label) for label in (schema.get("labels") or schema.get("classes") or [])]


def _primary_asset_keys(session: Session, dataset_id: str) -> dict[str, str]:
    """Map record -> storage key of its primary image asset (empty for pure-text datasets)."""
    rows = session.execute(
        select(RecordAssetModel.record_id, AssetModel.storage_key)
        .join(AssetModel, AssetModel.id == RecordAssetModel.asset_id)
        .where(AssetModel.dataset_id == dataset_id)
    ).all()
    return {record_id: storage_key for record_id, storage_key in rows}


def _records_needing_labels(session: Session, dataset_id: str, limit: int) -> list[str]:
    records = list(session.scalars(
        select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset_id)
        .order_by(DatasetRecordModel.created_at.asc())
        .limit(min(limit, 2000))
    ).all())
    rows = session.scalars(
        select(AnnotationModel).where(AnnotationModel.dataset_id == dataset_id)
    ).all()
    by_record: dict[str, list[AnnotationModel]] = {}
    for row in rows:
        by_record.setdefault(row.record_id, []).append(row)
    targets: list[str] = []
    for record in records:
        active = select_active_annotation(by_record.get(record.id))
        if active is not None and active.status == ReviewStatus.APPROVED.value:
            continue
        targets.append(record.id)
    return targets


def create_auto_label_job(
    session: Session,
    *,
    dataset_id: str,
    providers: list[dict[str, str]],
    auto_accept_confidence: float = 0.9,
    limit: int = 200,
    require_unanimous: bool = True,
) -> GenerationJobModel:
    """Queue an autonomous-labelling run over records that are not yet approved."""
    dataset = session.get(DatasetModel, dataset_id)
    if not dataset:
        raise ResourceNotFoundError("Dataset", dataset_id)
    if dataset.task_type not in {TaskType.TEXT_CLASSIFICATION.value, TaskType.IMAGE_CLASSIFICATION.value}:
        raise DomainValidationError(
            "Autonomous labelling currently supports classification datasets.", field="task_type"
        )
    if not providers:
        raise DomainValidationError("Choose at least one labelling model.", field="providers")
    classes = _labels(dataset)
    if not classes:
        raise DomainValidationError(
            "This dataset has no classes, so labels cannot be assigned.", field="label_schema"
        )

    targets = _records_needing_labels(session, dataset_id, limit)
    job = GenerationJobModel(
        id=generate_id("job"),
        project_id=dataset.project_id,
        dataset_id=dataset_id,
        dataset_name=dataset.name,
        kind="auto_label",
        prompt=f"Autonomous labelling of {len(targets)} record(s)",
        task_type=dataset.task_type,
        status="pending",
        total_items=len(targets),
        processed_items=0,
        phase="queued",
        config_json={
            "providers": providers[:3],
            "task_type": dataset.task_type,
            "auto_accept_confidence": auto_accept_confidence,
            "require_unanimous": require_unanimous,
            "classes": classes,
            "record_ids": [],
        },
    )
    session.add(job)
    session.flush()
    return job


# ------------------------------------------------------------------ runner ----

@dataclass
class _Progress:
    started: float = field(default_factory=time.monotonic)
    stamps: list[float] = field(default_factory=list)

    def mark(self) -> None:
        self.stamps.append(time.monotonic())
        if len(self.stamps) > ETA_WINDOW:
            del self.stamps[:-ETA_WINDOW]

    def eta(self, done: int, total: int) -> int | None:
        if done < ETA_MIN_SAMPLES or done >= total or len(self.stamps) < 2:
            return None
        span = self.stamps[-1] - self.stamps[0]
        if span <= 0:
            return None
        rate = (len(self.stamps) - 1) / span
        return max(1, round((total - done) / rate)) if rate > 0 else None


def _update(job_id: str, tracker: _Progress, *, done: int | None = None,
            status: str | None = None, result: dict[str, Any] | None = None,
            error: str | None = None, phase: str | None = None) -> None:
    with get_db_session() as session:
        job = session.get(GenerationJobModel, job_id)
        if not job:
            return
        total = int(job.total_items or 0)
        processed = int(job.processed_items or 0) if done is None else done
        job.processed_items = processed
        job.elapsed_seconds = round(time.monotonic() - tracker.started, 2)
        job.eta_seconds = tracker.eta(processed, total)
        job.updated_at = datetime.now(UTC)
        if phase is not None:
            job.phase = phase
        elif status is None or status == "running":
            job.phase = "labelling"
        if status is not None:
            job.status = status
        if result is not None:
            job.result_json = result
        if error is not None:
            job.error_message = error[:2000]
        if status in {"completed", "failed", "cancelled", "interrupted"}:
            job.finished_at = datetime.now(UTC)


def run_auto_label_job(job_id: str) -> None:
    tracker = _Progress()
    with get_db_session() as session:
        job = session.get(GenerationJobModel, job_id)
        if not job:
            return
        config = dict(job.config_json or {})
        dataset_id = job.dataset_id
        providers = list(config.get("providers") or [])
        classes = list(config.get("classes") or [])
        threshold = float(config.get("auto_accept_confidence") or 0.9)
        require_unanimous = bool(config.get("require_unanimous", True))
        task_type = str(config.get("task_type") or TaskType.TEXT_CLASSIFICATION.value)
        asset_keys = _primary_asset_keys(session, dataset_id)
        targets = _records_needing_labels(session, dataset_id, int(job.total_items or 200))
        job.total_items = len(targets)
        job.phase = "checking models"

    _update(job_id, tracker, done=0, status="running", phase="checking models")

    gateway = ProviderGateway.get_instance()
    # Probe with a real asset when the dataset is image-based: text-only models must fail here
    # rather than on the first record.
    probe_bytes: bytes | None = None
    if asset_keys:
        try:
            probe_bytes = get_storage_backend().read_bytes(next(iter(asset_keys.values())))
        except Exception:  # noqa: BLE001 - probe without bytes; the model may still answer
            probe_bytes = None

    healthy: list[dict[str, str]] = []
    errors: dict[str, str] = {}
    for ref in providers:
        try:
            provider = gateway.get_provider(str(ref.get("provider")))
            provider.annotate(ProviderRequest(
                model=str(ref.get("model")),
                task_type=task_type,
                input_text=None if probe_bytes else "ok",
                asset_bytes=probe_bytes,
                label_schema={"labels": classes},
            ))
            healthy.append(ref)
        except ProviderError as exc:
            errors[str(ref.get("provider"))] = str(exc.message)[:140]

    if not healthy:
        detail = "; ".join(f"{name}: {message}" for name, message in errors.items())
        _update(job_id, tracker, status="failed",
                error=f"No labelling model responded ({detail}). Configure a working key or use simulated models.",
                phase="failed")
        return

    auto_approved = 0
    needs_review = 0
    failed = 0
    processed = 0
    error_samples: list[str] = []
    _update(job_id, tracker, status="running", phase="labelling")

    class _Cancelled(Exception):
        """Raised when the job was cancelled between records."""

    for record_id in targets:
        # 1) short read: cancellation state + the record text (no write transaction held)
        try:
            with get_db_session() as session:
                job = session.get(GenerationJobModel, job_id)
                if job is None or job.status in {"cancelling", "cancelled"}:
                    raise _Cancelled
                record = session.get(DatasetRecordModel, record_id)
                text = str((record.extra_metadata or {}).get("text") or "") if record else ""
                storage_key = asset_keys.get(record_id)
        except _Cancelled:
            _update(job_id, tracker, done=processed, status="cancelled",
                    result={"accepted": auto_approved, "auto_approved": auto_approved,
                            "needs_review": needs_review, "failed": failed, "error_samples": error_samples,
                            "verdict": "accept" if auto_approved else "reject"},
                    phase="cancelled")
            return

        asset_bytes: bytes | None = None
        if storage_key:
            try:
                asset_bytes = get_storage_backend().read_bytes(storage_key)
            except Exception:  # noqa: BLE001 - a missing asset must not kill the run
                asset_bytes = None
        if not text and asset_bytes is None:
            processed += 1
            continue

        # 2) model calls: deliberately outside any database transaction
        labels: list[str] = []
        confidences: list[float] = []
        for ref in healthy:
            try:
                provider = gateway.get_provider(str(ref.get("provider")))
                response = provider.annotate(ProviderRequest(
                    model=str(ref.get("model")),
                    task_type=task_type,
                    input_text=text or None,
                    # The loaded asset MUST travel with the request; dropping it made every image
                    # look like an empty string, so all records got one identical label.
                    asset_bytes=asset_bytes,
                    label_schema={"labels": classes},
                ))
                label = str((response.payload or {}).get("label") or "")
                if not label:
                    continue
                if classes and label not in classes:
                    # A model that invents a class outside the schema gets no vote: dropping the
                    # whole record for it loses data that the other models may label correctly.
                    continue
                confidence = float((response.payload or {}).get("confidence") or response.confidence or 0.5)
                labels.append(label)
                confidences.append(confidence)
            except ProviderError:
                continue

        decision = decide(
            labels, confidences,
            auto_accept_confidence=threshold,
            require_unanimous=require_unanimous,
        )

        # 3) one short write transaction for this record's annotation
        if decision is None:
            failed += 1
            if len(error_samples) < 5:
                error_samples.append(f"{record_id}: no model returned a label")
        else:
            try:
                with get_db_session() as session:
                    origin = (
                        AnnotationOrigin.ENSEMBLE if decision.n_models > 1 else AnnotationOrigin.MODEL
                    )
                    annotation = AnnotationService.create_annotation(
                        session=session,
                        record_id=record_id,
                        payload={
                            "label": decision.label,
                            "autolabel": {
                                "agreement": decision.agreement,
                                "confidence": decision.confidence,
                                "n_models": decision.n_models,
                                "votes": decision.votes,
                                "band": decision.band,
                                "threshold": threshold,
                            },
                        },
                        origin=origin,
                        status=ReviewStatus.PENDING_REVIEW,
                        confidence=decision.confidence,
                        actor_id=AUTO_LABELER_ACTOR,
                    )
                    if decision.band == "auto_accept":
                        AnnotationService.transition_review_status(
                            session=session,
                            annotation_id=annotation.id,
                            next_status=ReviewStatus.APPROVED,
                            actor_id=AUTO_LABELER_ACTOR,
                            reason=(
                                "Autonomous labelling: models agreed and mean confidence "
                                f"{decision.confidence:.2f} >= {threshold:.2f}"
                            ),
                        )
                        auto_approved += 1
                    else:
                        needs_review += 1
            except Exception as exc:  # noqa: BLE001 - a single bad row must not kill the run
                failed += 1
                if len(error_samples) < 5:
                    error_samples.append(f"{record_id}: {str(exc)[:180]}")

        processed += 1
        tracker.mark()
        if processed % 5 == 0 or processed == len(targets):
            _update(job_id, tracker, done=processed)

    _update(
        job_id,
        tracker,
        done=processed,
        status="completed",
        phase="completed",
        result={
            "accepted": auto_approved,
            "auto_approved": auto_approved,
            "needs_review": needs_review,
            "failed": failed,
            "error_samples": error_samples,
            "verdict": "accept" if auto_approved else "reject",
            "rejection_reasons": [] if auto_approved else [
                "No record met the agreement/confidence bar, so all labels were sent for human review."
            ],
            "label_preservation": None,
            "models": [ref.get("provider") for ref in healthy],
            "threshold": threshold,
        },
    )


def start_auto_label_job(job_id: str) -> None:
    with _ACTIVE_LOCK:
        if job_id in _ACTIVE and _ACTIVE[job_id].is_alive():
            return
        thread = threading.Thread(target=run_auto_label_job, args=(job_id,), daemon=True,
                                  name=f"autolabel-{job_id}")
        _ACTIVE[job_id] = thread
        thread.start()
