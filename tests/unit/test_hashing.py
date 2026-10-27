"""
Unit tests for cryptographic SHA-256 and perceptual hashing (pHash).
"""
import io

from PIL import Image

from packages.dataset_io.hashing import compute_phash, compute_sha256


def test_compute_sha256_deterministic():
    data = b"Hello AI Dataset Engineering Platform"
    h1 = compute_sha256(data)
    h2 = compute_sha256(data)
    assert h1 == h2
    assert len(h1) == 64
    assert h1.islower()


def test_compute_phash_on_synthetic_image():
    # Create simple solid color synthetic 64x64 image
    img = Image.new("RGB", (64, 64), color="red")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    png_bytes = buffer.getvalue()

    phash1 = compute_phash(png_bytes)
    assert phash1 is not None
    assert len(phash1) == 16  # 64-bit hex representation

    # Re-encoding identical image must produce identical pHash
    phash2 = compute_phash(png_bytes)
    assert phash1 == phash2

    # Non-image data returns None
    assert compute_phash(b"Not an image") is None
