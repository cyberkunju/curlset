"""
REST API routes for candidate source discovery, SSRF-safe URL inspection,
and provenance rights review.
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_core.exceptions import (
    DomainValidationError,
    RightsViolationError,
    SSRFBlockedError,
)
from packages.dataset_sources.models import (
    DiscoveredSource,
    RightsReviewRequest,
    SourceImportRequest,
    SourceProvenanceSummary,
)
from packages.dataset_sources.service import SourceDiscoveryService

router = APIRouter(prefix="/api/v1", tags=["Sources & Rights"])


class UrlInspectionPayload(BaseModel):
    url: str


@router.get("/sources/candidates", response_model=list[DiscoveredSource])
def search_candidate_sources(
    query: str = Query("", description="Keywords to match candidate titles or descriptions"),
    max_results: int = Query(10, ge=1, le=50),
) -> list[DiscoveredSource]:
    """Search permitted public catalogs for candidate data sources."""
    return SourceDiscoveryService.search_candidates(query=query, max_results=max_results)


@router.post("/sources/inspect-url", response_model=DiscoveredSource)
async def inspect_remote_url(payload: UrlInspectionPayload) -> DiscoveredSource:
    """Inspect and safely fetch an external URL with SSRF protection."""
    try:
        return await SourceDiscoveryService.inspect_remote_url(payload.url)
    except SSRFBlockedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code, "message": e.message, "details": e.details},
        ) from e
    except DomainValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": e.code, "message": e.message, "details": e.details},
        ) from e


@router.post("/sources/import", status_code=status.HTTP_201_CREATED)
def import_source_candidate(
    payload: SourceImportRequest,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    """Import a candidate source reference into a dataset with attached source provenance."""
    try:
        record = SourceDiscoveryService.import_discovered_candidate(
            session=session,
            dataset_id=payload.dataset_id,
            source_id=payload.source_id,
            split=payload.split,
        )
        return {
            "status": "imported",
            "record_id": record.id,
            "dataset_id": payload.dataset_id,
            "split": payload.split,
        }
    except RightsViolationError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": e.code, "message": e.message, "details": e.details},
        ) from e


@router.post("/records/{record_id}/rights-review")
def review_record_rights(
    record_id: str,
    payload: RightsReviewRequest,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    """Record an auditable human rights review decision regarding source licensing."""
    source_rec = SourceDiscoveryService.record_rights_review(
        session=session,
        record_id=record_id,
        review=payload,
    )
    return {
        "status": "updated",
        "record_id": record_id,
        "source_id": source_rec.id,
        "license_status": source_rec.license_status,
        "terms_notes": source_rec.terms_notes,
    }


@router.get("/datasets/{dataset_id}/sources", response_model=list[SourceProvenanceSummary])
def list_dataset_sources(
    dataset_id: str,
    session: Session = Depends(get_db),
) -> list[SourceProvenanceSummary]:
    """List source provenance and licensing statuses for records in a dataset."""
    return SourceDiscoveryService.list_sources_for_dataset(
        session=session,
        dataset_id=dataset_id,
    )
