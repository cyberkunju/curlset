"""
Cryptographic and perceptual hashing utilities for dataset assets and deduplication.
"""
import hashlib
import io

from PIL import Image


def compute_sha256(data: bytes) -> str:
    """Compute exact 64-character lowercase SHA-256 hash."""
    return hashlib.sha256(data).hexdigest().lower()


def compute_phash(image_bytes: bytes) -> str | None:
    """
    Compute a 64-bit perceptual difference hash (dHash) for an image.
    Robust against minor re-encoding, format compression, and slight contrast adjustments.
    Returns 16-character hexadecimal string, or None if bytes cannot be parsed as an image.
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            # Convert to grayscale and resize to 9x8 for difference hashing
            grayscale = img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
            if hasattr(grayscale, "get_flattened_data"):
                pixels = list(grayscale.get_flattened_data())
            else:
                pixels = list(grayscale.getdata())

            # Compare adjacent pixels in each row
            diff = []
            for row in range(8):
                for col in range(8):
                    pixel_left = pixels[row * 9 + col]
                    pixel_right = pixels[row * 9 + col + 1]
                    diff.append(pixel_left > pixel_right)

            # Convert 64 boolean bits to hexadecimal
            decimal_value = 0
            for index, value in enumerate(diff):
                if value:
                    decimal_value += 1 << index
            return f"{decimal_value:016x}"
    except (OSError, ValueError):
        return None
