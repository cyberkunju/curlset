"""
Image-bundle exporter: a self-contained, re-importable image dataset archive.

Layout inside the export ZIP::

    images/00000_<stem>.<ext>      one file per record (collision-safe, stable order)
    labels.jsonl                  one JSON object per record: image path, label, split, provenance
    labels.csv                    the same rows for spreadsheet users
    manifest.json                 canonical immutable-version manifest (written by the service)
    README.md                     dataset card (written by the service)

Design rules
------------
* Deterministic: records are sorted by record id, file names are index-prefixed and sanitised, and
  the ZIP writer (service) uses a fixed timestamp.
* Honest: the label comes from the decided annotation payload; provenance (origin/status/confidence)
  and synthetic lineage are preserved. Nothing is invented for unannotated records — they are
  exported with ``label: null`` and ``review_status`` explaining why.
* Re-importable: ``labels.jsonl`` maps each bundled image path to its label, so a user can rebuild
  the dataset from the bundle alone.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
from typing import Any

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_stem(filename: str, fallback: str) -> tuple[str, str]:
    base = os.path.basename(filename or "") or fallback
    stem, extension = os.path.splitext(base)
    stem = _SAFE.sub("-", stem).strip("._-") or fallback
    extension = extension.lower() if re.fullmatch(r"\.[A-Za-z0-9]{1,8}", extension or "") else ""
    return stem[:60], extension


def _primary_image(record: dict[str, Any]) -> dict[str, Any] | None:
    assets = [asset for asset in (record.get("assets") or []) if isinstance(asset, dict)]
    for asset in assets:
        if str(asset.get("role") or "").strip() == "primary_image" and asset.get("modality") in (
            None, "", "image",
        ):
            return asset
    for asset in assets:
        if str(asset.get("modality") or "") == "image":
            return asset
    return None


def _label_row(
    record: dict[str, Any],
    image_path: str,
    asset: dict[str, Any],
) -> dict[str, Any]:
    annotation = record.get("annotation") if isinstance(record.get("annotation"), dict) else {}
    payload = annotation.get("payload") if isinstance(annotation.get("payload"), dict) else {}
    metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
    label = payload.get("label") if isinstance(payload.get("label"), str) else None
    if label is None and isinstance(metadata.get("label"), str):
        label = metadata["label"]
    generation = metadata.get("generation") if isinstance(metadata.get("generation"), dict) else None
    dimensions = asset.get("dimensions") if isinstance(asset.get("dimensions"), dict) else {}
    return {
        "record_id": record.get("id"),
        "image": image_path,
        "label": label,
        "split": record.get("split"),
        "review_status": annotation.get("status"),
        "annotation_origin": annotation.get("origin"),
        "confidence": annotation.get("confidence"),
        "asset_id": asset.get("asset_id"),
        "asset_sha256": asset.get("sha256"),
        "width": dimensions.get("width"),
        "height": dimensions.get("height"),
        "mime_type": asset.get("mime_type"),
        "synthetic": bool(metadata.get("synthetic")),
        "generation": generation,
    }


def build_image_bundle(
    manifest_data: dict[str, Any],
    asset_bytes: dict[str, bytes],
) -> tuple[dict[str, bytes], list[dict[str, Any]]]:
    """Return ``({relative path -> bytes}, label rows)`` for the bundle.

    ``asset_bytes`` maps a manifest ``storage_key`` to the asset's bytes (the service reads them).
    """
    records = sorted(
        (record for record in (manifest_data.get("records") or []) if isinstance(record, dict)),
        key=lambda record: str(record.get("id") or ""),
    )
    files: dict[str, bytes] = {}
    rows: list[dict[str, Any]] = []
    used_paths: set[str] = set()

    for index, record in enumerate(records):
        asset = _primary_image(record)
        if not asset:
            continue
        storage_key = str(asset.get("storage_key") or "")
        data = asset_bytes.get(storage_key)
        if data is None:
            continue
        stem, extension = _safe_stem(
            str(asset.get("original_filename") or ""),
            f"image-{index:05d}",
        )
        if not extension:
            mime = str(asset.get("mime_type") or "image/png").lower()
            extension = ".png" if "png" in mime else ".webp" if "webp" in mime else ".jpg"
        candidate = f"images/{index:05d}_{stem}{extension}"
        suffix = 1
        while candidate in used_paths:
            suffix += 1
            candidate = f"images/{index:05d}_{stem}-{suffix}{extension}"
        used_paths.add(candidate)
        files[candidate] = data
        rows.append(_label_row(record, candidate, asset))

    labels_jsonl = b"".join(
        (json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8") for row in rows
    )
    files["labels.jsonl"] = labels_jsonl

    buffer = io.StringIO()
    fieldnames = list(rows[0].keys()) if rows else ["record_id", "image", "label"]
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: ("" if row.get(key) is None else row.get(key)) for key in fieldnames})
    files["labels.csv"] = buffer.getvalue().encode("utf-8")
    return files, rows


def build_roundtrip_instructions(manifest_data: dict[str, Any], rows: list[dict[str, Any]]) -> bytes:
    """A short README section-style note explaining how to rebuild the dataset from the bundle."""
    dataset = manifest_data.get("dataset") or {}
    lines = [
        "# Image bundle — how to re-import",
        "",
        f"Dataset: {dataset.get('name') or 'dataset'}",
        f"Records: {len(rows)}",
        "",
        "1. Create an image-classification dataset with the same classes.",
        "2. Upload every file under `images/` (they are the exact stored assets).",
        "3. Apply `labels.jsonl`: `image` is the bundled path, `label` is the decided class.",
        "4. Records with `label: null` were never annotated; they are exported for completeness.",
        "",
        "Every row also carries provenance: `annotation_origin`, `review_status`, `confidence`,",
        "`asset_sha256`, image dimensions and synthetic lineage when applicable.",
    ]
    return ("\n".join(lines) + "\n").encode("utf-8")
