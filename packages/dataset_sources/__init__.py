"""
Dataset sources package for safe web discovery, SSRF defense, and rights review.
"""
from packages.dataset_sources.models import (
    DiscoveredSource,
    RightsReviewRequest,
    SourceImportRequest,
    SourceProvenanceSummary,
)
from packages.dataset_sources.service import SourceDiscoveryService
from packages.dataset_sources.ssrf_guard import validate_url_safety

__all__ = [
    "DiscoveredSource",
    "RightsReviewRequest",
    "SourceDiscoveryService",
    "SourceImportRequest",
    "SourceProvenanceSummary",
    "validate_url_safety",
]
