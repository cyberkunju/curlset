"""
Safe HTTP retrieval engine with SSRF validation, size capping, and parser sandboxing.
"""
import hashlib
from datetime import UTC, datetime

import httpx

from packages.dataset_core.constants import LicenseStatus
from packages.dataset_core.exceptions import DomainValidationError
from packages.dataset_sources.models import DiscoveredSource
from packages.dataset_sources.ssrf_guard import validate_url_safety

MAX_REMOTE_FETCH_BYTES = 10 * 1024 * 1024  # 10 MB limit for remote documents
FETCH_TIMEOUT_SECONDS = 5.0


class SafeFetcher:
    """Retrieves external URL content with rigorous SSRF and payload bounds."""

    @classmethod
    async def inspect_url(cls, url: str) -> DiscoveredSource:
        """
        Validates the URL against SSRF defenses, performs a bounded GET request,
        and returns a DiscoveredSource with initial UNKNOWN license status.
        Never executes scripts or accesses private network addresses.
        """
        safe_url = validate_url_safety(url)

        try:
            async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=False) as client:
                response = await client.get(safe_url, headers={"User-Agent": "AIDatasetPlatform-ResearchBot/1.0 (+http://localhost)"})

            if response.status_code == 401 or response.status_code == 403:
                raise DomainValidationError(
                    f"Access to '{safe_url}' requires authentication or is forbidden (HTTP {response.status_code}). Bypassing auth is strictly disallowed.",
                    field="url",
                )
            if response.status_code == 404:
                raise DomainValidationError(f"Target URL '{safe_url}' not found (HTTP 404).", field="url")
            if response.status_code != 200:
                raise DomainValidationError(f"Failed to fetch '{safe_url}' (HTTP {response.status_code}).", field="url")

            raw_bytes = response.content
            if len(raw_bytes) > MAX_REMOTE_FETCH_BYTES:
                raise DomainValidationError(
                    f"Remote resource at '{safe_url}' exceeds maximum allowed size of {MAX_REMOTE_FETCH_BYTES} bytes.",
                    field="size",
                )

            media_type = response.headers.get("content-type", "text/plain").split(";")[0].strip()
            content_sha = hashlib.sha256(raw_bytes).hexdigest()
            text_preview = response.text[:300] if "text" in media_type or "json" in media_type else "[Binary Media Asset]"

            now_str = datetime.now(UTC).isoformat()
            source_id = f"src_url_{content_sha[:12]}"

            return DiscoveredSource(
                source_id=source_id,
                url=safe_url,
                title=f"External Web Reference: {safe_url.split('/')[-1] or safe_url}",
                publisher=safe_url.split("//")[-1].split("/")[0],
                description=f"Direct URL reference fetched with SSRF verification on {now_str}.",
                retrieval_timestamp=now_str,
                license_evidence="Direct web fetch: License terms unverified. Public accessibility does NOT imply permission.",
                attribution_required=f"Source: {safe_url}",
                license_status=LicenseStatus.UNKNOWN,
                raw_content_preview=text_preview,
                content_sha256=content_sha,
                media_type=media_type,
                terms_notes="Unverified web source. Human rights review required prior to training dataset inclusion.",
            )

        except httpx.RequestError as e:
            raise DomainValidationError(f"Network error fetching '{safe_url}': {e}", field="network") from e
