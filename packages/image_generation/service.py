"""
Bounded image-dataset generation.

For each requested image the engine:
1. asks an ``IMAGE_GENERATION`` provider for one image (prompt composed from the user description,
   the target class and an optional style),
2. stores the bytes as a dataset asset (outside the relational row),
3. creates a record + primary image asset + a ``synthetic`` annotation at ``pending_review``,
4. reports progress, measured ETA, per-image cost and cancel on the shared job record
   (``kind="image_generation"``).

Hard rule: **at most 25 images per run** (``MAX_IMAGES_PER_RUN``). Image APIs are billed per image and
this limit exists to keep test datasets cheap; it is enforced server-side, not just in the UI.
"""
from __future__ import annotations

import io
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from PIL import Image
from sqlalchemy.orm import Session

from packages.dataset_core.constants import (
    AnnotationOrigin,
    AssetModality,
    AssetRole,
    ReviewStatus,
    TaskType,
)
from packages.dataset_core.db.models import DatasetModel, GenerationJobModel
from packages.dataset_core.db.session import get_db_session
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_core.services.record_service import RecordService
from packages.dataset_io.hashing import compute_phash, compute_sha256
from packages.dataset_io.storage import get_storage_backend
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderError,
    ProviderRequest,
)

#: Hard cost guard: image APIs bill per image. 25 keeps every test dataset inexpensive.
MAX_IMAGES_PER_RUN = 25
DEFAULT_IMAGES_PER_RUN = 10

_ACTIVE_LOCK = threading.Lock()
_ACTIVE: dict[str, threading.Thread] = {}


def _labels(dataset: DatasetModel) -> list[str]:
    schema = dataset.label_schema or {}
    return [str(label) for label in (schema.get("labels") or schema.get("classes") or [])]


def create_image_job(
    session: Session,
    *,
    dataset_id: str,
    prompt: str,
    count: int = DEFAULT_IMAGES_PER_RUN,
    provider: str,
    model: str,
    quality: str = "low",
    size: str = "1024x1024",
    style: str = "",
    split: str = "train",
    max_cost_usd: float | None = None,
) -> GenerationJobModel:
    """Create a pending image-generation job (dataset must be image classification)."""
    dataset = session.get(DatasetModel, dataset_id)
    if not dataset:
        raise ResourceNotFoundError("Dataset", dataset_id)
    if dataset.task_type not in {
        TaskType.IMAGE_CLASSIFICATION.value,
        TaskType.OBJECT_DETECTION.value,
    }:
        raise DomainValidationError(
            "Automated image generation supports image-classification and object-detection "
            "datasets. Detection runs generate the images only; you draw the boxes afterwards.",
            field="task_type",
        )
    classes = _labels(dataset)
    if dataset.task_type == TaskType.IMAGE_CLASSIFICATION.value and not classes:
        raise DomainValidationError(
            "This dataset has no classes, so generated images cannot be labelled.", field="label_schema"
        )
    if not str(prompt or "").strip():
        raise DomainValidationError("Describe what the images should show.", field="prompt")
    if count < 1:
        raise DomainValidationError("Ask for at least one image.", field="count")
    if count > MAX_IMAGES_PER_RUN:
        raise DomainValidationError(
            f"At most {MAX_IMAGES_PER_RUN} images per run (image APIs bill per image). "
            "Split larger datasets into several runs.",
            field="count",
        )
    if quality.lower() not in {"low", "medium", "high", "auto"}:
        raise DomainValidationError("quality must be low, medium, high or auto.", field="quality")

    job = GenerationJobModel(
        id=generate_id("job"),
        project_id=dataset.project_id,
        dataset_id=dataset_id,
        dataset_name=dataset.name,
        kind="image_generation",
        prompt=str(prompt).strip(),
        task_type=dataset.task_type,
        status="pending",
        total_items=count,
        processed_items=0,
        phase="queued",
        config_json={
            "task_type": dataset.task_type,
            "prompt": str(prompt).strip(),
            "classes": classes,
            "count": count,
            "provider": provider,
            "model": model,
            "quality": quality.lower(),
            "size": size,
            "style": style,
            "split": split,
            "max_cost_usd": max_cost_usd,
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
            job.phase = f"generating image {min(processed + 1, total)}/{total}"
        if status is not None:
            job.status = status
        if result is not None:
            job.result_json = result
        if error is not None:
            job.error_message = error[:2000]
        if status in {"completed", "failed", "cancelled", "interrupted"}:
            job.finished_at = datetime.now(UTC)


def _image_dimensions(image_bytes: bytes) -> dict[str, int] | None:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            return {"width": int(image.width), "height": int(image.height)}
    except Exception:  # noqa: BLE001 - dimensions are metadata, not worth failing an image
        return None


def _build_prompt(base_prompt: str, label: str, style: str, variation: int) -> str:
    parts = [base_prompt.strip()]
    parts.append(f"Subject represents the category: {label}.")
    if style.strip():
        parts.append(f"Visual style: {style.strip()}.")
    if variation > 1:
        parts.append(f"Variation {variation}.")
    return " ".join(parts)


def run_image_job(job_id: str) -> None:
    tracker = _Progress()
    with get_db_session() as session:
        job = session.get(GenerationJobModel, job_id)
        if not job:
            return
        config = dict(job.config_json or {})
        dataset_id = job.dataset_id
        classes = list(config.get("classes") or [])
        dataset_task_type = str(config.get("task_type") or job.task_type or "image_classification")
        count = int(config.get("count") or job.total_items or 1)
        provider_name = str(config.get("provider") or "")
        model_name = str(config.get("model") or "")
        base_prompt = str(config.get("prompt") or job.prompt or "")
        quality = str(config.get("quality") or "low")
        size = str(config.get("size") or "1024x1024")
        style = str(config.get("style") or "")
        split = str(config.get("split") or "train")
        max_cost = config.get("max_cost_usd")

    _update(job_id, tracker, done=0, status="running", phase="contacting the image model")

    gateway = ProviderGateway.get_instance()
    try:
        provider = gateway.get_provider(provider_name)
    except ProviderError as exc:
        _update(job_id, tracker, status="failed", error=f"provider unavailable: {exc.message}",
                phase="failed")
        return
    if not provider.supports_capability(ProviderCapability.IMAGE_GENERATION):
        _update(job_id, tracker, status="failed",
                error=f"provider '{provider_name}' cannot generate images",
                phase="failed")
        return

    backend = get_storage_backend()
    accepted = 0
    failed = 0
    cost_total = 0.0
    priced = True
    created_record_ids: list[str] = []
    error_samples: list[str] = []

    for index in range(count):
        with get_db_session() as session:
            job = session.get(GenerationJobModel, job_id)
            if job is None or job.status in {"cancelling", "cancelled"}:
                _update(job_id, tracker, done=index, status="cancelled",
                        result={"accepted": accepted, "failed": failed, "cost_usd": round(cost_total, 4),
                                "priced": priced, "verdict": "accept" if accepted else "reject"},
                        phase="cancelled")
                return

        label = classes[index % len(classes)] if classes else ""
        if dataset_task_type == TaskType.OBJECT_DETECTION.value:
            # Base images for boxing: mention the object categories but create NO annotation —
            # boxes are drawn by a human (or a detector proposal in a later slice).
            prompt_text = " ".join(part for part in [
                base_prompt.strip(),
                f"Show objects from these categories: {', '.join(classes)}." if classes else "",
                f"Visual style: {style.strip()}." if style.strip() else "",
                f"Variation {index + 1}.",
            ] if part)
        else:
            prompt_text = _build_prompt(base_prompt, label, style, index + 1)
        try:
            response = provider.generate(ProviderRequest(
                model=model_name,
                task_type=TaskType.IMAGE_CLASSIFICATION.value,
                parameters={
                    "prompt": prompt_text,
                    "quality": quality,
                    "size": size,
                    "label": label,
                    "variation": index + 1,
                },
            ))
            image_bytes = response.payload.get("image_bytes")
            if not isinstance(image_bytes, (bytes, bytearray)) or not image_bytes:
                raise ProviderError("provider returned no image bytes", provider=provider_name)
            image_bytes = bytes(image_bytes)
            mime_type = str(response.payload.get("mime_type") or "image/png")
            extension = {"image/png": ".png", "image/webp": ".webp", "image/jpeg": ".jpg"}.get(
                mime_type, ".png"
            )
            priced_image = bool(response.payload.get("priced", True))
            priced = priced and priced_image
            cost_total += float(response.usage.estimated_cost_usd or 0.0)

            if max_cost is not None and cost_total > float(max_cost):
                _update(job_id, tracker, done=index, status="cancelled",
                        error=f"Budget cap reached (${float(max_cost):.2f}); stopped after {accepted} image(s).",
                        result={"accepted": accepted, "failed": failed,
                                "cost_usd": round(cost_total, 4), "priced": priced,
                                "verdict": "accept" if accepted else "reject"},
                        phase="cancelled")
                return

            with get_db_session() as session:
                asset_id = generate_id("asset")
                storage_key = f"assets/{dataset_id}/{asset_id}{extension}"
                backend.write_bytes(storage_key, image_bytes)
                sha256 = compute_sha256(image_bytes)
                asset = RecordService.create_asset(
                    session=session,
                    dataset_id=dataset_id,
                    storage_key=storage_key,
                    modality=AssetModality.IMAGE,
                    mime_type=mime_type,
                    byte_size=len(image_bytes),
                    sha256=sha256,
                    phash=compute_phash(image_bytes),
                    original_filename=f"generated-{index + 1}{extension}",
                    dimensions=_image_dimensions(image_bytes),
                    transformation_metadata={
                        "generated": True,
                        "provider": provider_name,
                        "model": model_name,
                        "quality": quality,
                        "prompt": prompt_text,
                    },
                )
                record = RecordService.create_record(
                    session=session,
                    dataset_id=dataset_id,
                    split=split,
                    metadata={
                        "synthetic": True,
                        **({"label": label} if label else {}),
                        "task_type": dataset_task_type,
                        "generation": {
                            "provider": provider_name,
                            "model": model_name,
                            "quality": quality,
                            "size": size,
                            "prompt": prompt_text,
                            "index": index + 1,
                        },
                    },
                )
                RecordService.link_asset_to_record(
                    session=session, record_id=record.id, asset_id=asset.id,
                    role=AssetRole.PRIMARY_IMAGE,
                )
                RecordService.attach_source_record(session, record.id, source_type="synthetic")
                if dataset_task_type == TaskType.IMAGE_CLASSIFICATION.value:
                    AnnotationService.create_annotation(
                        session=session,
                        record_id=record.id,
                        payload={"label": label, "synthetic": True},
                        origin=AnnotationOrigin.SYNTHETIC,
                        status=ReviewStatus.PENDING_REVIEW,
                        confidence=1.0,
                        actor_id="image-generator",
                        model_metadata={"provider": provider_name, "model": model_name},
                    )
                created_record_ids.append(record.id)
            accepted += 1
        except ProviderError as exc:
            failed += 1
            if len(error_samples) < 5:
                error_samples.append(str(exc.message)[:200])
        except Exception as exc:  # noqa: BLE001 - one bad image must not kill the run
            failed += 1
            if len(error_samples) < 5:
                error_samples.append(str(exc)[:200])

        tracker.mark()
        _update(job_id, tracker, done=index + 1, phase=f"generating image {index + 1}/{count}")

    verdict = "accept" if accepted else "reject"
    _update(
        job_id,
        tracker,
        done=count,
        status="completed",
        phase="completed",
        result={
            "accepted": accepted,
            "failed": failed,
            "generated": accepted + failed,
            "cost_usd": round(cost_total, 4),
            "priced": priced,
            "verdict": verdict,
            "provider": provider_name,
            "model": model_name,
            "quality": quality,
            "rejection_reasons": error_samples,
            "record_ids": created_record_ids[:50],
            "rejection_breakdown": {"generation_failed": failed} if failed else {},
        },
    )


def start_image_job(job_id: str) -> None:
    with _ACTIVE_LOCK:
        if job_id in _ACTIVE and _ACTIVE[job_id].is_alive():
            return
        thread = threading.Thread(target=run_image_job, args=(job_id,), daemon=True,
                                  name=f"image-job-{job_id}")
        _ACTIVE[job_id] = thread
        thread.start()
