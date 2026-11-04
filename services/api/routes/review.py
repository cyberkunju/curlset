"""
Bulk review endpoint: apply one auditable review decision to many records at once.

Contract (docs/STATUS.md B4):
    POST /api/v1/datasets/{dataset_id}/review/bulk
    body {"record_ids": [...], "action": "approve"|"reject"|"needs_correction", "reason": str|None}
    -> {"updated": n, "skipped": m, "errors": [{record_id, reason}, ...]}

For every record the *selector-chosen* annotation (``annotation_selector.
select_active_annotation``) is transitioned through the shared review FSM, which
writes a per-annotation ``ReviewEvent``. Every updated record also gets an
``AuditLogModel`` entry, plus one batch-level ``BULK_REVIEW`` audit entry so a
single call is traceable in the project audit trail. The endpoint is
dataset→project scoped and requires the ``editor`` role (owner passes) via
``get_auth_user`` + ``verify_dataset_access``.
"""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from packages.dataset_core.annotation_selector import select_active_annotation
from packages.dataset_core.constants import ReviewStatus, can_transition_review_status
from packages.dataset_core.db.models import DatasetRecordModel
from packages.dataset_core.db.session import get_db
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import get_auth_user, verify_dataset_access

router = APIRouter(prefix="/api/v1/datasets", tags=["review"])

BulkReviewAction = Literal["approve", "approved", "reject", "rejected", "needs_correction"]

# Canonical action -> review status. "approved"/"rejected" are accepted aliases so
# the UI can pass either the imperative or the past-tense spelling.
ACTION_TO_STATUS: dict[str, ReviewStatus] = {
    "approve": ReviewStatus.APPROVED,
    "approved": ReviewStatus.APPROVED,
    "reject": ReviewStatus.REJECTED,
    "rejected": ReviewStatus.REJECTED,
    "needs_correction": ReviewStatus.NEEDS_CORRECTION,
}

CANONICAL_ACTION: dict[str, str] = {
    "approve": "approve",
    "approved": "approve",
    "reject": "reject",
    "rejected": "reject",
    "needs_correction": "needs_correction",
}

MAX_BULK_RECORDS = 1000


class BulkReviewRequest(BaseModel):
    """One review decision applied to a list of record ids."""

    model_config = ConfigDict(extra="ignore")

    record_ids: list[str] = Field(..., min_length=1, max_length=MAX_BULK_RECORDS)
    action: BulkReviewAction
    reason: str | None = Field(None, max_length=2000)


class BulkReviewIssue(BaseModel):
    """A record that could not be reviewed, with a human-readable reason."""

    record_id: str
    reason: str


class BulkReviewResponse(BaseModel):
    """Result of a bulk review call."""

    updated: int
    skipped: int
    errors: list[BulkReviewIssue] = Field(default_factory=list)
    # Convenience mirrors (same values) for clients that prefer explicit keys.
    updated_ids: list[str] = Field(default_factory=list)
    skipped_ids: list[str] = Field(default_factory=list)
    updated_count: int = 0
    skipped_count: int = 0
    error_count: int = 0


@router.post("/{dataset_id}/review/bulk", response_model=BulkReviewResponse)
def bulk_review_records(
    dataset_id: str,
    req: BulkReviewRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> BulkReviewResponse:
    """
    Approve / reject / flag-for-correction many records in one audited call.

    * Dataset and project scope are enforced before any mutation.
    * Records with no annotation are *skipped* (nothing to decide).
    * Records already in the requested state are *skipped* (idempotent).
    * Illegal FSM moves, unknown record ids and records from another dataset are
      reported in ``errors`` and never mutated.
    """
    dataset = verify_dataset_access(session, dataset_id, user_id, required_role="editor")
    next_status = ACTION_TO_STATUS[req.action]
    canonical_action = CANONICAL_ACTION[req.action]
    default_reason = f"Bulk review: {canonical_action}"
    event_reason = req.reason.strip() if req.reason and req.reason.strip() else default_reason

    updated_ids: list[str] = []
    skipped_ids: list[str] = []
    errors: list[BulkReviewIssue] = []
    seen: set[str] = set()

    for record_id in req.record_ids:
        if record_id in seen:
            # Duplicate id inside one request: count once, skip the repeat.
            skipped_ids.append(record_id)
            continue
        seen.add(record_id)

        record = session.get(DatasetRecordModel, record_id)
        if record is None:
            errors.append(BulkReviewIssue(record_id=record_id, reason="Record not found."))
            continue
        if record.dataset_id != dataset_id:
            errors.append(
                BulkReviewIssue(record_id=record_id, reason="Record does not belong to this dataset.")
            )
            continue

        active = select_active_annotation(record.annotations)
        if active is None:
            # Nothing to review yet — not an error.
            skipped_ids.append(record_id)
            continue

        current_status = ReviewStatus(active.status)
        if current_status == next_status:
            skipped_ids.append(record_id)
            continue
        if not can_transition_review_status(current_status, next_status):
            errors.append(
                BulkReviewIssue(
                    record_id=record_id,
                    reason=(
                        f"Illegal review transition from '{current_status.value}' "
                        f"to '{next_status.value}'."
                    ),
                )
            )
            continue

        AnnotationService.transition_review_status(
            session=session,
            annotation_id=active.id,
            next_status=next_status,
            actor_id=user_id,
            reason=event_reason,
        )
        updated_ids.append(record_id)

        # Per-record audit trail entry (in addition to the annotation ReviewEvent).
        AuditService.record_event(
            session=session,
            project_id=dataset.project_id,
            user_id=user_id,
            action=f"REVIEW_{next_status.value.upper()}",
            resource_type="DatasetRecord",
            resource_id=record_id,
            details={
                "annotation_id": active.id,
                "from_status": current_status.value,
                "to_status": next_status.value,
                "batch_action": canonical_action,
            },
        )

    # One batch-level audit entry makes the whole call traceable with a single row.
    AuditService.record_event(
        session=session,
        project_id=dataset.project_id,
        user_id=user_id,
        action="BULK_REVIEW",
        resource_type="Dataset",
        resource_id=dataset_id,
        details={
            "action": canonical_action,
            "requested": len(req.record_ids),
            "updated": len(updated_ids),
            "skipped": len(skipped_ids),
            "error_count": len(errors),
            "updated_ids": updated_ids[:200],
            "reason": req.reason,
        },
    )

    session.commit()

    return BulkReviewResponse(
        updated=len(updated_ids),
        skipped=len(skipped_ids),
        errors=errors,
        updated_ids=updated_ids,
        skipped_ids=skipped_ids,
        updated_count=len(updated_ids),
        skipped_count=len(skipped_ids),
        error_count=len(errors),
    )
