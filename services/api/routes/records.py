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
    search: str | None = Query(None, description="Search by record ID, external key, payload label, text, or file"),
    record_id: str | None = Query(None, description="Directly filter by record ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_db),
) -> RecordListResponse:
    """
    Review queue for a dataset.

    ``annotation_id`` / ``annotation_payload`` / ``review_status`` describe the
    *selector-chosen* annotation (``annotation_selector.select_active_annotation``:
    approved first, newest otherwise), so ``review_status`` filtering matches the
    annotation that a version freeze / quality audit would use.
    """
    items, total = RecordService.list_records_with_status(
        session=session,
        dataset_id=dataset_id,
        split=split,
        review_status=review_status,
        search=search,
        record_id=record_id,
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
    """
    Full record view. ``annotation`` / ``revisions`` / ``review_events`` belong to
    the selector-chosen annotation for the record (not simply the newest one), so
    the UI, quality engine and version freeze agree on which label is current.
    """
    return RecordService.get_record_detail(session=session, record_id=record_id)
