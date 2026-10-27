"""
Ingestion orchestrator: safe file parsing, duplicate detection, asset storage,
record creation, and multimodal bundling.
"""
import csv
import io
import json
import os
import zipfile

from PIL import Image
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import (
    AssetModality,
    AssetRole,
    LicenseStatus,
    RunStatus,
    RunType,
)
from packages.dataset_core.db.models import (
    AssetModel,
    DatasetModel,
    ProcessingRunModel,
    RunItemModel,
)
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_core.services.record_service import RecordService
from packages.dataset_io.hashing import compute_phash, compute_sha256
from packages.dataset_io.safety import (
    sanitize_archive_entry_path,
    validate_archive_bounds,
    validate_file_safety,
)
from packages.dataset_io.storage import StorageBackend, get_storage_backend


class DuplicateItem(BaseModel):
    filename: str
    sha256: str
    existing_asset_id: str
    message: str = "Exact duplicate file content detected"


class RejectedItem(BaseModel):
    filename: str
    reason: str


class AcceptedItem(BaseModel):
    record_id: str
    asset_id: str | None = None
    filename: str
    sha256: str | None = None
    modality: str
    role: str


class ImportReport(BaseModel):
    run_id: str
    dataset_id: str
    total_processed: int
    accepted_count: int
    duplicate_count: int
    rejected_count: int
    accepted_items: list[AcceptedItem] = []
    duplicates: list[DuplicateItem] = []
    rejected_items: list[RejectedItem] = []


class IngestionService:
    @classmethod
    def ingest_bytes(
        cls,
        session: Session,
        dataset_id: str,
        filename: str,
        data: bytes,
        split: str = "train",
        storage: StorageBackend | None = None,
        actor_id: str = "default_user",
    ) -> ImportReport:
        dataset = session.scalar(select(DatasetModel).where(DatasetModel.id == dataset_id))
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        backend = storage or get_storage_backend()

        # Create a ProcessingRun to track the import audit trail
        run_id = generate_id("run")
        run = ProcessingRunModel(
            id=run_id,
            dataset_id=dataset_id,
            run_type=RunType.IMPORT.value,
            status=RunStatus.RUNNING.value,
            actor_id=actor_id,
            configuration_snapshot={"filename": filename, "split": split},
        )
        session.add(run)
        session.flush()

        report = ImportReport(
            run_id=run_id,
            dataset_id=dataset_id,
            total_processed=0,
            accepted_count=0,
            duplicate_count=0,
            rejected_count=0,
        )

        try:
            mime, modality = validate_file_safety(filename, data)

            if modality == "archive":
                cls._process_archive(session, dataset, run, data, split, backend, report)
            elif mime == "text/csv":
                cls._process_csv(session, dataset, run, filename, data, split, report)
            elif mime in {"application/json", "application/x-ndjson"}:
                cls._process_json_or_jsonl(session, dataset, run, filename, data, split, report)
            else:
                # Standalone media or text asset
                cls._process_single_asset(session, dataset, run, filename, data, mime, modality, split, backend, report)

            run.status = RunStatus.COMPLETED.value
            run.total_items = report.total_processed
            run.processed_items = report.accepted_count + report.duplicate_count
            run.failed_items = report.rejected_count

        except Exception as e:  # noqa: BLE001
            run.status = RunStatus.FAILED.value
            run.error_summary = str(e)
            report.rejected_count += 1
            report.rejected_items.append(RejectedItem(filename=filename, reason=str(e)))
        finally:
            session.flush()

        return report

    @classmethod
    def _process_single_asset(
        cls,
        session: Session,
        dataset: DatasetModel,
        run: ProcessingRunModel,
        filename: str,
        data: bytes,
        mime: str,
        modality: str,
        split: str,
        backend: StorageBackend,
        report: ImportReport,
    ) -> None:
        report.total_processed += 1
        sha256 = compute_sha256(data)

        # Exact duplicate detection across dataset
        existing_asset = session.scalar(
            select(AssetModel).where(
                AssetModel.dataset_id == dataset.id,
                AssetModel.sha256 == sha256,
            )
        )
        if existing_asset:
            report.duplicate_count += 1
            report.duplicates.append(
                DuplicateItem(
                    filename=filename,
                    sha256=sha256,
                    existing_asset_id=existing_asset.id,
                )
            )
            cls._log_run_item(session, run.id, f"dup_{sha256[:12]}", RunStatus.COMPLETED, f"Duplicate of {existing_asset.id}")
            return

        # Dimensions & Perceptual Hash for images and Audio metadata
        dimensions = None
        phash = None
        if modality == "image":
            try:
                with Image.open(io.BytesIO(data)) as img:
                    dimensions = {"width": img.width, "height": img.height}
                phash = compute_phash(data)
            except (OSError, ValueError) as e:
                report.rejected_count += 1
                report.rejected_items.append(RejectedItem(filename=filename, reason=f"Corrupt image structure: {e}"))
                cls._log_run_item(session, run.id, f"bad_{sha256[:12]}", RunStatus.FAILED, str(e))
                return
        elif modality == "audio":
            try:
                import wave
                with wave.open(io.BytesIO(data), "rb") as wf:
                    channels = wf.getnchannels()
                    sample_rate = wf.getframerate()
                    frames = wf.getnframes()
                    duration_sec = round(frames / float(sample_rate), 3) if sample_rate > 0 else 0.0
                    dimensions = {
                        "channels": channels,
                        "sample_rate": sample_rate,
                        "sample_rate_hz": sample_rate,
                        "duration_seconds": duration_sec,
                    }
            except (wave.Error, EOFError, ValueError, OSError):
                dimensions = {"channels": 1, "sample_rate": 16000, "sample_rate_hz": 16000, "duration_seconds": None}

        # Store asset with opaque key
        ext = os.path.splitext(filename.lower())[1] or ".bin"
        asset_id = generate_id("asset")
        storage_key = f"assets/{dataset.id}/{asset_id}{ext}"
        backend.write_bytes(storage_key, data)

        asset = RecordService.create_asset(
            session=session,
            dataset_id=dataset.id,
            storage_key=storage_key,
            modality=AssetModality(modality),
            mime_type=mime,
            byte_size=len(data),
            sha256=sha256,
            phash=phash,
            original_filename=filename,
            dimensions=dimensions,
        )

        # Create Record
        record = RecordService.create_record(
            session=session,
            dataset_id=dataset.id,
            external_key=filename,
            split=split,
            metadata={"original_filename": filename, "byte_size": len(data)},
        )

        # Link Record to Asset
        if modality == "image":
            role = AssetRole.PRIMARY_IMAGE
        elif modality == "audio":
            role = AssetRole.PRIMARY_AUDIO
        elif modality == "document":
            role = AssetRole.SOURCE_DOCUMENT
        else:
            role = AssetRole.PAIRED_TEXT
        RecordService.link_asset_to_record(
            session=session,
            record_id=record.id,
            asset_id=asset.id,
            role=role,
        )


        # Attach initial source provenance
        RecordService.attach_source_record(
            session=session,
            record_id=record.id,
            source_type="upload",
            license_status=LicenseStatus.UNKNOWN,
        )

        cls._log_run_item(session, run.id, f"item_{sha256[:12]}", RunStatus.COMPLETED, record.id, record_id=record.id)

        report.accepted_count += 1
        report.accepted_items.append(
            AcceptedItem(
                record_id=record.id,
                asset_id=asset.id,
                filename=filename,
                sha256=sha256,
                modality=modality,
                role=role.value,
            )
        )

    @classmethod
    def _process_archive(
        cls,
        session: Session,
        dataset: DatasetModel,
        run: ProcessingRunModel,
        data: bytes,
        split: str,
        backend: StorageBackend,
        report: ImportReport,
    ) -> None:
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                validate_archive_bounds(zf)
                file_entries = [e for e in zf.infolist() if not e.is_dir()]

                # Group entries for multimodal pairing (e.g. image1.jpg + image1.txt)
                entries_by_stem: dict[str, list[zipfile.ZipInfo]] = {}
                for entry in file_entries:
                    safe_rel = sanitize_archive_entry_path(entry.filename)
                    if not safe_rel:
                        report.rejected_count += 1
                        report.rejected_items.append(
                            RejectedItem(filename=entry.filename, reason="Unsafe archive entry path (traversal blocked).")
                        )
                        continue
                    stem = os.path.splitext(safe_rel)[0]
                    entries_by_stem.setdefault(stem, []).append(entry)

                for stem, group in entries_by_stem.items():
                    # If group contains paired image and text, bundle under ONE record
                    image_entry = next((e for e in group if os.path.splitext(e.filename.lower())[1] in {".jpg", ".jpeg", ".png", ".webp"}), None)
                    text_entry = next((e for e in group if os.path.splitext(e.filename.lower())[1] in {".txt", ".json"}), None)

                    if image_entry and text_entry:
                        cls._process_paired_archive_item(session, dataset, run, zf, image_entry, text_entry, split, backend, report)
                    else:
                        for entry in group:
                            safe_name = sanitize_archive_entry_path(entry.filename) or entry.filename
                            entry_bytes = zf.read(entry)
                            try:
                                mime, modality = validate_file_safety(safe_name, entry_bytes)
                                cls._process_single_asset(session, dataset, run, safe_name, entry_bytes, mime, modality, split, backend, report)
                            except DomainValidationError as e:
                                report.rejected_count += 1
                                report.rejected_items.append(RejectedItem(filename=safe_name, reason=str(e)))
        except zipfile.BadZipFile:
            raise DomainValidationError("Corrupted or invalid ZIP archive file.")

    @classmethod
    def _process_paired_archive_item(
        cls,
        session: Session,
        dataset: DatasetModel,
        run: ProcessingRunModel,
        zf: zipfile.ZipFile,
        img_info: zipfile.ZipInfo,
        txt_info: zipfile.ZipInfo,
        split: str,
        backend: StorageBackend,
        report: ImportReport,
    ) -> None:
        report.total_processed += 1
        img_bytes = zf.read(img_info)
        txt_bytes = zf.read(txt_info)

        img_sha256 = compute_sha256(img_bytes)
        txt_sha256 = compute_sha256(txt_bytes)

        # Store image asset
        img_ext = os.path.splitext(img_info.filename.lower())[1]
        img_asset_id = generate_id("asset")
        img_key = f"assets/{dataset.id}/{img_asset_id}{img_ext}"
        backend.write_bytes(img_key, img_bytes)

        dimensions = None
        phash = None
        try:
            with Image.open(io.BytesIO(img_bytes)) as img:
                dimensions = {"width": img.width, "height": img.height}
            phash = compute_phash(img_bytes)
        except (OSError, ValueError):
            pass

        img_asset = RecordService.create_asset(
            session=session,
            dataset_id=dataset.id,
            storage_key=img_key,
            modality=AssetModality.IMAGE,
            mime_type="image/jpeg" if img_ext in {".jpg", ".jpeg"} else "image/png",
            byte_size=len(img_bytes),
            sha256=img_sha256,
            phash=phash,
            original_filename=img_info.filename,
            dimensions=dimensions,
        )

        # Store paired text asset
        txt_ext = os.path.splitext(txt_info.filename.lower())[1]
        txt_asset_id = generate_id("asset")
        txt_key = f"assets/{dataset.id}/{txt_asset_id}{txt_ext}"
        backend.write_bytes(txt_key, txt_bytes)

        txt_asset = RecordService.create_asset(
            session=session,
            dataset_id=dataset.id,
            storage_key=txt_key,
            modality=AssetModality.TEXT,
            mime_type="text/plain",
            byte_size=len(txt_bytes),
            sha256=txt_sha256,
            original_filename=txt_info.filename,
        )

        # Create bundled multimodal record
        record = RecordService.create_record(
            session=session,
            dataset_id=dataset.id,
            external_key=os.path.splitext(img_info.filename)[0],
            split=split,
            metadata={"paired": True, "image": img_info.filename, "text": txt_info.filename},
        )

        RecordService.link_asset_to_record(session, record.id, img_asset.id, AssetRole.PRIMARY_IMAGE, position=0)
        RecordService.link_asset_to_record(session, record.id, txt_asset.id, AssetRole.PAIRED_TEXT, position=1)
        RecordService.attach_source_record(session, record.id, source_type="archive_upload", license_status=LicenseStatus.UNKNOWN)

        cls._log_run_item(session, run.id, f"pair_{img_sha256[:12]}", RunStatus.COMPLETED, record.id, record_id=record.id)

        report.accepted_count += 1
        report.accepted_items.append(
            AcceptedItem(
                record_id=record.id,
                asset_id=img_asset.id,
                filename=img_info.filename,
                sha256=img_sha256,
                modality="multimodal",
                role="primary_image+paired_text",
            )
        )

    @classmethod
    def _process_csv(
        cls,
        session: Session,
        dataset: DatasetModel,
        run: ProcessingRunModel,
        filename: str,
        data: bytes,
        split: str,
        report: ImportReport,
    ) -> None:
        text_content = data.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text_content))
        for row_idx, row in enumerate(reader, start=1):
            report.total_processed += 1
            if not any(row.values()):
                continue  # Skip empty lines

            record = RecordService.create_record(
                session=session,
                dataset_id=dataset.id,
                external_key=f"csv_row_{row_idx}",
                split=split,
                metadata=dict(row),
            )
            RecordService.attach_source_record(session, record.id, source_type="csv_upload")
            cls._log_run_item(session, run.id, f"csv_{row_idx}", RunStatus.COMPLETED, record.id, record_id=record.id)

            report.accepted_count += 1
            report.accepted_items.append(
                AcceptedItem(
                    record_id=record.id,
                    filename=f"row_{row_idx}",
                    modality="tabular",
                    role="row",
                )
            )

    @classmethod
    def _process_json_or_jsonl(
        cls,
        session: Session,
        dataset: DatasetModel,
        run: ProcessingRunModel,
        filename: str,
        data: bytes,
        split: str,
        report: ImportReport,
    ) -> None:
        text_content = data.decode("utf-8", errors="replace")
        lines = [line.strip() for line in text_content.splitlines() if line.strip()]

        # Try JSON array first if file is .json
        items = []
        if filename.endswith(".json"):
            try:
                parsed = json.loads(text_content)
                if isinstance(parsed, list):
                    items = parsed
                elif isinstance(parsed, dict):
                    items = [parsed]
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

        # Fallback to JSONL
        if not items:
            for line_idx, line in enumerate(lines, start=1):
                try:
                    obj = json.loads(line)
                    items.append((line_idx, obj))
                except json.JSONDecodeError as e:
                    report.rejected_count += 1
                    report.rejected_items.append(RejectedItem(filename=f"{filename}:L{line_idx}", reason=f"Invalid JSON line: {e}"))

        for idx, item in enumerate(items, start=1):
            report.total_processed += 1
            payload = item if isinstance(item, dict) else item[1]
            ext_key = payload.get("id") or payload.get("external_id") or f"json_item_{idx}"

            record = RecordService.create_record(
                session=session,
                dataset_id=dataset.id,
                external_key=str(ext_key),
                split=split,
                metadata=payload,
            )
            RecordService.attach_source_record(session, record.id, source_type="json_upload")
            cls._log_run_item(session, run.id, f"json_{idx}", RunStatus.COMPLETED, record.id, record_id=record.id)

            report.accepted_count += 1
            report.accepted_items.append(
                AcceptedItem(
                    record_id=record.id,
                    filename=str(ext_key),
                    modality="structured_record",
                    role="json_item",
                )
            )

    @staticmethod
    def _log_run_item(
        session: Session,
        run_id: str,
        idempotency_key: str,
        status: RunStatus,
        output_ref: str | None = None,
        record_id: str | None = None,
        error_msg: str | None = None,
    ) -> None:
        item = RunItemModel(
            id=generate_id("run_item"),
            processing_run_id=run_id,
            record_id=record_id,
            idempotency_key=idempotency_key,
            status=status.value if isinstance(status, RunStatus) else status,
            output_reference=output_ref,
            error_message=error_msg,
        )
        session.add(item)
