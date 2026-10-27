"""
Data models and typed contracts for source discovery, rights review, and provenance.
"""
from pydantic import BaseModel, Field

from packages.dataset_core.constants import LicenseStatus


class DiscoveredSource(BaseModel):
    """Candidate source reference identified during public catalog or permitted URL research."""
    source_id: str
    url: str
    title: str
    publisher: str | None = None
    description: str
    retrieval_timestamp: str
    license_evidence: str | None = None
    attribution_required: str | None = None
    license_status: LicenseStatus = LicenseStatus.UNKNOWN
    raw_content_preview: str | None = None
    content_sha256: str | None = None
    media_type: str = "text/plain"
    estimated_records: int = 1
    terms_notes: str | None = None


class RightsReviewRequest(BaseModel):
    """User review decision assessing licensing evidence for an imported or candidate source."""
    license_status: LicenseStatus
    evidence_text: str = Field(..., min_length=5, description="Auditable reasoning or excerpt justifying the review decision.")
    terms_notes: str | None = None
    attribution_text: str | None = None


class SourceImportRequest(BaseModel):
    """Command to import a discovered source reference into a specific dataset."""
    source_id: str
    dataset_id: str
    split: str = "train"


class SourceProvenanceSummary(BaseModel):
    """Summary of source record provenance and licensing review state."""
    record_id: str
    source_id: str
    source_uri: str | None
    source_type: str
    license_status: str
    creator_attribution: str | None
    retrieved_at: str | None
    terms_notes: str | None
