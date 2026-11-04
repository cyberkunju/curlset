"""AI box proposals API (SAM 3.1 and any OBJECT_DETECTION provider)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import get_auth_user, verify_dataset_access
from packages.detection_proposals.service import (
    MAX_CONCEPTS,
    MAX_RECORDS_PER_RUN,
    create_proposal_job,
    start_proposal_job,
)
from packages.generation_jobs.service import get_job
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import ProviderCapability

router = APIRouter(tags=["detection_proposals"])


class ProposalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    concepts: list[str] = Field(default_factory=list, max_length=MAX_CONCEPTS)
    provider: str = Field(..., min_length=1, max_length=64)
    model: str = Field(..., min_length=1, max_length=128)
    limit: int = Field(25, ge=1, le=MAX_RECORDS_PER_RUN)


@router.post("/api/v1/datasets/{dataset_id}/proposals/detect", status_code=201)
def detect_boxes(
    dataset_id: str,
    req: ProposalRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Queue AI box proposals; results are ``model`` annotations at pending review."""
    dataset = verify_dataset_access(session, dataset_id, user_id, required_role="editor")
    gateway = ProviderGateway.get_instance()
    try:
        provider = gateway.get_provider(req.provider)
    except Exception:  # noqa: BLE001
        return {
            "error": {
                "code": "PROVIDER_UNAVAILABLE",
                "message": f"provider '{req.provider}' is not registered",
            }
        }
    if not provider.supports_capability(ProviderCapability.OBJECT_DETECTION):
        return {
            "error": {
                "code": "CAPABILITY_NOT_SUPPORTED",
                "message": f"provider '{req.provider}' does not support object detection",
            }
        }

    job = create_proposal_job(
        session,
        dataset_id=dataset_id,
        concepts=req.concepts,
        provider=req.provider,
        model=req.model,
        limit=req.limit,
    )
    payload = get_job(session, job.id)
    AuditService.record_event(
        session=session,
        project_id=dataset.project_id,
        user_id=user_id,
        action="DETECTION_PROPOSALS_STARTED",
        resource_type="Dataset",
        resource_id=dataset_id,
        details={"job_id": job.id, "provider": req.provider, "model": req.model},
    )
    session.commit()
    start_proposal_job(job.id)
    return payload
