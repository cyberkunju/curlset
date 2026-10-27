"""
Geometry-Aware Deterministic Augmentation Pipeline.
Performs simultaneous affine transformations on media assets and spatial bounding boxes:
- Horizontal Flip (hflip)
- Vertical Flip (vflip)
- 90-degree Clockwise Rotation (rot90_cw)
- 180-degree Rotation (rot180)
Ensures boundary clipping to [0, 1] or display coordinates, degenerate box purging (<5px),
and deterministic reproducibility.
"""
from __future__ import annotations

import io
from typing import Any

from PIL import Image


def transform_box_coordinates(
    box: dict[str, Any],
    image_width: int,
    image_height: int,
    transform_type: str,
    min_size_px: int = 5,
) -> tuple[dict[str, Any] | None, int, int]:
    """
    Transform single bounding box coordinates given image dimensions and transform type.
    Returns (transformed_box, new_width, new_height).
    If box becomes degenerate (< min_size_px), returns (None, new_width, new_height).
    """
    x = float(box.get("x", 0.0))
    y = float(box.get("y", 0.0))
    w = float(box.get("w", box.get("width", 0.0)))
    h = float(box.get("h", box.get("height", 0.0)))

    is_normalized = (x <= 1.0 and y <= 1.0 and w <= 1.0 and h <= 1.0 and image_width > 1)
    
    # Convert to pixel space for geometry calculation if normalized
    if is_normalized:
        px_x = x * image_width
        px_y = y * image_height
        px_w = w * image_width
        px_h = h * image_height
    else:
        px_x = x
        px_y = y
        px_w = w
        px_h = h

    new_w_img = image_width
    new_h_img = image_height

    if transform_type == "hflip":
        new_px_x = image_width - px_x - px_w
        new_px_y = px_y
        new_px_w = px_w
        new_px_h = px_h
    elif transform_type == "vflip":
        new_px_x = px_x
        new_px_y = image_height - px_y - px_h
        new_px_w = px_w
        new_px_h = px_h
    elif transform_type == "rot90_cw":
        # (x, y) becomes (H - y - h, x), dimensions swap
        new_px_x = image_height - px_y - px_h
        new_px_y = px_x
        new_px_w = px_h
        new_px_h = px_w
        new_w_img = image_height
        new_h_img = image_width
    elif transform_type == "rot180":
        new_px_x = image_width - px_x - px_w
        new_px_y = image_height - px_y - px_h
        new_px_w = px_w
        new_px_h = px_h
    else:
        # Pass through
        new_px_x = px_x
        new_px_y = px_y
        new_px_w = px_w
        new_px_h = px_h

    # Clip to valid image boundary
    clipped_x = max(0.0, min(float(new_w_img), new_px_x))
    clipped_y = max(0.0, min(float(new_h_img), new_px_y))
    clipped_w = max(0.0, min(float(new_w_img) - clipped_x, new_px_w))
    clipped_h = max(0.0, min(float(new_h_img) - clipped_y, new_px_h))

    # Reject degenerate boxes (< 5px)
    if clipped_w < min_size_px or clipped_h < min_size_px:
        return None, new_w_img, new_h_img

    transformed = dict(box)
    if is_normalized:
        transformed["x"] = round(clipped_x / new_w_img, 6)
        transformed["y"] = round(clipped_y / new_h_img, 6)
        if "w" in transformed:
            transformed["w"] = round(clipped_w / new_w_img, 6)
        if "width" in transformed:
            transformed["width"] = round(clipped_w / new_w_img, 6)
        if "h" in transformed:
            transformed["h"] = round(clipped_h / new_h_img, 6)
        if "height" in transformed:
            transformed["height"] = round(clipped_h / new_h_img, 6)
    else:
        transformed["x"] = round(clipped_x, 2)
        transformed["y"] = round(clipped_y, 2)
        if "w" in transformed:
            transformed["w"] = round(clipped_w, 2)
        if "width" in transformed:
            transformed["width"] = round(clipped_w, 2)
        if "h" in transformed:
            transformed["h"] = round(clipped_h, 2)
        if "height" in transformed:
            transformed["height"] = round(clipped_h, 2)

    return transformed, new_w_img, new_h_img


def transform_bbox_geometry(
    boxes: list[dict[str, Any]],
    image_width: int,
    image_height: int,
    transform_type: str,
    min_size_px: int = 5,
) -> tuple[list[dict[str, Any]], int, int]:
    """
    Apply deterministic geometry transformation to all bounding boxes.
    Discards boxes that fall outside boundaries or shrink below min_size_px.
    """
    valid_transforms = {"hflip", "vflip", "rot90_cw", "rot180"}
    if transform_type not in valid_transforms:
        raise ValueError(f"Unsupported transform '{transform_type}'. Supported: {sorted(valid_transforms)}")

    transformed_boxes: list[dict[str, Any]] = []
    final_w, final_h = image_width, image_height

    for box in boxes:
        new_box, cur_w, cur_h = transform_box_coordinates(
            box, image_width, image_height, transform_type, min_size_px=min_size_px
        )
        final_w, final_h = cur_w, cur_h
        if new_box is not None:
            transformed_boxes.append(new_box)

    return transformed_boxes, final_w, final_h


def transform_image_bytes(
    image_bytes: bytes,
    transform_type: str,
) -> tuple[bytes, int, int]:
    """
    Apply geometric transform directly to image bytes.
    Returns (new_image_bytes, new_width, new_height).
    """
    img = Image.open(io.BytesIO(image_bytes))
    orig_format = img.format or "JPEG"

    if transform_type == "hflip":
        transformed = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    elif transform_type == "vflip":
        transformed = img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    elif transform_type == "rot90_cw":
        transformed = img.transpose(Image.Transpose.ROTATE_270)
    elif transform_type == "rot180":
        transformed = img.transpose(Image.Transpose.ROTATE_180)
    else:
        transformed = img

    buf = io.BytesIO()
    transformed.save(buf, format=orig_format)
    return buf.getvalue(), transformed.width, transformed.height
