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



