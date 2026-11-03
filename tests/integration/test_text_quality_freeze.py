"""
TEXT-MVP C1/C2/C4 + D1/D2 regression tests.

Covered here:
- C1 ``RULE_EMPTY_TEXT`` blocks text-task records whose ``metadata["text"]`` is missing or blank
  (``text_classification`` and ``paired_image_text``).
- C2 ``RULE_DUPLICATE_TEXT`` warns on case/whitespace-normalized duplicate text, lists the
  affected record ids, and orders them deterministically.
- C3 existing rules keep working for text datasets (unresolved review, OOV label, class imbalance).
- C4 validation is deterministic for the same dataset state, and the quality engine audits the
  same annotation that the version freeze pins (both call
  ``packages.dataset_core.annotation_selector.select_active_annotation``).
- D1 the frozen manifest contains ``records[].metadata.text`` and the selector-chosen
  ``records[].annotation.payload.label``.
- D2 publication stays blocked while a record is unreviewed.

These are direct service-level tests (ORM + QualityEngine + VersioningService) so they do not
depend on routes/auth work landing concurrently. Every test uses unique dataset/project ids,
so it can share a database file with the existing suite.
"""
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from packages.dataset_core.annotation_selector import select_active_annotation
from packages.dataset_core.constants import (
    AnnotationOrigin,
    AssetModality,
    ReviewStatus,
    TaskType,
)
from packages.dataset_core.db.models import (
    AnnotationModel,
    AssetModel,
    DatasetModel,
    DatasetRecordModel,
    DatasetVersionModel,
    ProjectModel,
    RecordAssetModel,
)
from packages.dataset_core.db.session import get_db_session, init_database
from packages.dataset_core.exceptions import PublishingBlockedError
from packages.dataset_io.storage import get_storage_backend
from packages.dataset_quality.engine import QualityEngine
from packages.dataset_quality.models import ValidationSeverity
from packages.dataset_versioning.service import VersioningService

TEXT_TASK = TaskType.TEXT_CLASSIFICATION.value
NOW = datetime(2026, 1, 1, tzinfo=UTC)


class _FakeStorage:
    """Storage double: every key exists, so asset presence never masks a text failure."""

    def exists(self, key: str) -> bool:
        return True


def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _make_dataset(
    session,
    *,
    task_type: str = TEXT_TASK,
    classes: tuple[str, ...] = ("cat", "dog"),
) -> DatasetModel:
    project = ProjectModel(id=_uid("proj_tqf"), name="TQF Project")
    session.add(project)
    session.flush()
    dataset = DatasetModel(
        id=_uid("ds_tqf"),
        project_id=project.id,
        name="TQF Dataset",
        task_type=task_type,
        schema_version=1,
        label_schema={"classes": list(classes)},
    )
    session.add(dataset)
    session.flush()
    return dataset


def _make_record(
    session,
    dataset: DatasetModel,
    *,
    metadata: dict | None = None,
    text: str | None = None,
    split: str = "train",
) -> DatasetRecordModel:
    meta = dict(metadata or {})
    if text is not None:
        meta["text"] = text
    record = DatasetRecordModel(
        id=_uid("rec_tqf"),
        dataset_id=dataset.id,
        split=split,
        schema_version=1,
        extra_metadata=meta,
    )
    session.add(record)
    session.flush()
    return record


def _make_annotation(
    session,
    dataset: DatasetModel,
    record: DatasetRecordModel,
    *,
    label: str,
    status: str,
    created_at: datetime,
    origin: str = AnnotationOrigin.HUMAN.value,
) -> AnnotationModel:
    annotation = AnnotationModel(
        id=_uid("ann_tqf"),
        record_id=record.id,
        dataset_id=dataset.id,
        task_type=dataset.task_type,
        schema_version=1,
        payload={"label": label},
        origin=origin,
        status=status,
        created_at=created_at,
    )
    session.add(annotation)
    session.flush()
    return annotation


def _add_resolved_record(
    session,
    dataset: DatasetModel,
    *,
    text: str,
    label: str = "cat",
    created_at: datetime = NOW,
) -> DatasetRecordModel:
    record = _make_record(session, dataset, text=text)
    _make_annotation(
        session,
        dataset,
        record,
        label=label,
        status=ReviewStatus.APPROVED.value,
        created_at=created_at,
    )
    return record


def _rule_ids(report) -> list[str]:
    return [finding.rule_id for finding in report.findings]


def _finding(report, rule_id: str):
    return next(finding for finding in report.findings if finding.rule_id == rule_id)


def _report_fingerprint(report) -> str:
    return json.dumps(report.model_dump(), sort_keys=True)


def _frozen_manifest(version: DatasetVersionModel) -> dict:
    storage = get_storage_backend()
    return json.loads(storage.read_bytes(version.manifest_storage_key).decode("utf-8"))


@pytest.fixture(autouse=True)
def _database():
    init_database()
    yield


class TestTextQualityRules:
    def test_empty_text_blocks_text_classification(self):
        """C1: missing or blank metadata['text'] is a BLOCKING finding for text tasks."""
        with get_db_session() as session:
            dataset = _make_dataset(session)
            missing = _make_record(session, dataset, metadata={"source": "csv"})
            _make_annotation(
                session,
                dataset,
                missing,
                label="cat",
                status=ReviewStatus.APPROVED.value,
                created_at=NOW,
            )
            blank = _make_record(session, dataset, text="   \n  ")
            _make_annotation(
                session,
                dataset,
                blank,
                label="dog",
                status=ReviewStatus.APPROVED.value,
                created_at=NOW,
            )

            report = QualityEngine.validate_dataset(session, dataset.id)
            missing_id, blank_id = missing.id, blank.id

        assert report.is_publishable is False
        finding = _finding(report, "RULE_EMPTY_TEXT")
        assert finding.severity == ValidationSeverity.BLOCKING
        assert finding.count == 2
        assert set(finding.affected_record_ids) == {missing_id, blank_id}
        # The rule fires on its own; the records are otherwise reviewed/resolved.
        assert "RULE_UNRESOLVED_REVIEWS" not in _rule_ids(report)

    def test_empty_text_blocks_paired_image_text(self):
        """C1: paired_image_text is a text task under the canonical contract."""
        with get_db_session() as session:
            dataset = _make_dataset(session, task_type=TaskType.PAIRED_IMAGE_TEXT.value)
            record = _make_record(session, dataset, metadata={})
            _make_annotation(
                session,
                dataset,
                record,
                label="cat",
                status=ReviewStatus.APPROVED.value,
                created_at=NOW,
            )
            report = QualityEngine.validate_dataset(session, dataset.id)
            record_id = record.id

        assert report.is_publishable is False
        finding = _finding(report, "RULE_EMPTY_TEXT")
        assert finding.severity == ValidationSeverity.BLOCKING
        assert finding.affected_record_ids == [record_id]

    def test_text_asset_only_does_not_satisfy_canonical_contract(self):
        """Strict C1: text present only as an asset is still invisible -> BLOCKING."""
        with get_db_session() as session:
            dataset = _make_dataset(session)
            record = _make_record(session, dataset, metadata={"source": "legacy-upload"})
            asset = AssetModel(
                id=_uid("asset_tqf"),
                dataset_id=dataset.id,
                # unique per run: assets.storage_key is UNIQUE, so a fixed key makes the test
                # fail on the second execution against the same database.
                storage_key=f"assets/tqf/{_uid('legacy_only')}.txt",
                modality=AssetModality.TEXT.value,
                mime_type="text/plain",
                byte_size=28,
                sha256="a" * 64,
            )
            session.add(asset)
            session.flush()
            session.add(
                RecordAssetModel(
                    record_id=record.id,
                    asset_id=asset.id,
                    role="paired_text",
                    position=0,
                )
            )
            session.flush()
            _make_annotation(
                session,
                dataset,
                record,
                label="cat",
                status=ReviewStatus.APPROVED.value,
                created_at=NOW,
            )
            # Asset "exists" in storage, so MISSING_ASSETS cannot mask the result.
            report = QualityEngine.validate_dataset(
                session, dataset.id, storage=_FakeStorage()
            )
            record_id = record.id

        assert report.is_publishable is False
        finding = _finding(report, "RULE_EMPTY_TEXT")
        assert finding.severity == ValidationSeverity.BLOCKING
        assert finding.affected_record_ids == [record_id]

    def test_duplicate_text_warns_with_sorted_ids(self):
        """C2: normalized duplicates warn (non-blocking) with deterministic id ordering."""
        with get_db_session() as session:
            dataset = _make_dataset(session)
            first = _add_resolved_record(
                session, dataset, text="Hello   World", label="cat"
            )
            second = _add_resolved_record(
                session, dataset, text="hello world\n", label="dog", created_at=NOW + timedelta(seconds=1)
            )
            unique = _add_resolved_record(
                session, dataset, text="A completely different sample.", label="cat", created_at=NOW + timedelta(seconds=2)
            )

            report_one = QualityEngine.validate_dataset(session, dataset.id)
            report_two = QualityEngine.validate_dataset(session, dataset.id)
            first_id, second_id, unique_id = first.id, second.id, unique.id

        assert report_one.is_publishable is True  # warnings never block publication
        duplicate = _finding(report_one, "RULE_DUPLICATE_TEXT")
        assert duplicate.severity == ValidationSeverity.WARNING
        assert duplicate.count == 2
        assert duplicate.affected_record_ids == sorted([first_id, second_id])
        assert unique_id not in duplicate.affected_record_ids
        # Determinism: identical dataset state => identical report (ids/order included).
        assert _report_fingerprint(report_one) == _report_fingerprint(report_two)

    def test_existing_text_rules_still_fire(self):
        """C3: unresolved-review and OOV-label rules are unchanged for text datasets."""
        with get_db_session() as session:
            dataset = _make_dataset(session, classes=("cat", "dog"))
            out_of_vocab = _add_resolved_record(
                session, dataset, text="A mouse crept in.", label="mouse", created_at=NOW
            )
            pending = _make_record(session, dataset, text="Still under review.")
            _make_annotation(
                session,
                dataset,
                pending,
                label="cat",
                status=ReviewStatus.PENDING_REVIEW.value,
                created_at=NOW + timedelta(seconds=1),
            )
            resolved = _add_resolved_record(
                session, dataset, text="A clear cat sample.", label="cat", created_at=NOW + timedelta(seconds=2)
            )

            report = QualityEngine.validate_dataset(session, dataset.id)
            out_of_vocab_id, pending_id, resolved_id = (
                out_of_vocab.id,
                pending.id,
                resolved.id,
            )

        assert report.is_publishable is False
        schema = _finding(report, "RULE_SCHEMA_MISMATCH")
        assert out_of_vocab_id in schema.affected_record_ids
        unresolved = _finding(report, "RULE_UNRESOLVED_REVIEWS")
        assert unresolved.affected_record_ids == [pending_id]
        assert resolved_id not in unresolved.affected_record_ids
        # class_distribution counts every selector-chosen annotation (pending included).
        assert report.class_distribution.get("cat") == 2
        assert report.class_distribution.get("mouse") == 1

    def test_class_imbalance_still_warns(self):
        """C3: class-imbalance warning still computed from the selector-chosen labels."""
        with get_db_session() as session:
            dataset = _make_dataset(session, classes=("cat", "dog"))
            for index in range(5):
                _add_resolved_record(
                    session,
                    dataset,
                    text=f"Unambiguous cat sample number {index}.",
                    label="cat",
                    created_at=NOW + timedelta(seconds=index),
                )
            _add_resolved_record(
                session,
                dataset,
                text="The single dog sample.",
                label="dog",
                created_at=NOW + timedelta(seconds=10),
            )

            report = QualityEngine.validate_dataset(session, dataset.id)

        imbalance = _finding(report, "RULE_CLASS_IMBALANCE")
        assert imbalance.severity == ValidationSeverity.WARNING
        assert imbalance.count == 5
        assert "83.3%" in imbalance.title


class TestCanonicalAnnotationSelection:
    def test_engine_and_freeze_agree_on_approved_annotation(self):
        """C4/D1: with older-approved + newer-pending, both engine and freeze choose approved."""
        with get_db_session() as session:
            dataset = _make_dataset(session)
            record = _make_record(session, dataset, text="The reviewed sample text.")
            approved = _make_annotation(
                session,
                dataset,
                record,
                label="cat",
                status=ReviewStatus.APPROVED.value,
                created_at=NOW,
            )
            pending = _make_annotation(
                session,
                dataset,
                record,
                label="dog",
                status=ReviewStatus.PENDING_REVIEW.value,
                created_at=NOW + timedelta(seconds=1),
                origin=AnnotationOrigin.MODEL.value,
            )

            loaded = session.get(DatasetRecordModel, record.id)
            assert select_active_annotation(loaded.annotations).id == approved.id

            report = QualityEngine.validate_dataset(session, dataset.id)
            version = VersioningService.create_version(
                session=session,
                dataset_id=dataset.id,
                version_tag="v1.0.0",
                storage=get_storage_backend(),
            )
            manifest = _frozen_manifest(version)
            record_id, approved_id, pending_id = (
                record.id,
                approved.id,
                pending.id,
            )

        assert report.is_publishable is True
        assert "RULE_UNRESOLVED_REVIEWS" not in _rule_ids(report)
        assert report.class_distribution == {"cat": 1}
        frozen = next(
            item for item in manifest["records"] if item["record_id"] == record_id
        )
        assert frozen["metadata"]["text"] == "The reviewed sample text."
        assert frozen["annotation"]["annotation_id"] == approved_id
        assert frozen["annotation"]["status"] == ReviewStatus.APPROVED.value
        assert frozen["annotation"]["payload"]["label"] == "cat"
        assert frozen["annotation"]["annotation_id"] != pending_id

    def test_freeze_uses_selector_not_first_annotation(self):
        """D1: reverse case (older pending, newer approved) proves freeze is not annotations[0]."""
        with get_db_session() as session:
            dataset = _make_dataset(session)
            record = _make_record(session, dataset, text="Another reviewed sample.")
            pending_first = _make_annotation(
                session,
                dataset,
                record,
                label="cat",
                status=ReviewStatus.PENDING_REVIEW.value,
                created_at=NOW,
                origin=AnnotationOrigin.MODEL.value,
            )
            approved_later = _make_annotation(
                session,
                dataset,
                record,
                label="dog",
                status=ReviewStatus.APPROVED.value,
                created_at=NOW + timedelta(seconds=1),
            )
            assert session.get(DatasetRecordModel, record.id).annotations[0].id == pending_first.id

            report = QualityEngine.validate_dataset(session, dataset.id)
            version = VersioningService.create_version(
                session=session,
                dataset_id=dataset.id,
                version_tag="v1.0.0",
                storage=get_storage_backend(),
            )
            manifest = _frozen_manifest(version)
            record_id, approved_later_id = record.id, approved_later.id

        assert report.is_publishable is True
        assert report.class_distribution == {"dog": 1}
        frozen = next(
            item for item in manifest["records"] if item["record_id"] == record_id
        )
        assert frozen["annotation"]["annotation_id"] == approved_later_id
        assert frozen["annotation"]["payload"]["label"] == "dog"

    def test_publication_blocked_while_unreviewed(self):
        """D2: an unresolved active annotation still blocks publication."""
        with get_db_session() as session:
            dataset = _make_dataset(session)
            _add_resolved_record(
                session, dataset, text="This record is reviewed.", label="cat"
            )
            unreviewed = _make_record(session, dataset, text="This one is not.")
            _make_annotation(
                session,
                dataset,
                unreviewed,
                label="dog",
                status=ReviewStatus.PENDING_REVIEW.value,
                created_at=NOW + timedelta(seconds=1),
            )

            report = QualityEngine.validate_dataset(session, dataset.id)
            assert report.is_publishable is False
            assert "RULE_UNRESOLVED_REVIEWS" in _rule_ids(report)

            with pytest.raises(PublishingBlockedError) as exc_info:
                VersioningService.create_version(
                    session=session,
                    dataset_id=dataset.id,
                    storage=get_storage_backend(),
                )

            versions = session.scalars(
                select(DatasetVersionModel).where(
                    DatasetVersionModel.dataset_id == dataset.id
                )
            ).all()

        assert exc_info.value.details["blocking_count"] >= 1
        assert exc_info.value.code == "PUBLISHING_BLOCKED"
        assert versions == []
