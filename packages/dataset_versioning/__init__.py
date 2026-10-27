"""
Dataset Versioning package for immutable snapshotting, cryptographic manifests,
and automated dataset card documentation.
"""
from packages.dataset_versioning.doc_generator import generate_dataset_card_markdown
from packages.dataset_versioning.manifest import (
    DatasetVersionManifest,
    ManifestAnnotationItem,
    ManifestAssetItem,
    ManifestRecordItem,
    compute_manifest_hash,
    serialize_canonical_manifest,
)
from packages.dataset_versioning.service import VersioningService

__all__ = [
    "DatasetVersionManifest",
    "ManifestAnnotationItem",
    "ManifestAssetItem",
    "ManifestRecordItem",
    "VersioningService",
    "compute_manifest_hash",
    "generate_dataset_card_markdown",
    "serialize_canonical_manifest",
]
