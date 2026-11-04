"""
Image-generation API — bounded, cost-aware dataset creation.

``POST /datasets/{id}/generate-images`` queues a job that asks an ``IMAGE_GENERATION`` provider for
images, stores them as assets, and creates synthetic records at ``pending_review``. Progress, ETA and
cancel reuse the shared job endpoints. The per-run limit (25) is enforced server-side.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import get_auth_user, verify_dataset_access
from packages.dataset_security.rate_limiter import global_rate_limiter
from packages.generation_jobs.service import get_job
from packages.image_generation.service import (
    DEFAULT_IMAGES_PER_RUN,
    MAX_IMAGES_PER_RUN,
    create_image_job,
    start_image_job,
)
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import ProviderCapability

router = APIRouter(tags=["image_generation"])


class ImageGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(..., min_length=3, max_length=2000)
    count: int = Field(DEFAULT_IMAGES_PER_RUN, ge=1, le=MAX_IMAGES_PER_RUN)
    provider: str = Field(..., min_length=1, max_length=64)
    model: str = Field(..., min_length=1, max_length=128)
    quality: str = Field("low", pattern="^(low|medium|high|auto)$")
    size: str = Field("1024x1024", max_length=32)
    style: str = Field("", max_length=300)
    split: str = Field("train", pattern="^(train|val|test|unassigned)$")
    max_cost_usd: float | None = Field(None, ge=0.0, le=100.0)


@router.post("/api/v1/datasets/{dataset_id}/generate-images", status_code=201)
def generate_images(
    dataset_id: str,
    req: ImageGenerationRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Start a bounded image-generation job for an image-classification dataset."""
    dataset = verify_dataset_access(session, dataset_id, user_id, required_role="editor")
    global_rate_limiter.check(f"image_gen_{user_id}", max_requests=10, window_seconds=60)

    gateway = ProviderGateway.get_instance()
    try:
        provider = gateway.get_provider(req.provider)
    except Exception:  # noqa: BLE001 - return a clean error envelope
        return {
            "error": {
                "code": "PROVIDER_UNAVAILABLE",
                "message": f"provider '{req.provider}' is not registered",
            }
        }
    if not provider.supports_capability(ProviderCapability.IMAGE_GENERATION):
        return {
            "error": {
                "code": "CAPABILITY_NOT_SUPPORTED",
                "message": f"provider '{req.provider}' does not support image generation",
            }
        }

    job = create_image_job(
        session,
        dataset_id=dataset_id,
        prompt=req.prompt,
        count=req.count,
        provider=req.provider,
        model=req.model,
        quality=req.quality,
        size=req.size,
        style=req.style,
        split=req.split,
        max_cost_usd=req.max_cost_usd,
    )
    payload = get_job(session, job.id)
    AuditService.record_event(
        session=session,
        project_id=dataset.project_id,
        user_id=user_id,
        action="IMAGE_GENERATION_STARTED",
        resource_type="Dataset",
        resource_id=dataset_id,
        details={
            "job_id": job.id,
            "provider": req.provider,
            "model": req.model,
            "quality": req.quality,
            "count": req.count,
        },
    )
    session.commit()
    start_image_job(job.id)
    return payload
