"""
Pydantic contracts representing domain entities, boundary validation, and serialization.
"""
from datetime import UTC, datetime
from typing import Any

from pydantic import AliasChoices, BaseModel, Field, field_validator

from packages.dataset_core.constants import (
    AnnotationOrigin,
    AssetModality,
    AssetRole,
    ExportFormat,
    LicenseStatus,
    ReviewStatus,
    RunStatus,
    RunType,
    TaskType,
)


def utc_now() -> datetime:
    """Return current UTC datetime with timezone awareness."""
    return datetime.now(UTC)


class DomainBaseModel(BaseModel):
    """Base Pydantic configuration for domain contracts."""
    model_config = {
        "extra": "ignore",
        "populate_by_name": True,
        "from_attributes": True,
    }


class ProjectContract(DomainBaseModel):
    id: str
    owner_id: str = "default_user"
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = ""
    is_archived: bool = False
    settings: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class DatasetContract(DomainBaseModel):
    id: str
    project_id: str
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = ""
    task_type: TaskType
    schema_version: int = 1
    annotation_instructions: str | None = ""
    label_schema: dict[str, Any] = Field(default_factory=dict)
    is_archived: bool = False
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class AssetContract(DomainBaseModel):
    id: str
    dataset_id: str
    storage_key: str
    modality: AssetModality
    mime_type: str
    byte_size: int = Field(ge=0)
    sha256: str = Field(..., min_length=64, max_length=64)
    phash: str | None = None
    original_filename: str = ""
    dimensions: dict[str, int] | None = None  # e.g. {"width": 640, "height": 480}
    parent_asset_id: str | None = None
    transformation_metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class RecordAssetContract(DomainBaseModel):
    record_id: str
    asset_id: str
    role: AssetRole
    position: int = 0
    created_at: datetime = Field(default_factory=utc_now)


class AnnotationRevisionContract(DomainBaseModel):
    id: str
    annotation_id: str
    revision_number: int = Field(ge=1)
    payload: dict[str, Any] = Field(default_factory=dict)
    origin: AnnotationOrigin
    actor_id: str = "system"
    change_reason: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    processing_run_id: str | None = None
    model_metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class AnnotationContract(DomainBaseModel):
    id: str
    record_id: str
    dataset_id: str
    task_type: TaskType
    schema_version: int = 1
    current_revision_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    origin: AnnotationOrigin
    status: ReviewStatus = ReviewStatus.PENDING_REVIEW
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    consensus_score: float | None = Field(default=None, ge=0.0, le=1.0)
    processing_run_id: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class SourceRecordContract(DomainBaseModel):
    id: str
    record_id: str
    source_type: str = "upload"  # upload, web_retrieved, synthetic, augmented
    source_uri: str | None = None
    creator_attribution: str | None = None
    retrieved_at: datetime | None = None
    license_status: LicenseStatus = LicenseStatus.UNKNOWN
    license_identifier: str | None = None
    license_url: str | None = None
    terms_notes: str | None = None
    created_at: datetime = Field(default_factory=utc_now)


class DatasetRecordContract(DomainBaseModel):
    id: str
    dataset_id: str
    schema_version: int = 1
    external_key: str | None = None
    split: str | None = "train"  # train, val, test, unassigned
    extra_metadata: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("extra_metadata", "record_metadata"),
        serialization_alias="metadata",
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @property
    def metadata(self) -> dict[str, Any]:
        return self.extra_metadata

    @field_validator("split")

    @classmethod
    def validate_split(cls, v: str | None) -> str | None:
        if v and v not in {"train", "val", "test", "unassigned"}:
            raise ValueError(f"Invalid split '{v}'. Must be one of: train, val, test, unassigned.")
        return v


class ProcessingRunContract(DomainBaseModel):
    id: str
    dataset_id: str
    run_type: RunType
    status: RunStatus = RunStatus.PENDING
    configuration_snapshot: dict[str, Any] = Field(default_factory=dict)
    software_version: str = "0.1.0"
    actor_id: str = "system"
    total_items: int = 0
    processed_items: int = 0
    failed_items: int = 0
    error_summary: str | None = None
    cost_usage_metadata: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)


class RunItemContract(DomainBaseModel):
    id: str
    processing_run_id: str
    record_id: str | None = None
    idempotency_key: str
    status: RunStatus = RunStatus.PENDING
    attempts: int = 0
    output_reference: str | None = None
    error_message: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    finished_at: datetime | None = None


class DatasetVersionContract(DomainBaseModel):
    id: str
    dataset_id: str
    version_number: int = Field(ge=1)
    version_tag: str  # e.g. "v1.0.0"
    manifest_hash: str = Field(..., min_length=64, max_length=64)
    manifest_storage_key: str
    parent_version_id: str | None = None
    record_count: int = Field(ge=0)
    schema_version: int = 1
    quality_summary: dict[str, Any] = Field(default_factory=dict)
    documentation_markdown: str | None = None
    is_published: bool = True
    created_by: str = "system"
    created_at: datetime = Field(default_factory=utc_now)


class VersionItemContract(DomainBaseModel):
    id: str
    version_id: str
    record_id: str
    annotation_revision_id: str | None = None
    asset_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)


class ExportArtifactContract(DomainBaseModel):
    id: str
    version_id: str
    format: ExportFormat
    exporter_version: str = "1.0.0"
    storage_key: str
    byte_size: int = Field(ge=0)
    sha256: str = Field(..., min_length=64, max_length=64)
    record_count: int = Field(ge=0)
    quality_warnings: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)


class ReviewEventContract(DomainBaseModel):
    id: str
    annotation_id: str
    actor_id: str
    from_status: ReviewStatus
    to_status: ReviewStatus
    reason: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
