"""
Authentication and Project-scoped authorization verification.
"""
from fastapi import Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import (
    DatasetModel,
    DatasetRecordModel,
    ProjectMemberModel,
    ProjectModel,
)
from packages.dataset_core.exceptions import (
    ProjectOwnershipError,
    ResourceNotFoundError,
)
from packages.dataset_security.roles import has_permission


def get_auth_user(x_user_id: str | None = Header(None)) -> str:
    """
    Extract authenticated user/tenant identifier from request header.
    Defaults to 'default_user' for local single-user mode to preserve 100% backward compatibility.
    """
    return x_user_id or "default_user"


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
