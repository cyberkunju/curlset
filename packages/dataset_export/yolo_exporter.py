"""
YOLO Exporter for converting versioned object detection records into Ultralytics YOLO format.
Generates data.yaml and normalized label text files: <class_idx> <x_center> <y_center> <w> <h>.
"""
import os
from typing import Any


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
        if ann and ann.get("payload") and "boxes" in ann["payload"]:
            for box in ann["payload"]["boxes"]:
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
        assets = r.get("assets") or []
        first_asset = assets[0] if assets else {}
        orig_filename = first_asset.get("original_filename") or f"{record_id}.jpg"
        stem = os.path.splitext(orig_filename)[0]

        dims = first_asset.get("dimensions") or {}
        img_w = float(dims.get("width", 640))
        img_h = float(dims.get("height", 480))

        lines: list[str] = []
        ann = r.get("annotation")
        if ann and ann.get("payload") and "boxes" in ann["payload"]:
            for box in ann["payload"]["boxes"]:
                lbl = box.get("label")
                cat_idx = category_to_id.get(lbl, 0)

                w = float(box.get("w") if "w" in box else box.get("width", 50))
                h = float(box.get("h") if "h" in box else box.get("height", 50))
                x = float(box.get("x", 0))
                y = float(box.get("y", 0))

                # Normalize if coordinates are in pixel space
                if w > 1.0 or h > 1.0 or x > 1.0 or y > 1.0:
                    norm_x = x / img_w
                    norm_y = y / img_h
                    norm_w = w / img_w
                    norm_h = h / img_h
                else:
                    norm_x = x
                    norm_y = y
                    norm_w = w
                    norm_h = h

                # Convert (top-left x, y, w, h) to (center_x, center_y, w, h)
                x_center = round(norm_x + (norm_w / 2.0), 6)
                y_center = round(norm_y + (norm_h / 2.0), 6)
                w_norm = round(norm_w, 6)
                h_norm = round(norm_h, 6)

                lines.append(f"{cat_idx} {x_center} {y_center} {w_norm} {h_norm}")

        label_path = f"labels/{split}/{stem}.txt"
        files[label_path] = ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8")

    return files
