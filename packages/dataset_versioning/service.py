"""
Dataset Versioning Service managing immutable snapshot creation, manifest hashing,
version comparison, and documentation generation.
"""
import json
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import (
    AssetModel,
    DatasetModel,
    DatasetRecordModel,
    DatasetVersionModel,
    RecordAssetModel,
    VersionItemModel,
)
from packages.dataset_core.exceptions import (
    PublishingBlockedError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_io.storage import get_storage_backend
from packages.dataset_quality.engine import QualityEngine
from packages.dataset_versioning.doc_generator import generate_dataset_card_markdown
from packages.dataset_versioning.manifest import (
    DatasetVersionManifest,
    ManifestAnnotationItem,
    ManifestAssetItem,
    ManifestRecordItem,
    compute_manifest_hash,
    serialize_canonical_manifest,
)


class VersioningService:
    """Manages creation, immutability, diffing, and retrieval of dataset versions."""

    @staticmethod
    def create_version(
        session: Session,
        dataset_id: str,
        version_tag: str | None = None,
        created_by: str = "system",
        force: bool = False,
    ) -> DatasetVersionModel:
        """
        Freeze current dataset state into an immutable, cryptographically verifiable version.
        Runs quality audits prior to freezing; blocks publication if blocking issues exist.
        """
        dataset = session.get(DatasetModel, dataset_id)
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        # 1. Run Quality Validation Engine
        report = QualityEngine.validate_dataset(session=session, dataset_id=dataset_id)
        if not report.is_publishable and not force:
            blocking_findings = [
                f.model_dump() for f in report.findings if f.severity == "blocking"
            ]
            raise PublishingBlockedError(
                message=f"Publication blocked: {report.blocking_count} blocking issue(s) detected. Run Quality Engine to inspect and resolve before publishing.",
                blocking_count=report.blocking_count,
                findings=blocking_findings,
            )

        # 2. Determine Version Number and Tag
        max_num = session.execute(
            select(func.max(DatasetVersionModel.version_number)).where(
                DatasetVersionModel.dataset_id == dataset_id
            )
        ).scalar()
        next_version_num = (max_num or 0) + 1
        tag = version_tag.strip() if version_tag and version_tag.strip() else f"v{next_version_num}.0.0"

        # Check tag uniqueness for this dataset
        existing_tag = session.execute(
            select(DatasetVersionModel).where(
                DatasetVersionModel.dataset_id == dataset_id,
                DatasetVersionModel.version_tag == tag,
            )
        ).scalar_one_or_none()
        if existing_tag:
            tag = f"{tag}-rev{next_version_num}"

        # 3. Query all dataset records in deterministic order
        records = (
            session.execute(
                select(DatasetRecordModel)
                .where(DatasetRecordModel.dataset_id == dataset_id)
                .order_by(DatasetRecordModel.id)
            )
            .scalars()
            .all()
        )

        version_id = generate_id("ver")
        manifest_records: list[ManifestRecordItem] = []
        version_items: list[VersionItemModel] = []

        for record in records:
            # Annotation item
            manifest_ann = None
            revision_id = None
            active_ann = record.annotations[0] if record.annotations else None
            if active_ann:
                ann = active_ann
                revision_id = ann.current_revision_id or ann.id
                rev_num = len(ann.revisions) if ann.revisions else 1

                manifest_ann = ManifestAnnotationItem(
                    annotation_id=ann.id,
                    revision_id=revision_id,
                    revision_number=rev_num,
                    origin=ann.origin,
                    status=ann.status,
                    payload=ann.payload or {},
                    confidence=ann.confidence,
                    consensus_score=ann.consensus_score,
                )

            # Asset items
            record_assets = (
                session.execute(
                    select(RecordAssetModel, AssetModel)
                    .join(AssetModel, RecordAssetModel.asset_id == AssetModel.id)
                    .where(RecordAssetModel.record_id == record.id)
                    .order_by(RecordAssetModel.position)
                )
                .all()
            )

            manifest_assets: list[ManifestAssetItem] = []
            asset_ids: list[str] = []
            for ra, asset in record_assets:
                asset_ids.append(asset.id)
                manifest_assets.append(
                    ManifestAssetItem(
                        asset_id=asset.id,
                        role=ra.role,
                        modality=asset.modality,
                        mime_type=asset.mime_type,
                        byte_size=asset.byte_size,
                        sha256=asset.sha256,
                        storage_key=asset.storage_key,
                        original_filename=asset.original_filename,
                        dimensions=asset.dimensions,
                    )
                )

            manifest_records.append(
                ManifestRecordItem(
                    record_id=record.id,
                    external_key=record.external_key,
                    split=record.split,
                    metadata=record.extra_metadata or {},
                    annotation=manifest_ann,
                    assets=manifest_assets,
                )
            )

            # Version item model
            version_items.append(
                VersionItemModel(
                    id=generate_id("vitem"),
                    version_id=version_id,
                    record_id=record.id,
                    annotation_revision_id=revision_id,
                    asset_ids=asset_ids,
                )
            )

        # 4. Construct canonical manifest
        now_iso = datetime.now(UTC).isoformat()
        manifest = DatasetVersionManifest(
            manifest_version="1.0.0",
            version_id=version_id,
            dataset_id=dataset_id,
            dataset_name=dataset.name,
            version_tag=tag,
            version_number=next_version_num,
            task_type=dataset.task_type,
            schema_version=dataset.schema_version,
            created_at=now_iso,
            created_by=created_by,
            record_count=len(records),
            quality_summary=report.model_dump(),
            records=manifest_records,
        )

        manifest_bytes = serialize_canonical_manifest(manifest)
        manifest_hash = compute_manifest_hash(manifest_bytes)

        # 5. Save manifest to storage
        storage = get_storage_backend()
        manifest_storage_key = f"manifests/{dataset_id}/{version_id}_{manifest_hash[:12]}.json"
        storage.write_bytes(manifest_storage_key, manifest_bytes)

        # 6. Generate dataset card documentation
        dataset_card = generate_dataset_card_markdown(
            manifest=manifest,
            dataset_description=dataset.description,
            annotation_instructions=dataset.annotation_instructions,
        )

        # 7. Persist DatasetVersionModel and VersionItems
        version_model = DatasetVersionModel(
            id=version_id,
            dataset_id=dataset_id,
            version_number=next_version_num,
            version_tag=tag,
            manifest_hash=manifest_hash,
            manifest_storage_key=manifest_storage_key,
            record_count=len(records),
            schema_version=dataset.schema_version,
            quality_summary=report.model_dump(),
            documentation_markdown=dataset_card,
            is_published=True,
            created_by=created_by,
        )
        session.add(version_model)
        for vi in version_items:
            session.add(vi)

        session.commit()
        session.refresh(version_model)
        return version_model

    @staticmethod
    def list_versions(session: Session, dataset_id: str) -> list[DatasetVersionModel]:
        """List all published versions of a dataset ordered newest to oldest."""
        return (
            session.execute(
                select(DatasetVersionModel)
                .where(DatasetVersionModel.dataset_id == dataset_id)
                .order_by(DatasetVersionModel.version_number.desc())
            )
            .scalars()
            .all()
        )

    @staticmethod
    def get_version(session: Session, version_id: str) -> DatasetVersionModel:
        """Retrieve a specific dataset version."""
        version = session.get(DatasetVersionModel, version_id)
        if not version:
            raise ResourceNotFoundError("DatasetVersion", version_id)
        return version

    @staticmethod
    def get_version_manifest(session: Session, version_id: str) -> dict:
        """Retrieve the exact canonical manifest content for a version."""
        version = VersioningService.get_version(session, version_id)
        storage = get_storage_backend()
        data_bytes = storage.read_bytes(version.manifest_storage_key)
        return json.loads(data_bytes.decode("utf-8"))

    @staticmethod
    def compare_versions(
        session: Session, version_a_id: str, version_b_id: str
    ) -> dict:
        """
        Produce a deterministic semantic diff between two immutable versions:
        identifies added records, removed records, and updated annotation revisions.
        """
        v_a = VersioningService.get_version(session, version_a_id)
        v_b = VersioningService.get_version(session, version_b_id)

        items_a = {
            item.record_id: item.annotation_revision_id for item in v_a.version_items
        }
        items_b = {
            item.record_id: item.annotation_revision_id for item in v_b.version_items
        }

        records_a = set(items_a.keys())
        records_b = set(items_b.keys())

        added_record_ids = sorted(records_b - records_a)
        removed_record_ids = sorted(records_a - records_b)
        common_records = records_a & records_b

        updated_annotation_record_ids = [
            rid for rid in sorted(common_records) if items_a[rid] != items_b[rid]
        ]

        return {
            "version_a": {
                "id": v_a.id,
                "tag": v_a.version_tag,
                "version_number": v_a.version_number,
                "record_count": v_a.record_count,
                "manifest_hash": v_a.manifest_hash,
            },
            "version_b": {
                "id": v_b.id,
                "tag": v_b.version_tag,
                "version_number": v_b.version_number,
                "record_count": v_b.record_count,
                "manifest_hash": v_b.manifest_hash,
            },
            "records_added": added_record_ids,
            "records_removed": removed_record_ids,
            "annotations_updated": updated_annotation_record_ids,
            "net_record_change": len(records_b) - len(records_a),
        }
