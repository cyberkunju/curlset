"""
AI box proposals for object-detection datasets (SAM 3.1 / any OBJECT_DETECTION provider).

For each record the job loads the primary image, asks the provider for boxes for each concept
(one concept per provider call — SAM's contract), and stores the merged result as a
``model``-origin annotation at ``pending_review``. Nothing is auto-approved: proposals exist for a
human to accept, edit or delete in the workbench.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import (
    AnnotationOrigin,
    ReviewStatus,
    TaskType,
)
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
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderError,
    ProviderRequest,
)

MAX_RECORDS_PER_RUN = 50
MAX_CONCEPTS = 3
_ACTIVE_LOCK = threading.Lock()
_ACTIVE: dict[str, threading.Thread] = {}


def _asset_keys(session: Session, dataset_id: str) -> dict[str, tuple[str, dict[str, Any]]]:
    rows = session.execute(
        select(RecordAssetModel.record_id, AssetModel.storage_key, AssetModel.dimensions)
        .join(AssetModel, AssetModel.id == RecordAssetModel.asset_id)
        .where(AssetModel.dataset_id == dataset_id)
    ).all()
    return {record_id: (storage_key, dims or {}) for record_id, storage_key, dims in rows}


def _records_needing_boxes(session: Session, dataset_id: str, limit: int) -> list[str]:
    records = list(session.scalars(
        select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset_id)
        .order_by(DatasetRecordModel.created_at.asc())
        .limit(min(limit, MAX_RECORDS_PER_RUN))
    ).all())
    annotated = set()
    for annotation in session.scalars(
        select(AnnotationModel).where(AnnotationModel.dataset_id == dataset_id)
    ).all():
        if annotation.status == ReviewStatus.APPROVED.value:
            annotated.add(annotation.record_id)
    return [record.id for record in records if record.id not in annotated]


def create_proposal_job(
    session: Session,
    *,
    dataset_id: str,
    concepts: list[str],
    provider: str,
    model: str,
    limit: int = 25,
) -> GenerationJobModel:
    dataset = session.get(DatasetModel, dataset_id)
    if not dataset:
        raise ResourceNotFoundError("Dataset", dataset_id)
    if dataset.task_type != TaskType.OBJECT_DETECTION.value:
        raise DomainValidationError(
            "Box proposals apply to object-detection datasets.", field="task_type"
        )
    labels = [str(label) for label in ((dataset.label_schema or {}).get("labels") or [])]
    cleaned = [str(concept).strip() for concept in concepts if str(concept).strip()]
    if not cleaned:
        cleaned = labels[:MAX_CONCEPTS]
    cleaned = cleaned[:MAX_CONCEPTS]
    if labels:
        unknown = [concept for concept in cleaned if concept not in labels]
        if unknown:
            raise DomainValidationError(
                f"Concept(s) {unknown} are not classes of this dataset ({labels}). "
                "Box labels must match the dataset schema; rename the class or the concept.",
                field="concepts",
            )
    if not cleaned:
        raise DomainValidationError("Provide at least one concept to detect.", field="concepts")
    if any("," in concept for concept in cleaned):
        raise DomainValidationError(
            "SAM takes one concept per request; split comma lists into separate concepts.",
            field="concepts",
        )
    if limit < 1:
        raise DomainValidationError("Ask for at least one record.", field="limit")

    targets = _records_needing_boxes(session, dataset_id, limit)
    job = GenerationJobModel(
        id=generate_id("job"),
        project_id=dataset.project_id,
        dataset_id=dataset_id,
        dataset_name=dataset.name,
        kind="detection_proposals",
        prompt=f"Box proposals for: {', '.join(cleaned)}",
        task_type=dataset.task_type,
        status="pending",
        total_items=len(targets) * len(cleaned),
        processed_items=0,
        phase="queued",
        config_json={
            "concepts": cleaned,
            "provider": provider,
            "model": model,
            "targets": len(targets),
        },
    )
    session.add(job)
    session.flush()
    return job


@dataclass
class _Progress:
    started: float = field(default_factory=time.monotonic)
    stamps: list[float] = field(default_factory=list)

    def mark(self) -> None:
        self.stamps.append(time.monotonic())
        if len(self.stamps) > 20:
            del self.stamps[:-20]

    def eta(self, done: int, total: int) -> int | None:
        if done < 2 or done >= total or len(self.stamps) < 2:
            return None
        span = self.stamps[-1] - self.stamps[0]
        if span <= 0:
            return None
        rate = (len(self.stamps) - 1) / span
        return max(1, round((total - done) / rate)) if rate > 0 else None


def _update(job_id: str, tracker: _Progress, *, done: int | None = None, status: str | None = None,
            result: dict[str, Any] | None = None, error: str | None = None,
            phase: str | None = None) -> None:
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
            job.phase = "detecting boxes"
        if status is not None:
            job.status = status
        if result is not None:
            job.result_json = result
        if error is not None:
            job.error_message = error[:2000]
        if status in {"completed", "failed", "cancelled", "interrupted"}:
            job.finished_at = datetime.now(UTC)


def run_proposal_job(job_id: str) -> None:
    tracker = _Progress()
    with get_db_session() as session:
        job = session.get(GenerationJobModel, job_id)
        if not job:
            return
        config = dict(job.config_json or {})
        dataset_id = job.dataset_id
        concepts = list(config.get("concepts") or [])
        provider_name = str(config.get("provider") or "")
        model_name = str(config.get("model") or "")
        targets = _records_needing_boxes(session, dataset_id, int(config.get("targets") or 25))
        asset_map = _asset_keys(session, dataset_id)

    _update(job_id, tracker, done=0, status="running", phase="contacting the detection model")
    gateway = ProviderGateway.get_instance()
    try:
        provider = gateway.get_provider(provider_name)
    except ProviderError as exc:
        _update(job_id, tracker, status="failed", phase="failed",
                error=f"provider unavailable: {exc.message}")
        return
    if not provider.supports_capability(ProviderCapability.OBJECT_DETECTION):
        _update(job_id, tracker, status="failed", phase="failed",
                error=f"provider '{provider_name}' does not support object detection")
        return

    storage = get_storage_backend()
    processed = 0
    proposed_records = 0
    empty_records = 0
    failed = 0
    box_count = 0
    error_samples: list[str] = []
    should_cancel = False

    for record_id in targets:
        if should_cancel:
            break
        key, dims = asset_map.get(record_id, ("", {}))
        image_bytes = None
        if key:
            try:
                image_bytes = storage.read_bytes(key)
            except Exception:  # noqa: BLE001
                image_bytes = None
        if not image_bytes:
            failed += 1
            processed += len(concepts)
            continue

        boxes: list[dict[str, Any]] = []
        for concept in concepts:
            with get_db_session() as session:
                job = session.get(GenerationJobModel, job_id)
                if job is None or job.status in {"cancelling", "cancelled"}:
                    should_cancel = True
                    break
            try:
                response = provider.detect(ProviderRequest(
                    model=model_name,
                    task_type=TaskType.OBJECT_DETECTION.value,
                    asset_bytes=image_bytes,
                    parameters={"concept": concept, "include_confidence": True},
                ))
                for box in (response.payload or {}).get("boxes") or []:
                    boxes.append({
                        "label": concept,
                        "x": int(box["x"]),
                        "y": int(box["y"]),
                        "w": int(box["width"]),
                        "h": int(box["height"]),
                        "confidence": box.get("confidence"),
                        "source": provider_name,
                    })
            except ProviderError as exc:
                failed += 1
                if len(error_samples) < 5:
                    error_samples.append(f"{concept}: {str(exc.message)[:160]}")
            processed += 1
            tracker.mark()
            _update(job_id, tracker, done=processed)

        if boxes:
            width = int(dims.get("width") or boxes[0].get("frame", {}).get("width") or 0)
            height = int(dims.get("height") or boxes[0].get("frame", {}).get("height") or 0)
            try:
                with get_db_session() as session:
                    existing = session.scalars(
                        select(AnnotationModel).where(
                            AnnotationModel.record_id == record_id,
                            AnnotationModel.origin.in_(
                                [AnnotationOrigin.MODEL.value, AnnotationOrigin.ENSEMBLE.value]
                            ),
                            AnnotationModel.status == ReviewStatus.PENDING_REVIEW.value,
                        )
                    ).all()
                    proposal_payload = {
                        "label": boxes[0]["label"],
                        "boxes": boxes,
                        "coordinate_system": "pixel-intrinsic",
                        "image_dimensions": {"width": width, "height": height},
                        "proposed_by": provider_name,
                        "concepts": concepts,
                    }
                    if existing:
                        AnnotationService.update_annotation_payload(
                            session=session,
                            annotation_id=existing[0].id,
                            payload=proposal_payload,
                            actor_id=provider_name,
                            change_reason="Re-ran AI box proposals",
                            confidence=1.0,
                        )
                    else:
                        AnnotationService.create_annotation(
                            session=session,
                            record_id=record_id,
                            payload=proposal_payload,
                            origin=AnnotationOrigin.MODEL,
                            status=ReviewStatus.PENDING_REVIEW,
                            confidence=1.0,
                            actor_id=provider_name,
                            model_metadata={"provider": provider_name, "model": model_name},
                        )
                proposed_records += 1
                box_count += len(boxes)
            except Exception as exc:  # noqa: BLE001 - a bad record must not kill the run
                failed += 1
                if len(error_samples) < 5:
                    error_samples.append(str(exc)[:160])
        else:
            empty_records += 1

    if should_cancel:
        _update(job_id, tracker, done=processed, status="cancelled", phase="cancelled",
                result={"accepted": proposed_records, "boxes": box_count, "empty": empty_records,
                        "failed": failed, "verdict": "accept" if proposed_records else "reject"})
        return

    _update(
        job_id,
        tracker,
        done=processed,
        status="completed",
        phase="completed",
        result={
            "accepted": proposed_records,
            "boxes": box_count,
            "empty": empty_records,
            "failed": failed,
            "verdict": "accept" if proposed_records else "reject",
            "rejection_reasons": error_samples if failed else [],
            "label_preservation": None,
            "provider": provider_name,
            "model": model_name,
            "concepts": concepts,
        },
    )


def start_proposal_job(job_id: str) -> None:
    with _ACTIVE_LOCK:
        if job_id in _ACTIVE and _ACTIVE[job_id].is_alive():
            return
        thread = threading.Thread(target=run_proposal_job, args=(job_id,), daemon=True,
                                  name=f"proposals-{job_id}")
        _ACTIVE[job_id] = thread
        thread.start()
