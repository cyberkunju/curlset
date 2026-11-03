"""
CSV Exporter for converting versioned dataset records into standard CSV format.

Text MVP contract (docs/TEXT_MVP.md §0): ``record.metadata["text"]`` is the canonical
input text and ``annotation.payload["label"]`` is the decided label. Both are emitted as
explicit columns and never fabricated. Unknown metadata keys are preserved as extra
columns; nested values are JSON-encoded so the file stays machine-parseable.
"""
import csv
import io
import json
from typing import Any

# Task types whose text content legitimately lives in the annotation payload.
_PAYLOAD_TEXT_TASK_TYPES = frozenset({"audio_transcription", "document_ocr"})
_CANONICAL_METADATA_KEYS = frozenset({"text", "label", "split"})

_IMAGE_ROLES = frozenset({"primary_image", "image"})


def _record_text(record: dict[str, Any], task_type: str | None) -> str:
    """Canonical input text (metadata.text), payload.text only for audio/OCR."""
    metadata = record.get("metadata") or {}
    if isinstance(metadata, dict):
        text = metadata.get("text")
        if isinstance(text, str) and text.strip():
            return text
    if task_type in _PAYLOAD_TEXT_TASK_TYPES:
        annotation = record.get("annotation")
        payload = annotation.get("payload") if isinstance(annotation, dict) else None
        if isinstance(payload, dict):
            text = payload.get("text")
            if isinstance(text, str) and text.strip():
                return text
    return ""


def _record_label(record: dict[str, Any]) -> str:
    """Decided label from ``annotation.payload["label"]`` (legacy keys allowed)."""
    annotation = record.get("annotation")
    payload = annotation.get("payload") if isinstance(annotation, dict) else None
    if not isinstance(payload, dict):
        return ""
    for key in ("label", "category"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    labels = payload.get("labels")
    if isinstance(labels, list):
        return "|".join(str(item) for item in labels)
    if isinstance(labels, str) and labels.strip():
        return labels
    return ""


def _stringify_metadata_value(value: Any) -> str:
    """Serialize a metadata value in a portable, deterministic way."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)
    return str(value)


def _primary_asset(assets: list[dict[str, Any]]) -> dict[str, Any]:
    """Pick the record's primary media asset by explicit role/modality, deterministically."""
    items = [a for a in assets if isinstance(a, dict)]
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


def export_to_csv(manifest_data: dict[str, Any]) -> bytes:
    """Export records from a version manifest into RFC 4180 style CSV.

    Standard columns carry the real input text and the decided label; any other
    metadata keys from the frozen manifest are appended as extra columns.
    """
    records = manifest_data.get("records", [])
    task_type = manifest_data.get("task_type")
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\r\n")

    # Discover extra metadata keys (canonical text/label/split have dedicated columns).
    meta_keys: set[str] = set()
    for r in records:
        meta = r.get("metadata") or {}
        if isinstance(meta, dict):
            for key in meta:
                if key not in _CANONICAL_METADATA_KEYS:
                    meta_keys.add(key)
    sorted_meta_keys = sorted(meta_keys)

    headers = ["record_id", "split", "external_key", "text"] + sorted_meta_keys + [
        "label",
        "origin",
        "confidence",
        "primary_asset_filename",
        "primary_asset_sha256",
    ]
    writer.writerow(headers)

    for r in records:
        record_id = r.get("record_id", "")
        split = r.get("split", "train")
        external_key = r.get("external_key") or ""
        meta = r.get("metadata") or {}
        if not isinstance(meta, dict):
            meta = {}

        meta_values = [_stringify_metadata_value(meta.get(k)) for k in sorted_meta_keys]

        ann = r.get("annotation")
        origin = ""
        confidence = ""
        if isinstance(ann, dict):
            origin = ann.get("origin") or ""
            conf = ann.get("confidence")
            confidence = str(conf) if conf is not None else ""

        asset = _primary_asset(r.get("assets") or [])
        asset_filename = asset.get("original_filename") or ""
        asset_sha = asset.get("sha256") or ""

        row = (
            [record_id, split, external_key, _record_text(r, task_type)]
            + meta_values
            + [_record_label(r), origin, confidence, asset_filename, asset_sha]
        )
        writer.writerow(row)

    return output.getvalue().encode("utf-8")
