"""
JSONL Exporter for converting versioned dataset records into structured JSON Lines format.
"""
import json
from typing import Any


def export_to_jsonl(manifest_data: dict[str, Any]) -> bytes:
    """
    Export records from a version manifest into newline-delimited JSON.
    Each line represents a complete, self-contained record with metadata and provenance.
    """
    records = manifest_data.get("records", [])
    lines: list[str] = []

    for r in records:
        entry = {
            "record_id": r.get("record_id"),
            "split": r.get("split", "train"),
            "external_key": r.get("external_key"),
            "metadata": r.get("metadata", {}),
            "annotation": r.get("annotation"),
            "assets": r.get("assets", []),
        }
        lines.append(json.dumps(entry, sort_keys=True, ensure_ascii=False))

    content = "\n".join(lines) + ("\n" if lines else "")
    return content.encode("utf-8")
