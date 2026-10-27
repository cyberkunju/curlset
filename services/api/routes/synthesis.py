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
) -> SynthesisRunSummary:
    """Trigger bounded synthetic data generation with lineage tracking and duplicate prevention."""
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
        return SynthesisService.generate_synthetic_batch(session=session, request=req)
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
