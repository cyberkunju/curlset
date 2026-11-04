"""
Autonomous labelling API.

One call queues a model-driven labelling run over every record that is not yet approved. High-agreement,
high-confidence results are auto-approved (provenance stays ``ensemble``/``model``); the rest are left
at ``pending_review`` for a human. Progress, ETA and cancel reuse the job endpoints.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from packages.autolabel.service import create_auto_label_job, start_auto_label_job
from packages.dataset_core.db.session import get_db
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import get_auth_user, verify_dataset_access
from packages.dataset_security.rate_limiter import global_rate_limiter
from packages.generation_jobs.service import get_job
from packages.provider_gateway.gateway import ProviderGateway

router = APIRouter(tags=["autolabel"])


class AutoLabelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    providers: list[dict[str, str]] = Field(..., min_length=1, max_length=3)
    auto_accept_confidence: float = Field(0.9, ge=0.5, le=1.0)
    limit: int = Field(200, ge=1, le=2000)
    require_unanimous: bool = True


@router.post("/api/v1/datasets/{dataset_id}/auto-label", status_code=201)
def start_autonomous_labelling(
    dataset_id: str,
    req: AutoLabelRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Queue an autonomous labelling run (models label; humans only review disagreements)."""
    dataset = verify_dataset_access(session, dataset_id, user_id, required_role="editor")
    global_rate_limiter.check(f"autolabel_{user_id}", max_requests=10, window_seconds=60)

    gateway = ProviderGateway.get_instance()
    for ref in req.providers:
        try:
            gateway.get_provider(str(ref.get("provider")))
        except Exception as exc:  # noqa: BLE001 - return a clean 4xx body instead of a stack trace
            return {
                "error": {
                    "code": "PROVIDER_UNAVAILABLE",
                    "message": f"provider '{ref.get('provider')}' is not registered: {exc}",
                }
            }

    job = create_auto_label_job(
        session,
        dataset_id=dataset_id,
        providers=req.providers,
        auto_accept_confidence=req.auto_accept_confidence,
        limit=req.limit,
        require_unanimous=req.require_unanimous,
    )
    payload = get_job(session, job.id)
    AuditService.record_event(
        session=session,
        project_id=dataset.project_id,
        user_id=user_id,
        action="AUTONOMOUS_LABELING_STARTED",
        resource_type="Dataset",
        resource_id=dataset_id,
        details={
            "job_id": job.id,
            "providers": [ref.get("provider") for ref in req.providers],
            "targets": job.total_items,
            "auto_accept_confidence": req.auto_accept_confidence,
        },
    )
    session.commit()
    start_auto_label_job(job.id)
    return payload
