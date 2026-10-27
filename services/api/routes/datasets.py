"""
API endpoints for Dataset workspace details, statistics, and record management.
"""
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import (
    AnnotationModel,
    DatasetRecordModel,
)
from packages.dataset_core.db.session import get_db
from packages.dataset_core.domain_models import DatasetContract, DatasetRecordContract
from packages.dataset_core.services.dataset_service import DatasetService
from packages.dataset_core.services.record_service import RecordService

router = APIRouter(prefix="/api/v1/datasets", tags=["Datasets"])


class UpdateDatasetRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    annotation_instructions: str | None = None
    label_schema: dict[str, Any] | None = None


class DatasetDetailResponse(BaseModel):
    dataset: DatasetContract
    stats: dict[str, int]


@router.get("/{dataset_id}", response_model=DatasetDetailResponse)
def get_dataset_detail(
    dataset_id: str,
    session: Session = Depends(get_db),
):
    dataset = DatasetService.get_dataset(session=session, dataset_id=dataset_id)

    # Compute live, un-mocked statistics from database rows
    total_records = session.scalar(
        select(func.count(DatasetRecordModel.id)).where(DatasetRecordModel.dataset_id == dataset_id)
    ) or 0

    annotations_query = (
        select(AnnotationModel.status, func.count(AnnotationModel.id))
        .where(AnnotationModel.dataset_id == dataset_id)
        .group_by(AnnotationModel.status)
    )
    status_counts = dict(session.execute(annotations_query).all())

    stats = {
        "total_records": total_records,
        "pending_review": status_counts.get("pending_review", 0),
        "approved": status_counts.get("approved", 0),
        "rejected": status_counts.get("rejected", 0),
        "needs_correction": status_counts.get("needs_correction", 0),
        "invalid": status_counts.get("invalid", 0),
    }

    return DatasetDetailResponse(dataset=dataset, stats=stats)


@router.patch("/{dataset_id}", response_model=DatasetContract)
def update_dataset(
    dataset_id: str,
    req: UpdateDatasetRequest,
    session: Session = Depends(get_db),
):
    return DatasetService.update_dataset(
        session=session,
        dataset_id=dataset_id,
        name=req.name,
        description=req.description,
        annotation_instructions=req.annotation_instructions,
        label_schema=req.label_schema,
    )


@router.get("/{dataset_id}/records", response_model=list[DatasetRecordContract])
def list_dataset_records(
    dataset_id: str,
    split: str | None = Query(None, description="Optional split filter: train, val, test"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_db),
) -> list[DatasetRecordContract]:
    return RecordService.list_records(
        session=session,
        dataset_id=dataset_id,
        split=split,
        limit=limit,
        offset=offset,
    )


@router.get("/{dataset_id}/clusters")
def get_dataset_clusters(
    dataset_id: str,
    session: Session = Depends(get_db),
):
    """
    Compute 2D Semantic Cluster Map coordinates and sparse coverage gap cells (data deserts).
    """
    dataset = DatasetService.get_dataset(session=session, dataset_id=dataset_id)
    records = session.scalars(
        select(DatasetRecordModel)
        .where(DatasetRecordModel.dataset_id == dataset.id)
        .order_by(DatasetRecordModel.id)
    ).all()

    from packages.dataset_quality.clustering import compute_dataset_clusters

    return compute_dataset_clusters(records)


class TokenSimulationRequest(BaseModel):
    target_context_window: int = 4096
    system_prompt: str = ""


@router.post("/{dataset_id}/token-simulation")
def simulate_dataset_tokens(
    dataset_id: str,
    req: TokenSimulationRequest,
    session: Session = Depends(get_db),
):
    """
    Live multimodal token and context-window capacity simulation across dataset records.
    """
    dataset = DatasetService.get_dataset(session=session, dataset_id=dataset_id)
    records = session.scalars(
        select(DatasetRecordModel)
        .where(DatasetRecordModel.dataset_id == dataset.id)
    ).all()

    from packages.dataset_io.token_simulator import estimate_multimodal_tokens

    token_breakdowns = []
    total_tokens_list = []
    truncated_count = 0
    at_risk_count = 0

    for r in records:
        text = r.extra_metadata.get("text", "") if r.extra_metadata else ""
        has_img = any(ra.role in {"primary_image", "image"} for ra in r.record_assets) if r.record_assets else False

        sim = estimate_multimodal_tokens(
            text=text,
            has_image=has_img,
            system_prompt=req.system_prompt,
            target_context_window=req.target_context_window,
        )
        total_tokens_list.append(sim["total_tokens"])
        if not sim["fits_target"]:
            truncated_count += 1
        elif sim["truncation_risk"]:
            at_risk_count += 1

        token_breakdowns.append({
            "record_id": r.id,
            **sim,
        })

    total_records = len(records)
    avg_tokens = round(sum(total_tokens_list) / total_records, 1) if total_records > 0 else 0
    sorted_tokens = sorted(total_tokens_list)
    p95_idx = int(total_records * 0.95) if total_records > 0 else 0
    p95_tokens = sorted_tokens[p95_idx] if sorted_tokens else 0
    max_tokens = max(total_tokens_list) if total_tokens_list else 0

    return {
        "dataset_id": dataset.id,
        "target_context_window": req.target_context_window,
        "total_records_evaluated": total_records,
        "avg_tokens_per_record": avg_tokens,
        "p95_tokens": p95_tokens,
        "max_tokens": max_tokens,
        "records_truncated": truncated_count,
        "truncation_percentage": round((truncated_count / total_records) * 100, 2) if total_records > 0 else 0.0,
        "records_at_risk": at_risk_count,
        "sample_breakdowns": token_breakdowns[:20],
    }


class AugmentDatasetRequest(BaseModel):
    transform_type: str = "hflip"  # "hflip" | "vflip" | "rot90_cw" | "rot180"
    record_ids: list[str] | None = None
    seed: int | None = 42
    target_split: str | None = None


@router.post("/{dataset_id}/augment")
def augment_dataset_records(
    dataset_id: str,
    req: AugmentDatasetRequest,
    session: Session = Depends(get_db),
):
    """
    Execute geometry-aware deterministic affine augmentation on dataset records.
    Co-transforms media assets and spatial bounding boxes simultaneously with origin='augmented'.
    """
    import hashlib
    from datetime import UTC, datetime

    from packages.dataset_core.constants import (
        AnnotationOrigin,
        AssetModality,
        ReviewStatus,
    )
    from packages.dataset_core.db.models import (
        AnnotationModel,
        AnnotationRevisionModel,
        AssetModel,
        RecordAssetModel,
    )
    from packages.dataset_core.id_generator import generate_id
    from packages.dataset_io.spatial_augment import (
        transform_bbox_geometry,
        transform_image_bytes,
    )
    from packages.dataset_io.storage import get_storage_backend

    dataset = DatasetService.get_dataset(session=session, dataset_id=dataset_id)
    storage = get_storage_backend()

    query = select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset.id)
    if req.record_ids:
        query = query.where(DatasetRecordModel.id.in_(req.record_ids))
    records = session.scalars(query).all()

    created_records = []
    now = datetime.now(UTC)

    for orig_rec in records:
        new_rec_id = generate_id("rec")
        target_split = req.target_split or orig_rec.split

        # 1. Check for primary image asset to transform
        orig_ra = orig_rec.record_assets[0] if orig_rec.record_assets else None
        new_asset = None

        new_width, new_height = 800, 600

        if orig_ra and orig_ra.asset:
            orig_asset = orig_ra.asset
            try:
                raw_bytes = storage.read_bytes(orig_asset.storage_key)
                aug_bytes, new_width, new_height = transform_image_bytes(raw_bytes, req.transform_type)

                new_asset_id = generate_id("ast")
                new_key = f"assets/{dataset.id}/{new_asset_id}_{req.transform_type}.jpg"
                storage.save_bytes(new_key, aug_bytes)

                new_asset = AssetModel(
                    id=new_asset_id,
                    dataset_id=dataset.id,
                    storage_key=new_key,
                    modality=AssetModality.IMAGE.value,
                    mime_type="image/jpeg",
                    byte_size=len(aug_bytes),
                    sha256=hashlib.sha256(aug_bytes).hexdigest(),
                    original_filename=f"aug_{req.transform_type}_{orig_asset.original_filename}",
                    dimensions={"width": new_width, "height": new_height},
                    parent_asset_id=orig_asset.id,
                    transformation_metadata={
                        "transform": req.transform_type,
                        "seed": req.seed,
                    },
                    created_at=now,
                )
                session.add(new_asset)
                session.flush()
            except (OSError, ValueError, KeyError) as err:
                import logging
                logging.getLogger(__name__).warning("Asset augmentation skipped: %s", err)

        # 2. Create augmented record
        new_record = DatasetRecordModel(
            id=new_rec_id,
            dataset_id=dataset.id,
            split=target_split,
            schema_version=orig_rec.schema_version,
            external_key=f"{orig_rec.external_key or orig_rec.id}_aug_{req.transform_type}",
            extra_metadata={
                **(orig_rec.extra_metadata or {}),
                "augmented_from": orig_rec.id,
                "transformation": req.transform_type,
            },
            created_at=now,
        )
        session.add(new_record)
        session.flush()

        if new_asset:
            ra_link = RecordAssetModel(
                record_id=new_record.id,
                asset_id=new_asset.id,
                role=orig_ra.role if orig_ra else "primary_image",
                position=0,
                created_at=now,
            )
            session.add(ra_link)

        # 3. Transform bounding boxes or copy classification label
        orig_ann = orig_rec.annotations[0] if orig_rec.annotations else None
        if orig_ann:
            new_payload = dict(orig_ann.payload or {})
            if "boxes" in new_payload and isinstance(new_payload["boxes"], list):
                aug_boxes, _, _ = transform_bbox_geometry(
                    new_payload["boxes"],
                    image_width=new_width,
                    image_height=new_height,
                    transform_type=req.transform_type,
                )
                new_payload["boxes"] = aug_boxes

            ann_id = generate_id("ann")
            rev_id = generate_id("rev")

            aug_ann = AnnotationModel(
                id=ann_id,
                record_id=new_record.id,
                dataset_id=dataset.id,
                task_type=orig_ann.task_type,
                schema_version=orig_ann.schema_version,
                current_revision_id=rev_id,
                payload=new_payload,
                origin=AnnotationOrigin.AUGMENTED.value,
                status=ReviewStatus.PENDING_REVIEW.value,
                created_at=now,
            )
            session.add(aug_ann)
            session.flush()

            rev = AnnotationRevisionModel(
                id=rev_id,
                annotation_id=ann_id,
                revision_number=1,
                payload=new_payload,
                status=ReviewStatus.PENDING_REVIEW.value,
                origin=AnnotationOrigin.AUGMENTED.value,
                author_id="system_augmentation",
                created_at=now,
            )
            session.add(rev)

        created_records.append(new_rec_id)

        session.commit()

    return {
        "dataset_id": dataset.id,
        "transform_type": req.transform_type,
        "augmented_count": len(created_records),
        "record_ids": created_records,
    }



