"""
Dataset records endpoints: queue listing, filtering, and detailed record view.
"""
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_core.services.record_service import RecordService

router = APIRouter(tags=["records"])


class RecordListResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int
    limit: int
    offset: int


@router.get("/api/v1/datasets/{dataset_id}/queue", response_model=RecordListResponse)
def get_dataset_queue(
    dataset_id: str,
    split: str | None = Query(None, description="Filter by split (train, val, test, unassigned)"),
    review_status: str | None = Query(None, description="Filter by review status (unannotated, pending_review, approved, rejected, needs_correction)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_db),
) -> RecordListResponse:
    items, total = RecordService.list_records_with_status(
        session=session,
        dataset_id=dataset_id,
        split=split,
        review_status=review_status,
        limit=limit,
        offset=offset,
    )
    return RecordListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/api/v1/records/{record_id}")
def get_record_detail(
    record_id: str,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    return RecordService.get_record_detail(session=session, record_id=record_id)
