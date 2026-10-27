"""
REST API routes for bounded synthetic data generation and lineage tracking.
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import get_auth_user, verify_dataset_access
from packages.dataset_security.quotas import QuotaManager
from packages.dataset_security.rate_limiter import global_rate_limiter
from packages.dataset_synthesis.models import SynthesisBatchRequest, SynthesisRunSummary
from packages.dataset_synthesis.service import SynthesisService

router = APIRouter(prefix="/api/v1", tags=["Synthetic Generation"])


class GenerateRequestBody(BaseModel):
    target_class: str
    count: int = Field(default=5, ge=1, le=50, description="Bounded batch count (1-50)")
    prompt_template: str = "Generate realistic training examples for class: {class_name}"
    template_version: str = "v1.0"
    provider_name: str = "fake"
    model_name: str = "fake-text-generator-v1"
    seed: int | None = 42
    split: str = "train"


@router.post("/datasets/{dataset_id}/synthesize", response_model=SynthesisRunSummary, status_code=status.HTTP_201_CREATED)
def trigger_synthetic_generation(
    dataset_id: str,
    payload: GenerateRequestBody,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> SynthesisRunSummary:
    """Trigger bounded synthetic data generation with lineage tracking, rate limiting, and quotas."""
    # 1. Enforce rate limiting
    global_rate_limiter.check(f"synthesis_{user_id}", max_requests=25, window_seconds=60)

    # 2. Verify authorization
    dataset = verify_dataset_access(session, dataset_id, user_id, required_role="editor")

    # 3. Enforce record quota
    QuotaManager.check_record_quota(session, dataset.project_id, payload.count)

    req = SynthesisBatchRequest(
        dataset_id=dataset_id,
        target_class=payload.target_class,
        count=payload.count,
        prompt_template=payload.prompt_template,
        template_version=payload.template_version,
        provider_name=payload.provider_name,
        model_name=payload.model_name,
        seed=payload.seed,
        split=payload.split,
    )
    try:
        summary = SynthesisService.generate_synthetic_batch(session=session, request=req)
        AuditService.record_event(
            session=session,
            project_id=dataset.project_id,
            user_id=user_id,
            action="SYNTHETIC_GENERATION",
            resource_type="Dataset",
            resource_id=dataset_id,
            details={
                "target_class": payload.target_class,
                "requested_count": payload.count,
                "created_count": summary.accepted_count,
                "run_id": summary.run_id,
            },
        )
        session.commit()
        return summary
    except ResourceNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": e.code, "message": e.message, "details": e.details},
        ) from e
    except DomainValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": e.code, "message": e.message, "details": e.details},
        ) from e


@router.get("/datasets/{dataset_id}/synthetic-lineage")
def get_dataset_synthetic_lineage(
    dataset_id: str,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve proportion of real vs synthetic records and past generation runs."""
    try:
        return SynthesisService.get_dataset_lineage(session=session, dataset_id=dataset_id)
    except ResourceNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": e.code, "message": e.message, "details": e.details},
        ) from e
