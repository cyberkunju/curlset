"""
Annotation endpoints: creation, append-only revisions, and review state machine transitions.
"""
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.session import get_db
from packages.dataset_core.domain_models import AnnotationContract
from packages.dataset_core.services.annotation_service import AnnotationService

router = APIRouter(tags=["annotations"])


class CreateAnnotationRequest(BaseModel):
    payload: dict[str, Any]
    origin: AnnotationOrigin = AnnotationOrigin.HUMAN
    status: ReviewStatus = ReviewStatus.PENDING_REVIEW
    actor_id: str = "default_user"
    confidence: float | None = Field(None, ge=0.0, le=1.0)


class UpdateAnnotationRequest(BaseModel):
    payload: dict[str, Any]
    actor_id: str = "default_user"
    change_reason: str | None = None
    confidence: float | None = Field(None, ge=0.0, le=1.0)


class TransitionStatusRequest(BaseModel):
    next_status: ReviewStatus
    actor_id: str = "default_user"
    reason: str | None = None


@router.post("/api/v1/records/{record_id}/annotations", response_model=AnnotationContract, status_code=201)
def create_annotation(
    record_id: str,
    req: CreateAnnotationRequest,
    session: Session = Depends(get_db),
) -> AnnotationContract:
    ann = AnnotationService.create_annotation(
        session=session,
        record_id=record_id,
        payload=req.payload,
        origin=req.origin,
        status=req.status,
        actor_id=req.actor_id,
        confidence=req.confidence,
    )
    session.commit()
    return ann


@router.put("/api/v1/annotations/{annotation_id}", response_model=AnnotationContract)
def update_annotation(
    annotation_id: str,
    req: UpdateAnnotationRequest,
    session: Session = Depends(get_db),
) -> AnnotationContract:
    ann = AnnotationService.update_annotation_payload(
        session=session,
        annotation_id=annotation_id,
        payload=req.payload,
        actor_id=req.actor_id,
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
) -> AnnotationContract:
    ann = AnnotationService.transition_review_status(
        session=session,
        annotation_id=annotation_id,
        next_status=req.next_status,
        actor_id=req.actor_id,
        reason=req.reason,
    )
    session.commit()
    return ann
