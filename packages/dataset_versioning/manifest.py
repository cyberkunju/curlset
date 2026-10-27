"""
Dataset Version Manifest schema, canonical serialization, and cryptographic hashing.
"""
import hashlib
import json
from typing import Any

from pydantic import BaseModel, Field


class ManifestAssetItem(BaseModel):
    asset_id: str
    role: str
    modality: str
    mime_type: str
    byte_size: int
    sha256: str
    storage_key: str
    original_filename: str
    dimensions: dict[str, Any] | None = None


class ManifestAnnotationItem(BaseModel):
    annotation_id: str
    revision_id: str
    revision_number: int
    origin: str
    status: str
    payload: dict[str, Any]
    confidence: float | None = None
    consensus_score: float | None = None


class ManifestRecordItem(BaseModel):
    record_id: str
    external_key: str | None = None
    split: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    annotation: ManifestAnnotationItem | None = None
    assets: list[ManifestAssetItem] = Field(default_factory=list)


class DatasetVersionManifest(BaseModel):
    manifest_version: str = "1.0.0"
    version_id: str
    dataset_id: str
    dataset_name: str
    version_tag: str
    version_number: int
    task_type: str
    schema_version: int
    created_at: str
    created_by: str
    record_count: int
    quality_summary: dict[str, Any] = Field(default_factory=dict)
    records: list[ManifestRecordItem] = Field(default_factory=list)


def serialize_canonical_manifest(manifest: DatasetVersionManifest) -> bytes:
    """
    Produce a deterministic, canonically ordered JSON byte string for the manifest.
    Guarantees that identical manifest contents produce the exact same SHA-256 hash.
    """
    data = manifest.model_dump(mode="json")
    # Sort records deterministically by record_id
    data["records"] = sorted(data["records"], key=lambda r: r["record_id"])
    for record in data["records"]:
        record["assets"] = sorted(record["assets"], key=lambda a: a["asset_id"])

    canonical_json = json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return canonical_json.encode("utf-8")


def compute_manifest_hash(manifest_bytes: bytes) -> str:
    """Calculate the cryptographic SHA-256 digest of the canonical manifest bytes."""
    return hashlib.sha256(manifest_bytes).hexdigest()
