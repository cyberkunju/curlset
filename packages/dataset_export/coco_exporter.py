"""
COCO Exporter for converting versioned object detection records into standard COCO JSON format.

The primary image for a record is resolved by explicit asset role/modality rather than by
manifest array position: canonical manifests sort ``record["assets"]`` by ``asset_id``, so
``assets[0]`` can be a thumbnail/crop/paired-text asset and silently corrupt every bbox.
"""
import json
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


def export_to_coco(manifest_data: dict[str, Any]) -> bytes:
    """
    Export records from an object detection version manifest into standard MS COCO format.
    Generates info, licenses, categories, images, and annotations structures.
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
    category_to_id = {cat: idx + 1 for idx, cat in enumerate(sorted_categories)}

    coco_categories = [
        {"id": cat_id, "name": cat_name, "supercategory": "none"}
        for cat_name, cat_id in category_to_id.items()
    ]

    coco_images: list[dict[str, Any]] = []
    coco_annotations: list[dict[str, Any]] = []

    ann_counter = 1

    for img_idx, r in enumerate(records, start=1):
        record_id = r.get("record_id", "")
        image_asset = select_primary_image_asset(r.get("assets") or [])
        filename = image_asset.get("original_filename") or f"{record_id}.jpg"
        dims = image_asset.get("dimensions") or {}
        ann = r.get("annotation")
        payload = ann.get("payload") if isinstance(ann, dict) else None
        img_dims = payload.get("image_dimensions") if isinstance(payload, dict) else {}
        if not isinstance(img_dims, dict):
            img_dims = {}
        img_width = dims.get("width") or img_dims.get("width") or 640
        img_height = dims.get("height") or img_dims.get("height") or 480

        coco_images.append({
            "id": img_idx,
            "file_name": filename,
            "width": img_width,
            "height": img_height,
            "record_id": record_id,
            "split": r.get("split", "train"),
        })

        if isinstance(payload, dict) and isinstance(payload.get("boxes"), list):
            coord_sys = payload.get("coordinate_system")
            for box in payload["boxes"]:
                if not isinstance(box, dict):
                    continue
                lbl = box.get("label")
                cat_id = category_to_id.get(lbl, 1)

                # Read box coordinates
                w = float(box.get("w") if "w" in box else box.get("width", 50))
                h = float(box.get("h") if "h" in box else box.get("height", 50))
                x = float(box.get("x", 0))
                y = float(box.get("y", 0))

                # If coordinates are explicitly normalized or fractional (0..1) without pixel-intrinsic flag
                is_normalized = (coord_sys == "normalized") or (
                    coord_sys != "pixel-intrinsic" and w <= 1.0 and h <= 1.0 and x <= 1.0 and y <= 1.0
                )
                if is_normalized:
                    x = round(x * img_width, 2)
                    y = round(y * img_height, 2)
                    w = round(w * img_width, 2)
                    h = round(h * img_height, 2)

                area = round(w * h, 2)

                coco_annotations.append({
                    "id": ann_counter,
                    "image_id": img_idx,
                    "category_id": cat_id,
                    "bbox": [x, y, w, h],
                    "area": area,
                    "iscrowd": 0,
                })
                ann_counter += 1

    coco_doc = {
        "info": {
            "year": 2026,
            "version": manifest_data.get("version_tag", "1.0"),
            "description": manifest_data.get("dataset_name", "Object Detection Dataset"),
            "contributor": manifest_data.get("created_by", "Platform User"),
            "date_created": manifest_data.get("created_at", ""),
        },
        "licenses": [
            {
                "id": 1,
                "name": "Platform Verified / Review-Required",
                "url": "",
            }
        ],
        "categories": coco_categories,
        "images": coco_images,
        "annotations": coco_annotations,
    }

    return json.dumps(coco_doc, indent=2, ensure_ascii=False).encode("utf-8")
