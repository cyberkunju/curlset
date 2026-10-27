"""
API endpoints for Project workspaces and scoped Dataset operations.
"""
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_core.domain_models import DatasetContract, ProjectContract
from packages.dataset_core.services.dataset_service import DatasetService
from packages.dataset_core.services.project_service import ProjectService

router = APIRouter(prefix="/api/v1/projects", tags=["Projects"])


class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = ""
    settings: dict[str, Any] | None = None


class UpdateProjectRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    settings: dict[str, Any] | None = None


class CreateDatasetRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    task_type: str = Field(..., min_length=1)
    description: str | None = ""
    annotation_instructions: str | None = ""
    label_schema: dict[str, Any] | None = None


def get_current_user(x_user_id: str | None = Header(None)) -> str:
    """Extract authenticated user/owner from header or fallback to default local user."""
    return x_user_id or "default_user"


@router.post("", response_model=ProjectContract, status_code=status.HTTP_201_CREATED)
def create_project(
    req: CreateProjectRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    return ProjectService.create_project(
        session=session,
        name=req.name,
        description=req.description or "",
        owner_id=user_id,
        settings=req.settings,
    )


@router.get("", response_model=list[ProjectContract])
def list_projects(
    include_archived: bool = False,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    return ProjectService.list_projects(
        session=session,
        owner_id=user_id,
        include_archived=include_archived,
    )


@router.get("/{project_id}", response_model=ProjectContract)
def get_project(
    project_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    project = ProjectService.get_project(session=session, project_id=project_id)
    if project.owner_id != user_id and user_id != "default_user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return project


@router.patch("/{project_id}", response_model=ProjectContract)
def update_project(
    project_id: str,
    req: UpdateProjectRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    project = ProjectService.get_project(session=session, project_id=project_id)
    if project.owner_id != user_id and user_id != "default_user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return ProjectService.update_project(
        session=session,
        project_id=project_id,
        name=req.name,
        description=req.description,
        settings=req.settings,
    )


@router.post("/{project_id}/archive", response_model=ProjectContract)
def archive_project(
    project_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    project = ProjectService.get_project(session=session, project_id=project_id)
    if project.owner_id != user_id and user_id != "default_user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return ProjectService.archive_project(session=session, project_id=project_id)


# Scoped Dataset Endpoints
@router.post("/{project_id}/datasets", response_model=DatasetContract, status_code=status.HTTP_201_CREATED)
def create_project_dataset(
    project_id: str,
    req: CreateDatasetRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    project = ProjectService.get_project(session=session, project_id=project_id)
    if project.owner_id != user_id and user_id != "default_user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return DatasetService.create_dataset(
        session=session,
        project_id=project_id,
        name=req.name,
        task_type=req.task_type,
        description=req.description or "",
        annotation_instructions=req.annotation_instructions or "",
        label_schema=req.label_schema,
    )


@router.get("/{project_id}/datasets", response_model=list[DatasetContract])
def list_project_datasets(
    project_id: str,
    include_archived: bool = False,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    project = ProjectService.get_project(session=session, project_id=project_id)
    if project.owner_id != user_id and user_id != "default_user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return DatasetService.list_datasets(
        session=session,
        project_id=project_id,
        include_archived=include_archived,
    )
