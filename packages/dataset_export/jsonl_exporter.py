"""
JSONL Exporter for converting versioned dataset records into structured JSON Lines format.

Text MVP contract (docs/TEXT_MVP.md §0): the canonical input text for text tasks lives in
``record.metadata["text"]`` (Record.extra_metadata, frozen into the version manifest).
``Annotation.payload["text"]`` is *not* a text field for ``text_classification``; it is
only accepted as a fallback for audio/OCR tasks where the transcription payload is the
source of truth. No value is ever fabricated.
"""
import json
from typing import Any

# Task types whose text content legitimately lives in the annotation payload.
_PAYLOAD_TEXT_TASK_TYPES = frozenset({"audio_transcription", "document_ocr"})


def _record_text(record: dict[str, Any], task_type: str | None) -> str:
    """Return the record's input text without ever fabricating a placeholder.

    ``metadata.text`` is the single source of truth. ``payload.text`` is only used for
    audio transcription / document OCR records, where no ``metadata.text`` exists.
    """
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


def _record_label(record: dict[str, Any]) -> str | None:
    """Return the decided label from ``annotation.payload["label"]`` (legacy keys allowed)."""
    annotation = record.get("annotation")
    payload = annotation.get("payload") if isinstance(annotation, dict) else None
    if not isinstance(payload, dict):
        return None
    for key in ("label", "category"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    labels = payload.get("labels")
    if isinstance(labels, str) and labels.strip():
        return labels
    return None


def export_to_jsonl(manifest_data: dict[str, Any]) -> bytes:
    """Export records from a version manifest into newline-delimited JSON (JSON Lines).

    Each line is a self-contained record with the real input ``text``, the decided
    ``label``, metadata/provenance and assets. Output is deterministic for a given
    manifest (sorted keys, stable record order, trailing newline).
    """
    records = manifest_data.get("records", [])
    task_type = manifest_data.get("task_type")
    lines: list[str] = []

    for r in records:
        metadata = r.get("metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}
        text = _record_text(r, task_type)

        # Keep unknown metadata keys, but never duplicate the canonical text field.
        metadata_out = dict(metadata)
        if text:
            metadata_out["text"] = text
        else:
            metadata_out.pop("text", None)

        entry = {
            "record_id": r.get("record_id"),
            "split": r.get("split", "train"),
            "external_key": r.get("external_key"),
            "text": text,
            "label": _record_label(r),
            "metadata": metadata_out,
            "annotation": r.get("annotation"),
            "assets": r.get("assets", []),
        }
        lines.append(json.dumps(entry, sort_keys=True, ensure_ascii=False))

    content = "\n".join(lines) + ("\n" if lines else "")
    return content.encode("utf-8")
