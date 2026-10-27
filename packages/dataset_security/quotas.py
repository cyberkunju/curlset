"""
Resource and storage quota management and enforcement.
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import (
    AssetModel,
    DatasetModel,
    DatasetRecordModel,
    ProjectModel,
)
from packages.dataset_core.exceptions import QuotaExceededError, ResourceNotFoundError

DEFAULT_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024  # 100 MB
DEFAULT_RECORD_QUOTA = 10_000                     # 10,000 records


class QuotaManager:
    """Manages project-scoped quotas for storage bytes and record counts."""

    @classmethod
    def get_project_usage(cls, session: Session, project_id: str) -> dict:
        """Calculate live storage and record usage against configured project limits."""
        project = session.get(ProjectModel, project_id)
        if not project:
            raise ResourceNotFoundError("Project", project_id)

        settings = project.settings or {}
        storage_quota = settings.get("storage_quota_bytes", DEFAULT_STORAGE_QUOTA_BYTES)
        record_quota = settings.get("record_quota", DEFAULT_RECORD_QUOTA)

        # Sum byte_size across all assets for datasets in this project
        storage_used = (
            session.scalar(
                select(func.sum(AssetModel.byte_size))
                .select_from(AssetModel)
                .join(DatasetModel, AssetModel.dataset_id == DatasetModel.id)
                .where(DatasetModel.project_id == project_id)
            )
            or 0
        )

        # Count total records across all datasets in this project
        records_used = (
            session.scalar(
                select(func.count(DatasetRecordModel.id))
                .select_from(DatasetRecordModel)
                .join(DatasetModel, DatasetRecordModel.dataset_id == DatasetModel.id)
                .where(DatasetModel.project_id == project_id)
            )
            or 0
        )

        storage_pct = round((storage_used / storage_quota) * 100, 2) if storage_quota > 0 else 0.0
        records_pct = round((records_used / record_quota) * 100, 2) if record_quota > 0 else 0.0

        return {
            "project_id": project_id,
            "storage_bytes_used": storage_used,
            "storage_quota_bytes": storage_quota,
            "storage_percentage": storage_pct,
            "records_used": records_used,
            "records_quota": record_quota,
            "records_percentage": records_pct,
        }

    @classmethod
    def check_storage_quota(cls, session: Session, project_id: str, incoming_bytes: int) -> None:
        """Enforce storage byte limit before persisting incoming asset files."""
        if incoming_bytes <= 0:
            return

        usage = cls.get_project_usage(session, project_id)
        projected = usage["storage_bytes_used"] + incoming_bytes
        limit = usage["storage_quota_bytes"]

        if projected > limit:
            raise QuotaExceededError(
                resource="storage",
                current=projected,
                limit=limit,
                unit="bytes",
            )

    @classmethod
    def check_record_quota(cls, session: Session, project_id: str, incoming_records: int) -> None:
        """Enforce record limit before batch ingestion or synthesis."""
        if incoming_records <= 0:
            return

        usage = cls.get_project_usage(session, project_id)
        projected = usage["records_used"] + incoming_records
        limit = usage["records_quota"]

        if projected > limit:
            raise QuotaExceededError(
                resource="records",
                current=projected,
                limit=limit,
                unit="records",
            )
