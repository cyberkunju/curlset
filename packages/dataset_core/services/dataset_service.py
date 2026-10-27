"""
Dataset service for dataset workspace management and schema versioning.
"""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import TaskType
from packages.dataset_core.db.models import DatasetModel, ProjectModel
from packages.dataset_core.domain_models import DatasetContract
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id


class DatasetService:
    @staticmethod
    def create_dataset(
        session: Session,
        project_id: str,
        name: str,
        task_type: str,
        description: str = "",
        annotation_instructions: str = "",
        label_schema: dict[str, Any] | None = None,
    ) -> DatasetContract:
        # Validate project exists
        project = session.scalar(select(ProjectModel).where(ProjectModel.id == project_id))
        if not project:
            raise ResourceNotFoundError("Project", project_id)

        clean_name = name.strip()
        if not clean_name:
            raise DomainValidationError("Dataset name cannot be empty", field="name")

        # Validate task type
        try:
            valid_task = TaskType(task_type)
        except ValueError:
            valid_types = [t.value for t in TaskType]
            raise DomainValidationError(
                f"Invalid task type '{task_type}'. Supported tasks: {valid_types}",
                field="task_type",
            )

        dataset_id = generate_id("dataset")
        dataset = DatasetModel(
            id=dataset_id,
            project_id=project_id,
            name=clean_name,
            task_type=valid_task.value,
            description=description.strip() if description else "",
            annotation_instructions=annotation_instructions.strip() if annotation_instructions else "",
            label_schema=label_schema or {},
            schema_version=1,
            is_archived=False,
        )
        session.add(dataset)
        session.flush()
        return DatasetContract.model_validate(dataset)

    @staticmethod
    def get_dataset(session: Session, dataset_id: str) -> DatasetContract:
        stmt = select(DatasetModel).where(DatasetModel.id == dataset_id)
        dataset = session.scalar(stmt)
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)
        return DatasetContract.model_validate(dataset)

    @staticmethod
    def list_datasets(
        session: Session,
        project_id: str,
        include_archived: bool = False,
    ) -> list[DatasetContract]:
        stmt = select(DatasetModel).where(DatasetModel.project_id == project_id)
        if not include_archived:
            stmt = stmt.where(DatasetModel.is_archived == False)
        stmt = stmt.order_by(DatasetModel.created_at.desc())
        datasets = session.scalars(stmt).all()
        return [DatasetContract.model_validate(d) for d in datasets]

    @staticmethod
    def update_dataset(
        session: Session,
        dataset_id: str,
        name: str | None = None,
        description: str | None = None,
        annotation_instructions: str | None = None,
        label_schema: dict[str, Any] | None = None,
    ) -> DatasetContract:
        stmt = select(DatasetModel).where(DatasetModel.id == dataset_id)
        dataset = session.scalar(stmt)
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        if name is not None:
            clean_name = name.strip()
            if not clean_name:
                raise DomainValidationError("Dataset name cannot be empty", field="name")
            dataset.name = clean_name
        if description is not None:
            dataset.description = description.strip()
        if annotation_instructions is not None:
            dataset.annotation_instructions = annotation_instructions.strip()
        if label_schema is not None:
            dataset.label_schema = label_schema
            # Bumping schema version on schema alteration
            dataset.schema_version += 1

        session.flush()
        return DatasetContract.model_validate(dataset)
