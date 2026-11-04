"""
Natural-language dataset editing API.

Two-step by design: ``preview`` never mutates and returns real counts plus warnings; ``apply``
requires ``confirm=true`` and records a reversible change set. An instruction that cannot be mapped
to a supported operation is rejected with the supported vocabulary — it is never half-applied.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_edits.service import (
    apply_edit,
    list_change_sets,
    plan_edit,
    undo_change_set,
)
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import get_auth_user, verify_dataset_access
from packages.dataset_security.rate_limiter import global_rate_limiter
from packages.generation_jobs.service import start_job

router = APIRouter(tags=["edits"])


class EditPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instruction: str = Field(..., min_length=3, max_length=1000)


class EditApplyRequest(EditPreviewRequest):
    confirm: bool = Field(False, description="Must be true: the caller has seen the preview.")
    provider: str | None = Field(None, max_length=64)
    model: str | None = Field(None, max_length=128)
    verifier_providers: list[dict[str, str]] = Field(default_factory=list, max_length=3)


@router.post("/api/v1/datasets/{dataset_id}/edits/preview")
def preview_edit(
    dataset_id: str,
    req: EditPreviewRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Parse the instruction and report exactly what would change (no mutation)."""
    verify_dataset_access(session, dataset_id, user_id, required_role="editor")
    return plan_edit(session, dataset_id, req.instruction).to_dict()


@router.post("/api/v1/datasets/{dataset_id}/edits/apply")
def apply_natural_language_edit(
    dataset_id: str,
    req: EditApplyRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Apply a previewed edit and record a reversible change set."""
    dataset = verify_dataset_access(session, dataset_id, user_id, required_role="editor")
    global_rate_limiter.check(f"edits_{user_id}", max_requests=30, window_seconds=60)
    if not req.confirm:
        return {
            "error": {
                "code": "CONFIRMATION_REQUIRED",
                "message": "Call /edits/preview first and resend the same instruction with confirm=true.",
            },
            "preview": plan_edit(session, dataset_id, req.instruction).to_dict(),
        }

    result = apply_edit(
        session,
        dataset_id,
        req.instruction,
        actor_id=user_id,
        provider=req.provider,
        model=req.model,
        verifier_providers=req.verifier_providers,
    )
    AuditService.record_event(
        session=session,
        project_id=dataset.project_id,
        user_id=user_id,
        action="NATURAL_LANGUAGE_EDIT_APPLIED",
        resource_type="Dataset",
        resource_id=dataset_id,
        details={"change_set_id": result.get("change_set_id"), "counts": result.get("counts", {})},
    )
    session.commit()
    # Start background work only after the row exists for other sessions/threads.
    if result.get("job_id"):
        start_job(str(result["job_id"]))
    return result


@router.get("/api/v1/datasets/{dataset_id}/edits")
def edit_history(
    dataset_id: str,
    limit: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> list[dict[str, Any]]:
    """Recent change sets for this dataset, newest first."""
    verify_dataset_access(session, dataset_id, user_id)
    return list_change_sets(session, dataset_id, limit=limit)


@router.post("/api/v1/datasets/{dataset_id}/edits/{change_set_id}/undo")
def undo_edit(
    dataset_id: str,
    change_set_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Reverse a change set from its stored before-state."""
    dataset = verify_dataset_access(session, dataset_id, user_id, required_role="editor")
    result = undo_change_set(session, change_set_id, actor_id=user_id)
    AuditService.record_event(
        session=session,
        project_id=dataset.project_id,
        user_id=user_id,
        action="NATURAL_LANGUAGE_EDIT_UNDONE",
        resource_type="Dataset",
        resource_id=dataset_id,
        details={"change_set_id": change_set_id},
    )
    session.commit()
    # Start background work only after the row exists for other sessions/threads.
    if result.get("job_id"):
        start_job(str(result["job_id"]))
    return result
