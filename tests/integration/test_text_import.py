"""Integration tests for the TEXT-MVP import pipeline (docs/TEXT_MVP.md A1-A9).

These tests drive ``IngestionService.ingest_bytes`` directly against an in-memory
SQLite database and throw-away local storage, so they are independent of the API
process and of any shared development database.

Criteria covered:
A1 CSV + column aliases          A2 JSONL/JSON-array          A3 plain .txt
A4 row-level rejection           A5 per-record atomicity        A6 splits
A7 imported annotations          A8 blank text                A9 dedupe
Plus: paired image+text ZIP bundles must store the .txt CONTENT in
``metadata["text"]`` (TEXT_MVP §0); A9 dedupe is split-aware (same-split repeats
are import noise, cross-split repeats are leakage and must stay representable so
C2's ``RULE_DUPLICATE_TEXT`` can warn about them).
"""
from __future__ import annotations

import io
import json
import uuid
import zipfile

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.base import Base
from packages.dataset_core.db.models import (
    AnnotationModel,
    AnnotationRevisionModel,
    AssetModel,
    DatasetModel,
    DatasetRecordModel,
    ProcessingRunModel,
    RunItemModel,
)
from packages.dataset_core.db.session import init_database
from packages.dataset_core.exceptions import DomainValidationError
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_core.services.dataset_service import DatasetService
from packages.dataset_core.services.project_service import ProjectService
from packages.dataset_io.ingestion_service import IngestionService
from packages.dataset_io.storage import LocalStorageBackend
from services.api.main import app

LABELS = ["billing", "technical_support", "feature_request", "general_inquiry"]


@pytest.fixture
def env(tmp_path):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    # Match the production session configuration (packages/dataset_core/db/session.py
    # uses autoflush=False) so savepoint interaction behaves as it does in the API.
    session = sessionmaker(bind=engine, autoflush=False)()
    storage = LocalStorageBackend(root_dir=str(tmp_path / "storage"))
    project = ProjectService.create_project(session, name="Text Import Lab")
    dataset_contract = DatasetService.create_dataset(
        session,
        project.id,
        "Support Tickets",
        "text_classification",
        label_schema={"classes": LABELS},
    )
    dataset = session.get(DatasetModel, dataset_contract.id)
    try:
        yield session, dataset, storage
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def ingest(session: Session, dataset: DatasetModel, storage: LocalStorageBackend, filename: str, data: bytes | str, split: str = "train"):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return IngestionService.ingest_bytes(
        session=session,
        dataset_id=dataset.id,
        filename=filename,
        data=data,
        split=split,
        storage=storage,
    )


def make_dataset(session: Session, project_id: str, task_type: str = "text_classification", label_schema: dict | None = None) -> DatasetModel:
    contract = DatasetService.create_dataset(
        session, project_id, "Secondary Dataset", task_type, label_schema=label_schema
    )
    return session.get(DatasetModel, contract.id)


def dataset_records(session: Session, dataset: DatasetModel) -> list[DatasetRecordModel]:
    return list(
        session.scalars(
            select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset.id)
        ).all()
    )


def records_by_text(session: Session, dataset: DatasetModel) -> dict[str, DatasetRecordModel]:
    return {
        record.extra_metadata["text"]: record
        for record in dataset_records(session, dataset)
    }


def annotations_for(session: Session, record: DatasetRecordModel) -> list[AnnotationModel]:
    return list(
        session.scalars(
            select(AnnotationModel).where(AnnotationModel.record_id == record.id)
        ).all()
    )


def assert_imported_annotation(session: Session, record: DatasetRecordModel, expected_label: str) -> None:
    annotations = annotations_for(session, record)
    assert len(annotations) == 1, f"expected exactly one imported annotation for {record.id}"
    annotation = annotations[0]
    assert annotation.origin == AnnotationOrigin.IMPORTED.value
    assert annotation.status == ReviewStatus.PENDING_REVIEW.value
    assert annotation.payload == {"label": expected_label}
    revision = session.scalar(
        select(AnnotationRevisionModel).where(
            AnnotationRevisionModel.annotation_id == annotation.id
        )
    )
    assert revision is not None
    assert revision.origin == AnnotationOrigin.IMPORTED.value
    assert revision.actor_id == "importer"


def create_png_bytes(color: str = "blue") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), color=color).save(buffer, format="PNG")
    return buffer.getvalue()


def build_paired_zip(
    text: str,
    *,
    image_name: str = "item_01.png",
    text_name: str = "item_01.txt",
) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(image_name, create_png_bytes())
        archive.writestr(text_name, text)
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# A1 - CSV with RFC 4180 quoting, canonical text/label aliases, kept columns
# ---------------------------------------------------------------------------


def test_a1_csv_quoted_fields_aliases_and_preserved_columns(env):
    session, dataset, storage = env
    csv_data = (
        "ticket_id,sentence,category,notes\n"
        '1,"Charged twice, please refund",billing,"first ticket"\n'
        '2,"App crashes on upload\nand the export is empty",technical_support,"second ticket"\n'
    )

    report = ingest(session, dataset, storage, "tickets.csv", csv_data)

    assert report.total_processed == 2
    assert report.accepted_count == 2
    assert report.duplicate_count == 0
    assert report.rejected_count == 0

    rows = dataset_records(session, dataset)
    assert len(rows) == 2
    by_ticket = {record.extra_metadata["ticket_id"]: record for record in rows}

    first = by_ticket["1"]
    assert first.extra_metadata["text"] == "Charged twice, please refund"
    assert first.extra_metadata["label"] == "billing"
    # Every original column is preserved under its original header name.
    assert first.extra_metadata["sentence"] == "Charged twice, please refund"
    assert first.extra_metadata["category"] == "billing"
    assert first.extra_metadata["notes"] == "first ticket"
    assert first.split == "train"
    assert first.extra_metadata["split"] == "train"

    second = by_ticket["2"]
    # Quoted embedded newline survives the round trip.
    assert second.extra_metadata["text"] == "App crashes on upload\nand the export is empty"
    assert second.extra_metadata["label"] == "technical_support"

    # Every accepted row carrying an in-schema label gets an imported annotation.
    assert_imported_annotation(session, first, "billing")
    assert_imported_annotation(session, second, "technical_support")


@pytest.mark.parametrize(
    ("text_column", "label_column", "text_value"),
    [
        ("text", "label", "Canonical columns"),
        ("sentence", "category", "Sentence alias"),
        ("content", "class", "Content alias"),
        ("prompt", "intent", "Prompt alias"),
        ("input", "target", "Input alias"),
        ("question", "sentiment", "Question alias"),
        ("document", "topic", "Document alias"),
    ],
)
def test_a1_text_and_label_alias_columns(env, text_column, label_column, text_value):
    session, dataset, storage = env
    csv_data = f"{text_column},{label_column}\n{text_value},billing\n"

    report = ingest(session, dataset, storage, "aliases.csv", csv_data)

    assert report.accepted_count == 1
    assert report.rejected_count == 0
    record = dataset_records(session, dataset)[0]
    assert record.extra_metadata["text"] == text_value
    assert record.extra_metadata["label"] == "billing"
    # Original alias column is preserved as well as the canonical key.
    assert record.extra_metadata[text_column] == text_value
    assert_imported_annotation(session, record, "billing")


def test_a1_case_insensitive_aliases(env):
    session, dataset, storage = env
    report = ingest(session, dataset, storage, "upper.csv", "Text,LABEL\nSome text,billing\n")

    assert report.accepted_count == 1
    record = dataset_records(session, dataset)[0]
    assert record.extra_metadata["text"] == "Some text"
    assert record.extra_metadata["label"] == "billing"
    assert record.extra_metadata["Text"] == "Some text"


# ---------------------------------------------------------------------------
# A2 - JSONL and JSON-array share the same normalization
# ---------------------------------------------------------------------------


def test_a2_jsonl_normalizes_and_preserves_unknown_keys(env):
    session, dataset, storage = env
    body = "\n".join(
        [
            json.dumps(
                {
                    "id": "j1",
                    "prompt": "How do I invite a teammate?",
                    "intent": "general_inquiry",
                    "meta": {"lang": "en"},
                }
            ),
            json.dumps(
                {
                    "id": "j2",
                    "text": "The export archive is empty",
                    "label": "technical_support",
                    "priority": 2,
                }
            ),
        ]
    )

    report = ingest(session, dataset, storage, "tickets.jsonl", body + "\n")

    assert report.accepted_count == 2
    assert report.rejected_count == 0
    by_external_key = {record.external_key: record for record in dataset_records(session, dataset)}

    first = by_external_key["j1"]
    assert first.extra_metadata["text"] == "How do I invite a teammate?"
    assert first.extra_metadata["label"] == "general_inquiry"
    assert first.extra_metadata["prompt"] == "How do I invite a teammate?"
    assert first.extra_metadata["meta"] == {"lang": "en"}
    assert_imported_annotation(session, first, "general_inquiry")

    second = by_external_key["j2"]
    assert second.extra_metadata["text"] == "The export archive is empty"
    assert second.extra_metadata["label"] == "technical_support"
    assert second.extra_metadata["priority"] == 2
    assert_imported_annotation(session, second, "technical_support")


def test_a2_json_array_normalizes_like_jsonl(env):
    session, dataset, storage = env
    payload = [
        {"id": "a1", "content": "Where is my refund?", "class": "billing"},
        {"id": "a2", "question": "Where is the documentation?", "target": "general_inquiry"},
    ]

    report = ingest(session, dataset, storage, "tickets.json", json.dumps(payload))

    assert report.accepted_count == 2
    assert report.rejected_count == 0
    by_external_key = {record.external_key: record for record in dataset_records(session, dataset)}
    assert by_external_key["a1"].extra_metadata["text"] == "Where is my refund?"
    assert by_external_key["a1"].extra_metadata["label"] == "billing"
    assert by_external_key["a2"].extra_metadata["text"] == "Where is the documentation?"
    assert by_external_key["a2"].extra_metadata["label"] == "general_inquiry"


def test_a2_jsonl_invalid_line_is_row_rejected_and_good_lines_import(env):
    session, dataset, storage = env
    body = "\n".join(
        [
            json.dumps({"text": "Good one", "label": "billing"}),
            '{"text": ',
            json.dumps({"text": "Good two", "label": "feature_request"}),
        ]
    )

    report = ingest(session, dataset, storage, "mixed.jsonl", body + "\n")

    assert report.accepted_count == 2
    assert report.rejected_count == 1
    rejected = report.rejected_items[0]
    assert rejected.row_number == 2
    assert "invalid json" in rejected.reason.lower()
    assert {record.extra_metadata["text"] for record in dataset_records(session, dataset)} == {
        "Good one",
        "Good two",
    }


# ---------------------------------------------------------------------------
# A3 - plain .txt: one record per non-empty line + text asset for lineage
# ---------------------------------------------------------------------------


def test_a3_txt_import_one_record_per_non_empty_line_with_asset(env):
    session, dataset, storage = env
    raw = b"First sample\n\n   Second sample   \n\nThird sample\n"

    report = ingest(session, dataset, storage, "corpus.txt", raw, split="val")

    assert report.total_processed == 3
    assert report.accepted_count == 3
    assert report.rejected_count == 0

    rows = sorted(dataset_records(session, dataset), key=lambda row: int(row.external_key.rsplit("_", 1)[1]))
    assert [row.extra_metadata["text"] for row in rows] == [
        "First sample",
        "Second sample",
        "Third sample",
    ]
    assert [row.extra_metadata["split"] for row in rows] == ["val", "val", "val"]
    assert [row.split for row in rows] == ["val", "val", "val"]

    # Each line is stored as an immutable text asset and linked to its record.
    assets = list(
        session.scalars(select(AssetModel).where(AssetModel.dataset_id == dataset.id)).all()
    )
    assert len(assets) == 3
    assert {asset.modality for asset in assets} == {"text"}
    assert {storage.read_bytes(asset.storage_key) for asset in assets} == {
        b"First sample",
        b"Second sample",
        b"Third sample",
    }
    for record in rows:
        linked_assets = [link.asset for link in record.record_assets]
        assert len(linked_assets) == 1
        assert linked_assets[0].modality == "text"
    for item in report.accepted_items:
        assert item.asset_id is not None
        assert item.modality == "text"


# ---------------------------------------------------------------------------
# Paired image+text ZIP bundles: canonical text contract + A9 dedupe
# ---------------------------------------------------------------------------


def test_paired_zip_import_stores_text_content_for_text_contract(env):
    session, dataset, storage = env
    paired_text = "Visible surface defect on the upper-left corner."
    report = ingest(
        session,
        dataset,
        storage,
        "bundle.zip",
        build_paired_zip(paired_text),
        split="val",
    )

    assert report.accepted_count == 1
    assert report.rejected_count == 0

    records = dataset_records(session, dataset)
    assert len(records) == 1
    record = records[0]
    metadata = record.extra_metadata

    # TEXT_MVP §0: metadata["text"] is the text CONTENT that workspace, AI
    # labeling, quality, clustering and exporters read — never the filename.
    assert metadata["text"] == paired_text
    assert metadata["text"].strip()
    assert metadata["text"] != "item_01.txt"
    # Lineage filenames are preserved under explicit non-canonical keys.
    assert metadata["paired"] is True
    assert metadata["paired_image_filename"] == "item_01.png"
    assert metadata["paired_text_filename"] == "item_01.txt"
    assert record.split == "val"
    assert {link.asset.modality for link in record.record_assets} == {"image", "text"}


def test_paired_zip_dedupe_is_split_aware(env):
    session, dataset, storage = env
    zip_bytes = build_paired_zip("Defect description for dedupe.")

    first = ingest(session, dataset, storage, "bundle.zip", zip_bytes)
    assert first.accepted_count == 1
    records_after_first = dataset_records(session, dataset)
    assert len(records_after_first) == 1
    assert len(list(session.scalars(select(AssetModel)).all())) == 2

    second = ingest(session, dataset, storage, "bundle.zip", zip_bytes)

    assert second.accepted_count == 0
    assert second.duplicate_count >= 1
    assert second.rejected_count == 0
    # Same-split re-import created neither a new record nor new assets.
    assert len(dataset_records(session, dataset)) == 1
    assert len(list(session.scalars(select(AssetModel)).all())) == 2
    assert second.duplicates[0].existing_record_id == records_after_first[0].id

    # Split-aware: the same normalized text in a DIFFERENT split is a leakage
    # signal, not import noise, so it must import (RULE_DUPLICATE_TEXT can warn).
    renamed_bundle = build_paired_zip(
        "  defect   DESCRIPTION for dedupe. ",
        image_name="item_02.png",
        text_name="item_02.txt",
    )
    cross_split = ingest(
        session, dataset, storage, "bundle_copy.zip", renamed_bundle, split="test"
    )

    assert cross_split.accepted_count == 1
    assert cross_split.duplicate_count == 0
    assert len(dataset_records(session, dataset)) == 2
    assert len(list(session.scalars(select(AssetModel)).all())) == 4

    # Re-importing into that same test split dedupes again.
    cross_split_again = ingest(
        session, dataset, storage, "bundle_copy.zip", renamed_bundle, split="test"
    )
    assert cross_split_again.accepted_count == 0
    assert cross_split_again.duplicate_count == 1
    assert len(dataset_records(session, dataset)) == 2
    assert len(list(session.scalars(select(AssetModel)).all())) == 4


def test_paired_zip_blank_text_keeps_image_record_without_bogus_text(env):
    session, dataset, storage = env
    report = ingest(
        session,
        dataset,
        storage,
        "blank_text_bundle.zip",
        build_paired_zip("   \n\t  "),
    )

    assert report.accepted_count == 1
    assert report.rejected_count == 0
    records = dataset_records(session, dataset)
    assert len(records) == 1
    metadata = records[0].extra_metadata
    # No bogus text is invented when the paired .txt body is blank.
    assert "text" not in metadata
    assert metadata["paired"] is True
    assert metadata["paired_text_filename"] == "item_01.txt"
    assert {link.asset.modality for link in records[0].record_assets} == {"image", "text"}


# ---------------------------------------------------------------------------
# A4 / A5 - malformed rows are rejected individually, atomically, with row numbers
# ---------------------------------------------------------------------------


def test_a4_row_level_rejection_keeps_good_rows_and_no_orphan(env):
    session, dataset, storage = env
    csv_data = (
        "text,label\n"
        '"Good one",billing\n'
        '"This row has a stray value",technical_support,oops\n'
        ",general_inquiry\n"
        '"Good two",feature_request\n'
    )

    report = ingest(session, dataset, storage, "reviews.csv", csv_data)

    assert report.total_processed == 4
    assert report.accepted_count == 2
    assert report.duplicate_count == 0
    assert report.rejected_count == 2

    # Only the good rows are committed: the failed rows leave no orphan records.
    rows = dataset_records(session, dataset)
    assert len(rows) == 2
    assert {record.extra_metadata["text"] for record in rows} == {"Good one", "Good two"}
    assert all(record.extra_metadata.get("text") for record in rows)

    rejected = {item.row_number: item for item in report.rejected_items}
    assert rejected[2].filename == "reviews.csv:row2"
    assert "stray column" in rejected[2].reason.lower()
    assert rejected[3].filename == "reviews.csv:row3"
    assert "text" in rejected[3].reason.lower()

    # ProcessingRun accounting matches what was persisted.
    run = session.get(ProcessingRunModel, report.run_id)
    assert run is not None
    assert run.status == "completed"
    assert run.total_items == 4
    assert run.processed_items == 2
    assert run.failed_items == 2

    # Every committed record has its own completed run item.
    for record in rows:
        item = session.scalar(
            select(RunItemModel).where(RunItemModel.record_id == record.id)
        )
        assert item is not None
        assert item.status == "completed"
    failed_items = list(
        session.scalars(
            select(RunItemModel).where(
                RunItemModel.processing_run_id == report.run_id,
                RunItemModel.status == "failed",
            )
        ).all()
    )
    assert len(failed_items) == 2


def test_a5_failure_after_record_flush_rolls_back_only_that_row(env, monkeypatch):
    session, dataset, storage = env
    original_create_annotation = AnnotationService.create_annotation

    def failing_create_annotation(*args, **kwargs):
        payload = kwargs.get("payload") or {}
        if payload.get("label") == "technical_support":
            raise DomainValidationError("simulated annotation failure", field="label")
        return original_create_annotation(*args, **kwargs)

    monkeypatch.setattr(AnnotationService, "create_annotation", failing_create_annotation)

    csv_data = (
        "text,label\n"
        '"Row one",billing\n'
        '"Row two",technical_support\n'
        '"Row three",feature_request\n'
    )

    report = ingest(session, dataset, storage, "atomic.csv", csv_data)

    # Only the failing row is rejected; the rest of the file still imports.
    assert report.accepted_count == 2
    assert report.rejected_count == 1
    assert "simulated annotation failure" in report.rejected_items[0].reason

    rows = dataset_records(session, dataset)
    assert {record.extra_metadata["text"] for record in rows} == {"Row one", "Row three"}
    # The flushed-then-failed row was rolled back by its savepoint.
    assert "Row two" not in {record.extra_metadata["text"] for record in rows}
    for record in rows:
        assert session.scalar(
            select(RunItemModel).where(RunItemModel.record_id == record.id)
        ) is not None


def test_a5_rejection_audit_items_survive_a_later_row_savepoint_rollback(env, monkeypatch):
    session, dataset, storage = env
    original_create_annotation = AnnotationService.create_annotation

    def failing_create_annotation(*args, **kwargs):
        payload = kwargs.get("payload") or {}
        if payload.get("label") == "technical_support":
            raise DomainValidationError("simulated savepoint rollback", field="label")
        return original_create_annotation(*args, **kwargs)

    monkeypatch.setattr(AnnotationService, "create_annotation", failing_create_annotation)

    # Row 1 is rejected at parse time (stray column), row 2 fails inside its
    # savepoint after the record was flushed, row 3 imports normally. Row 1's
    # audit item must survive row 2's savepoint rollback, and row 2 must leave no
    # committed record behind.
    csv_data = (
        "text,label\n"
        '"Too many,columns",billing,oops\n'
        '"Rollback row",technical_support\n'
        '"Survivor",feature_request\n'
    )

    report = ingest(session, dataset, storage, "audit_trail.csv", csv_data)

    assert report.accepted_count == 1
    assert report.rejected_count == 2
    run_items = list(
        session.scalars(
            select(RunItemModel).where(RunItemModel.processing_run_id == report.run_id)
        ).all()
    )
    failed = [item for item in run_items if item.status == "failed"]
    completed_for_records = [
        item for item in run_items if item.status == "completed" and item.record_id
    ]
    assert len(failed) == 2, "each rejected row keeps its audit-trail item"
    assert len(completed_for_records) == 1
    assert [record.extra_metadata["text"] for record in dataset_records(session, dataset)] == [
        "Survivor"
    ]


# ---------------------------------------------------------------------------
# A6 - optional split column; invalid split is a row rejection
# ---------------------------------------------------------------------------


def test_a6_split_column_maps_to_split_and_invalid_split_rejected(env):
    session, dataset, storage = env
    csv_data = (
        "text,label,split\n"
        '"One",billing,val\n'
        '"Two",technical_support,validation\n'
        '"Three",feature_request,training\n'
        '"Four",general_inquiry,holdout\n'
    )

    report = ingest(session, dataset, storage, "splits.csv", csv_data, split="train")

    assert report.accepted_count == 3
    assert report.rejected_count == 1
    by_text = records_by_text(session, dataset)
    assert by_text["One"].split == "val"
    assert by_text["One"].extra_metadata["split"] == "val"
    # Common split synonyms are normalized.
    assert by_text["Two"].split == "val"
    assert by_text["Three"].split == "train"
    assert "Four" not in by_text

    rejected = report.rejected_items[0]
    assert rejected.row_number == 4
    assert "invalid split" in rejected.reason.lower()
    assert "holdout" in rejected.reason


def test_a6_dataset_level_split_applies_without_split_column(env):
    session, dataset, storage = env
    report = ingest(
        session,
        dataset,
        storage,
        "plain.csv",
        'text,label\n"No split column",billing\n',
        split="test",
    )

    assert report.accepted_count == 1
    record = dataset_records(session, dataset)[0]
    assert record.split == "test"
    assert record.extra_metadata["split"] == "test"


def test_a6_invalid_dataset_level_split_is_rejected_up_front(env):
    session, dataset, storage = env
    with pytest.raises(DomainValidationError):
        ingest(session, dataset, storage, "plain.csv", "text,label\nhello,billing\n", split="holdout")
    assert dataset_records(session, dataset) == []


# ---------------------------------------------------------------------------
# A7 - in-schema labels become imported annotations; OOV labels are rejected
# ---------------------------------------------------------------------------


def test_a7_in_schema_label_creates_imported_annotation_and_oov_is_rejected(env):
    session, dataset, storage = env
    csv_data = (
        "text,label\n"
        '"Billing issue",billing\n'
        '"Spam offer",spam\n'
        '"Feature ask",feature_request\n'
    )

    report = ingest(session, dataset, storage, "labels.csv", csv_data)

    assert report.accepted_count == 2
    assert report.rejected_count == 1
    by_text = records_by_text(session, dataset)
    assert set(by_text) == {"Billing issue", "Feature ask"}
    assert_imported_annotation(session, by_text["Billing issue"], "billing")
    assert_imported_annotation(session, by_text["Feature ask"], "feature_request")

    rejected = report.rejected_items[0]
    assert rejected.row_number == 2
    assert "spam" in rejected.reason
    assert "label_schema" in rejected.reason
    # The out-of-vocabulary label was not silently stored as a metadata-only record.
    assert "Spam offer" not in by_text
    assert len(session.scalars(select(AnnotationModel)).all()) == 2


def test_a7_label_without_configured_schema_still_creates_imported_annotation(env):
    session, dataset, storage = env
    unlabeled_dataset = make_dataset(session, dataset.project_id)

    report = ingest(
        session,
        unlabeled_dataset,
        storage,
        "free.csv",
        'text,label\n"Anything goes",custom_label\n',
    )

    assert report.accepted_count == 1
    record = dataset_records(session, unlabeled_dataset)[0]
    assert_imported_annotation(session, record, "custom_label")


# ---------------------------------------------------------------------------
# A8 - blank / whitespace-only text is rejected
# ---------------------------------------------------------------------------


def test_a8_blank_and_whitespace_text_rows_rejected(env):
    session, dataset, storage = env
    csv_data = (
        "text,label\n"
        '"Real text",billing\n'
        ",technical_support\n"
        '"   ",feature_request\n'
    )

    report = ingest(session, dataset, storage, "blanks.csv", csv_data)

    assert report.accepted_count == 1
    assert report.rejected_count == 2
    rows = dataset_records(session, dataset)
    assert [record.extra_metadata["text"] for record in rows] == ["Real text"]
    assert {item.row_number for item in report.rejected_items} == {2, 3}
    assert all("text" in item.reason.lower() for item in report.rejected_items)


def test_a8_jsonl_missing_or_blank_text_rejected(env):
    session, dataset, storage = env
    body = "\n".join(
        [
            json.dumps({"label": "billing"}),
            json.dumps({"text": "   ", "label": "technical_support"}),
            json.dumps({"text": "Usable sample", "label": "feature_request"}),
        ]
    )

    report = ingest(session, dataset, storage, "blanks.jsonl", body + "\n")

    assert report.accepted_count == 1
    assert report.rejected_count == 2
    assert [record.extra_metadata["text"] for record in dataset_records(session, dataset)] == [
        "Usable sample"
    ]


# ---------------------------------------------------------------------------
# A9 - re-importing identical content into the SAME split does not duplicate records
# ---------------------------------------------------------------------------


def test_a9_reimport_does_not_duplicate_text_records(env):
    session, dataset, storage = env
    csv_data = (
        "text,label\n"
        '"Refund please",billing\n'
        '"App crash on upload",technical_support\n'
        '"Dark mode request",feature_request\n'
    )

    first = ingest(session, dataset, storage, "tickets.csv", csv_data)
    assert first.accepted_count == 3
    original_records = dataset_records(session, dataset)
    original_ids = {record.id for record in original_records}
    assert len(session.scalars(select(AnnotationModel)).all()) == 3

    second = ingest(session, dataset, storage, "tickets.csv", csv_data)

    assert second.accepted_count == 0
    assert second.duplicate_count == 3
    assert second.rejected_count == 0
    assert len(dataset_records(session, dataset)) == 3
    # No duplicate annotations either: the duplicate rows created no new records.
    assert len(session.scalars(select(AnnotationModel)).all()) == 3

    for duplicate in second.duplicates:
        assert duplicate.existing_record_id in original_ids
        assert len(duplicate.sha256) == 64
        assert "duplicate" in duplicate.message.lower()

    run = session.get(ProcessingRunModel, second.run_id)
    assert run is not None
    assert run.total_items == 3
    assert run.processed_items == 3
    assert run.failed_items == 0

    # Dedupe is content-hash based: case/whitespace-only drift is still a duplicate
    # when it lands in the same split.
    third = ingest(
        session,
        dataset,
        storage,
        "tickets_variant.csv",
        'text,label\n"  REFUND   PLEASE ",billing\n',
    )
    assert third.accepted_count == 0
    assert third.duplicate_count == 1
    assert len(dataset_records(session, dataset)) == 3

    # ...but the same content in a DIFFERENT split is a train/val/test leakage risk:
    # it must be imported so RULE_DUPLICATE_TEXT can warn about it.
    cross_split = ingest(session, dataset, storage, "tickets.csv", csv_data, split="test")
    assert cross_split.accepted_count == 3
    assert cross_split.duplicate_count == 0
    assert len(dataset_records(session, dataset)) == 6


def test_a9_txt_reimport_does_not_duplicate_lines_or_assets(env):
    session, dataset, storage = env
    raw = b"Alpha sample\nBeta sample\n"

    first = ingest(session, dataset, storage, "corpus.txt", raw)
    assert first.accepted_count == 2
    assets_after_first = session.scalars(select(AssetModel)).all()
    assert len(assets_after_first) == 2

    second = ingest(session, dataset, storage, "corpus.txt", raw)

    assert second.accepted_count == 0
    assert second.duplicate_count == 2
    assert len(dataset_records(session, dataset)) == 2
    assert len(session.scalars(select(AssetModel)).all()) == 2

    # Cross-split repeats import as separate records.
    cross_split = ingest(session, dataset, storage, "corpus.txt", raw, split="test")
    assert cross_split.accepted_count == 2
    assert cross_split.duplicate_count == 0
    assert len(dataset_records(session, dataset)) == 4


# ---------------------------------------------------------------------------
# C2 - cross-split duplicates are representable over HTTP, so the quality engine's
# RULE_DUPLICATE_TEXT warning can expose train/test contamination
# ---------------------------------------------------------------------------


def test_cross_split_duplicate_text_is_imported_and_flagged_by_quality():
    """Same text in train and test: both records import, then validation warns."""
    init_database()
    unique = uuid.uuid4().hex[:8]
    with TestClient(app) as client:
        project_resp = client.post(
            "/api/v1/projects", json={"name": f"split-aware-project-{unique}"}
        )
        assert project_resp.status_code == 201, project_resp.text
        project_id = project_resp.json()["id"]

        dataset_resp = client.post(
            f"/api/v1/projects/{project_id}/datasets",
            json={
                "name": f"split-aware-dataset-{unique}",
                "task_type": "text_classification",
                "label_schema": {"labels": ["sports", "tech"]},
            },
        )
        assert dataset_resp.status_code == 201, dataset_resp.text
        dataset_id = dataset_resp.json()["id"]

        csv_bytes = (
            b"text,label,split\n"
            b'"Shared leakage sentence",sports,train\n'
            b'"  SHARED   leakage sentence ",tech,test\n'
        )
        import_resp = client.post(
            f"/api/v1/datasets/{dataset_id}/import/file",
            files={"file": ("split_leakage.csv", csv_bytes, "text/csv")},
            data={"split": "train"},
        )
        assert import_resp.status_code == 200, import_resp.text
        report = import_resp.json()
        # Cross-split repeats are leakage (not import noise) and must be accepted.
        assert report["accepted_count"] == 2, report
        assert report["duplicate_count"] == 0, report
        accepted_ids = [item["record_id"] for item in report["accepted_items"]]
        assert len(accepted_ids) == 2

        validate_resp = client.post(f"/api/v1/datasets/{dataset_id}/validate")
        assert validate_resp.status_code == 200, validate_resp.text
        findings = {
            finding["rule_id"]: finding
            for finding in validate_resp.json()["findings"]
        }
        assert "RULE_DUPLICATE_TEXT" in findings, (
            f"expected RULE_DUPLICATE_TEXT for cross-split duplicate text; got {sorted(findings)}"
        )
        finding = findings["RULE_DUPLICATE_TEXT"]
        assert finding["severity"] != "blocking", finding
        affected = set(finding.get("affected_record_ids", []))
        assert set(accepted_ids).issubset(affected), (
            f"expected affected ids {sorted(accepted_ids)} in RULE_DUPLICATE_TEXT {sorted(affected)}"
        )


# ---------------------------------------------------------------------------
# Regression guard: non-text tasks are not forced to carry text
# ---------------------------------------------------------------------------


def test_non_text_dataset_rows_without_text_still_import(env):
    session, dataset, storage = env
    image_dataset = make_dataset(
        session, dataset.project_id, "image_classification", {"labels": ["dog", "cat"]}
    )

    report = ingest(
        session,
        image_dataset,
        storage,
        "labels.csv",
        "filename,label\ndog_1.jpg,dog\ncat_1.jpg,cat\n",
    )

    assert report.accepted_count == 2
    assert report.rejected_count == 0
    rows = dataset_records(session, image_dataset)
    assert [record.extra_metadata["label"] for record in rows] == ["dog", "cat"]
    assert all("text" not in record.extra_metadata for record in rows)
    # Labels still become imported proposals for classification tasks.
    for record in rows:
        assert_imported_annotation(session, record, record.extra_metadata["label"])
