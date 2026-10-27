"""
Project service for workspace and access lifecycle management.
"""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import ProjectModel
from packages.dataset_core.domain_models import ProjectContract
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id


class ProjectService:
    @staticmethod
    def create_project(
        session: Session,
        name: str,
        description: str = "",
        owner_id: str = "default_user",
        settings: dict[str, Any] | None = None,
    ) -> ProjectContract:
        clean_name = name.strip()
        if not clean_name:
            raise DomainValidationError("Project name cannot be empty", field="name")
        if len(clean_name) > 255:
            raise DomainValidationError("Project name cannot exceed 255 characters", field="name")

        project_id = generate_id("project")
        project = ProjectModel(
            id=project_id,
            owner_id=owner_id,
            name=clean_name,
            description=description.strip() if description else "",
            settings=settings or {},
            is_archived=False,
        )
        session.add(project)
        session.flush()
        return ProjectContract.model_validate(project)

    @staticmethod
    def get_project(session: Session, project_id: str) -> ProjectContract:
        stmt = select(ProjectModel).where(ProjectModel.id == project_id)
        project = session.scalar(stmt)
        if not project:
            raise ResourceNotFoundError("Project", project_id)
        return ProjectContract.model_validate(project)

    @staticmethod
    def list_projects(
        session: Session,
        owner_id: str | None = None,
        include_archived: bool = False,
    ) -> list[ProjectContract]:
        stmt = select(ProjectModel)
        if owner_id:
            stmt = stmt.where(ProjectModel.owner_id == owner_id)
        if not include_archived:
            stmt = stmt.where(ProjectModel.is_archived == False)
        stmt = stmt.order_by(ProjectModel.created_at.desc())
        projects = session.scalars(stmt).all()
        return [ProjectContract.model_validate(p) for p in projects]

    @staticmethod
    def update_project(
        session: Session,
        project_id: str,
        name: str | None = None,
        description: str | None = None,
        settings: dict[str, Any] | None = None,
    ) -> ProjectContract:
        stmt = select(ProjectModel).where(ProjectModel.id == project_id)
        project = session.scalar(stmt)
        if not project:
            raise ResourceNotFoundError("Project", project_id)

        if name is not None:
            clean_name = name.strip()
            if not clean_name:
                raise DomainValidationError("Project name cannot be empty", field="name")
            project.name = clean_name
        if description is not None:
            project.description = description.strip()
        if settings is not None:
            project.settings = settings

        session.flush()
        return ProjectContract.model_validate(project)

    @staticmethod
    def archive_project(session: Session, project_id: str) -> ProjectContract:
        stmt = select(ProjectModel).where(ProjectModel.id == project_id)
        project = session.scalar(stmt)
        if not project:
            raise ResourceNotFoundError("Project", project_id)
        project.is_archived = True
        session.flush()
        return ProjectContract.model_validate(project)
