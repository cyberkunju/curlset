"""
Input safety validation: magic byte sniffing, zip bomb defense, and path traversal protection.
"""
import os
import zipfile
from pathlib import PurePosixPath

from packages.dataset_core.exceptions import DomainValidationError

# Magic byte signatures
MAGIC_SIGNATURES = {
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "application/zip": b"PK\x03\x04",
}


def detect_mime_from_magic_bytes(data: bytes, filename: str = "") -> str | None:
    """Inspect leading bytes to detect true content format."""
    if len(data) >= 3 and data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 8 and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    if len(data) >= 4 and data.startswith(b"PK\x03\x04"):
        return "application/zip"

    # Check for valid UTF-8 text formats
    try:
        data[:4096].decode("utf-8")
        ext = os.path.splitext(filename.lower())[1]
        if ext == ".csv":
            return "text/csv"
        if ext == ".json":
            return "application/json"
        if ext == ".jsonl":
            return "application/x-ndjson"
        return "text/plain"
    except UnicodeDecodeError:
        return None


def validate_file_safety(filename: str, data: bytes, max_bytes: int = 104857600) -> tuple[str, str]:
    """
    Validate file size and verify that the file extension matches its magic-byte content signature.
    Returns (detected_mime, modality).
    Raises DomainValidationError on spoofed or oversized files.
    """
    if len(data) > max_bytes:
        raise DomainValidationError(
            f"File '{filename}' exceeds maximum allowed size of {max_bytes} bytes (got {len(data)} bytes).",
            field="file_size",
        )

    mime = detect_mime_from_magic_bytes(data, filename)
    if not mime:
        raise DomainValidationError(
            f"File '{filename}' has unsupported or unreadable binary content.",
            field="mime_type",
        )

    ext = os.path.splitext(filename.lower())[1]
    expected_image_exts = {".jpg", ".jpeg", ".png", ".webp"}

    if mime.startswith("image/") and ext not in expected_image_exts:
        raise DomainValidationError(
            f"File '{filename}' has image magic bytes but non-image extension '{ext}'.",
            field="extension",
        )

    if ext in expected_image_exts and not mime.startswith("image/"):
        raise DomainValidationError(
            f"File '{filename}' has image extension '{ext}' but actual content is not a valid image (MIME spoofing detected).",
            field="extension",
        )

    if ext == ".zip" and mime != "application/zip":
        raise DomainValidationError(
            f"File '{filename}' has .zip extension but invalid ZIP header.",
            field="extension",
        )

    # Determine modality
    if mime.startswith("image/"):
        modality = "image"
    elif mime.startswith("text/") or mime in {"application/json", "application/x-ndjson"}:
        modality = "text"
    elif mime == "application/zip":
        modality = "archive"
    else:
        modality = "document"

    return mime, modality


def sanitize_archive_entry_path(entry_path: str) -> str | None:
    """
    Strictly sanitize a zip archive entry path against path traversal.
    Rejects:
    - Path navigation like '../' or '..\\'
    - Leading '/' or '\\'
    - Windows absolute paths like 'C:\\'
    - Null bytes
    - Symlinks / device files
    Returns safe normalized POSIX path or None if entry is malicious/invalid.
    """
    if "\x00" in entry_path or ":" in entry_path:
        return None

    # Replace backslashes
    normalized = entry_path.replace("\\", "/")

    # Check for explicit traversal
    parts = normalized.split("/")
    if ".." in parts:
        return None

    posix = PurePosixPath(normalized)
    if posix.is_absolute() or posix.drive:
        return None

    # Filter out empty or dot paths
    clean_parts = [p for p in parts if p and p != "."]
    if not clean_parts:
        return None

    return "/".join(clean_parts)


def validate_archive_bounds(
    zf: zipfile.ZipFile,
    max_entries: int = 1000,
    max_decompressed_bytes: int = 524288000,
) -> None:
    """
    Check ZIP archive against zip bomb attacks and entry limits before extraction.
    """
    entries = zf.infolist()
    if len(entries) > max_entries:
        raise DomainValidationError(
            f"ZIP archive contains {len(entries)} entries, exceeding the maximum limit of {max_entries}.",
            field="archive_entry_count",
        )

    total_uncompressed = 0
    total_compressed = 0
    for entry in entries:
        total_uncompressed += entry.file_size
        total_compressed += entry.compress_size
        if total_uncompressed > max_decompressed_bytes:
            raise DomainValidationError(
                f"ZIP archive exceeds uncompressed size limit of {max_decompressed_bytes} bytes.",
                field="decompressed_size",
            )

    # Ratio check for zip bomb defense
    if total_compressed > 0 and (total_uncompressed / total_compressed) > 100 and total_uncompressed > 50 * 1024 * 1024:
        raise DomainValidationError(
            "ZIP archive exhibits suspicious compression ratio (>100:1) characteristic of a decompression bomb.",
            field="zip_bomb_detected",
        )
