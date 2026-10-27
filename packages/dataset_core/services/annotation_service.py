"""
Annotation service managing task-specific annotations, append-only revisions,
and auditable review state transitions.
"""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import (
    AnnotationOrigin,
    ReviewStatus,
    can_transition_review_status,
)
from packages.dataset_core.db.models import (
    AnnotationModel,
    AnnotationRevisionModel,
    DatasetRecordModel,
    ReviewEventModel,
)
from packages.dataset_core.domain_models import (
    AnnotationContract,
    AnnotationRevisionContract,
    ReviewEventContract,
)
from packages.dataset_core.exceptions import (
    DomainValidationError,
    InvalidStateTransitionError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_core.task_schemas import validate_annotation_payload


class AnnotationService:
    @staticmethod
    def create_annotation(
        session: Session,
        record_id: str,
        payload: dict[str, Any],
        origin: AnnotationOrigin = AnnotationOrigin.HUMAN,
        status: ReviewStatus = ReviewStatus.PENDING_REVIEW,
        actor_id: str = "default_user",
        confidence: float | None = None,
        consensus_score: float | None = None,
        processing_run_id: str | None = None,
        model_metadata: dict[str, Any] | None = None,
    ) -> AnnotationContract:
        # Validate record exists
        record = session.scalar(select(DatasetRecordModel).where(DatasetRecordModel.id == record_id))
        if not record:
            raise ResourceNotFoundError("DatasetRecord", record_id)

        # Validate against task schema and label constraints
        validate_annotation_payload(
            task_type=record.dataset.task_type,
            payload=payload,
            label_schema=record.dataset.label_schema,
        )

        # Enforce that model-generated annotations cannot start as approved
        if origin == AnnotationOrigin.MODEL and status == ReviewStatus.APPROVED:
            raise DomainValidationError("Model-generated annotations cannot be directly created as approved. They must start as proposed or pending_review.")

        annotation_id = generate_id("annotation")
        revision_id = generate_id("revision")

        # Create append-only initial revision
        initial_revision = AnnotationRevisionModel(
            id=revision_id,
            annotation_id=annotation_id,
            revision_number=1,
            payload=payload,
            origin=origin.value if isinstance(origin, AnnotationOrigin) else origin,
            actor_id=actor_id,
            change_reason="Initial creation",
            confidence=confidence,
            processing_run_id=processing_run_id,
            model_metadata=model_metadata or {},
        )
        session.add(initial_revision)

        # Create annotation entity pointing to current revision
        task_type_str = record.dataset.task_type
        annotation = AnnotationModel(
            id=annotation_id,
            record_id=record_id,
            dataset_id=record.dataset_id,
            task_type=task_type_str,
            schema_version=record.schema_version,
            current_revision_id=revision_id,
            payload=payload,
            origin=origin.value if isinstance(origin, AnnotationOrigin) else origin,
            status=status.value if isinstance(status, ReviewStatus) else status,
            confidence=confidence,
            consensus_score=consensus_score,
            processing_run_id=processing_run_id,
        )
        session.add(annotation)

        # Record initial event
        event_id = generate_id("event")
        event = ReviewEventModel(
            id=event_id,
            annotation_id=annotation_id,
            actor_id=actor_id,
            from_status=ReviewStatus.PROPOSED.value,
            to_status=annotation.status,
            reason="Initial annotation recorded",
        )
        session.add(event)
        session.flush()

        return AnnotationContract.model_validate(annotation)

    @staticmethod
    def get_annotation(session: Session, annotation_id: str) -> AnnotationContract:
        stmt = select(AnnotationModel).where(AnnotationModel.id == annotation_id)
        annotation = session.scalar(stmt)
        if not annotation:
            raise ResourceNotFoundError("Annotation", annotation_id)
        return AnnotationContract.model_validate(annotation)

    @staticmethod
    def get_revisions(session: Session, annotation_id: str) -> list[AnnotationRevisionContract]:
        stmt = (
            select(AnnotationRevisionModel)
            .where(AnnotationRevisionModel.annotation_id == annotation_id)
            .order_by(AnnotationRevisionModel.revision_number.asc())
        )
        revisions = session.scalars(stmt).all()
        return [AnnotationRevisionContract.model_validate(r) for r in revisions]

    @staticmethod
    def update_annotation_payload(
        session: Session,
        annotation_id: str,
        payload: dict[str, Any],
        actor_id: str = "default_user",
        origin: AnnotationOrigin = AnnotationOrigin.HUMAN,
        change_reason: str | None = None,
        confidence: float | None = None,
    ) -> AnnotationContract:
        stmt = select(AnnotationModel).where(AnnotationModel.id == annotation_id)
        annotation = session.scalar(stmt)
        if not annotation:
            raise ResourceNotFoundError("Annotation", annotation_id)

        # Validate task schema & label constraints
        dataset = annotation.record.dataset
        validate_annotation_payload(
            task_type=dataset.task_type,
            payload=payload,
            label_schema=dataset.label_schema,
        )

        # Count existing revisions
        count_stmt = select(AnnotationRevisionModel).where(AnnotationRevisionModel.annotation_id == annotation_id)
        revisions_count = len(session.scalars(count_stmt).all())

        new_revision_id = generate_id("revision")
        revision = AnnotationRevisionModel(
            id=new_revision_id,
            annotation_id=annotation_id,
            revision_number=revisions_count + 1,
            payload=payload,
            origin=origin.value if isinstance(origin, AnnotationOrigin) else origin,
            actor_id=actor_id,
            change_reason=change_reason or "Human update",
            confidence=confidence,
        )
        session.add(revision)

        # Update current annotation pointer and payload
        annotation.current_revision_id = new_revision_id
        annotation.payload = payload
        annotation.origin = origin.value if isinstance(origin, AnnotationOrigin) else origin
        if confidence is not None:
            annotation.confidence = confidence

        session.flush()
        return AnnotationContract.model_validate(annotation)

    @staticmethod
    def transition_review_status(
        session: Session,
        annotation_id: str,
        next_status: ReviewStatus,
        actor_id: str = "default_user",
        reason: str | None = None,
    ) -> AnnotationContract:
        stmt = select(AnnotationModel).where(AnnotationModel.id == annotation_id)
        annotation = session.scalar(stmt)
        if not annotation:
            raise ResourceNotFoundError("Annotation", annotation_id)

        curr_status = ReviewStatus(annotation.status)
        if not can_transition_review_status(curr_status, next_status):
            raise InvalidStateTransitionError(
                from_state=curr_status.value,
                to_state=next_status.value,
                details={"annotation_id": annotation_id},
            )

        annotation.status = next_status.value

        # Log auditable review event
        event_id = generate_id("event")
        event = ReviewEventModel(
            id=event_id,
            annotation_id=annotation_id,
            actor_id=actor_id,
            from_status=curr_status.value,
            to_status=next_status.value,
            reason=reason,
        )
        session.add(event)
        session.flush()

        return AnnotationContract.model_validate(annotation)

    @staticmethod
    def get_review_events(session: Session, annotation_id: str) -> list[ReviewEventContract]:
        stmt = (
            select(ReviewEventModel)
            .where(ReviewEventModel.annotation_id == annotation_id)
            .order_by(ReviewEventModel.created_at.asc())
        )
        events = session.scalars(stmt).all()
        return [ReviewEventContract.model_validate(e) for e in events]
