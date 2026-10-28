"""
SQLAlchemy ORM models for the AI Dataset Engineering Platform.
"""
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from packages.dataset_core.db.base import Base, utc_now


class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(64), default="default_user", index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, default="")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    datasets: Mapped[list["DatasetModel"]] = relationship("DatasetModel", back_populates="project", cascade="all, delete-orphan")
    members: Mapped[list["ProjectMemberModel"]] = relationship("ProjectMemberModel", back_populates="project", cascade="all, delete-orphan")


class DatasetModel(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, default="")
    task_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    annotation_instructions: Mapped[str | None] = mapped_column(Text, default="")
    label_schema: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    project: Mapped["ProjectModel"] = relationship("ProjectModel", back_populates="datasets")
    records: Mapped[list["DatasetRecordModel"]] = relationship("DatasetRecordModel", back_populates="dataset", cascade="all, delete-orphan")
    assets: Mapped[list["AssetModel"]] = relationship("AssetModel", back_populates="dataset", cascade="all, delete-orphan")
    runs: Mapped[list["ProcessingRunModel"]] = relationship("ProcessingRunModel", back_populates="dataset", cascade="all, delete-orphan")
    versions: Mapped[list["DatasetVersionModel"]] = relationship("DatasetVersionModel", back_populates="dataset", cascade="all, delete-orphan")


class DatasetRecordModel(Base):
    __tablename__ = "dataset_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    external_key: Mapped[str | None] = mapped_column(String(255), index=True)
    split: Mapped[str] = mapped_column(String(32), default="train", index=True)
    extra_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    dataset: Mapped["DatasetModel"] = relationship("DatasetModel", back_populates="records")
    record_assets: Mapped[list["RecordAssetModel"]] = relationship("RecordAssetModel", back_populates="record", cascade="all, delete-orphan")
    annotations: Mapped[list["AnnotationModel"]] = relationship("AnnotationModel", back_populates="record", cascade="all, delete-orphan")
    source_record: Mapped[Optional["SourceRecordModel"]] = relationship("SourceRecordModel", back_populates="record", uselist=False, cascade="all, delete-orphan")


class AssetModel(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    modality: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    phash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), default="")
    dimensions: Mapped[dict[str, int] | None] = mapped_column(JSON, nullable=True)
    parent_asset_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    transformation_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    dataset: Mapped["DatasetModel"] = relationship("DatasetModel", back_populates="assets")
    record_assets: Mapped[list["RecordAssetModel"]] = relationship("RecordAssetModel", back_populates="asset")


class RecordAssetModel(Base):
    __tablename__ = "record_assets"

    record_id: Mapped[str] = mapped_column(String(64), ForeignKey("dataset_records.id", ondelete="CASCADE"), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(64), ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(64), nullable=False, default="primary_image")
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    record: Mapped["DatasetRecordModel"] = relationship("DatasetRecordModel", back_populates="record_assets")
    asset: Mapped["AssetModel"] = relationship("AssetModel", back_populates="record_assets")


class AnnotationModel(Base):
    __tablename__ = "annotations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    record_id: Mapped[str] = mapped_column(String(64), ForeignKey("dataset_records.id", ondelete="CASCADE"), nullable=False, index=True)
    dataset_id: Mapped[str] = mapped_column(String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    task_type: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    current_revision_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    origin: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending_review", index=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    consensus_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    processing_run_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("processing_runs.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    record: Mapped["DatasetRecordModel"] = relationship("DatasetRecordModel", back_populates="annotations")
    revisions: Mapped[list["AnnotationRevisionModel"]] = relationship("AnnotationRevisionModel", back_populates="annotation", cascade="all, delete-orphan")


class AnnotationRevisionModel(Base):
    __tablename__ = "annotation_revisions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    annotation_id: Mapped[str] = mapped_column(String(64), ForeignKey("annotations.id", ondelete="CASCADE"), nullable=False, index=True)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    origin: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(64), default="system")
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    processing_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    annotation: Mapped["AnnotationModel"] = relationship("AnnotationModel", back_populates="revisions")


class SourceRecordModel(Base):
    __tablename__ = "source_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    record_id: Mapped[str] = mapped_column(String(64), ForeignKey("dataset_records.id", ondelete="CASCADE"), nullable=False, unique=True)
    source_type: Mapped[str] = mapped_column(String(64), default="upload")
    source_uri: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    creator_attribution: Mapped[str | None] = mapped_column(String(512), nullable=True)
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    license_status: Mapped[str] = mapped_column(String(64), default="unknown", index=True)
    license_identifier: Mapped[str | None] = mapped_column(String(128), nullable=True)
    license_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    terms_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    record: Mapped["DatasetRecordModel"] = relationship("DatasetRecordModel", back_populates="source_record")


class ProcessingRunModel(Base):
    __tablename__ = "processing_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    run_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    configuration_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    software_version: Mapped[str] = mapped_column(String(64), default="0.1.0")
    actor_id: Mapped[str] = mapped_column(String(64), default="system")
    total_items: Mapped[int] = mapped_column(Integer, default=0)
    processed_items: Mapped[int] = mapped_column(Integer, default=0)
    failed_items: Mapped[int] = mapped_column(Integer, default=0)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_usage_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    dataset: Mapped["DatasetModel"] = relationship("DatasetModel", back_populates="runs")
    items: Mapped[list["RunItemModel"]] = relationship("RunItemModel", back_populates="run", cascade="all, delete-orphan")


class RunItemModel(Base):
    __tablename__ = "run_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    processing_run_id: Mapped[str] = mapped_column(String(64), ForeignKey("processing_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    record_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    output_reference: Mapped[str | None] = mapped_column(String(512), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    run: Mapped["ProcessingRunModel"] = relationship("ProcessingRunModel", back_populates="items")


class DatasetVersionModel(Base):
    __tablename__ = "dataset_versions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    version_tag: Mapped[str] = mapped_column(String(64), nullable=False)
    manifest_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    manifest_storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    parent_version_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("dataset_versions.id"), nullable=True)
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    quality_summary: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    documentation_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str] = mapped_column(String(64), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    dataset: Mapped["DatasetModel"] = relationship("DatasetModel", back_populates="versions")
    version_items: Mapped[list["VersionItemModel"]] = relationship("VersionItemModel", back_populates="version", cascade="all, delete-orphan")
    export_artifacts: Mapped[list["ExportArtifactModel"]] = relationship("ExportArtifactModel", back_populates="version", cascade="all, delete-orphan")


class VersionItemModel(Base):
    __tablename__ = "version_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    version_id: Mapped[str] = mapped_column(String(64), ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    record_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    annotation_revision_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    asset_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    version: Mapped["DatasetVersionModel"] = relationship("DatasetVersionModel", back_populates="version_items")


class ExportArtifactModel(Base):
    __tablename__ = "export_artifacts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    version_id: Mapped[str] = mapped_column(String(64), ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    format: Mapped[str] = mapped_column(String(32), nullable=False)
    exporter_version: Mapped[str] = mapped_column(String(32), default="1.0.0")
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    quality_warnings: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    version: Mapped["DatasetVersionModel"] = relationship("DatasetVersionModel", back_populates="export_artifacts")


class ReviewEventModel(Base):
    __tablename__ = "review_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    annotation_id: Mapped[str] = mapped_column(String(64), ForeignKey("annotations.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(64), default="system")
    from_status: Mapped[str] = mapped_column(String(32), nullable=False)
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ProjectMemberModel(Base):
    __tablename__ = "project_members"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), default="viewer")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    project: Mapped["ProjectModel"] = relationship("ProjectModel", back_populates="members")


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class ProviderCredentialModel(Base):
    __tablename__ = "provider_credentials"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), default="default_user", index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_prefix: Mapped[str] = mapped_column(String(32), default="")
    key_suffix: Mapped[str] = mapped_column(String(32), default="")
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    models: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="configured")
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


# Explicit composite indexes for high-frequency queries
Index("idx_records_dataset_split", DatasetRecordModel.dataset_id, DatasetRecordModel.split)
Index("idx_assets_dataset_sha256", AssetModel.dataset_id, AssetModel.sha256)
Index("idx_annotations_dataset_status", AnnotationModel.dataset_id, AnnotationModel.status)
Index("idx_revisions_annotation_number", AnnotationRevisionModel.annotation_id, AnnotationRevisionModel.revision_number)
Index("idx_project_members_project_user", ProjectMemberModel.project_id, ProjectMemberModel.user_id, unique=True)
Index("idx_provider_credentials_user_prov", ProviderCredentialModel.user_id, ProviderCredentialModel.provider)

