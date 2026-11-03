"""
Record and asset service managing multimodal samples, assets, and source provenance.
"""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.annotation_selector import select_active_annotation
from packages.dataset_core.constants import AssetModality, AssetRole, LicenseStatus
from packages.dataset_core.db.models import (
    AssetModel,
    DatasetModel,
    DatasetRecordModel,
    RecordAssetModel,
    ReviewEventModel,
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

    @staticmethod
    def get_record_detail(session: Session, record_id: str) -> dict[str, Any]:
        stmt = select(DatasetRecordModel).where(DatasetRecordModel.id == record_id)
        record = session.scalar(stmt)
        if not record:
            raise ResourceNotFoundError("DatasetRecord", record_id)

        assets_data = []
        for ra in record.record_assets:
            a = ra.asset
            assets_data.append({
                "id": a.id,
                "role": ra.role,
                "position": ra.position,
                "storage_key": a.storage_key,
                "modality": a.modality,
                "mime_type": a.mime_type,
                "byte_size": a.byte_size,
                "original_filename": a.original_filename,
                "dimensions": a.dimensions,
                "created_at": a.created_at.isoformat(),
            })

        annotation_data = None
        revisions_data = []
        review_events_data = []
        # TEXT-MVP §0 rule 4: the record's decision is the shared selector's
        # choice (approved first, newest otherwise) — never "newest annotation",
        # which would let a fresh unreviewed proposal shadow an approved label.
        active_ann = select_active_annotation(record.annotations)
        if active_ann is not None:
            annotation_data = {
                "id": active_ann.id,
                "task_type": active_ann.task_type,
                "schema_version": active_ann.schema_version,
                "payload": active_ann.payload,
                "origin": active_ann.origin,
                "status": active_ann.status,
                "confidence": active_ann.confidence,
                "consensus_score": active_ann.consensus_score,
                "current_revision_id": active_ann.current_revision_id,
                "created_at": active_ann.created_at.isoformat(),
                "updated_at": active_ann.updated_at.isoformat(),
            }
            for rev in sorted(active_ann.revisions, key=lambda x: x.revision_number):
                revisions_data.append({
                    "id": rev.id,
                    "revision_number": rev.revision_number,
                    "payload": rev.payload,
                    "origin": rev.origin,
                    "actor_id": rev.actor_id,
                    "change_reason": rev.change_reason,
                    "confidence": rev.confidence,
                    "created_at": rev.created_at.isoformat(),
                })
            events = session.scalars(
                select(ReviewEventModel)
                .where(ReviewEventModel.annotation_id == active_ann.id)
                .order_by(ReviewEventModel.created_at.asc())
            ).all()
            for ev in events:
                review_events_data.append({
                    "id": ev.id,
                    "actor_id": ev.actor_id,
                    "from_status": ev.from_status,
                    "to_status": ev.to_status,
                    "reason": ev.reason,
                    "created_at": ev.created_at.isoformat(),
                })

        return {
            "id": record.id,
            "dataset_id": record.dataset_id,
            "schema_version": record.schema_version,
            "external_key": record.external_key,
            "split": record.split,
            "metadata": record.extra_metadata or {},
            "created_at": record.created_at.isoformat(),
            "updated_at": record.updated_at.isoformat(),
            "assets": assets_data,
            "annotation": annotation_data,
            "revisions": revisions_data,
            "review_events": review_events_data,
        }

    @staticmethod
    def list_records_with_status(
        session: Session,
        dataset_id: str,
        split: str | None = None,
        review_status: str | None = None,
        search: str | None = None,
        record_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        stmt = select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset_id)
        if record_id:
            stmt = stmt.where(DatasetRecordModel.id == record_id)
        if split:
            stmt = stmt.where(DatasetRecordModel.split == split)

        all_records = session.scalars(stmt.order_by(DatasetRecordModel.created_at.asc())).all()

        filtered_items = []
        for r in all_records:
            latest_status = "unannotated"
            latest_payload = None
            annotation_id = None
            # Queue/status/search/filter all describe the selector-chosen
            # annotation, so an approved label cannot be shadowed by a newer
            # pending proposal (TEXT-MVP §0 rule 4 / B5).
            active_ann = select_active_annotation(r.annotations)
            if active_ann is not None:
                latest_status = active_ann.status
                latest_payload = active_ann.payload
                annotation_id = active_ann.id

            if review_status:
                if review_status == "unannotated" and latest_status != "unannotated":
                    continue
                if review_status != "unannotated" and latest_status != review_status:
                    continue

            # First primary asset for preview
            primary_asset = None
            if r.record_assets:
                pa = r.record_assets[0].asset
                primary_asset = {
                    "id": pa.id,
                    "modality": pa.modality,
                    "mime_type": pa.mime_type,
                    "dimensions": pa.dimensions,
                    "original_filename": pa.original_filename,
                }

            if search:
                q = search.lower().strip()
                id_match = q in r.id.lower()
                key_match = bool(r.external_key and q in r.external_key.lower())
                label_match = False
                text_match = False
                if latest_payload and isinstance(latest_payload, dict):
                    if "label" in latest_payload:
                        label_match = q in str(latest_payload["label"]).lower()
                    if "text" in latest_payload:
                        text_match = q in str(latest_payload["text"]).lower()
                file_match = bool(
                    primary_asset
                    and primary_asset.get("original_filename")
                    and q in primary_asset["original_filename"].lower()
                )
                if not (id_match or key_match or label_match or text_match or file_match):
                    continue

            filtered_items.append({
                "id": r.id,
                "dataset_id": r.dataset_id,
                "external_key": r.external_key,
                "split": r.split,
                "metadata": r.extra_metadata or {},
                "created_at": r.created_at.isoformat(),
                "review_status": latest_status,
                "annotation_id": annotation_id,
                "annotation_payload": latest_payload,
                "primary_asset": primary_asset,
            })

        total = len(filtered_items)
        paged = filtered_items[offset : offset + limit]
        return paged, total

