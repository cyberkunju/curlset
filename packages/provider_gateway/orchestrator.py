"""
AI Annotation batch orchestrator: executes model inference across dataset records,
validates proposals against task schemas, attaches model provenance, and logs per-item run status.
"""
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import (
    AnnotationOrigin,
    ReviewStatus,
    RunStatus,
    RunType,
)
from packages.dataset_core.db.models import (
    DatasetModel,
    DatasetRecordModel,
    ProcessingRunModel,
    RunItemModel,
)
from packages.dataset_core.domain_models import ProcessingRunContract
from packages.dataset_core.exceptions import ResourceNotFoundError
from packages.dataset_core.id_generator import generate_id
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_core.task_schemas import validate_annotation_payload
from packages.dataset_io.storage import get_storage_backend
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import ProviderRequest


class AIAnnotationOrchestrator:
    @classmethod
    def run_annotation_batch(
        cls,
        session: Session,
        dataset_id: str,
        provider_name: str = "fake",
        model_name: str = "fake-classifier-v1",
        target_split: str | None = None,
        only_unannotated: bool = True,
        limit: int = 50,
        enable_consensus: bool = False,
    ) -> ProcessingRunContract:
        dataset = session.scalar(select(DatasetModel).where(DatasetModel.id == dataset_id))
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        gateway = ProviderGateway.get_instance()

        # 1. Initialize Processing Run
        run_id = generate_id("run")
        run = ProcessingRunModel(
            id=run_id,
            dataset_id=dataset_id,
            run_type=RunType.INFERENCE.value,
            status=RunStatus.RUNNING.value,
            configuration_snapshot={
                "provider": provider_name,
                "model": model_name,
                "target_split": target_split,
                "only_unannotated": only_unannotated,
                "limit": limit,
                "enable_consensus": enable_consensus,
            },
            started_at=datetime.now(UTC),
        )
        session.add(run)
        session.flush()

        # 2. Select target records
        stmt = select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset_id)
        if target_split:
            stmt = stmt.where(DatasetRecordModel.split == target_split)
        records = session.scalars(stmt.order_by(DatasetRecordModel.created_at.asc())).all()

        target_records: list[DatasetRecordModel] = []
        for r in records:
            if only_unannotated and r.annotations:
                continue
            target_records.append(r)
            if len(target_records) >= limit:
                break

        run.total_items = len(target_records)
        processed_count = 0
        failed_count = 0
        backend = get_storage_backend()

        # 3. Process records with bounded execution
        for record in target_records:
            item_id = generate_id("item")

            # Extract payload or asset bytes
            input_text = None
            asset_bytes = None

            if record.extra_metadata and ("text" in record.extra_metadata or "content" in record.extra_metadata):
                input_text = record.extra_metadata.get("text") or record.extra_metadata.get("content")

            if record.record_assets:
                primary_asset = record.record_assets[0].asset
                if primary_asset.modality == "text" and not input_text:
                    try:
                        input_text = backend.read_bytes(primary_asset.storage_key).decode("utf-8")
                    except (OSError, UnicodeDecodeError):
                        pass
                elif primary_asset.modality == "image":
                    try:
                        asset_bytes = backend.read_bytes(primary_asset.storage_key)
                    except OSError:
                        pass

            req = ProviderRequest(
                model=model_name,
                task_type=dataset.task_type,
                input_text=input_text,
                asset_bytes=asset_bytes,
                label_schema=dataset.label_schema,
            )

            try:
                # Primary model proposal
                response = gateway.execute(provider_name, req)

                # Validate proposal adheres strictly to task schema and label vocabulary
                validate_annotation_payload(
                    task_type=dataset.task_type,
                    payload=response.payload,
                    label_schema=dataset.label_schema,
                )

                consensus_score = None
                if enable_consensus:
                    # Consensus Critic verification pass
                    critic_resp = gateway.execute(provider_name, req)
                    if critic_resp.payload.get("label") == response.payload.get("label"):
                        consensus_score = round((response.confidence + critic_resp.confidence) / 2.0, 3)
                    else:
                        consensus_score = 0.500  # Disagreement

                # Create Model Annotation (Enforced as PENDING_REVIEW, never approved)
                AnnotationService.create_annotation(
                    session=session,
                    record_id=record.id,
                    payload=response.payload,
                    origin=AnnotationOrigin.MODEL,
                    status=ReviewStatus.PENDING_REVIEW,
                    actor_id=f"model:{model_name}",
                    confidence=response.confidence,
                    consensus_score=consensus_score,
                    processing_run_id=run.id,
                    model_metadata={
                        "provider": provider_name,
                        "model": model_name,
                        "usage": response.usage.model_dump(),
                        "latency_ms": response.latency_ms,
                    },
                )

                processed_count += 1
                run_item = RunItemModel(
                    id=item_id,
                    processing_run_id=run.id,
                    record_id=record.id,
                    idempotency_key=f"{run.id}:{record.id}",
                    status=RunStatus.COMPLETED.value,
                    attempts=1,
                    output_reference=str(response.payload),
                    finished_at=datetime.now(UTC),
                )
                session.add(run_item)

            except Exception as e:  # noqa: BLE001
                failed_count += 1
                run_item = RunItemModel(
                    id=item_id,
                    processing_run_id=run.id,
                    record_id=record.id,
                    idempotency_key=f"{run.id}:{record.id}",
                    status=RunStatus.FAILED.value,
                    attempts=1,
                    error_message=str(e),
                    finished_at=datetime.now(UTC),
                )
                session.add(run_item)

        run.processed_items = processed_count
        run.failed_items = failed_count
        run.status = RunStatus.COMPLETED.value if failed_count < len(target_records) or len(target_records) == 0 else RunStatus.FAILED.value
        run.finished_at = datetime.now(UTC)
        session.flush()

        return ProcessingRunContract.model_validate(run)
