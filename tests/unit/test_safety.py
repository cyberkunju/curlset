"""
Unit tests for file safety, magic byte validation, and zip traversal defenses.
"""
import pytest

from packages.dataset_core.exceptions import DomainValidationError
from packages.dataset_io.safety import (
    detect_mime_from_magic_bytes,
    sanitize_archive_entry_path,
    validate_file_safety,
)


def test_magic_byte_detection():
    jpeg_header = b"\xff\xd8\xff\xe0\x00\x10JFIF"
    png_header = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    zip_header = b"PK\x03\x04\x14\x00\x00\x00"
    utf8_text = b"id,name,value\n1,alpha,100\n"

    assert detect_mime_from_magic_bytes(jpeg_header, "test.jpg") == "image/jpeg"
    assert detect_mime_from_magic_bytes(png_header, "test.png") == "image/png"
    assert detect_mime_from_magic_bytes(zip_header, "archive.zip") == "application/zip"
    assert detect_mime_from_magic_bytes(utf8_text, "data.csv") == "text/csv"


def test_mime_spoofing_detection():
    # Plain text file disguised as a PNG
    fake_png_data = b"This is just ASCII text disguised with a .png extension."
    with pytest.raises(DomainValidationError) as exc:
        validate_file_safety("malicious.png", fake_png_data)
    assert "MIME spoofing detected" in str(exc.value)


def test_oversized_file_rejection():
    data = b"x" * 1000
    with pytest.raises(DomainValidationError) as exc:
        validate_file_safety("huge.txt", data, max_bytes=500)
    assert "exceeds maximum allowed size" in str(exc.value)


def test_archive_path_traversal_sanitizer():
    # Normal safe relative paths
    assert sanitize_archive_entry_path("images/defect_01.jpg") == "images/defect_01.jpg"
    assert sanitize_archive_entry_path("data.jsonl") == "data.jsonl"

    # Traversal attempts must be blocked
    assert sanitize_archive_entry_path("../../etc/passwd") is None
    assert sanitize_archive_entry_path("folder/../../escaped.txt") is None
    assert sanitize_archive_entry_path("/absolute/path.jpg") is None
    assert sanitize_archive_entry_path("\\windows\\system32\\cmd.exe") is None
    assert sanitize_archive_entry_path("C:\\secret.key") is None
    assert sanitize_archive_entry_path("image\x00nullbyte.jpg") is None
