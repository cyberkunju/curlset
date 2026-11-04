"""
Authentication and Project-scoped authorization verification.
"""
from fastapi import Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import (
    AnnotationModel,
    DatasetModel,
    DatasetRecordModel,
    ProjectMemberModel,
    ProjectModel,
)
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ProjectOwnershipError,
    ResourceNotFoundError,
)
from packages.dataset_security.roles import has_permission

MAX_ACTOR_ID_LENGTH = 64


def get_auth_user(x_user_id: str | None = Header(None)) -> str:
    """
    Resolve the acting principal for the current request.

    This is the *only* accepted source of actor identity: the ``X-User-Id``
    request header. It is never read from a JSON body (see docs/STATUS.md §0
    rule 3 — ``origin``/``status``/``actor_id`` are server-derived only).

    Local single-user mode: an absent/blank header resolves to ``"default_user"``
    so the local-first workflow needs no login (``verify_project_access`` treats
    that principal as the local owner). The value is sanitised and bounded to the
    64-character column width so a malformed header cannot silently collide with
    another principal.

    NOTE: the header itself is trivially forgeable by any client that can reach
    the API. Real authentication is explicitly out of scope for this MVP
    (docs/STATUS.md §2); this function makes the *derivation* trustworthy and
    keeps every audit row/actor id server-derived rather than body-supplied.
    """
    if not x_user_id:
        return "default_user"
    cleaned = x_user_id.strip()
    if not cleaned:
        return "default_user"
    if len(cleaned) > MAX_ACTOR_ID_LENGTH:
        raise DomainValidationError(
            f"X-User-Id header must not exceed {MAX_ACTOR_ID_LENGTH} characters.",
            field="x_user_id",
        )
    return cleaned


def verify_project_access(
    session: Session,
    project_id: str,
    user_id: str,
    required_role: str = "viewer",
) -> ProjectModel:
    """
    Verify that the user has sufficient access level to the specified project.
    In local single-user mode ('default_user'), operations are unconditionally permitted.
    In multi-tenant hosted mode, checks project owner and project_members table.
    """
    project = session.get(ProjectModel, project_id)
    if not project or project.is_archived:
        raise ResourceNotFoundError("Project", project_id)

    # Local mode fallback
    if user_id == "default_user":
        return project

    # Project owner check
    if project.owner_id == user_id:
        return project

    # Check project membership
    member = session.scalar(
        select(ProjectMemberModel).where(
            ProjectMemberModel.project_id == project_id,
            ProjectMemberModel.user_id == user_id,
        )
    )

    if not member:
        raise ProjectOwnershipError(f"User '{user_id}' has no access to project '{project_id}'")

    if not has_permission(member.role, required_role):
        raise ProjectOwnershipError(
            f"User '{user_id}' has role '{member.role}' which lacks required '{required_role}' access."
        )

    return project


def verify_dataset_access(
    session: Session,
    dataset_id: str,
    user_id: str,
    required_role: str = "viewer",
) -> DatasetModel:
    """Verify access to dataset and its parent project."""
    dataset = session.get(DatasetModel, dataset_id)
    if not dataset or dataset.is_archived:
        raise ResourceNotFoundError("Dataset", dataset_id)

    verify_project_access(session, dataset.project_id, user_id, required_role)
    return dataset


def verify_record_access(
    session: Session,
    record_id: str,
    user_id: str,
    required_role: str = "viewer",
) -> DatasetRecordModel:
    """Verify access to record and its parent dataset and project."""
    record = session.get(DatasetRecordModel, record_id)
    if not record:
        raise ResourceNotFoundError("Record", record_id)

    verify_dataset_access(session, record.dataset_id, user_id, required_role)
    return record


def verify_annotation_access(
    session: Session,
    annotation_id: str,
    user_id: str,
    required_role: str = "viewer",
) -> AnnotationModel:
    """
    Verify access to an annotation through its record → dataset → project chain.

    Annotation mutations (payload revision, review transition) must always go
    through this guard so the acting principal is authorized against the owning
    project before a ReviewEvent or revision is written.
    """
    annotation = session.get(AnnotationModel, annotation_id)
    if not annotation:
        raise ResourceNotFoundError("Annotation", annotation_id)

    verify_record_access(session, annotation.record_id, user_id, required_role)
    return annotation
