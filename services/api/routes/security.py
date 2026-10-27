"""
API routes for project membership (RBAC), quota usage, and audit trail logs.
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import ProjectMemberModel
from packages.dataset_core.db.session import get_db
from packages.dataset_core.exceptions import ResourceNotFoundError
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import get_auth_user, verify_project_access
from packages.dataset_security.quotas import QuotaManager
from packages.dataset_security.roles import UserRole

router = APIRouter(prefix="/api/v1/projects/{project_id}", tags=["Security & Governance"])


class MemberRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    role: str = Field(default=UserRole.VIEWER.value)


class MemberResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    role: str
    created_at: str | None = None


class QuotaUsageResponse(BaseModel):
    project_id: str
    storage_bytes_used: int
    storage_quota_bytes: int
    storage_percentage: float
    records_used: int
    records_quota: int
    records_percentage: float


@router.get("/members", response_model=list[MemberResponse])
def list_project_members(
    project_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
):
    """List members and their roles for the specified project."""
    project = verify_project_access(session, project_id, user_id, required_role="viewer")

    members = session.scalars(
        select(ProjectMemberModel).where(ProjectMemberModel.project_id == project_id)
    ).all()

    response = [
        MemberResponse(
            id=f"owner_{project.id}",
            project_id=project.id,
            user_id=project.owner_id,
            role="owner",
            created_at=project.created_at.isoformat() if project.created_at else None,
        )
    ]
    for m in members:
        if m.user_id != project.owner_id:
            response.append(
                MemberResponse(
                    id=m.id,
                    project_id=m.project_id,
                    user_id=m.user_id,
                    role=m.role,
                    created_at=m.created_at.isoformat() if m.created_at else None,
                )
            )
    return response


@router.post("/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def add_or_update_member(
    project_id: str,
    req: MemberRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
):
    """Add or update a project member's role (requires owner permissions)."""
    verify_project_access(session, project_id, user_id, required_role="owner")

    valid_roles = [r.value for r in UserRole]
    if req.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role '{req.role}'. Valid roles are: {valid_roles}",
        )

    # Check existing member
    member = session.scalar(
        select(ProjectMemberModel).where(
            ProjectMemberModel.project_id == project_id,
            ProjectMemberModel.user_id == req.user_id,
        )
    )

    is_new = member is None
    if member:
        member.role = req.role
    else:
        member = ProjectMemberModel(
            id=f"pm_{uuid.uuid4().hex[:16]}",
            project_id=project_id,
            user_id=req.user_id,
            role=req.role,
        )
        session.add(member)

    AuditService.record_event(
        session=session,
        project_id=project_id,
        user_id=user_id,
        action="MEMBER_ADDED" if is_new else "MEMBER_ROLE_UPDATED",
        resource_type="ProjectMember",
        resource_id=req.user_id,
        details={"target_user": req.user_id, "role": req.role},
    )

    session.commit()
    session.refresh(member)

    return MemberResponse(
        id=member.id,
        project_id=member.project_id,
        user_id=member.user_id,
        role=member.role,
        created_at=member.created_at.isoformat() if member.created_at else None,
    )


@router.delete("/members/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    project_id: str,
    target_user_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
):
    """Remove a member from the project (requires owner permissions)."""
    project = verify_project_access(session, project_id, user_id, required_role="owner")

    if target_user_id == project.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove primary project owner",
        )

    member = session.scalar(
        select(ProjectMemberModel).where(
            ProjectMemberModel.project_id == project_id,
            ProjectMemberModel.user_id == target_user_id,
        )
    )
    if not member:
        raise ResourceNotFoundError("ProjectMember", target_user_id)

    session.delete(member)
    AuditService.record_event(
        session=session,
        project_id=project_id,
        user_id=user_id,
        action="MEMBER_REMOVED",
        resource_type="ProjectMember",
        resource_id=target_user_id,
        details={"removed_user": target_user_id},
    )
    session.commit()


@router.get("/usage", response_model=QuotaUsageResponse)
def get_project_quota_usage(
    project_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
):
    """Retrieve storage bytes and record counts against project quotas."""
    verify_project_access(session, project_id, user_id, required_role="viewer")
    return QuotaManager.get_project_usage(session, project_id)


@router.get("/audit-logs", response_model=list[dict[str, Any]])
def get_project_audit_logs(
    project_id: str,
    limit: int = 50,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
):
    """Query recent audit events for the project (requires editor or owner access)."""
    verify_project_access(session, project_id, user_id, required_role="editor")
    return AuditService.list_events(session, project_id, limit=limit)
