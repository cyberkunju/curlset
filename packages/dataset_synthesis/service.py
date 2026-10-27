"""
Synthetic data generation service.
Coordinates bounded model inference, duplicate prevention, schema validation,
lineage tracking, and review status routing.
"""
import hashlib
import re
from datetime import UTC, datetime
from typing import Any, ClassVar

from sqlalchemy.orm import Session

from packages.dataset_core.constants import (
    AnnotationOrigin,
    LicenseStatus,
    ReviewStatus,
    RunStatus,
    RunType,
    TaskType,
)
from packages.dataset_core.db.models import (
    AnnotationModel,
    DatasetModel,
    DatasetRecordModel,
    ProcessingRunModel,
    SourceRecordModel,
)
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_synthesis.models import SynthesisBatchRequest, SynthesisRunSummary
from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.fake_provider import FakeProvider
from packages.provider_gateway.types import ProviderCapability, ProviderRequest


class SynthesisService:
    """Service orchestrating synthetic sample generation runs."""

    _providers: ClassVar[dict[str, BaseProvider]] = {
        "fake": FakeProvider(),
    }

    @classmethod
    def register_provider(cls, name: str, provider: BaseProvider) -> None:
        cls._providers[name] = provider

    @classmethod
    def get_provider(cls, name: str) -> BaseProvider:
        provider = cls._providers.get(name)
        if not provider:
            raise ResourceNotFoundError("Provider", name)
        return provider

    @classmethod
    def generate_synthetic_batch(
        cls,
        session: Session,
        request: SynthesisBatchRequest,
    ) -> SynthesisRunSummary:
        """
        Execute bounded synthetic data generation for a dataset.
        Prevents exact duplicates, attaches cryptographic lineage,
        and routes all generated candidates into pending_review.
        """
        # 1. Dataset verification
        dataset = session.query(DatasetModel).filter_by(id=request.dataset_id).first()
        if not dataset:
            raise ResourceNotFoundError("Dataset", request.dataset_id)

        # 2. Target class validation
        allowed_classes = []
        if dataset.label_schema:
            allowed_classes = dataset.label_schema.get("classes") or dataset.label_schema.get("labels") or []
        if allowed_classes and request.target_class not in allowed_classes:
            raise DomainValidationError(
                f"Target class '{request.target_class}' not in dataset schema: {allowed_classes}"
            )

        # 3. Provider capability check
        provider = cls.get_provider(request.provider_name)
        if dataset.task_type == TaskType.TEXT_CLASSIFICATION.value:
            if not provider.supports_capability(ProviderCapability.TEXT_GENERATION):
                raise DomainValidationError(
                    f"Provider '{provider.name}' does not support TEXT_GENERATION capability."
                )
        elif (
            dataset.task_type == TaskType.IMAGE_CLASSIFICATION.value
            and not provider.supports_capability(ProviderCapability.IMAGE_GENERATION)
        ):
            raise DomainValidationError(
                f"Provider '{provider.name}' does not support IMAGE_GENERATION capability."
            )


        # 4. Processing Run initialization
        run_id = generate_id("run")
        config = {
            "target_class": request.target_class,
            "count": request.count,
            "prompt_template": request.prompt_template,
            "template_version": request.template_version,
            "seed": request.seed,
            "split": request.split,
            "provider_name": request.provider_name,
            "model_name": request.model_name,
        }
        run_model = ProcessingRunModel(
            id=run_id,
            dataset_id=dataset.id,
            run_type=RunType.SYNTHESIS.value,
            status=RunStatus.RUNNING.value,
            configuration_snapshot=config,
            total_items=request.count,
            processed_items=0,
            failed_items=0,
            started_at=datetime.now(UTC),
            created_at=datetime.now(UTC),
        )
        session.add(run_model)
        session.flush()


        # 5. Build set of existing content hashes and 3-gram sets for anti-collapse filter
        existing_records = (
            session.query(DatasetRecordModel)
            .filter_by(dataset_id=dataset.id)
            .all()
        )
        existing_hashes: set[str] = set()
        existing_3gram_sets: list[set[str]] = []

        def extract_3grams(s: str) -> set[str]:
            norm = re.sub(r"\s+", " ", s.lower().strip())
            if len(norm) < 3:
                return {norm}
            return {norm[i:i + 3] for i in range(len(norm) - 2)}

        for r in existing_records:
            if r.extra_metadata and "text" in r.extra_metadata:
                raw_text = r.extra_metadata["text"].strip()
                text_hash = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()
                existing_hashes.add(text_hash)
                existing_3gram_sets.append(extract_3grams(raw_text))

        accepted_record_ids: list[str] = []
        duplicate_count = 0
        anti_collapse_rejected_count = 0
        now = datetime.now(UTC)

        # 6. Bounded generation loop
        for idx in range(request.count):
            req = ProviderRequest(
                model=request.model_name,
                task_type="text_generation",
                prompt_template=request.prompt_template,
                parameters={
                    "target_class": request.target_class,
                    "index": idx,
                    "seed": request.seed or 42,
                    "template_version": request.template_version,
                },
            )
            response = provider.generate(req)
            gen_text = response.payload.get("text", "").strip()

            if not gen_text:
                continue

            content_sha = hashlib.sha256(gen_text.encode("utf-8")).hexdigest()

            # Exact duplicate check
            if content_sha in existing_hashes:
                duplicate_count += 1
                continue

            # 3-Gram Jaccard Anti-Collapse Diversity Filter
            cand_3grams = extract_3grams(gen_text)
            is_collapsed = False
            for exist_set in existing_3gram_sets:
                if not cand_3grams or not exist_set:
                    continue
                jaccard = len(cand_3grams & exist_set) / len(cand_3grams | exist_set)
                if jaccard > 0.72:
                    is_collapsed = True
                    break

            if is_collapsed:
                anti_collapse_rejected_count += 1
                continue

            existing_hashes.add(content_sha)
            existing_3gram_sets.append(cand_3grams)

            # Create Record with explicit lineage
            record_id = generate_id("rec")
            lineage_metadata = {
                "source": "synthetic",
                "run_id": run_id,
                "provider": request.provider_name,
                "model": request.model_name,
                "prompt_template": request.prompt_template,
                "template_version": request.template_version,
                "seed": request.seed,
                "index": idx,
                "content_sha256": content_sha,
                "generated_at": now.isoformat(),
            }

            record = DatasetRecordModel(
                id=record_id,
                dataset_id=dataset.id,
                split=request.split,
                schema_version=dataset.schema_version,
                external_key=f"synth_{run_id}_{idx}",
                extra_metadata={
                    "text": gen_text,
                    "lineage": lineage_metadata,
                },
                created_at=now,
            )
            session.add(record)
            session.flush()

            # Create Annotation defaulting to PENDING_REVIEW (Rule 6: Never silently approved)
            annotation_id = generate_id("ann")
            annotation = AnnotationModel(
                id=annotation_id,
                record_id=record.id,
                dataset_id=dataset.id,
                task_type=dataset.task_type,
                schema_version=dataset.schema_version,
                payload={"label": request.target_class, "rationale": "Synthetically generated sample"},
                origin=AnnotationOrigin.SYNTHETIC.value,
                status=ReviewStatus.PENDING_REVIEW.value,
                confidence=response.confidence,
                processing_run_id=run_id,
                created_at=now,
                updated_at=now,
            )
            session.add(annotation)


            # Attach synthetic provenance source record
            source_rec = SourceRecordModel(
                id=generate_id("src"),
                record_id=record.id,
                source_type="synthetic_generation",
                source_uri=f"run://{run_id}",
                creator_attribution=f"Generated by {request.provider_name}/{request.model_name} (template {request.template_version})",
                retrieved_at=now,
                license_status=LicenseStatus.APPROVED_FOR_INTENDED_USE.value,
                terms_notes="Generated synthetically; origin disclosed in provenance metadata.",
            )
            session.add(source_rec)
            accepted_record_ids.append(record.id)

        # 7. Complete ProcessingRun
        run_model.status = RunStatus.COMPLETED.value
        run_model.finished_at = datetime.now(UTC)
        run_model.processed_items = len(accepted_record_ids)
        run_model.failed_items = duplicate_count
        run_model.cost_usage_metadata = {
            "requested": request.count,
            "accepted": len(accepted_record_ids),
            "duplicates_dropped": duplicate_count,
        }
        session.commit()

        # 8. Compute total & synthetic statistics
        all_dataset_records = session.query(DatasetRecordModel).filter_by(dataset_id=dataset.id).all()
        total_records = len(all_dataset_records)
        synthetic_count = sum(
            1 for r in all_dataset_records
            if r.extra_metadata and r.extra_metadata.get("lineage", {}).get("source") == "synthetic"
        )
        synthetic_ratio = round(synthetic_count / total_records, 4) if total_records > 0 else 0.0

        return SynthesisRunSummary(
            run_id=run_id,
            dataset_id=dataset.id,
            target_class=request.target_class,
            requested_count=request.count,
            generated_count=request.count,
            accepted_count=len(accepted_record_ids),
            duplicate_count=duplicate_count,
            anti_collapse_rejected_count=anti_collapse_rejected_count,
            lineage={
                "provider": request.provider_name,
                "model": request.model_name,
                "template_version": request.template_version,
                "prompt_template": request.prompt_template,
                "seed": request.seed,
            },
            record_ids=accepted_record_ids,
            total_dataset_records=total_records,
            synthetic_record_count=synthetic_count,
            synthetic_ratio=synthetic_ratio,
        )

    @classmethod
    def get_dataset_lineage(cls, session: Session, dataset_id: str) -> dict[str, Any]:
        """Retrieve synthetic data breakdown and generation run history for a dataset."""
        dataset = session.query(DatasetModel).filter_by(id=dataset_id).first()
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        runs = (
            session.query(ProcessingRunModel)
            .filter_by(dataset_id=dataset_id, run_type=RunType.SYNTHESIS.value)
            .order_by(ProcessingRunModel.created_at.desc())
            .all()
        )

        all_records = session.query(DatasetRecordModel).filter_by(dataset_id=dataset_id).all()
        total_count = len(all_records)
        synthetic_count = sum(
            1 for r in all_records
            if r.extra_metadata and r.extra_metadata.get("lineage", {}).get("source") == "synthetic"
        )
        real_count = total_count - synthetic_count
        ratio = round(synthetic_count / total_count, 4) if total_count > 0 else 0.0

        run_summaries = []
        for r in runs:
            cfg = r.configuration_snapshot or {}
            run_summaries.append({
                "run_id": r.id,
                "status": r.status,
                "provider": cfg.get("provider_name", "unknown"),
                "model": cfg.get("model_name", "unknown"),
                "configuration": cfg,
                "metrics": r.cost_usage_metadata,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })


        return {
            "dataset_id": dataset_id,
            "total_records": total_count,
            "real_records": real_count,
            "synthetic_records": synthetic_count,
            "synthetic_ratio": ratio,
            "runs": run_summaries,
        }
