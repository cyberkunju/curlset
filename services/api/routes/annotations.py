"""
Annotation endpoints: creation, append-only revisions, and review state machine transitions.

Trust boundary (docs/STATUS.md §0 rule 3): ``origin``, ``status`` and
``actor_id`` are NEVER read from the request body on this router.

* ``POST /api/v1/records/{record_id}/annotations`` always creates
  ``origin="human"`` + ``status="pending_review"``; the label is validated by
  ``validate_annotation_payload`` and the payload is the only client input.
* The deciding action is ``POST /api/v1/annotations/{annotation_id}/transition``,
  which enforces the FSM in ``packages/dataset_core/constants.py`` and writes a
  ``ReviewEvent``.
* The acting identity comes exclusively from ``get_auth_user`` (the
  ``X-User-Id`` header / local ``default_user`` fallback), so a client cannot
  forge an approved human label or an audit actor over HTTP.

Fields the client may still send for backward compatibility (``origin``,
``status``, ``actor_id``) are ignored by pydantic (``extra="ignore"``) — they are
never forwarded to the service.
"""
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.session import get_db
from packages.dataset_core.domain_models import AnnotationContract
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_security.auth import (
    get_auth_user,
    verify_annotation_access,
    verify_record_access,
)

router = APIRouter(tags=["annotations"])


class CreateAnnotationRequest(BaseModel):
    """Manual label creation. Only the payload (+ optional confidence) is trusted."""

    model_config = ConfigDict(extra="ignore")

    payload: dict[str, Any]
    confidence: float | None = Field(None, ge=0.0, le=1.0)


class UpdateAnnotationRequest(BaseModel):
    """Append a revision to an existing annotation. Actor is derived server-side."""

    model_config = ConfigDict(extra="ignore")

    payload: dict[str, Any]
    change_reason: str | None = None
    confidence: float | None = Field(None, ge=0.0, le=1.0)


class TransitionStatusRequest(BaseModel):
    """Explicit review decision. Actor is derived server-side; reason is optional evidence."""

    model_config = ConfigDict(extra="ignore")

    next_status: ReviewStatus
    reason: str | None = None


@router.post("/api/v1/records/{record_id}/annotations", response_model=AnnotationContract, status_code=201)
def create_annotation(
    record_id: str,
    req: CreateAnnotationRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> AnnotationContract:
    """
    Create a manual (human) annotation.

    Server-derived invariants: ``origin="human"`` and ``status="pending_review"``
    ALWAYS — an approval must go through the explicit transition endpoint so the
    decision is auditable. Client-supplied origin/status/actor_id are ignored.
    """
    verify_record_access(session, record_id, user_id, required_role="editor")

    ann = AnnotationService.create_annotation(
        session=session,
        record_id=record_id,
        payload=req.payload,
        origin=AnnotationOrigin.HUMAN,
        status=ReviewStatus.PENDING_REVIEW,
        actor_id=user_id,
        confidence=req.confidence,
    )
    session.commit()
    return ann


@router.put("/api/v1/annotations/{annotation_id}", response_model=AnnotationContract)
def update_annotation(
    annotation_id: str,
    req: UpdateAnnotationRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> AnnotationContract:
    """
    Append a new payload revision (append-only: earlier revisions are preserved).

    The actor is derived from the request identity, never from the body, and the
    annotation's ``origin`` is preserved. Editing a decided annotation returns it
    to the review queue (see ``AnnotationService.update_annotation_payload``).
    """
    verify_annotation_access(session, annotation_id, user_id, required_role="editor")

    ann = AnnotationService.update_annotation_payload(
        session=session,
        annotation_id=annotation_id,
        payload=req.payload,
        actor_id=user_id,
        change_reason=req.change_reason,
        confidence=req.confidence,
    )
    session.commit()
    return ann


@router.post("/api/v1/annotations/{annotation_id}/transition", response_model=AnnotationContract)
def transition_annotation_status(
    annotation_id: str,
    req: TransitionStatusRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> AnnotationContract:
    """
    Perform an explicit, auditable review decision (approve / reject / needs_correction …).

    The FSM in ``packages/dataset_core/constants.py`` rejects illegal moves with
    HTTP 400; every accepted move writes a ``ReviewEvent`` with the server-derived
    actor id.
    """
    verify_annotation_access(session, annotation_id, user_id, required_role="editor")

    ann = AnnotationService.transition_review_status(
        session=session,
        annotation_id=annotation_id,
        next_status=req.next_status,
        actor_id=user_id,
        reason=req.reason,
    )
    session.commit()
    return ann
