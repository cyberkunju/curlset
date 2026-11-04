"""
Ingestion orchestrator: safe file parsing, duplicate detection, asset storage,
record creation, and multimodal bundling.

Text-bearing formats (CSV / JSON / JSONL / plain ``.txt``) are imported through a
single row pipeline (:meth:`IngestionService._import_rows`) that:

* normalizes every row into the canonical text contract
  (``metadata["text"]`` / ``metadata["label"]`` / ``metadata["split"]``) with
  :mod:`packages.dataset_io.text_normalize`, preserving all original columns;
* rejects malformed rows individually, with a row number and reason, so the good
  rows of a file still import (docs/STATUS.md A4/A8);
* runs every row inside a SQLAlchemy savepoint, so a failing row can never leave
  a flushed record behind without its processing-run item (A5);
* deduplicates text content by ``(split, normalized-content hash)`` (A9): a repeat
  inside the same split is skipped as import noise, while a repeat in a different
  split is imported on purpose so train/val/test leakage stays representable and
  the quality engine's ``RULE_DUPLICATE_TEXT`` warning can surface it;
* turns an in-vocabulary ``label`` column into an
  ``Annotation(origin="imported", status="pending_review")`` instead of writing
  the label to metadata only (A7).
"""
from __future__ import annotations

import csv
import io
import json
import os
import zipfile
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from PIL import Image
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import (
    AnnotationOrigin,
    AssetModality,
    AssetRole,
    LicenseStatus,
    ReviewStatus,
    RunStatus,
    RunType,
    TaskType,
)
from packages.dataset_core.db.models import (
    AssetModel,
    DatasetModel,
    DatasetRecordModel,
    ProcessingRunModel,
    RunItemModel,
)
from packages.dataset_core.domain_models import AssetContract
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_core.services.record_service import RecordService
from packages.dataset_io.hashing import compute_phash, compute_sha256
from packages.dataset_io.safety import (
    sanitize_archive_entry_path,
    validate_archive_bounds,
    validate_file_safety,
)
from packages.dataset_io.storage import StorageBackend, get_storage_backend
from packages.dataset_io.text_normalize import (
    MAX_TEXT_CHARS,
    VALID_SPLITS,
    TextRecordFields,
    normalize_text_metadata,
    text_content_hash,
)

# Task types whose primary sample content is the record's text. A tabular row
# without text cannot become a usable sample for these tasks, so it is rejected
# (docs/STATUS.md A4/A8).
_TEXT_PRIMARY_TASK_TYPES: frozenset[str] = frozenset(
    {TaskType.TEXT_CLASSIFICATION.value, TaskType.PAIRED_IMAGE_TEXT.value}
)

# Task types for which a bare ``{"label": ...}`` payload is a complete, valid
# annotation. An imported label column becomes an imported annotation only for
# these tasks; other task types keep their label in metadata only.
_LABEL_ANNOTATION_TASK_TYPES: frozenset[str] = frozenset(
    {TaskType.TEXT_CLASSIFICATION.value, TaskType.IMAGE_CLASSIFICATION.value}
)

# CSV rows can carry more values than the header declares. ``csv.DictReader``
# puts those stray values under this key so we can reject the row with a clear
# reason instead of letting a ``None`` key reach persisted metadata.
_STRAY_COLUMNS_KEY = "__stray_extra_columns__"

# Provenance actor recorded on annotations created by the importer.
IMPORT_ANNOTATION_ACTOR_ID = "importer"


class DuplicateItem(BaseModel):
    filename: str
    sha256: str
    existing_asset_id: str | None = None
    existing_record_id: str | None = None
    message: str = "Exact duplicate file content detected"


class RejectedItem(BaseModel):
    filename: str
    reason: str
    row_number: int | None = None


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


@dataclass(frozen=True)
class _TextImportRow:
    """One normalized-able row yielded by a text-bearing file parser."""

    row_number: int
    raw_metadata: dict[str, Any]
    external_key: str
    display_name: str
    rejection: str | None = None


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

        # The dataset-level split is the fallback for rows without a split column.
        # Rejecting it up-front beats rejecting every row of the file one by one.
        if split not in VALID_SPLITS:
            raise DomainValidationError(
                f"Invalid split '{split}'. Allowed: {sorted(VALID_SPLITS)}",
                field="split",
            )

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
            started_at=datetime.now(UTC),
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
            elif (
                modality == "text"
                and filename.lower().endswith(".txt")
                and dataset.task_type in _TEXT_PRIMARY_TASK_TYPES
            ):
                # A plain-text corpus is one sample per non-empty line (A3).
                cls._process_text_file(session, dataset, run, filename, data, split, backend, report)
            else:
                # Standalone media or text asset
                cls._process_single_asset(session, dataset, run, filename, data, mime, modality, split, backend, report)

            run.status = RunStatus.COMPLETED.value

        except Exception as e:  # noqa: BLE001
            run.status = RunStatus.FAILED.value
            run.error_summary = str(e) or e.__class__.__name__
            report.rejected_count += 1
            report.rejected_items.append(
                RejectedItem(filename=filename, reason=str(e) or e.__class__.__name__)
            )
        finally:
            # Accounting must reflect what was actually persisted, including a
            # file-level failure that happens after some rows were imported.
            run.total_items = report.total_processed
            run.processed_items = report.accepted_count + report.duplicate_count
            run.failed_items = report.rejected_count
            run.finished_at = datetime.now(UTC)
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

                # Content hashes are only needed (and only scanned for) when the
                # archive actually contains paired image+text bundles.
                existing_hashes: dict[str, str] | None = None
                for stem, group in entries_by_stem.items():
                    # If group contains paired image and text, bundle under ONE record
                    image_entry = next((e for e in group if os.path.splitext(e.filename.lower())[1] in {".jpg", ".jpeg", ".png", ".webp"}), None)
                    text_entry = next((e for e in group if os.path.splitext(e.filename.lower())[1] in {".txt", ".json"}), None)

                    if image_entry and text_entry:
                        if existing_hashes is None:
                            existing_hashes = cls._load_text_content_hashes(session, dataset.id)
                        cls._process_paired_archive_item(
                            session,
                            dataset,
                            run,
                            zf,
                            image_entry,
                            text_entry,
                            split,
                            backend,
                            report,
                            existing_hashes,
                        )
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
        existing_hashes: dict[tuple[str, str], str],
    ) -> None:
        """Import one image+text bundle; dedupe is split-aware like row imports."""
        report.total_processed += 1
        img_bytes = zf.read(img_info)
        txt_bytes = zf.read(txt_info)

        # The canonical contract (docs/STATUS.md §0) says metadata["text"] is the
        # sample's text CONTENT. For a bundle that is the decoded .txt body, never
        # the paired filename (which would break workspace/AI labeling/exports and
        # make content-hash dedupe miss re-imports).
        paired_text = txt_bytes.decode("utf-8", errors="replace").strip()
        if len(paired_text) > MAX_TEXT_CHARS:
            paired_text = paired_text[:MAX_TEXT_CHARS]
        content_hash = text_content_hash(paired_text) if paired_text else None
        dedupe_key = (split, content_hash) if content_hash is not None else None

        if dedupe_key is not None and dedupe_key in existing_hashes:
            existing_record_id = existing_hashes[dedupe_key]
            report.duplicate_count += 1
            report.duplicates.append(
                DuplicateItem(
                    filename=img_info.filename,
                    sha256=content_hash,
                    existing_record_id=existing_record_id,
                    message="Duplicate paired text content detected (content hash match)",
                )
            )
            cls._log_run_item(
                session,
                run.id,
                f"dup_pair_{content_hash[:12]}",
                RunStatus.COMPLETED,
                f"duplicate_of:{existing_record_id}",
            )
            return

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

        # Create bundled multimodal record. Filenames stay available as lineage
        # under non-canonical keys; metadata["text"] carries the bundle's content.
        metadata: dict[str, Any] = {
            "paired": True,
            "paired_image_filename": img_info.filename,
            "paired_text_filename": txt_info.filename,
        }
        if paired_text:
            metadata["text"] = paired_text
        record = RecordService.create_record(
            session=session,
            dataset_id=dataset.id,
            external_key=os.path.splitext(img_info.filename)[0],
            split=split,
            metadata=metadata,
        )

        RecordService.link_asset_to_record(session, record.id, img_asset.id, AssetRole.PRIMARY_IMAGE, position=0)
        RecordService.link_asset_to_record(session, record.id, txt_asset.id, AssetRole.PAIRED_TEXT, position=1)
        RecordService.attach_source_record(session, record.id, source_type="archive_upload", license_status=LicenseStatus.UNKNOWN)

        cls._log_run_item(session, run.id, f"pair_{img_sha256[:12]}", RunStatus.COMPLETED, record.id, record_id=record.id)

        if dedupe_key is not None:
            existing_hashes[dedupe_key] = record.id
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
        text_content = data.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text_content), restkey=_STRAY_COLUMNS_KEY)
        if reader.fieldnames is None:
            raise DomainValidationError(f"CSV file '{filename}' has no header row.", field="header")

        header_columns = len(reader.fieldnames)
        require_text = dataset.task_type in _TEXT_PRIMARY_TASK_TYPES
        rows: list[_TextImportRow] = []
        for row_number, row in enumerate(reader, start=1):
            # DictReader puts surplus row values in a list under the restkey; only
            # that list signals stray columns (a real column carrying the sentinel
            # name would be a plain string and is treated as data).
            stray = row.get(_STRAY_COLUMNS_KEY)
            raw_metadata = {
                key: value for key, value in row.items() if key != _STRAY_COLUMNS_KEY
            }
            values = list(raw_metadata.values())
            rejection = None
            if isinstance(stray, list) and stray:
                rejection = (
                    f"stray column(s): {len(stray)} value(s) beyond the "
                    f"{header_columns} header column(s)"
                )
            elif not any(values):
                continue  # Completely blank line: formatting artifact, not a data row.
            rows.append(
                _TextImportRow(
                    row_number=row_number,
                    raw_metadata=raw_metadata,
                    external_key=f"csv_row_{row_number}",
                    display_name=f"row_{row_number}",
                    rejection=rejection,
                )
            )

        cls._import_rows(
            session,
            dataset,
            run,
            filename,
            rows,
            default_split=split,
            source_type="csv_upload",
            report=report,
            require_text=require_text,
            modality="tabular",
            role="row",
            store_text_assets=False,
            backend=None,
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
        text_content = data.decode("utf-8-sig", errors="replace")
        require_text = dataset.task_type in _TEXT_PRIMARY_TASK_TYPES
        rows: list[_TextImportRow] = []

        if filename.lower().endswith(".json"):
            try:
                parsed = json.loads(text_content)
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                raise DomainValidationError(f"Invalid JSON document: {e}", field="json") from e

            if isinstance(parsed, dict):
                entries: list[tuple[int, Any]] = [(1, parsed)]
            elif isinstance(parsed, list):
                entries = list(enumerate(parsed, start=1))
            else:
                raise DomainValidationError(
                    "JSON document must be an object or an array of objects.",
                    field="json",
                )

            for item_number, item in entries:
                if not isinstance(item, dict):
                    rows.append(
                        _TextImportRow(
                            row_number=item_number,
                            raw_metadata={},
                            external_key=f"json_item_{item_number}",
                            display_name=f"item_{item_number}",
                            rejection="JSON item is not an object",
                        )
                    )
                    continue
                rows.append(cls._json_import_row(item_number, item))
        else:
            # JSON Lines: one JSON object per non-empty physical line.
            for line_number, line in enumerate(text_content.splitlines(), start=1):
                if not line.strip():
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError as e:
                    rows.append(
                        _TextImportRow(
                            row_number=line_number,
                            raw_metadata={},
                            external_key=f"json_line_{line_number}",
                            display_name=f"line_{line_number}",
                            rejection=f"invalid JSON line: {e.msg}",
                        )
                    )
                    continue
                if not isinstance(item, dict):
                    rows.append(
                        _TextImportRow(
                            row_number=line_number,
                            raw_metadata={},
                            external_key=f"json_line_{line_number}",
                            display_name=f"line_{line_number}",
                            rejection="JSON line is not an object",
                        )
                    )
                    continue
                rows.append(cls._json_import_row(line_number, item))

        cls._import_rows(
            session,
            dataset,
            run,
            filename,
            rows,
            default_split=split,
            source_type="json_upload",
            report=report,
            require_text=require_text,
            modality="structured_record",
            role="json_item",
            store_text_assets=False,
            backend=None,
        )

    @staticmethod
    def _json_import_row(row_number: int, item: dict[str, Any]) -> _TextImportRow:
        external_key = item.get("id") or item.get("external_id") or f"json_item_{row_number}"
        return _TextImportRow(
            row_number=row_number,
            raw_metadata=dict(item),
            external_key=str(external_key),
            display_name=str(external_key),
        )

    @classmethod
    def _process_text_file(
        cls,
        session: Session,
        dataset: DatasetModel,
        run: ProcessingRunModel,
        filename: str,
        data: bytes,
        split: str,
        storage: StorageBackend,
        report: ImportReport,
    ) -> None:
        """Import a plain-text corpus: one record per non-empty line (A3)."""
        text_content = data.decode("utf-8-sig", errors="replace")
        rows: list[_TextImportRow] = []
        for line_number, line in enumerate(text_content.splitlines(), start=1):
            stripped = line.strip()
            if not stripped:
                continue
            rows.append(
                _TextImportRow(
                    row_number=line_number,
                    raw_metadata={"text": stripped},
                    external_key=f"txt_line_{line_number}",
                    display_name=f"line_{line_number}",
                )
            )

        cls._import_rows(
            session,
            dataset,
            run,
            filename,
            rows,
            default_split=split,
            source_type="txt_upload",
            report=report,
            require_text=True,
            modality="text",
            role="text_line",
            store_text_assets=True,
            backend=storage,
        )

    @classmethod
    def _import_rows(
        cls,
        session: Session,
        dataset: DatasetModel,
        run: ProcessingRunModel,
        filename: str,
        rows: Iterable[_TextImportRow],
        *,
        default_split: str,
        source_type: str,
        report: ImportReport,
        require_text: bool,
        modality: str,
        role: str,
        store_text_assets: bool,
        backend: StorageBackend | None,
    ) -> None:
        """Import parsed rows, each in its own savepoint, with per-row diagnostics."""
        existing_hashes = cls._load_text_content_hashes(session, dataset.id)

        for row in rows:
            report.total_processed += 1
            rejected_filename = f"{filename}:row{row.row_number}"

            if row.rejection:
                cls._reject_row(session, run, report, rejected_filename, row.row_number, row.rejection)
                continue

            fields = normalize_text_metadata(
                row.raw_metadata,
                default_split=default_split,
                require_text=require_text,
            )
            validation_problem = cls._validation_problem(fields, require_text)
            if validation_problem:
                cls._reject_row(session, run, report, rejected_filename, row.row_number, validation_problem)
                continue

            label_problem = cls._label_problem(dataset, fields.label)
            if label_problem:
                cls._reject_row(session, run, report, rejected_filename, row.row_number, label_problem)
                continue

            effective_split = fields.split or default_split
            content_hash = text_content_hash(fields.text) if fields.has_text else None
            dedupe_key = (effective_split, content_hash) if content_hash is not None else None
            if dedupe_key is not None and dedupe_key in existing_hashes:
                cls._record_duplicate(
                    session,
                    run,
                    report,
                    display_name=row.display_name,
                    row_number=row.row_number,
                    content_hash=content_hash,
                    existing_record_id=existing_hashes[dedupe_key],
                )
                continue

            try:
                record_id, asset_id = cls._persist_row(
                    session,
                    dataset,
                    run,
                    filename=filename,
                    external_key=row.external_key,
                    display_name=row.display_name,
                    split=effective_split,
                    metadata=fields.metadata,
                    text=fields.text,
                    label=fields.label,
                    source_type=source_type,
                    store_text_asset=store_text_assets,
                    backend=backend,
                )
            except DomainValidationError as e:
                cls._reject_row(session, run, report, rejected_filename, row.row_number, str(e))
                continue

            if dedupe_key is not None:
                existing_hashes[dedupe_key] = record_id
            report.accepted_count += 1
            report.accepted_items.append(
                AcceptedItem(
                    record_id=record_id,
                    asset_id=asset_id,
                    filename=row.display_name,
                    sha256=content_hash,
                    modality=modality,
                    role=role,
                )
            )

    @classmethod
    def _persist_row(
        cls,
        session: Session,
        dataset: DatasetModel,
        run: ProcessingRunModel,
        *,
        filename: str,
        external_key: str,
        display_name: str,
        split: str,
        metadata: dict[str, Any],
        text: str | None,
        label: str | None,
        source_type: str,
        store_text_asset: bool,
        backend: StorageBackend | None,
    ) -> tuple[str, str | None]:
        """Persist one record, its provenance/annotation and run item atomically.

        ``session.begin_nested()`` issues a SAVEPOINT: if anything in this row
        fails, only this row is rolled back and the outer import transaction stays
        usable. A committed record can therefore never exist without its run item.
        """
        with session.begin_nested():
            record = RecordService.create_record(
                session=session,
                dataset_id=dataset.id,
                external_key=external_key,
                split=split,
                metadata=metadata,
            )
            RecordService.attach_source_record(
                session=session,
                record_id=record.id,
                source_type=source_type,
                license_status=LicenseStatus.UNKNOWN,
            )

            if label is not None and dataset.task_type in _LABEL_ANNOTATION_TASK_TYPES:
                # Imported pre-labeled data becomes a reviewable proposal; it is
                # never auto-approved (docs/STATUS.md §0 rule 2 / A7).
                AnnotationService.create_annotation(
                    session=session,
                    record_id=record.id,
                    payload={"label": label},
                    origin=AnnotationOrigin.IMPORTED,
                    status=ReviewStatus.PENDING_REVIEW,
                    actor_id=IMPORT_ANNOTATION_ACTOR_ID,
                    processing_run_id=run.id,
                )

            asset_id: str | None = None
            if store_text_asset and backend is not None and text:
                asset = cls._store_text_line_asset(
                    session,
                    dataset,
                    backend,
                    filename=filename,
                    display_name=display_name,
                    text=text,
                )
                RecordService.link_asset_to_record(
                    session=session,
                    record_id=record.id,
                    asset_id=asset.id,
                    role=AssetRole.PAIRED_TEXT,
                    position=0,
                )
                asset_id = asset.id

            cls._log_run_item(
                session,
                run.id,
                f"item_{record.id}",
                RunStatus.COMPLETED,
                record.id,
                record_id=record.id,
            )

        return record.id, asset_id

    @classmethod
    def _store_text_line_asset(
        cls,
        session: Session,
        dataset: DatasetModel,
        backend: StorageBackend,
        *,
        filename: str,
        display_name: str,
        text: str,
    ) -> AssetContract:
        """Store one imported text line as an immutable TEXT asset for lineage."""
        payload = text.encode("utf-8")
        asset_id = generate_id("asset")
        storage_key = f"assets/{dataset.id}/{asset_id}.txt"
        backend.write_bytes(storage_key, payload)
        return RecordService.create_asset(
            session=session,
            dataset_id=dataset.id,
            storage_key=storage_key,
            modality=AssetModality.TEXT,
            mime_type="text/plain",
            byte_size=len(payload),
            sha256=compute_sha256(payload),
            original_filename=f"{filename}#{display_name}"[:255],
        )

    @staticmethod
    def _validation_problem(fields: TextRecordFields, require_text: bool) -> str | None:
        """Return a row-level rejection reason, or ``None`` when the row is valid."""
        for problem in fields.problems:
            if problem.startswith("invalid split"):
                return problem
        if require_text and not fields.has_text:
            return "missing or blank text"
        return None

    @staticmethod
    def _allowed_labels(dataset: DatasetModel) -> list[str] | None:
        """Extract configured class names from the dataset label schema, if any."""
        schema = dataset.label_schema if isinstance(dataset.label_schema, dict) else {}
        for key in ("classes", "labels"):
            values = schema.get(key)
            if isinstance(values, list):
                return [str(value) for value in values]
        return None

    @classmethod
    def _label_problem(cls, dataset: DatasetModel, label: str | None) -> str | None:
        """Reject an out-of-vocabulary imported label instead of silently storing it."""
        if label is None or dataset.task_type not in _LABEL_ANNOTATION_TASK_TYPES:
            return None
        allowed = cls._allowed_labels(dataset)
        if allowed is not None and label not in allowed:
            return f"label '{label}' is not in the dataset label_schema (allowed: {allowed})"
        return None

    @staticmethod
    def _load_text_content_hashes(
        session: Session, dataset_id: str
    ) -> dict[tuple[str, str], str]:
        """Map ``(split, normalized text-content hash) -> existing record id``.

        Dedupe scope is deliberately **split-aware**: a content hash is only a
        duplicate when it repeats inside the same split. Same-split repeats are
        import noise (a spreadsheet re-uploaded, a bundle imported twice) and are
        skipped. Cross-split repeats are a different thing entirely: they are
        train/val/test *leakage* risks that must remain representable so the
        quality engine's ``RULE_DUPLICATE_TEXT`` warning can expose them. A
        dataset-wide dedupe would silently destroy that signal.

        Import is bounded by file size in practice; the dataset scan keeps dedupe
        correct across formats without adding an index to the fixed schema.
        """
        stmt = select(
            DatasetRecordModel.id,
            DatasetRecordModel.split,
            DatasetRecordModel.extra_metadata,
        ).where(DatasetRecordModel.dataset_id == dataset_id)
        hashes: dict[tuple[str, str], str] = {}
        for record_id, split, metadata in session.execute(stmt):
            if not isinstance(metadata, dict):
                continue
            text = metadata.get("text")
            if not isinstance(text, str) or not text.strip():
                continue
            hashes.setdefault((split or "train", text_content_hash(text)), record_id)
        return hashes

    @classmethod
    def _reject_row(
        cls,
        session: Session,
        run: ProcessingRunModel,
        report: ImportReport,
        rejected_filename: str,
        row_number: int,
        reason: str,
    ) -> None:
        message = f"row {row_number}: {reason}"
        report.rejected_count += 1
        report.rejected_items.append(
            RejectedItem(filename=rejected_filename, reason=message, row_number=row_number)
        )
        cls._log_run_item(
            session,
            run.id,
            f"reject_row_{row_number}",
            RunStatus.FAILED,
            error_msg=message,
        )
        # Flush immediately so the rejection audit item is durable before the next
        # row's savepoint; it must never be rolled back together with another row.
        session.flush()

    @classmethod
    def _record_duplicate(
        cls,
        session: Session,
        run: ProcessingRunModel,
        report: ImportReport,
        *,
        display_name: str,
        row_number: int,
        content_hash: str,
        existing_record_id: str,
    ) -> None:
        report.duplicate_count += 1
        report.duplicates.append(
            DuplicateItem(
                filename=display_name,
                sha256=content_hash,
                existing_asset_id=None,
                existing_record_id=existing_record_id,
                message="Duplicate text content detected (content hash match)",
            )
        )
        cls._log_run_item(
            session,
            run.id,
            f"dup_{content_hash[:12]}_{row_number}",
            RunStatus.COMPLETED,
            f"duplicate_of:{existing_record_id}",
        )
        # Flush immediately so the duplicate audit item is durable before the next
        # row's savepoint; it must never be rolled back together with another row.
        session.flush()

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
