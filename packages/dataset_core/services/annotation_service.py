"""
Annotation service managing task-specific annotations, append-only revisions,
and auditable review state transitions.

Trust boundary (docs/TEXT_MVP.md §0 rule 3):
- ``origin`` / ``status`` / ``actor_id`` are NEVER accepted from a request body.
  The HTTP layer (``services/api/routes/annotations.py``) passes server-derived
  values only: origin=human + status=pending_review for manual labels, and the
  actor from ``get_auth_user``. Review decisions are explicit FSM transitions.
- This service is also called directly (never over HTTP) by trusted producers:
  the AI orchestrator (origin=model, status=pending_review), the importer
  (origin=imported, status=pending_review) and the demo seed script. Those
  callers pass provenance explicitly.
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
        """
        Create an annotation plus its initial append-only revision and ReviewEvent.

        Callers must be trusted producers: the HTTP annotation route always
        passes origin=human/status=pending_review and the identity derived from
        ``get_auth_user`` (never client-supplied values). Model/imported/synthetic
        producers pass their own provenance explicitly.
        """
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

        resolved_origin = origin.value if isinstance(origin, AnnotationOrigin) else origin
        resolved_status = status.value if isinstance(status, ReviewStatus) else status

        annotation_id = generate_id("annotation")
        revision_id = generate_id("revision")

        # Create append-only initial revision
        initial_revision = AnnotationRevisionModel(
            id=revision_id,
            annotation_id=annotation_id,
            revision_number=1,
            payload=payload,
            origin=resolved_origin,
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
            origin=resolved_origin,
            status=resolved_status,
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
            to_status=resolved_status,
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
        origin: AnnotationOrigin | None = None,
        change_reason: str | None = None,
        confidence: float | None = None,
    ) -> AnnotationContract:
        """
        Append a new payload revision to an existing annotation.

        Trust boundary: ``actor_id`` must be derived from ``get_auth_user`` by the
        HTTP layer — never from a request body. ``origin`` is deliberately NOT
        taken from callers: provenance is immutable once an annotation exists, so
        an edit can never relabel a model/imported annotation as "human" (the
        previous code coerced origin to human on every update). The parameter is
        kept for signature compatibility with older internal callers and ignored.

        Review integrity: editing a decided annotation invalidates that decision
        (the stored status no longer describes the new payload). Approved →
        needs_correction, rejected/needs_correction → pending_review and
        invalid → needs_correction are all legal FSM moves; the change is
        recorded as a ReviewEvent so the audit trail explains why a previously
        approved label is back in the queue.
        """
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

        resolved_actor = actor_id or "default_user"
        previous_origin = annotation.origin
        previous_status = ReviewStatus(annotation.status)

        # Count existing revisions
        count_stmt = select(AnnotationRevisionModel).where(AnnotationRevisionModel.annotation_id == annotation_id)
        revisions_count = len(session.scalars(count_stmt).all())

        new_revision_id = generate_id("revision")
        revision = AnnotationRevisionModel(
            id=new_revision_id,
            annotation_id=annotation_id,
            revision_number=revisions_count + 1,
            payload=payload,
            origin=previous_origin,
            actor_id=resolved_actor,
            change_reason=change_reason or "Human update",
            confidence=confidence,
        )
        session.add(revision)

        # Update current annotation pointer and payload; provenance is immutable.
        annotation.current_revision_id = new_revision_id
        annotation.payload = payload
        if confidence is not None:
            annotation.confidence = confidence

        # A revised payload cannot keep a decision about the previous payload.
        if previous_status == ReviewStatus.APPROVED:
            next_status = ReviewStatus.NEEDS_CORRECTION
        elif previous_status in (ReviewStatus.REJECTED, ReviewStatus.NEEDS_CORRECTION):
            next_status = ReviewStatus.PENDING_REVIEW
        elif previous_status == ReviewStatus.INVALID:
            next_status = ReviewStatus.NEEDS_CORRECTION
        else:
            next_status = previous_status

        if next_status != previous_status:
            annotation.status = next_status.value
            re_review_reason = "Payload revised; re-review required."
            if change_reason:
                re_review_reason = f"{re_review_reason} {change_reason}"
            session.add(
                ReviewEventModel(
                    id=generate_id("event"),
                    annotation_id=annotation_id,
                    actor_id=resolved_actor,
                    from_status=previous_status.value,
                    to_status=next_status.value,
                    reason=re_review_reason,
                )
            )

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
