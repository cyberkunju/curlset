"""
Catalog source adapter for public dataset discovery.
Searches permitted public catalogs (e.g., Open Science, Wikimedia, OpenGov)
and extracts metadata, licensing statements, and content samples.
"""
import hashlib
from datetime import UTC, datetime
from typing import Any

from packages.dataset_core.constants import LicenseStatus
from packages.dataset_sources.models import DiscoveredSource

# Deterministic simulated public catalogue for offline testing and standard discovery
SAMPLE_PUBLIC_CATALOG: list[dict[str, Any]] = [
    {
        "source_id": "src_catalog_arxiv_nlp_01",
        "url": "https://arxiv.org/abs/2301.00001",
        "title": "Open Multimodal Benchmarking Corpus (Scientific Abstract Subset)",
        "publisher": "arXiv Open Access",
        "description": "Curated machine learning abstracts with annotated benchmark task definitions.",
        "license_evidence": "arXiv non-exclusive distribution license; explicit open research attribution permitted.",
        "attribution_required": "Source: arXiv.org (Authors: OpenML Research Group, 2023)",
        "license_status": LicenseStatus.REVIEW_REQUIRED,
        "media_type": "text/plain",
        "raw_content": "We introduce a benchmark for multimodal dataset engineering that quantifies annotation provenance and review velocity across distributed teams.",
        "terms_notes": "Permitted for academic and internal benchmarking; check commercial redistribution terms.",
    },
    {
        "source_id": "src_catalog_wikimedia_geo_02",
        "url": "https://commons.wikimedia.org/wiki/File:Public_Domain_Geometrics.svg",
        "title": "Wikimedia Public Domain Geometric Projections",
        "publisher": "Wikimedia Commons",
        "description": "High-contrast vector and raster geometric figures dedicated to the public domain.",
        "license_evidence": "CC0 1.0 Universal (Public Domain Dedication). Verified no copyright reserved.",
        "attribution_required": "None required (CC0 1.0 Dedication)",
        "license_status": LicenseStatus.APPROVED_FOR_INTENDED_USE,
        "media_type": "image/png",
        "raw_content": "[Binary SVG/PNG geometric figure]",
        "terms_notes": "CC0 verified. No restrictions on commercial or non-commercial training.",
    },
    {
        "source_id": "src_catalog_gov_traffic_03",
        "url": "https://data.gov/dataset/traffic-camera-detections",
        "title": "Open Transportation Camera Urban Survey",
        "publisher": "Department of Transportation Open Data",
        "description": "Sample urban roadway imagery captured under municipal open-government data initiative.",
        "license_evidence": "U.S. Federal Government Work (17 U.S.C. 105). Public domain in the United States.",
        "attribution_required": "Data provided by DOT Open Data Portal",
        "license_status": LicenseStatus.REVIEW_REQUIRED,
        "media_type": "text/plain",
        "raw_content": "Traffic survey timestamp 2026-04-12: Vehicle count 42, pedestrian count 14, ambient lighting optimal.",
        "terms_notes": "Public domain in US; international copyright and privacy considerations require verification.",
    },
    {
        "source_id": "src_catalog_web_blog_restricted_04",
        "url": "https://example-private-blog.com/posts/ai-notes",
        "title": "Proprietary Tech Commentary and Review Snippets",
        "publisher": "Private Publisher",
        "description": "Copyrighted blog commentary found via public web search.",
        "license_evidence": "All Rights Reserved (c) 2026 Private Publisher. No scraping or model training permitted.",
        "attribution_required": "Private Publisher (Strict All Rights Reserved)",
        "license_status": LicenseStatus.RESTRICTED,
        "media_type": "text/plain",
        "raw_content": "This copyrighted commentary may not be ingested or reproduced without a paid enterprise license.",
        "terms_notes": "RESTRICTED: Explicitly prohibits dataset ingestion or model training without written contract.",
    },
]


class CatalogSourceAdapter:
    """Queries permitted open catalogs and structures candidates with rights metadata."""

    @classmethod
    def search(cls, query: str, max_results: int = 10) -> list[DiscoveredSource]:
        """
        Search catalog references matching the query.
        Public availability NEVER implies permission; returns candidate items
        with explicit licensing evidence and status.
        """
        q = query.strip().lower()
        results: list[DiscoveredSource] = []
        now_str = datetime.now(UTC).isoformat()

        for item in SAMPLE_PUBLIC_CATALOG:
            # Query match across title, description, or publisher
            haystack = f"{item['title']} {item['description']} {item.get('publisher', '')} {item['terms_notes']}".lower()
            if not q or q in haystack:
                content = item.get("raw_content", "")
                content_sha = hashlib.sha256(content.encode("utf-8")).hexdigest()

                source = DiscoveredSource(
                    source_id=item["source_id"],
                    url=item["url"],
                    title=item["title"],
                    publisher=item.get("publisher"),
                    description=item["description"],
                    retrieval_timestamp=now_str,
                    license_evidence=item.get("license_evidence"),
                    attribution_required=item.get("attribution_required"),
                    license_status=item["license_status"],
                    raw_content_preview=content[:200] if content else None,
                    content_sha256=content_sha,
                    media_type=item.get("media_type", "text/plain"),
                    terms_notes=item.get("terms_notes"),
                )
                results.append(source)
                if len(results) >= max_results:
                    break

        return results

    @classmethod
    def get_source_by_id(cls, source_id: str) -> dict[str, Any] | None:
        """Retrieve original raw catalog item by source_id."""
        for item in SAMPLE_PUBLIC_CATALOG:
            if item["source_id"] == source_id:
                return item
        return None
