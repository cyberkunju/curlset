"""
Inference API endpoints for provider discovery, batch AI proposals, and run tracking.
"""
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import ProcessingRunModel
from packages.dataset_core.db.session import get_db
from packages.dataset_core.domain_models import ProcessingRunContract
from packages.dataset_core.exceptions import ResourceNotFoundError
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import get_auth_user, verify_dataset_access
from packages.dataset_security.rate_limiter import global_rate_limiter
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.orchestrator import AIAnnotationOrchestrator

router = APIRouter(tags=["inference"])


class AIAnnotateRequest(BaseModel):
    provider: str = Field("fake", description="Provider name: fake or ollama")
    model: str = Field("fake-classifier-v1", description="Model identifier")
    target_split: str | None = Field(None, description="Optional split filter: train, val, test")
    only_unannotated: bool = Field(True, description="Process only records without annotations")
    limit: int = Field(50, ge=1, le=500, description="Maximum records to process")
    enable_consensus: bool = Field(False, description="Enable dual-pass verifier consensus")


class RunDetailResponse(BaseModel):
    run: ProcessingRunContract
    items: list[dict[str, Any]]


@router.get("/api/v1/providers")
def list_providers() -> list[dict[str, Any]]:
    """List registered AI providers, capabilities, and models."""
    gateway = ProviderGateway.get_instance()
    return gateway.list_providers()


@router.post("/api/v1/datasets/{dataset_id}/ai-annotate", response_model=ProcessingRunContract, status_code=202)
def run_ai_annotation(
    dataset_id: str,
    req: AIAnnotateRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> ProcessingRunContract:
    """
    Trigger batch model annotation across dataset records.
    All outputs are saved as reviewable proposals (pending_review), never approved.
    """
    # 1. Rate limiting
    global_rate_limiter.check(f"inference_{user_id}", max_requests=30, window_seconds=60)

    # 2. Authorization
    dataset = verify_dataset_access(session, dataset_id, user_id, required_role="editor")

    run = AIAnnotationOrchestrator.run_annotation_batch(
        session=session,
        dataset_id=dataset_id,
        provider_name=req.provider,
        model_name=req.model,
        target_split=req.target_split,
        only_unannotated=req.only_unannotated,
        limit=req.limit,
        enable_consensus=req.enable_consensus,
    )
    AuditService.record_event(
        session=session,
        project_id=dataset.project_id,
        user_id=user_id,
        action="AI_ANNOTATION_BATCH",
        resource_type="ProcessingRun",
        resource_id=run.id,
        details={"provider": req.provider, "model": req.model, "processed_items": run.processed_items},
    )
    session.commit()
    return run


@router.get("/api/v1/runs/{run_id}", response_model=RunDetailResponse)
def get_run_detail(
    run_id: str,
    session: Session = Depends(get_db),
) -> RunDetailResponse:
    """Fetch status, error summary, and item-level results of a processing run."""
    run = session.scalar(select(ProcessingRunModel).where(ProcessingRunModel.id == run_id))
    if not run:
        raise ResourceNotFoundError("ProcessingRun", run_id)

    items_data = []
    for it in run.items:
        items_data.append({
            "id": it.id,
            "record_id": it.record_id,
            "idempotency_key": it.idempotency_key,
            "status": it.status,
            "attempts": it.attempts,
            "output_reference": it.output_reference,
            "error_message": it.error_message,
        })

    return RunDetailResponse(
        run=ProcessingRunContract.model_validate(run),
        items=items_data,
    )
