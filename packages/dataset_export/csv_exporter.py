"""
CSV Exporter for converting versioned dataset records into standard CSV format.
"""
import csv
import io
from typing import Any


def export_to_csv(manifest_data: dict[str, Any]) -> bytes:
    """
    Export records from a version manifest into RFC 4180 compliant CSV.
    Determines standard columns based on task type and metadata fields.
    """
    records = manifest_data.get("records", [])
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")

    # Discover any extra metadata keys
    meta_keys: set[str] = set()
    for r in records:
        meta = r.get("metadata") or {}
        for k in meta:
            meta_keys.add(k)
    sorted_meta_keys = sorted(meta_keys)

    # Standard headers
    headers = ["record_id", "split", "external_key"] + sorted_meta_keys + [
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

        meta_values = [str(meta.get(k, "")) for k in sorted_meta_keys]

        ann = r.get("annotation")
        label = ""
        origin = ""
        confidence = ""
        if ann:
            payload = ann.get("payload") or {}
            label = str(
                payload.get("label")
                or payload.get("category")
                or payload.get("labels")
                or ""
            )
            origin = ann.get("origin") or ""
            conf = ann.get("confidence")
            confidence = str(conf) if conf is not None else ""

        assets = r.get("assets") or []
        asset_filename = assets[0].get("original_filename", "") if assets else ""
        asset_sha = assets[0].get("sha256", "") if assets else ""

        row = [record_id, split, external_key] + meta_values + [
            label,
            origin,
            confidence,
            asset_filename,
            asset_sha,
        ]
        writer.writerow(row)

    return output.getvalue().encode("utf-8")
