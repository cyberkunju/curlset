"""
Export Service managing generation, packaging, hashing, and retrieval of
reproducible dataset exports bound to immutable versions.
"""
import hashlib
import io
import json
import zipfile

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
        }
        if normalized_format not in supported_formats:
            raise DomainValidationError(
                f"Unsupported export format '{format_str}'. Supported formats: {sorted(supported_formats)}.",
                field="format",
            )

        # 1. Retrieve the exact canonical manifest for this immutable version
        manifest_data = VersioningService.get_version_manifest(session, version_id)
        storage = get_storage_backend()

        # 2. Assemble complete distribution ZIP package
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            if normalized_format == ExportFormat.CSV.value:
                data_bytes = export_to_csv(manifest_data)
                zf.writestr("data.csv", data_bytes)
            elif normalized_format == ExportFormat.JSONL.value:
                data_bytes = export_to_jsonl(manifest_data)
                zf.writestr("data.jsonl", data_bytes)
            elif normalized_format == ExportFormat.COCO.value:
                coco_bytes = export_to_coco(manifest_data)
                zf.writestr("annotations/instances_default.json", coco_bytes)
            elif normalized_format == ExportFormat.YOLO.value:
                yolo_files = export_to_yolo_files(manifest_data)
                for rel_path, file_bytes in yolo_files.items():
                    zf.writestr(rel_path, file_bytes)
            elif normalized_format == ExportFormat.WEBVTT.value:
                vtt_files = export_to_webvtt_files(manifest_data)
                for rel_path, file_bytes in vtt_files.items():
                    zf.writestr(rel_path, file_bytes)
            elif normalized_format == ExportFormat.UNSLOTH_SHAREGPT_VLM.value:
                preset_files = export_unsloth_sharegpt_vlm(manifest_data)
                for rel_path, file_bytes in preset_files.items():
                    zf.writestr(rel_path, file_bytes)
            elif normalized_format == ExportFormat.AXOLOTL_ALPACA_CHATML.value:
                preset_files = export_axolotl_alpaca_chatml(manifest_data)
                for rel_path, file_bytes in preset_files.items():
                    zf.writestr(rel_path, file_bytes)
            elif normalized_format == ExportFormat.LLAMA_FACTORY_BUNDLE.value:
                preset_files = export_llama_factory_bundle(manifest_data)
                for rel_path, file_bytes in preset_files.items():
                    zf.writestr(rel_path, file_bytes)
            elif normalized_format == ExportFormat.ULTRALYTICS_YOLO_V8_V11.value:
                preset_files = export_ultralytics_yolo(manifest_data)
                for rel_path, file_bytes in preset_files.items():
                    zf.writestr(rel_path, file_bytes)


            # Add canonical version manifest
            zf.writestr(
                "manifest.json",
                json.dumps(manifest_data, indent=2, ensure_ascii=False).encode("utf-8"),
            )

            # Add dataset card README.md
            dataset_card = version.documentation_markdown or "# Dataset Card\n"
            zf.writestr("README.md", dataset_card.encode("utf-8"))

            # Add associated media assets if present
            records = manifest_data.get("records", [])
            seen_assets: set[str] = set()
            for r in records:
                assets = r.get("assets") or []
                for a in assets:
                    storage_key = a.get("storage_key")
                    filename = a.get("original_filename") or f"{a.get('asset_id')}.bin"
                    if storage_key and storage_key not in seen_assets:
                        seen_assets.add(storage_key)
                        try:
                            asset_bytes = storage.read_bytes(storage_key)
                            zf.writestr(f"assets/{filename}", asset_bytes)
                        except (OSError, KeyError, ValueError):
                            # Asset file read failed or missing from storage backend
                            continue

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
            exporter_version="1.0.0",
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
