"""
Export Service managing generation, packaging, hashing, and retrieval of
reproducible dataset exports bound to immutable versions.

Byte determinism (TEXT_MVP E4): every ZIP member is written with a fixed
1980-01-01 timestamp, a fixed create_system/external_attr, and members are emitted in a
stable sorted order. Exporting the same immutable version + format twice therefore yields
identical bytes and an identical SHA-256, independent of wall-clock time or timezone.
"""
import hashlib
import io
import json
import zipfile
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import ExportFormat
from packages.dataset_core.db.models import DatasetVersionModel, ExportArtifactModel
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_export.coco_exporter import export_to_coco
from packages.dataset_export.csv_exporter import export_to_csv
from packages.dataset_export.image_bundle_exporter import (
    build_image_bundle,
    build_roundtrip_instructions,
)
from packages.dataset_export.jsonl_exporter import export_to_jsonl
from packages.dataset_export.webvtt_exporter import export_to_webvtt_files
from packages.dataset_export.yolo_exporter import export_to_yolo_files
from packages.dataset_io.presets import (
    export_axolotl_alpaca_chatml,
    export_llama_factory_bundle,
    export_ultralytics_yolo,
    export_unsloth_sharegpt_vlm,
)
from packages.dataset_io.storage import get_storage_backend
from packages.dataset_versioning.service import VersioningService

# Fixed DOS timestamp used for every ZIP entry so exports are byte-reproducible.
_ZIP_EPOCH = (1980, 1, 1, 0, 0, 0)
_ZIP_CREATE_SYSTEM = 3  # Unix, fixed across platforms
_ZIP_EXTERNAL_ATTR = 0o600 << 16


def _zip_info(name: str) -> zipfile.ZipInfo:
    """Build a deterministic ZipInfo for one archive member."""
    info = zipfile.ZipInfo(filename=name, date_time=_ZIP_EPOCH)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = _ZIP_CREATE_SYSTEM
    info.external_attr = _ZIP_EXTERNAL_ATTR
    return info


def _write_entry(zf: zipfile.ZipFile, name: str, data: bytes) -> None:
    """Write one deterministic ZIP member."""
    zf.writestr(_zip_info(name), data)


def _format_data_entries(
    normalized_format: str, manifest_data: dict[str, Any]
) -> list[tuple[str, bytes]]:
    """Generate the format-specific data members in a stable, sorted order."""
    if normalized_format == ExportFormat.CSV.value:
        return [("data.csv", export_to_csv(manifest_data))]
    if normalized_format == ExportFormat.JSONL.value:
        return [("data.jsonl", export_to_jsonl(manifest_data))]
    if normalized_format == ExportFormat.COCO.value:
        return [("annotations/instances_default.json", export_to_coco(manifest_data))]
    if normalized_format == ExportFormat.YOLO.value:
        return _sorted_files(export_to_yolo_files(manifest_data))
    if normalized_format == ExportFormat.WEBVTT.value:
        return _sorted_files(export_to_webvtt_files(manifest_data))
    if normalized_format == ExportFormat.UNSLOTH_SHAREGPT_VLM.value:
        return _sorted_files(export_unsloth_sharegpt_vlm(manifest_data))
    if normalized_format == ExportFormat.AXOLOTL_ALPACA_CHATML.value:
        return _sorted_files(export_axolotl_alpaca_chatml(manifest_data))
    if normalized_format == ExportFormat.LLAMA_FACTORY_BUNDLE.value:
        return _sorted_files(export_llama_factory_bundle(manifest_data))
    if normalized_format == ExportFormat.ULTRALYTICS_YOLO_V8_V11.value:
        return _sorted_files(export_ultralytics_yolo(manifest_data))
    raise DomainValidationError(f"Unsupported export format '{normalized_format}'.", field="format")


def _sorted_files(files: dict[str, bytes]) -> list[tuple[str, bytes]]:
    """Stable member ordering for multi-file exporters."""
    return [(str(rel_path), file_bytes) for rel_path, file_bytes in sorted(files.items())]


class ExportService:
    """Orchestrates generation of training-ready dataset archives bound to immutable versions."""

    @staticmethod
    def export_dataset_version(
        session: Session,
        version_id: str,
        format_str: str,
    ) -> ExportArtifactModel:
        """
        Generate a reproducible export artifact bound strictly to an immutable version.
        Produces a self-contained ZIP archive containing the formatted data file,
        canonical manifest.json, dataset card README.md, and media assets.
        """
        version = session.get(DatasetVersionModel, version_id)
        if not version:
            raise ResourceNotFoundError("DatasetVersion", version_id)

        normalized_format = format_str.lower().strip()
        supported_formats = {
            ExportFormat.CSV.value,
            ExportFormat.JSONL.value,
            ExportFormat.COCO.value,
            ExportFormat.YOLO.value,
            ExportFormat.WEBVTT.value,
            ExportFormat.UNSLOTH_SHAREGPT_VLM.value,
            ExportFormat.AXOLOTL_ALPACA_CHATML.value,
            ExportFormat.LLAMA_FACTORY_BUNDLE.value,
            ExportFormat.ULTRALYTICS_YOLO_V8_V11.value,
            ExportFormat.IMAGE_BUNDLE.value,
        }
        if normalized_format not in supported_formats:
            raise DomainValidationError(
                f"Unsupported export format '{format_str}'. Supported formats: {sorted(supported_formats)}.",
                field="format",
            )

        # 1. Retrieve the exact canonical manifest for this immutable version
        manifest_data = VersioningService.get_version_manifest(session, version_id)
        storage = get_storage_backend()

        # 2. Assemble complete distribution ZIP package (deterministic member set/order)
        zip_buffer = io.BytesIO()
        if normalized_format == ExportFormat.IMAGE_BUNDLE.value:
            # Self-contained image dataset: exact stored pixels + label mapping + provenance.
            asset_bytes: dict[str, bytes] = {}
            for record in manifest_data.get("records") or []:
                for asset in record.get("assets") or []:
                    if not isinstance(asset, dict):
                        continue
                    key = str(asset.get("storage_key") or "")
                    if not key or key in asset_bytes:
                        continue
                    try:
                        asset_bytes[key] = storage.read_bytes(key)
                    except (OSError, KeyError, ValueError):
                        continue
            bundle_files, bundle_rows = build_image_bundle(manifest_data, asset_bytes)
            if not bundle_rows:
                raise DomainValidationError(
                    "This version has no image assets to bundle. Choose a tabular format instead.",
                    field="format",
                )
            bundle_files["images/README.md"] = build_roundtrip_instructions(manifest_data, bundle_rows)
            with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for rel_path, file_bytes in sorted(bundle_files.items()):
                    _write_entry(zf, rel_path, file_bytes)
                _write_entry(
                    zf,
                    "manifest.json",
                    json.dumps(manifest_data, indent=2, ensure_ascii=False, sort_keys=True).encode("utf-8"),
                )
                dataset_card = version.documentation_markdown or "# Dataset Card\n"
                _write_entry(zf, "README.md", dataset_card.encode("utf-8"))
        else:
            with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for rel_path, file_bytes in _format_data_entries(normalized_format, manifest_data):
                    _write_entry(zf, rel_path, file_bytes)

                # Add canonical version manifest
                _write_entry(
                    zf,
                    "manifest.json",
                    json.dumps(manifest_data, indent=2, ensure_ascii=False, sort_keys=True).encode("utf-8"),
                )

                # Add dataset card README.md
                dataset_card = version.documentation_markdown or "# Dataset Card\n"
                _write_entry(zf, "README.md", dataset_card.encode("utf-8"))

                # Add associated media assets if present (sorted by destination path)
                records = manifest_data.get("records", [])
                seen_assets: set[str] = set()
                asset_entries: list[tuple[str, str, bytes]] = []
                for r in records:
                    assets = r.get("assets") or []
                    for a in assets:
                        if not isinstance(a, dict):
                            continue
                        storage_key = a.get("storage_key")
                        filename = a.get("original_filename") or f"{a.get('asset_id')}.bin"
                        if storage_key and storage_key not in seen_assets:
                            seen_assets.add(storage_key)
                            try:
                                asset_data = storage.read_bytes(storage_key)
                            except (OSError, KeyError, ValueError):
                                # Asset file read failed or missing from storage backend
                                continue
                            asset_entries.append((f"assets/{filename}", str(storage_key), asset_data))
                for dest_path, _storage_key, asset_data in sorted(
                    asset_entries, key=lambda item: (item[0], item[1])
                ):
                    _write_entry(zf, dest_path, asset_data)

        zip_bytes = zip_buffer.getvalue()
        artifact_sha256 = hashlib.sha256(zip_bytes).hexdigest()

        # 4. Save archive to storage backend
        artifact_id = generate_id("exp")
        artifact_storage_key = (
            f"exports/{version.dataset_id}/{version_id}_{artifact_id}_{artifact_sha256[:12]}.zip"
        )
        storage.write_bytes(artifact_storage_key, zip_bytes)

        # 5. Extract quality warnings from quality_summary
        quality_summary = version.quality_summary or {}
        findings = quality_summary.get("findings") or []
        warnings = [
            f.get("title", "")
            for f in findings
            if f.get("severity") in ("warning", "blocking")
        ]

        # 6. Persist ExportArtifactModel
        artifact = ExportArtifactModel(
            id=artifact_id,
            version_id=version_id,
            format=normalized_format,
            # 1.1.0: deterministic ZIP bytes + text-preserving content (metadata.text,
            # decided label, no fabricated placeholders, split-aware presets).
            # Byte output changed, so the exporter version is bumped for cache/audit clarity.
            exporter_version="1.1.0",
            storage_key=artifact_storage_key,
            byte_size=len(zip_bytes),
            sha256=artifact_sha256,
            record_count=manifest_data.get("record_count", 0),
            quality_warnings=warnings,
        )
        session.add(artifact)
        session.commit()
        session.refresh(artifact)
        return artifact

    @staticmethod
    def list_version_exports(session: Session, version_id: str) -> list[ExportArtifactModel]:
        """List all generated export packages for a specific dataset version."""
        return (
            session.execute(
                select(ExportArtifactModel)
                .where(ExportArtifactModel.version_id == version_id)
                .order_by(ExportArtifactModel.created_at.desc())
            )
            .scalars()
            .all()
        )

    @staticmethod
    def get_export_artifact(
        session: Session, artifact_id: str
    ) -> tuple[ExportArtifactModel, bytes]:
        """Retrieve export artifact metadata and raw binary package bytes."""
        artifact = session.get(ExportArtifactModel, artifact_id)
        if not artifact:
            raise ResourceNotFoundError("ExportArtifact", artifact_id)
        storage = get_storage_backend()
        data = storage.read_bytes(artifact.storage_key)
        return artifact, data
