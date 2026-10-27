"""
Source discovery, rights review management, and provenance tracking service.
Enforces that public accessibility is never conflated with training clearance,
and ensures that licensing decisions are auditable and immutable once frozen.
"""
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import LicenseStatus
from packages.dataset_core.db.models import (
    DatasetModel,
    DatasetRecordModel,
    SourceRecordModel,
)
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
    RightsViolationError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_sources.catalog_adapter import CatalogSourceAdapter
from packages.dataset_sources.models import (
    DiscoveredSource,
    RightsReviewRequest,
    SourceProvenanceSummary,
)
from packages.dataset_sources.safe_fetcher import SafeFetcher


class SourceDiscoveryService:
    """Orchestrates candidate source discovery, safe fetching, and rights audits."""

    @classmethod
    def search_candidates(cls, query: str = "", max_results: int = 10) -> list[DiscoveredSource]:
        """Search permitted open catalogs for candidate training data references."""
        return CatalogSourceAdapter.search(query=query, max_results=max_results)

    @classmethod
    async def inspect_remote_url(cls, url: str) -> DiscoveredSource:
        """Inspect and safely fetch an external URL reference with SSRF protection."""
        return await SafeFetcher.inspect_url(url)

    @classmethod
    def record_rights_review(
        cls,
        session: Session,
        record_id: str,
        review: RightsReviewRequest,
        reviewer_id: str = "default_user",
    ) -> SourceRecordModel:
        """
        Record a human rights review decision regarding source licensing.
        Auditable evidence text is mandatory to mark any source as approved for intended use.
        """
        stmt = select(SourceRecordModel).where(SourceRecordModel.record_id == record_id)
        source_record = session.scalar(stmt)
        if not source_record:
            raise ResourceNotFoundError("SourceRecord for Record", record_id)

        # Enforce evidentiary standards: cannot approve without evidence
        if review.license_status == LicenseStatus.APPROVED_FOR_INTENDED_USE and (
            not review.evidence_text or len(review.evidence_text.strip()) < 5
        ):
            raise DomainValidationError(
                "Substantial evidence or license excerpt is required to mark a source as approved for intended use.",
                field="evidence_text",
            )

        now_str = datetime.now(UTC).isoformat()
        review_audit_log = (
            f"\n[Rights Review on {now_str} by {reviewer_id}]: Status set to '{review.license_status.value}'. "
            f"Evidence: {review.evidence_text}."
        )
        if review.terms_notes:
            review_audit_log += f" Terms: {review.terms_notes}"

        source_record.license_status = review.license_status.value
        source_record.terms_notes = (source_record.terms_notes or "") + review_audit_log
        if review.attribution_text:
            source_record.creator_attribution = review.attribution_text

        session.flush()
        return source_record

    @classmethod
    def import_discovered_candidate(
        cls,
        session: Session,
        dataset_id: str,
        source_id: str,
        split: str = "train",
        actor_id: str = "default_user",
    ) -> DatasetRecordModel:
        """
        Imports a discovered source reference into a dataset as an unapproved candidate record.
        Strictly prevents importing sources identified as RESTRICTED or REJECTED.
        """
        dataset = session.get(DatasetModel, dataset_id)
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        catalog_item = CatalogSourceAdapter.get_source_by_id(source_id)
        if not catalog_item:
            raise ResourceNotFoundError("Discovered Source", source_id)

        # 1. Enforce rights restrictions: prohibited sources cannot be imported
        if catalog_item.get("license_status") in {LicenseStatus.RESTRICTED, LicenseStatus.REJECTED}:
            raise RightsViolationError(
                f"Source '{source_id}' is marked '{catalog_item.get('license_status')}' and cannot be imported.",
                details={"source_id": source_id, "terms": catalog_item.get("terms_notes")},
            )

        # 2. Extract content & metadata
        content = catalog_item.get("raw_content", "")
        metadata = {
            "source_id": source_id,
            "title": catalog_item.get("title"),
            "url": catalog_item.get("url"),
            "text": content,
            "char_count": len(content),
        }

        # 3. Create dataset record
        record_id = generate_id("rec")
        record = DatasetRecordModel(
            id=record_id,
            dataset_id=dataset_id,
            split=split,
            schema_version=1,
            external_key=f"ext_{source_id}",
            extra_metadata=metadata,
        )
        session.add(record)
        session.flush()

        # 4. Attach source provenance record
        source_rec = SourceRecordModel(
            id=generate_id("src"),
            record_id=record.id,
            source_type="catalog",
            source_uri=catalog_item.get("url"),
            creator_attribution=catalog_item.get("attribution_required"),
            retrieved_at=datetime.now(UTC),
            license_status=catalog_item.get("license_status", LicenseStatus.UNKNOWN).value,
            license_identifier=catalog_item.get("license_evidence"),
            license_url=catalog_item.get("url"),
            terms_notes=catalog_item.get("terms_notes"),
        )
        session.add(source_rec)
        session.flush()

        return record

    @classmethod
    def list_sources_for_dataset(
        cls,
        session: Session,
        dataset_id: str,
    ) -> list[SourceProvenanceSummary]:
        """List all source provenance records for records in a dataset."""
        stmt = (
            select(SourceRecordModel, DatasetRecordModel)
            .join(DatasetRecordModel, SourceRecordModel.record_id == DatasetRecordModel.id)
            .where(DatasetRecordModel.dataset_id == dataset_id)
            .order_by(SourceRecordModel.created_at.desc())
        )
        rows = session.execute(stmt).all()
        summaries = []
        for src, rec in rows:
            summaries.append(
                SourceProvenanceSummary(
                    record_id=rec.id,
                    source_id=src.id,
                    source_uri=src.source_uri,
                    source_type=src.source_type,
                    license_status=src.license_status,
                    creator_attribution=src.creator_attribution,
                    retrieved_at=src.retrieved_at.isoformat() if src.retrieved_at else None,
                    terms_notes=src.terms_notes,
                )
            )
        return summaries
