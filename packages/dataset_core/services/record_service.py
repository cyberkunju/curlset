"""
Record and asset service managing multimodal samples, assets, and source provenance.
"""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import AssetModality, AssetRole, LicenseStatus
from packages.dataset_core.db.models import (
    AssetModel,
    DatasetModel,
    DatasetRecordModel,
    RecordAssetModel,
    SourceRecordModel,
)
from packages.dataset_core.domain_models import (
    AssetContract,
    DatasetRecordContract,
    SourceRecordContract,
)
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id


class RecordService:
    @staticmethod
    def create_record(
        session: Session,
        dataset_id: str,
        external_key: str | None = None,
        split: str = "train",
        metadata: dict[str, Any] | None = None,
    ) -> DatasetRecordContract:
        # Validate dataset exists
        dataset = session.scalar(select(DatasetModel).where(DatasetModel.id == dataset_id))
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        valid_splits = {"train", "val", "test", "unassigned"}
        if split not in valid_splits:
            raise DomainValidationError(f"Invalid split '{split}'. Allowed: {valid_splits}", field="split")

        record_id = generate_id("record")
        record = DatasetRecordModel(
            id=record_id,
            dataset_id=dataset_id,
            schema_version=dataset.schema_version,
            external_key=external_key,
            split=split,
            extra_metadata=metadata or {},
        )
        session.add(record)
        session.flush()
        return DatasetRecordContract.model_validate(record)

    @staticmethod
    def get_record(session: Session, record_id: str) -> DatasetRecordContract:
        stmt = select(DatasetRecordModel).where(DatasetRecordModel.id == record_id)
        record = session.scalar(stmt)
        if not record:
            raise ResourceNotFoundError("DatasetRecord", record_id)
        return DatasetRecordContract.model_validate(record)

    @staticmethod
    def list_records(
        session: Session,
        dataset_id: str,
        split: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[DatasetRecordContract]:
        stmt = select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset_id)
        if split:
            stmt = stmt.where(DatasetRecordModel.split == split)
        stmt = stmt.order_by(DatasetRecordModel.created_at.asc()).limit(limit).offset(offset)
        records = session.scalars(stmt).all()
        return [DatasetRecordContract.model_validate(r) for r in records]

    @staticmethod
    def create_asset(
        session: Session,
        dataset_id: str,
        storage_key: str,
        modality: AssetModality,
        mime_type: str,
        byte_size: int,
        sha256: str,
        phash: str | None = None,
        original_filename: str = "",
        dimensions: dict[str, int] | None = None,
        parent_asset_id: str | None = None,
        transformation_metadata: dict[str, Any] | None = None,
    ) -> AssetContract:
        dataset = session.scalar(select(DatasetModel).where(DatasetModel.id == dataset_id))
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        if len(sha256) != 64:
            raise DomainValidationError("SHA-256 hash must be exactly 64 hexadecimal characters", field="sha256")

        asset_id = generate_id("asset")
        asset = AssetModel(
            id=asset_id,
            dataset_id=dataset_id,
            storage_key=storage_key,
            modality=modality.value if isinstance(modality, AssetModality) else modality,
            mime_type=mime_type,
            byte_size=byte_size,
            sha256=sha256,
            phash=phash,
            original_filename=original_filename,
            dimensions=dimensions,
            parent_asset_id=parent_asset_id,
            transformation_metadata=transformation_metadata or {},
        )
        session.add(asset)
        session.flush()
        return AssetContract.model_validate(asset)

    @staticmethod
    def link_asset_to_record(
        session: Session,
        record_id: str,
        asset_id: str,
        role: AssetRole = AssetRole.PRIMARY_IMAGE,
        position: int = 0,
    ) -> None:
        record = session.scalar(select(DatasetRecordModel).where(DatasetRecordModel.id == record_id))
        if not record:
            raise ResourceNotFoundError("DatasetRecord", record_id)
        asset = session.scalar(select(AssetModel).where(AssetModel.id == asset_id))
        if not asset:
            raise ResourceNotFoundError("Asset", asset_id)

        role_value = role.value if isinstance(role, AssetRole) else role
        link = RecordAssetModel(
            record_id=record_id,
            asset_id=asset_id,
            role=role_value,
            position=position,
        )
        session.merge(link)
        session.flush()

    @staticmethod
    def attach_source_record(
        session: Session,
        record_id: str,
        source_type: str = "upload",
        source_uri: str | None = None,
        license_status: LicenseStatus = LicenseStatus.UNKNOWN,
        creator_attribution: str | None = None,
        license_identifier: str | None = None,
        license_url: str | None = None,
        terms_notes: str | None = None,
    ) -> SourceRecordContract:
        record = session.scalar(select(DatasetRecordModel).where(DatasetRecordModel.id == record_id))
        if not record:
            raise ResourceNotFoundError("DatasetRecord", record_id)

        source_id = generate_id("source")
        lic_val = license_status.value if isinstance(license_status, LicenseStatus) else license_status
        source = SourceRecordModel(
            id=source_id,
            record_id=record_id,
            source_type=source_type,
            source_uri=source_uri,
            creator_attribution=creator_attribution,
            license_status=lic_val,
            license_identifier=license_identifier,
            license_url=license_url,
            terms_notes=terms_notes,
        )
        merged = session.merge(source)
        session.flush()
        session.refresh(merged)
        return SourceRecordContract.model_validate(merged)

