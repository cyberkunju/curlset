"""
YOLO Exporter for converting versioned object detection records into Ultralytics YOLO format.
Generates data.yaml and normalized label text files: <class_idx> <x_center> <y_center> <w> <h>.

Primary images are resolved by explicit asset role/modality (not ``assets[0]``) because the
canonical version manifest sorts assets by ``asset_id``; array position can be a thumbnail.
"""
import os
from typing import Any

_IMAGE_ROLES = frozenset({"primary_image", "image"})


def select_primary_image_asset(assets: list[Any] | None) -> dict[str, Any]:
    """Resolve the record's primary image asset deterministically (role/modality first)."""
    items = [a for a in (assets or []) if isinstance(a, dict)]
    if not items:
        return {}

    def _sort_key(asset: dict[str, Any]) -> str:
        return str(asset.get("asset_id") or "")

    primary = [
        a
        for a in items
        if str(a.get("role") or "").strip() == "primary_image"
        and (a.get("modality") in (None, "", "image"))
    ]
    if primary:
        return min(primary, key=_sort_key)

    images = [
        a
        for a in items
        if a.get("modality") == "image" or str(a.get("role") or "").strip() in _IMAGE_ROLES
    ]
    if images:
        return min(images, key=_sort_key)
    return min(items, key=_sort_key)


def export_to_yolo_files(manifest_data: dict[str, Any]) -> dict[str, bytes]:
    """
    Export records from an object detection version manifest into YOLO structure.
    Returns mapping of file relative path -> binary content.
    """
    records = manifest_data.get("records", [])

    # 1. Collect all distinct categories deterministically
    categories_set: set[str] = set()
    for r in records:
        ann = r.get("annotation")
        payload = ann.get("payload") if isinstance(ann, dict) else None
        if isinstance(payload, dict) and isinstance(payload.get("boxes"), list):
            for box in payload["boxes"]:
                if isinstance(box, dict):
                    lbl = box.get("label")
                    if lbl:
                        categories_set.add(lbl)

    sorted_categories = sorted(categories_set)
    category_to_id = {cat: idx for idx, cat in enumerate(sorted_categories)}

    # 2. Generate data.yaml
    yaml_lines = [
        f"# YOLOv8 / YOLOv11 dataset configuration for {manifest_data.get('dataset_name', 'Dataset')}",
        "train: images/train",
        "val: images/val",
        "test: images/test",
        "",
        f"nc: {len(sorted_categories)}",
        "names:",
    ]
    for idx, name in enumerate(sorted_categories):
        yaml_lines.append(f"  {idx}: {name}")
    yaml_lines.append("")

    files: dict[str, bytes] = {
        "data.yaml": "\n".join(yaml_lines).encode("utf-8")
    }

    # 3. Generate label txt files for each record
    for r in records:
        split = r.get("split", "train")
        if split not in {"train", "val", "test"}:
            split = "train"

        record_id = r.get("record_id", "")
        image_asset = select_primary_image_asset(r.get("assets") or [])
        orig_filename = image_asset.get("original_filename") or f"{record_id}.jpg"
        stem = os.path.splitext(orig_filename)[0]

        dims = image_asset.get("dimensions") or {}
        ann = r.get("annotation")
        payload = ann.get("payload") if isinstance(ann, dict) else None
        img_dims = payload.get("image_dimensions") if isinstance(payload, dict) else {}
        if not isinstance(img_dims, dict):
            img_dims = {}
        img_w = float(dims.get("width") or img_dims.get("width") or 640)
        img_h = float(dims.get("height") or img_dims.get("height") or 480)
        coord_sys = payload.get("coordinate_system") if isinstance(payload, dict) else None

        lines: list[str] = []
        if isinstance(payload, dict) and isinstance(payload.get("boxes"), list):
            for box in payload["boxes"]:
                if not isinstance(box, dict):
                    continue
                lbl = box.get("label")
                cat_idx = category_to_id.get(lbl, 0)

                w = float(box.get("w") if "w" in box else box.get("width", 50))
                h = float(box.get("h") if "h" in box else box.get("height", 50))
                x = float(box.get("x", 0))
                y = float(box.get("y", 0))

                # Normalize if coordinates are explicitly pixel-intrinsic or > 1.0
                is_pixel = (coord_sys == "pixel-intrinsic") or (
                    coord_sys != "normalized" and (w > 1.0 or h > 1.0 or x > 1.0 or y > 1.0)
                )
                if is_pixel:
                    norm_x = x / img_w
                    norm_y = y / img_h
                    norm_w = w / img_w
                    norm_h = h / img_h
                else:
                    norm_x = x
                    norm_y = y
                    norm_w = w
                    norm_h = h

                # Clamp normalized coordinates to [0, 1]
                norm_x = max(0.0, min(1.0, norm_x))
                norm_y = max(0.0, min(1.0, norm_y))
                norm_w = max(0.000001, min(1.0 - norm_x, norm_w))
                norm_h = max(0.000001, min(1.0 - norm_y, norm_h))

                # Convert (top-left x, y, w, h) to (center_x, center_y, w, h)
                x_center = round(norm_x + (norm_w / 2.0), 6)
                y_center = round(norm_y + (norm_h / 2.0), 6)
                w_norm = round(norm_w, 6)
                h_norm = round(norm_h, 6)

                lines.append(f"{cat_idx} {x_center} {y_center} {w_norm} {h_norm}")

        label_path = f"labels/{split}/{stem}.txt"
        files[label_path] = ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8")

    return files
