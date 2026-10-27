"""
Deterministic Quality Validation Engine running static and semantic audits over dataset records.
"""
from collections import Counter
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import (
    AnnotationOrigin,
    ReviewStatus,
    RunStatus,
    RunType,
    TaskType,
)
from packages.dataset_core.db.models import (
    DatasetModel,
    DatasetRecordModel,
    ProcessingRunModel,
)
from packages.dataset_core.exceptions import ResourceNotFoundError
from packages.dataset_core.id_generator import generate_id
from packages.dataset_io.storage import StorageBackend, get_storage_backend
from packages.dataset_quality.models import (
    QualityReport,
    ValidationFinding,
    ValidationSeverity,
)


class QualityEngine:
    @classmethod
    def validate_dataset(
        cls,
        session: Session,
        dataset_id: str,
        storage: StorageBackend | None = None,
    ) -> QualityReport:
        dataset = session.scalar(select(DatasetModel).where(DatasetModel.id == dataset_id))
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        backend = storage or get_storage_backend()
        records = session.scalars(
            select(DatasetRecordModel)
            .where(DatasetRecordModel.dataset_id == dataset_id)
            .order_by(DatasetRecordModel.created_at.asc())
        ).all()

        findings: list[ValidationFinding] = []
        class_counter: Counter[str] = Counter()
        split_counter: Counter[str] = Counter()
        origin_counter: Counter[str] = Counter()

        # Extract allowed classes if configured
        allowed_classes: list[str] | None = None
        if dataset.label_schema:
            if "classes" in dataset.label_schema and isinstance(dataset.label_schema["classes"], list):
                allowed_classes = [str(c) for c in dataset.label_schema["classes"]]
            elif "labels" in dataset.label_schema and isinstance(dataset.label_schema["labels"], list):
                allowed_classes = [str(c) for c in dataset.label_schema["labels"]]

        total_records = len(records)

        # 1. Check for empty dataset
        if total_records == 0:
            findings.append(
                ValidationFinding(
                    rule_id="RULE_EMPTY_DATASET",
                    severity=ValidationSeverity.BLOCKING,
                    title="Empty Dataset",
                    description="Dataset contains 0 records. At least 1 valid annotated record is required before publication.",
                    remediation="Import data or media assets into the dataset.",
                    affected_record_ids=[],
                    count=0,
                )
            )

        sha_to_splits: dict[str, set[str]] = {}
        sha_to_records: dict[str, list[str]] = {}
        unresolved_record_ids: list[str] = []
        schema_mismatch_ids: list[str] = []
        missing_asset_ids: list[str] = []
        empty_content_ids: list[str] = []
        invalid_timestamp_ids: list[str] = []

        for r in records:
            split_counter[r.split] += 1

            # Check annotation status
            if not r.annotations:
                unresolved_record_ids.append(r.id)
            else:
                latest_ann = max(r.annotations, key=lambda a: a.created_at)
                origin_counter[latest_ann.origin] += 1

                if latest_ann.status != ReviewStatus.APPROVED.value:
                    unresolved_record_ids.append(r.id)

                # Task-specific schema and payload audits
                if dataset.task_type == TaskType.OBJECT_DETECTION.value:
                    boxes = latest_ann.payload.get("boxes")
                    if not isinstance(boxes, list) or len(boxes) == 0:
                        schema_mismatch_ids.append(r.id)
                    else:
                        for b in boxes:
                            box_lbl = b.get("label")
                            if not box_lbl or not isinstance(box_lbl, str):
                                schema_mismatch_ids.append(r.id)
                            else:
                                class_counter[box_lbl] += 1
                                if allowed_classes is not None and box_lbl not in allowed_classes:
                                    schema_mismatch_ids.append(r.id)
                elif dataset.task_type == TaskType.AUDIO_TRANSCRIPTION.value:
                    text_content = latest_ann.payload.get("text")
                    if not text_content or not isinstance(text_content, str) or not text_content.strip():
                        schema_mismatch_ids.append(r.id)
                    else:
                        class_counter["transcribed"] += 1

                    # Timestamp boundary checks
                    segments = latest_ann.payload.get("segments")
                    if segments and isinstance(segments, list):
                        audio_duration = None
                        for ra in r.record_assets:
                            if ra.asset and ra.asset.dimensions and "duration_seconds" in ra.asset.dimensions:
                                audio_duration = ra.asset.dimensions["duration_seconds"]
                                break

                        for seg in segments:
                            if isinstance(seg, dict):
                                s = seg.get("start_time")
                                e = seg.get("end_time")
                                if s is not None and e is not None:
                                    if s > e or s < 0:
                                        invalid_timestamp_ids.append(r.id)
                                        break
                                    if audio_duration and e > (audio_duration + 1.0):
                                        invalid_timestamp_ids.append(r.id)
                                        break
                elif dataset.task_type == TaskType.DOCUMENT_OCR.value:
                    doc_text = latest_ann.payload.get("text")
                    if not doc_text or not isinstance(doc_text, str) or not doc_text.strip():
                        schema_mismatch_ids.append(r.id)
                    else:
                        class_counter["ocr_extracted"] += 1
                else:
                    lbl = latest_ann.payload.get("label")
                    if not lbl or not isinstance(lbl, str) or not lbl.strip():
                        schema_mismatch_ids.append(r.id)
                    else:
                        class_counter[lbl] += 1
                        if allowed_classes is not None and lbl not in allowed_classes:
                            schema_mismatch_ids.append(r.id)


            # Check text content emptiness
            if r.extra_metadata and ("text" in r.extra_metadata or "content" in r.extra_metadata):
                text_val = str(r.extra_metadata.get("text") or r.extra_metadata.get("content") or "").strip()
                if not text_val:
                    empty_content_ids.append(r.id)

            # Check linked assets
            for ra in r.record_assets:
                asset = ra.asset
                if not backend.exists(asset.storage_key):
                    missing_asset_ids.append(r.id)

                if asset.byte_size <= 0:
                    empty_content_ids.append(r.id)

                # Collect hashes for duplicate and split leakage audits
                sha = asset.sha256
                if sha:
                    sha_to_splits.setdefault(sha, set()).add(r.split)
                    sha_to_records.setdefault(sha, []).append(r.id)

        # 2. Unresolved Reviews Finding
        if unresolved_record_ids:
            findings.append(
                ValidationFinding(
                    rule_id="RULE_UNRESOLVED_REVIEWS",
                    severity=ValidationSeverity.BLOCKING,
                    title="Unreviewed or Pending Annotations",
                    description=f"{len(unresolved_record_ids)} records are unannotated or remain in pending_review / needs_correction status.",
                    remediation="Review and approve all annotations in the Annotation Workspace before snapshotting.",
                    affected_record_ids=unresolved_record_ids[:50],
                    count=len(unresolved_record_ids),
                )
            )

        # 3. Schema Mismatch Finding
        if schema_mismatch_ids:
            findings.append(
                ValidationFinding(
                    rule_id="RULE_SCHEMA_MISMATCH",
                    severity=ValidationSeverity.BLOCKING,
                    title="Schema & Allowed Vocabulary Violation",
                    description=f"{len(schema_mismatch_ids)} annotations have missing labels or values outside allowed label schema {allowed_classes}.",
                    remediation="Re-label affected records to comply with configured schema vocabulary.",
                    affected_record_ids=schema_mismatch_ids[:50],
                    count=len(schema_mismatch_ids),
                )
            )

        # 4. Missing Storage Assets Finding
        if missing_asset_ids:
            findings.append(
                ValidationFinding(
                    rule_id="RULE_MISSING_ASSETS",
                    severity=ValidationSeverity.BLOCKING,
                    title="Missing Media Storage Assets",
                    description=f"{len(missing_asset_ids)} records point to asset files not present in storage.",
                    remediation="Re-upload missing assets or remove unreferenced records.",
                    affected_record_ids=missing_asset_ids[:50],
                    count=len(missing_asset_ids),
                )
            )

        # 5. Empty or Zero-Byte Content Finding
        if empty_content_ids:
            findings.append(
                ValidationFinding(
                    rule_id="RULE_EMPTY_CONTENT",
                    severity=ValidationSeverity.BLOCKING,
                    title="Empty Content or Corrupt Files",
                    description=f"{len(empty_content_ids)} records have empty text bodies or 0-byte asset files.",
                    remediation="Provide valid content for these records or purge them.",
                    affected_record_ids=empty_content_ids[:50],
                    count=len(empty_content_ids),
                )
            )

        # 5b. Audio Timestamp Violation Finding
        if invalid_timestamp_ids:
            findings.append(
                ValidationFinding(
                    rule_id="RULE_AUDIO_TIMESTAMPS",
                    severity=ValidationSeverity.BLOCKING,
                    title="Invalid Audio Segment Timestamps",
                    description=f"{len(invalid_timestamp_ids)} audio records contain inverted timestamps (start > end) or exceed audio track duration.",
                    remediation="Adjust speech segment timestamps in the annotation workspace to match the audio track.",
                    affected_record_ids=invalid_timestamp_ids[:50],
                    count=len(invalid_timestamp_ids),
                )
            )


        # 6. Split Leakage Check (identical hash in train AND test/val)
        leakage_records: list[str] = []
        for sha, splits in sha_to_splits.items():
            if len(splits) > 1 and "train" in splits and ("test" in splits or "val" in splits):
                leakage_records.extend(sha_to_records[sha])

        if leakage_records:
            findings.append(
                ValidationFinding(
                    rule_id="RULE_SPLIT_LEAKAGE",
                    severity=ValidationSeverity.WARNING,
                    title="Train-Test Split Contamination Detected",
                    description=f"Identical asset content is shared across both training and test/validation splits across {len(leakage_records)} records.",
                    remediation="Reassign split partitions so training samples do not leak into evaluation benchmarks.",
                    affected_record_ids=list(set(leakage_records))[:50],
                    count=len(leakage_records),
                )
            )

        # 7. Exact Duplicates Check (multiple records sharing exact asset hash)
        duplicate_records: list[str] = []
        for sha, rec_ids in sha_to_records.items():
            if len(rec_ids) > 1:
                duplicate_records.extend(rec_ids)

        if duplicate_records:
            findings.append(
                ValidationFinding(
                    rule_id="RULE_EXACT_DUPLICATES",
                    severity=ValidationSeverity.WARNING,
                    title="Exact Duplicate Records",
                    description=f"{len(duplicate_records)} records share identical content hashes.",
                    remediation="Deduplicate records if unique representations are desired.",
                    affected_record_ids=list(set(duplicate_records))[:50],
                    count=len(duplicate_records),
                )
            )

        # 8. Class Imbalance Warning (Single class > 80% with >= 5 records and >= 2 classes)
        if total_records >= 5 and len(class_counter) >= 2:
            most_common_class, most_common_count = class_counter.most_common(1)[0]
            ratio = most_common_count / total_records
            if ratio > 0.80:
                findings.append(
                    ValidationFinding(
                        rule_id="RULE_CLASS_IMBALANCE",
                        severity=ValidationSeverity.WARNING,
                        title=f"Severe Class Imbalance ({most_common_class}: {round(ratio * 100, 1)}%)",
                        description=f"Dominant class '{most_common_class}' accounts for {round(ratio * 100, 1)}% of all annotations.",
                        remediation="Acquire or synthesize more samples for underrepresented classes.",
                        affected_record_ids=[],
                        count=most_common_count,
                    )
                )

        # 9. Synthetic proportion disclosure
        synth_count = origin_counter.get(AnnotationOrigin.SYNTHETIC.value, 0)
        if synth_count > 0:
            synth_ratio = round((synth_count / total_records) * 100, 1) if total_records > 0 else 0
            findings.append(
                ValidationFinding(
                    rule_id="INFO_SYNTHETIC_PROPORTION",
                    severity=ValidationSeverity.INFO,
                    title=f"Synthetic Content Disclosed ({synth_ratio}%)",
                    description=f"Dataset contains {synth_count} synthetically generated records ({synth_ratio}% of dataset). Ensure lineage is preserved.",
                    remediation="Verify synthetic candidate annotations in the workbench prior to publishing.",
                    affected_record_ids=[],
                    count=synth_count,
                )
            )


        blocking_count = sum(1 for f in findings if f.severity == ValidationSeverity.BLOCKING)
        warning_count = sum(1 for f in findings if f.severity == ValidationSeverity.WARNING)
        info_count = sum(1 for f in findings if f.severity == ValidationSeverity.INFO)

        is_publishable = (blocking_count == 0) and (total_records > 0)

        report = QualityReport(
            dataset_id=dataset.id,
            schema_version=dataset.schema_version,
            is_publishable=is_publishable,
            total_records=total_records,
            blocking_count=blocking_count,
            warning_count=warning_count,
            info_count=info_count,
            findings=findings,
            class_distribution=dict(class_counter),
            split_distribution=dict(split_counter),
            origin_distribution=dict(origin_counter),
        )

        # Persist validation run
        run_id = generate_id("run")
        run = ProcessingRunModel(
            id=run_id,
            dataset_id=dataset.id,
            run_type=RunType.VALIDATION.value,
            status=RunStatus.COMPLETED.value if is_publishable else RunStatus.FAILED.value,
            configuration_snapshot={"schema_version": dataset.schema_version},
            total_items=total_records,
            processed_items=total_records,
            failed_items=blocking_count,
            error_summary=f"{blocking_count} blocking issues, {warning_count} warnings" if blocking_count > 0 else None,
            cost_usage_metadata=report.model_dump(),
            started_at=datetime.now(UTC),
            finished_at=datetime.now(UTC),
        )
        session.add(run)
        session.flush()

        return report
