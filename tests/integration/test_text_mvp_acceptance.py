"""Independent black-box acceptance suite for docs/TEXT_MVP.md.

Owner: verifier (task-15). This file is the executable acceptance contract for the
text vertical slice. It drives the REAL HTTP API through
``fastapi.testclient.TestClient`` over ``services.api.main:app`` only — no direct
ORM access is used to make assertions. The only non-HTTP imports are the app
object itself, ``init_database`` (to create tables for an isolated DB) and Pillow
(to synthesise a tiny PNG fixture).

Each test maps to a criterion of docs/TEXT_MVP.md §1:

    A1..A9  TestAImport
    B1..B5  TestBLabeling
    C1..C4  TestCQuality
    D1..D3  TestDFreeze
    E1..E4  TestEExport
    F1..F5  TestFEvaluation
    G1      TestGQueueAndFlow (G2/G3 are frontend-only and out of scope for a
            backend black-box verifier)

Run in isolation (never the full suite):

    $env:DATABASE_URL="sqlite:///./data/t_acc.db"
    $env:LOCAL_STORAGE_DIR="./data/t_acc_storage"
    .venv\\Scripts\\python.exe -B -m pytest tests/integration/test_text_mvp_acceptance.py -q

Delete ./data/t_acc.db and ./data/t_acc_storage/ before a clean run.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import uuid
import zipfile

import pytest
from fastapi.testclient import TestClient

from packages.dataset_core.db.session import init_database
from services.api.config import settings
from services.api.main import app

client = TestClient(app)

# Label vocabularies deliberately chosen so that fabricated placeholder labels
# ("positive" etc.) can be detected as fabrications in exports (TEXT_MVP E2).
LABELS = ["sports", "tech", "finance"]
BIN_LABELS = ["positive", "negative"]

FABRICATION_STRINGS = [
    "Classify this sample.",
    "Sample instruction",
    "Target answer",
    "Approved label.",
    "Provide analysis for the input.",
    "Describe this image.",
]


# ---------------------------------------------------------------------------
# Fixtures / module setup
# ---------------------------------------------------------------------------
def setup_module(module) -> None:
    """Create tables for the isolated DATABASE_URL and the storage root."""
    init_database()
    os.makedirs(settings.LOCAL_STORAGE_DIR, exist_ok=True)


def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _err(resp) -> str:
    return f"HTTP {resp.status_code}: {resp.text[:800]}"


def _body_text(resp) -> str:
    try:
        return json.dumps(resp.json())
    except Exception:  # noqa: BLE001 - diagnostic helper only
        return resp.text


def _create_project() -> str:
    resp = client.post("/api/v1/projects", json={"name": _uid("acceptance-project")})
    assert resp.status_code == 201, _err(resp)
    return resp.json()["id"]


def _create_text_dataset(project_id: str, labels: list[str] | None = None) -> str:
    body = {
        "name": _uid("acceptance-text-ds"),
        "task_type": "text_classification",
        "label_schema": {"labels": list(labels or LABELS)},
    }
    resp = client.post(f"/api/v1/projects/{project_id}/datasets", json=body)
    assert resp.status_code == 201, _err(resp)
    return resp.json()["id"]


def _fresh_dataset(labels: list[str] | None = None) -> tuple[str, str]:
    project_id = _create_project()
    return project_id, _create_text_dataset(project_id, labels)


def _import_file(
    dataset_id: str,
    filename: str,
    data: bytes,
    *,
    split: str = "train",
    content_type: str | None = None,
):
    files = {"file": (filename, data, content_type or "application/octet-stream")}
    return client.post(
        f"/api/v1/datasets/{dataset_id}/import/file",
        files=files,
        data={"split": split},
    )


def _csv_bytes(rows: list[dict], header: list[str]) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=header, quoting=csv.QUOTE_MINIMAL)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in header})
    return buffer.getvalue().encode("utf-8")


def _jsonl_bytes(items: list[dict]) -> bytes:
    return ("\n".join(json.dumps(item) for item in items) + "\n").encode("utf-8")


def _tiny_png() -> bytes:
    from PIL import Image

    image = Image.new("RGB", (8, 8), color="blue")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _record(record_id: str) -> dict:
    resp = client.get(f"/api/v1/records/{record_id}")
    assert resp.status_code == 200, _err(resp)
    return resp.json()


def _queue(dataset_id: str, **params) -> dict:
    resp = client.get(f"/api/v1/datasets/{dataset_id}/queue", params=params)
    assert resp.status_code == 200, _err(resp)
    return resp.json()


def _validate(dataset_id: str) -> dict:
    resp = client.post(f"/api/v1/datasets/{dataset_id}/validate")
    assert resp.status_code == 200, _err(resp)
    return resp.json()


def _rule_map(report: dict) -> dict[str, dict]:
    return {finding["rule_id"]: finding for finding in report.get("findings", [])}


def _accepted_ids(report: dict) -> list[str]:
    return [item["record_id"] for item in report.get("accepted_items", [])]


def _text_of(record_id: str) -> str | None:
    return _record(record_id)["metadata"].get("text")


def _annotation_id(record_id: str) -> str:
    detail = _record(record_id)
    annotation = detail.get("annotation")
    assert annotation, f"expected an annotation on record {record_id}: {detail}"
    return annotation["id"]


def _transition(annotation_id: str, next_status: str, reason: str = "verifier") -> dict:
    resp = client.post(
        f"/api/v1/annotations/{annotation_id}/transition",
        json={"next_status": next_status, "reason": reason},
    )
    assert resp.status_code == 200, _err(resp)
    return resp.json()


def _create_human_annotation(record_id: str, label: str) -> dict:
    resp = client.post(
        f"/api/v1/records/{record_id}/annotations",
        json={"payload": {"label": label}},
    )
    assert resp.status_code == 201, _err(resp)
    return resp.json()


def _approve_imported(record_id: str) -> None:
    """Approve the record's current (imported) annotation via the transition endpoint."""
    _transition(_annotation_id(record_id), "approved")


def _approve_all(record_ids: list[str]) -> None:
    for record_id in record_ids:
        _approve_imported(record_id)


def _freeze(dataset_id: str, tag: str = "v1.0.0"):
    return client.post(
        f"/api/v1/datasets/{dataset_id}/versions", json={"version_tag": tag}
    )


def _manifest(version_id: str) -> dict:
    resp = client.get(f"/api/v1/versions/{version_id}/manifest")
    assert resp.status_code == 200, _err(resp)
    return resp.json()


def _export(version_id: str, fmt: str) -> dict:
    resp = client.post(
        f"/api/v1/versions/{version_id}/exports", json={"format": fmt}
    )
    assert resp.status_code == 200, _err(resp)
    return resp.json()


def _download_zip(artifact_id: str) -> zipfile.ZipFile:
    resp = client.get(f"/api/v1/exports/{artifact_id}/download")
    assert resp.status_code == 200, _err(resp)
    return zipfile.ZipFile(io.BytesIO(resp.content))


def _zip_texts(archive: zipfile.ZipFile) -> dict[str, str]:
    """Decode every text-like member of an export ZIP (skip binary media)."""
    texts: dict[str, str] = {}
    for name in archive.namelist():
        lowered = name.lower()
        if lowered.endswith((".jsonl", ".csv", ".json", ".md", ".yaml", ".yml", ".py", ".txt", ".vtt")):
            texts[name] = archive.read(name).decode("utf-8", errors="replace")
    return texts


def _data_blob(texts: dict[str, str]) -> str:
    """Concatenate only the training-data members of an export (not docs/configs)."""
    parts = []
    for name, content in texts.items():
        lowered = name.lower()
        if not lowered.endswith((".jsonl", ".csv", ".json")):
            continue
        if "manifest" in lowered or "dataset_info" in lowered:
            continue
        parts.append(content)
    return "\n".join(parts)


def _assert_no_fabrication(blob: str, where: str) -> None:
    for fabricated in FABRICATION_STRINGS:
        assert fabricated not in blob, (
            f"{where} contains fabricated placeholder text {fabricated!r}"
        )


def _bulk_review(dataset_id: str, record_ids: list[str], action: str = "approve", reason: str | None = None):
    body: dict = {"record_ids": record_ids, "action": action}
    if reason:
        body["reason"] = reason
    return client.post(f"/api/v1/datasets/{dataset_id}/review/bulk", json=body)


def _evaluation_run(dataset_id: str, split: str = "test"):
    return client.post(
        f"/api/v1/datasets/{dataset_id}/evaluation/run", json={"split": split}
    )


def _runs(dataset_id: str):
    return client.get(f"/api/v1/datasets/{dataset_id}/evaluation/runs")


def _queue_active_annotation(item: dict) -> tuple[str | None, dict | None, str | None]:
    """Read the selector-chosen annotation out of a queue item.

    The contract pins the semantics (metadata.text + the selector-chosen
    annotation) but not the exact JSON key names, so accept the documented
    shapes the implementation may expose.
    """
    annotation = item.get("annotation") or item.get("active_annotation")
    if isinstance(annotation, dict):
        return annotation.get("id"), annotation.get("payload"), annotation.get("status")
    annotation_id = item.get("annotation_id")
    if annotation_id:
        return annotation_id, item.get("annotation_payload"), item.get("review_status")
    return None, None, item.get("review_status")


def _make_frozen_text_dataset(rows: list[dict], labels: list[str] | None = None) -> dict:
    """Create -> import CSV(text,label,split) -> approve all -> freeze.

    Returns dataset_id, version_id, and text -> label mapping.
    """
    _project_id, dataset_id = _fresh_dataset(labels)
    payload = _csv_bytes(rows, ["text", "label", "split"])
    resp = _import_file(dataset_id, "train.csv", payload)
    assert resp.status_code == 200, _err(resp)
    report = resp.json()
    assert report["accepted_count"] == len(rows), report
    assert report["rejected_count"] == 0, report
    for record_id in _accepted_ids(report):
        _approve_imported(record_id)
    version_resp = _freeze(dataset_id)
    assert version_resp.status_code == 200, _err(version_resp)
    version = version_resp.json()
    return {
        "dataset_id": dataset_id,
        "version_id": version["id"],
        "records": {row["text"]: row["label"] for row in rows},
    }


# ===========================================================================
# A. Import
# ===========================================================================
class TestAImport:
    def test_a1_csv_quoted_fields_and_column_aliases(self):
        """A1: RFC 4180 quoted CSV -> one record/row, text+label via column aliases."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [
            {"text": 'Great match, final score was 3-2', "label": "sports", "note": 'has, "commas"'},
            {"text": "New chip announced today", "label": "tech", "note": "second row"},
        ]
        resp = _import_file(
            dataset_id, "quoted.csv", _csv_bytes(rows, ["text", "label", "note"])
        )
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        assert report["accepted_count"] == 2, report
        assert report["rejected_count"] == 0, report
        assert _text_of(_accepted_ids(report)[0]) in {rows[0]["text"], rows[1]["text"]}
        assert {_text_of(rid) for rid in _accepted_ids(report)} == {
            rows[0]["text"],
            rows[1]["text"],
        }
        for record_id in _accepted_ids(report):
            metadata = _record(record_id)["metadata"]
            assert metadata.get("label") in {"sports", "tech"}, metadata

        # Alias columns (sentence/category) must normalize to text/label too.
        alias_rows = [{"sentence": "Alias column sentence about markets", "category": "finance"}]
        alias_resp = _import_file(
            dataset_id, "aliases.csv", _csv_bytes(alias_rows, ["sentence", "category"])
        )
        assert alias_resp.status_code == 200, _err(alias_resp)
        alias_report = alias_resp.json()
        assert alias_report["accepted_count"] == 1, alias_report
        metadata = _record(_accepted_ids(alias_report)[0])["metadata"]
        assert metadata.get("text") == alias_rows[0]["sentence"], metadata
        assert metadata.get("label") == alias_rows[0]["category"], metadata

    def test_a2_jsonl_and_json_array_normalization_preserves_unknown_keys(self):
        """A2: JSONL and JSON-array -> same normalization; unknown keys preserved."""
        _project_id, dataset_id = _fresh_dataset()
        items = [
            {"text": "Jsonl alpha sample about the league", "label": "sports", "extra_key": "keep-me"},
            {"text": "Jsonl beta sample about compilers", "label": "tech", "extra_key": "keep-me-too"},
        ]
        resp = _import_file(
            dataset_id,
            "samples.jsonl",
            _jsonl_bytes(items),
            content_type="application/x-ndjson",
        )
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        assert report["accepted_count"] == 2, report
        assert {_text_of(rid) for rid in _accepted_ids(report)} == {
            items[0]["text"],
            items[1]["text"],
        }
        for record_id in _accepted_ids(report):
            metadata = _record(record_id)["metadata"]
            assert metadata.get("extra_key", "").startswith("keep-me"), metadata

        array_items = [{"text": "Json array gamma sample about rates", "label": "finance"}]
        array_resp = _import_file(
            dataset_id,
            "array.json",
            json.dumps(array_items).encode("utf-8"),
            content_type="application/json",
        )
        assert array_resp.status_code == 200, _err(array_resp)
        array_report = array_resp.json()
        assert array_report["accepted_count"] == 1, array_report
        metadata = _record(_accepted_ids(array_report)[0])["metadata"]
        assert metadata.get("text") == array_items[0]["text"], metadata
        assert metadata.get("label") == "finance", metadata

    def test_a3_txt_one_record_per_nonempty_line_with_text_asset(self):
        """A3: .txt -> one record per non-empty line, content in metadata.text + text asset."""
        _project_id, dataset_id = _fresh_dataset()
        expected = ["First line of the text corpus", "Second line of the text corpus", "Third line"]
        content = f"{expected[0]}\n\n{expected[1]}\n   \n{expected[2]}\n"
        resp = _import_file(
            dataset_id, "corpus.txt", content.encode("utf-8"), content_type="text/plain"
        )
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        assert report["accepted_count"] == 3, report
        assert report["rejected_count"] == 0, report
        assert {_text_of(rid) for rid in _accepted_ids(report)} == set(expected)
        for record_id in _accepted_ids(report):
            detail = _record(record_id)
            assert any(
                asset.get("modality") == "text" for asset in detail.get("assets", [])
            ), f"expected a text asset for lineage on {record_id}: {detail.get('assets')}"

    def test_a4_malformed_row_rejected_with_row_number_and_no_orphan(self):
        """A4: malformed row rejected row-level with row number; no orphan record."""
        _project_id, dataset_id = _fresh_dataset()
        csv_text = (
            "text,label\n"
            '"valid row one",sports\n'
            '"stray extra column",tech,UNEXPECTED-EXTRA\n'
            ",tech\n"
            '"valid row two",finance\n'
        )
        resp = _import_file(dataset_id, "mixed.csv", csv_text.encode("utf-8"))
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        assert report["accepted_count"] == 2, report
        assert report["rejected_count"] >= 2, report
        assert report["rejected_items"], report
        rejection_blob = " ".join(
            f"{item.get('filename', '')} {item.get('reason', '')}"
            for item in report["rejected_items"]
        )
        assert re.search(r"(?i)(row|line)\D{0,3}\d+", rejection_blob), (
            "row-level rejection must include a row number: "
            f"{rejection_blob!r}"
        )
        queue = _queue(dataset_id)
        assert queue["total"] == 2, queue
        assert sorted(item["metadata"].get("text") for item in queue["items"]) == [
            "valid row one",
            "valid row two",
        ]

    def test_a5_partial_failure_leaves_no_unaccounted_records(self):
        """A5: mid-file failures never commit a record that the run item accounting misses."""
        _project_id, dataset_id = _fresh_dataset()
        csv_text = (
            "text,label\n"
            '"atomic good one",sports\n'
            '"atomic bad split",tech,HOLDOUT\n'
            '"atomic good two",finance\n'
            ",tech\n"
            '"atomic good three",sports\n'
        )
        resp = _import_file(dataset_id, "atomic.csv", csv_text.encode("utf-8"))
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        accepted = _accepted_ids(report)
        assert len(accepted) == report["accepted_count"], report
        assert report["accepted_count"] == 3, report
        assert report["rejected_count"] == 2, report
        queue = _queue(dataset_id)
        assert queue["total"] == report["accepted_count"], (
            "records exist that the import report did not account for: "
            f"queue={queue['total']} accepted={report['accepted_count']}"
        )
        assert {item["id"] for item in queue["items"]} == set(accepted)

    def test_a6_split_column_respected_and_invalid_split_rejected(self):
        """A6: optional split column assigns train/val/test; invalid split rejected."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [
            {"text": "Split row train sample", "label": "sports", "split": "train"},
            {"text": "Split row val sample", "label": "tech", "split": "val"},
            {"text": "Split row test sample", "label": "finance", "split": "test"},
            {"text": "Split row invalid sample", "label": "sports", "split": "holdout"},
        ]
        resp = _import_file(
            dataset_id, "splits.csv", _csv_bytes(rows, ["text", "label", "split"])
        )
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        assert report["accepted_count"] == 3, report
        assert report["rejected_count"] == 1, report
        for split in ("train", "val", "test"):
            queue = _queue(dataset_id, split=split)
            assert queue["total"] == 1, (split, queue)
            assert queue["items"][0]["metadata"].get("split") == split
        assert _queue(dataset_id, split="holdout")["total"] == 0

        # No split column -> dataset-level split applies.
        _p2, dataset2 = _fresh_dataset()
        no_split = [{"text": "Dataset level split text", "label": "tech"}]
        resp2 = _import_file(
            dataset2,
            "nosplit.csv",
            _csv_bytes(no_split, ["text", "label"]),
            split="val",
        )
        assert resp2.status_code == 200, _err(resp2)
        records = _queue(dataset2, split="val")["items"]
        assert len(records) == 1, records
        assert records[0]["metadata"].get("split") == "val", records[0]

    def test_a7_labeled_import_creates_imported_pending_annotation_and_rejects_oov(self):
        """A7: in-schema label -> imported/pending_review annotation; OOV -> row rejection."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [
            {"text": "Cricket final highlights reel", "label": "sports"},
            {"text": "Weather report for tomorrow", "label": "weather"},
        ]
        resp = _import_file(
            dataset_id, "labeled.csv", _csv_bytes(rows, ["text", "label"])
        )
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        assert report["accepted_count"] == 1, report
        assert report["rejected_count"] == 1, report
        record_id = _accepted_ids(report)[0]
        annotation = _record(record_id)["annotation"]
        assert annotation is not None, "labeled import must create an annotation"
        assert annotation["origin"] == "imported", annotation
        assert annotation["status"] == "pending_review", annotation
        assert annotation["payload"].get("label") == "sports", annotation
        # OOV label must be a row rejection, not a silent metadata write.
        assert _queue(dataset_id)["total"] == 1, "OOV row was imported as a record"

    def test_a8_blank_text_rows_are_rejected(self):
        """A8: empty/whitespace text rows are rejected row-level."""
        _project_id, dataset_id = _fresh_dataset()
        csv_text = "text,label\n\"   \",sports\n,tech\n\"A genuinely valid sentence\",finance\n"
        resp = _import_file(dataset_id, "blanks.csv", csv_text.encode("utf-8"))
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        assert report["accepted_count"] == 1, report
        assert report["rejected_count"] == 2, report
        queue = _queue(dataset_id)
        assert queue["total"] == 1, queue
        assert (queue["items"][0]["metadata"].get("text") or "").strip()

    def test_a9_reimport_same_content_is_deduped(self):
        """A9: re-importing the same file content does not duplicate text records."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [
            {"text": "Dedupe sample one about markets", "label": "finance"},
            {"text": "Dedupe sample two about football", "label": "sports"},
        ]
        payload = _csv_bytes(rows, ["text", "label"])
        first = _import_file(dataset_id, "dedupe.csv", payload)
        assert first.status_code == 200, _err(first)
        assert first.json()["accepted_count"] == 2, first.json()
        second = _import_file(dataset_id, "dedupe.csv", payload)
        assert second.status_code == 200, _err(second)
        report = second.json()
        assert report["accepted_count"] == 0, report
        assert report["duplicate_count"] == 2, report
        assert report["rejected_count"] == 0, report
        assert _queue(dataset_id)["total"] == 2, _queue(dataset_id)


# ===========================================================================
# B. Labeling
# ===========================================================================
class TestBLabeling:
    def test_b1_manual_label_is_human_pending_then_transition_approves_with_review_event(self):
        """B1: manual POST -> origin=human/status=pending_review; transition approves + ReviewEvent."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [{"text": "Manual labeling target sentence", "label": "sports"}]
        resp = _import_file(dataset_id, "label.csv", _csv_bytes(rows, ["text", "label"]))
        assert resp.status_code == 200, _err(resp)
        record_id = _accepted_ids(resp.json())[0]

        created = _create_human_annotation(record_id, "tech")
        assert created["origin"] == "human", f"server-derived origin wrong: {created}"
        assert created["status"] == "pending_review", f"server-derived status wrong: {created}"
        assert created["payload"].get("label") == "tech", created

        approved = _transition(created["id"], "approved", "reviewed by verifier")
        assert approved["status"] == "approved", approved

        detail = _record(record_id)
        transitions = [event.get("to_status") for event in detail.get("review_events", [])]
        assert "approved" in transitions, (
            "approval must write an auditable ReviewEvent, got: "
            f"{detail.get('review_events')}"
        )

    def test_b2_forged_origin_status_actor_cannot_produce_approved_label(self):
        """B2: forging origin/status/actor over HTTP is impossible (regression C1)."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [{"text": "Forgery attempt target sentence", "label": "sports"}]
        resp = _import_file(dataset_id, "forge.csv", _csv_bytes(rows, ["text", "label"]))
        assert resp.status_code == 200, _err(resp)
        record_id = _accepted_ids(resp.json())[0]

        forged = client.post(
            f"/api/v1/records/{record_id}/annotations",
            json={
                "payload": {"label": "tech"},
                "origin": "human",
                "status": "approved",
                "actor_id": "attacker",
            },
            headers={"X-User-Id": "default_user"},
        )
        assert forged.status_code in (201, 422), _err(forged)
        if forged.status_code == 201:
            body = forged.json()
            assert body["status"] != "approved", (
                f"forged approved annotation accepted: {body}"
            )
            assert body["status"] == "pending_review", body
            # actor_id must be derived from the authenticated principal, not the body.
            revisions = _record(record_id).get("revisions") or []
            assert revisions, "expected a revision for the created annotation"
            assert revisions[0]["actor_id"] == "default_user", (
                "actor_id must derive from the request identity, not the body: "
                f"{revisions[0]}"
            )

        detail = _record(record_id)
        active = detail.get("annotation")
        assert not (active and active["status"] == "approved"), (
            f"an approved annotation exists after a forgery attempt: {active}"
        )
        assert _queue(dataset_id, review_status="approved")["total"] == 0
        blocked = _freeze(dataset_id)
        assert blocked.status_code == 422, _err(blocked)

    def test_b3_ai_annotation_reads_metadata_text_and_never_approves(self):
        """B3: ai-annotate reads metadata.text, writes model/pending_review proposals."""
        _project_id, dataset_id = _fresh_dataset(BIN_LABELS)
        rows = [
            {"text": "The documentation is excellent and the UI is great.", "label": "positive"},
            {"text": "The screen is defective and the battery is terrible.", "label": "negative"},
        ]
        resp = _import_file(
            dataset_id, "ai.csv", _csv_bytes(rows, ["text", "label"])
        )
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        assert report["accepted_count"] == 2, report
        record_by_text = {_text_of(rid): rid for rid in _accepted_ids(report)}

        run_resp = client.post(
            f"/api/v1/datasets/{dataset_id}/ai-annotate",
            json={
                "provider": "fake",
                "model": "fake-classifier-v1",
                "only_unannotated": False,
                "limit": 10,
            },
        )
        assert run_resp.status_code == 202, _err(run_resp)
        run = run_resp.json()
        assert run.get("processed_items", 0) >= 2, run
        assert run.get("failed_items", 0) == 0, run

        expected = {
            "The documentation is excellent and the UI is great.": "positive",
            "The screen is defective and the battery is terrible.": "negative",
        }
        for text, rid in record_by_text.items():
            annotation = _record(rid)["annotation"]
            assert annotation is not None, f"no model proposal for {text!r}"
            assert annotation["origin"] == "model", annotation
            assert annotation["status"] == "pending_review", (
                f"AI proposal must never be auto-approved: {annotation}"
            )
            # Key proof the gateway read metadata.text: the deterministic fake
            # provider's keyword heuristic can only fire on the real text.
            assert annotation["payload"].get("label") == expected[text], (
                f"model did not read metadata['text'] for {text!r}: {annotation}"
            )

        run_detail = client.get(f"/api/v1/runs/{run['id']}")
        assert run_detail.status_code == 200, _err(run_detail)
        assert len(run_detail.json().get("items", [])) == 2, run_detail.json()
        assert _queue(dataset_id, review_status="approved")["total"] == 0

    def test_b4_bulk_review_updates_n_records_in_one_audited_call(self):
        """B4: POST /datasets/{id}/review/bulk approves N records with one audited call."""
        project_id, dataset_id = _fresh_dataset()
        rows = [
            {"text": "Bulk review sample alpha", "label": "sports"},
            {"text": "Bulk review sample beta", "label": "tech"},
            {"text": "Bulk review sample gamma", "label": "finance"},
        ]
        resp = _import_file(dataset_id, "bulk.csv", _csv_bytes(rows, ["text", "label"]))
        assert resp.status_code == 200, _err(resp)
        record_ids = _accepted_ids(resp.json())
        assert len(record_ids) == 3, resp.json()

        audit_before = client.get(
            f"/api/v1/projects/{project_id}/audit-logs", params={"limit": 500}
        )
        assert audit_before.status_code == 200, _err(audit_before)

        bulk = _bulk_review(dataset_id, record_ids, action="approve", reason="bulk approval")
        assert bulk.status_code == 200, _err(bulk)
        body = bulk.json()
        updated = body.get("updated", body.get("updated_count"))
        assert updated == 3, f"bulk review must update all 3 records: {body}"
        assert _queue(dataset_id, review_status="approved")["total"] == 3

        audit_after = client.get(
            f"/api/v1/projects/{project_id}/audit-logs", params={"limit": 500}
        )
        assert audit_after.status_code == 200, _err(audit_after)
        assert len(audit_after.json()) > len(audit_before.json()), (
            "bulk review must write an audit event"
        )

        invalid = _bulk_review(dataset_id, record_ids, action="explode")
        assert invalid.status_code in (400, 422), (
            f"invalid bulk action must be rejected: {_err(invalid)}"
        )

    def test_b5_multiple_annotations_active_one_follows_shared_selector(self):
        """B5: imported + human annotations coexist; active annotation follows selector."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [{"text": "Selector multiple annotation sample", "label": "sports"}]
        resp = _import_file(dataset_id, "selector.csv", _csv_bytes(rows, ["text", "label"]))
        assert resp.status_code == 200, _err(resp)
        record_id = _accepted_ids(resp.json())[0]
        imported_id = _annotation_id(record_id)
        _transition(imported_id, "approved", "imported label accepted")

        newer = _create_human_annotation(record_id, "tech")
        assert newer["status"] == "pending_review", newer

        detail = _record(record_id)
        active = detail["annotation"]
        assert active["id"] == imported_id, (
            "the shared selector must keep the approved annotation active over a newer "
            f"pending one: active={active} imported={imported_id} newer={newer['id']}"
        )
        assert active["status"] == "approved", active
        queue_item = _queue(dataset_id)["items"][0]
        queue_ann_id, queue_payload, queue_status = _queue_active_annotation(queue_item)
        assert queue_ann_id == imported_id, (
            f"queue annotation {queue_ann_id} disagrees with selector {imported_id}"
        )
        assert queue_payload and queue_payload.get("label") == "sports", queue_payload
        assert queue_status == "approved", queue_status


# ===========================================================================
# C. Quality
# ===========================================================================
class TestCQuality:
    def test_c1_rule_empty_text_blocks_publication(self):
        """C1: a text-task record without metadata.text is BLOCKING (RULE_EMPTY_TEXT)."""
        _project_id, dataset_id = _fresh_dataset()
        png = _tiny_png()
        resp = _import_file(dataset_id, "no_text.png", png, content_type="image/png")
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        assert report["accepted_count"] == 1, (
            "expected the non-text asset to import as a record so the empty-text rule "
            f"is reachable: {report}"
        )
        record_id = _accepted_ids(report)[0]
        assert not (_record(record_id)["metadata"].get("text") or "").strip()

        quality = _validate(dataset_id)
        rules = _rule_map(quality)
        assert "RULE_EMPTY_TEXT" in rules, (
            f"RULE_EMPTY_TEXT missing; got {sorted(rules)}"
        )
        finding = rules["RULE_EMPTY_TEXT"]
        assert finding["severity"] == "blocking", finding
        assert record_id in finding.get("affected_record_ids", []), finding
        assert quality["is_publishable"] is False, quality
        assert quality["blocking_count"] >= 1, quality
        assert _freeze(dataset_id).status_code == 422

    def test_c2_rule_duplicate_text_warns(self):
        """C2: normalized duplicate text across splits is a WARNING.

        Import dedupe is split-aware: the same content imported into the SAME split
        is a duplicate (covered by A9), but the same content in a DIFFERENT split is
        accepted and recorded so cross-split duplicates (train/test leakage) are
        representable and RULE_DUPLICATE_TEXT can warn about them.
        """
        _project_id, dataset_id = _fresh_dataset()
        duplicate_text = "Cross split duplicate text sample about the league"
        rows = [
            {"text": duplicate_text, "label": "sports", "split": "train"},
            {"text": duplicate_text, "label": "tech", "split": "test"},
        ]
        resp = _import_file(
            dataset_id,
            "cross_split.csv",
            _csv_bytes(rows, ["text", "label", "split"]),
        )
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        assert report["accepted_count"] == 2, (
            "split-aware dedupe must accept the same text in different splits: "
            f"{report}"
        )
        assert report["duplicate_count"] == 0, (
            "cross-split duplicates must not be counted as import duplicates: "
            f"{report}"
        )
        assert report["rejected_count"] == 0, report
        record_ids = _accepted_ids(report)
        assert len(record_ids) == 2 and len(set(record_ids)) == 2, report
        assert _queue(dataset_id)["total"] == 2, _queue(dataset_id)

        quality = _validate(dataset_id)
        rules = _rule_map(quality)
        assert "RULE_DUPLICATE_TEXT" in rules, (
            "RULE_DUPLICATE_TEXT missing for the same normalized text in train+test; "
            f"got {sorted(rules)}"
        )
        finding = rules["RULE_DUPLICATE_TEXT"]
        assert finding["severity"] == "warning", (
            f"duplicate text must be a warning per contract C2: {finding}"
        )
        affected = set(finding.get("affected_record_ids") or [])
        assert set(record_ids) <= affected, (
            "both cross-split duplicate records must be listed as affected: "
            f"affected={sorted(affected)} record_ids={sorted(record_ids)}"
        )

    def test_c3_existing_text_rules_still_work(self):
        """C3: unresolved reviews + class imbalance still fire for text datasets."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [{"text": f"Class imbalance sports sample number {i}", "label": "sports"} for i in range(5)]
        rows.append({"text": "Class imbalance tech sample number 0", "label": "tech"})
        resp = _import_file(
            dataset_id, "imbalance.csv", _csv_bytes(rows, ["text", "label"])
        )
        assert resp.status_code == 200, _err(resp)
        record_ids = _accepted_ids(resp.json())
        assert len(record_ids) == 6, resp.json()
        _approve_all(record_ids)

        report = _validate(dataset_id)
        rules = _rule_map(report)
        assert "RULE_CLASS_IMBALANCE" in rules, (
            f"RULE_CLASS_IMBALANCE missing; got {sorted(rules)}"
        )
        assert "RULE_UNRESOLVED_REVIEWS" not in rules, (
            "all records are approved; unresolved-review rule must not fire"
        )
        assert report["is_publishable"] is True, report

        pending = _import_file(
            dataset_id,
            "pending.csv",
            _csv_bytes([{"text": "Unresolved review sample", "label": "finance"}], ["text", "label"]),
        )
        assert pending.status_code == 200, _err(pending)
        report2 = _validate(dataset_id)
        rules2 = _rule_map(report2)
        assert "RULE_UNRESOLVED_REVIEWS" in rules2, (
            f"RULE_UNRESOLVED_REVIEWS missing; got {sorted(rules2)}"
        )
        assert rules2["RULE_UNRESOLVED_REVIEWS"]["severity"] == "blocking"
        assert report2["is_publishable"] is False, report2

    def test_c4_validation_is_deterministic(self):
        """C4: same dataset state -> identical validation report."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [
            {"text": "Determinism sample alpha", "label": "sports"},
            {"text": "Determinism sample beta", "label": "tech"},
        ]
        resp = _import_file(dataset_id, "determinism.csv", _csv_bytes(rows, ["text", "label"]))
        assert resp.status_code == 200, _err(resp)
        _approve_all(_accepted_ids(resp.json()))
        first = _validate(dataset_id)
        second = _validate(dataset_id)
        assert first == second, "validation is not deterministic across identical calls"
        assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)

    def test_c4b_validate_and_freeze_use_the_same_active_annotation(self):
        """C4: engine audits the same annotation the freeze will pin (shared selector)."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [{"text": "Selector consistency across validate and freeze", "label": "sports"}]
        resp = _import_file(dataset_id, "c4b.csv", _csv_bytes(rows, ["text", "label"]))
        assert resp.status_code == 200, _err(resp)
        record_id = _accepted_ids(resp.json())[0]
        imported_id = _annotation_id(record_id)
        _transition(imported_id, "approved", "approved imported label")
        rejected = _create_human_annotation(record_id, "tech")
        _transition(rejected["id"], "rejected", "reject conflicting label")

        report = _validate(dataset_id)
        rules = _rule_map(report)
        assert "RULE_UNRESOLVED_REVIEWS" not in rules, (
            "the selector-chosen annotation is approved; unresolved-review rule must not "
            f"fire: {rules.get('RULE_UNRESOLVED_REVIEWS')}"
        )
        assert "RULE_SCHEMA_MISMATCH" not in rules, rules.get("RULE_SCHEMA_MISMATCH")

        version_resp = _freeze(dataset_id)
        assert version_resp.status_code == 200, _err(version_resp)
        manifest = _manifest(version_resp.json()["id"])
        assert manifest["records"], manifest
        record_entry = manifest["records"][0]
        assert record_entry["annotation"]["payload"]["label"] == "sports", (
            "freeze pinned a different annotation than the one validation audited: "
            f"{record_entry['annotation']}"
        )
        assert record_entry["annotation"]["status"] == "approved", record_entry["annotation"]


# ===========================================================================
# D. Freeze
# ===========================================================================
class TestDFreeze:
    def test_d1_manifest_contains_metadata_text_and_selector_label(self):
        """D1: manifest records carry metadata.text and annotation.payload.label."""
        rows = [
            {"text": "Manifest text sample one", "label": "sports", "split": "train"},
            {"text": "Manifest text sample two", "label": "tech", "split": "train"},
            {"text": "Manifest text sample three", "label": "finance", "split": "test"},
        ]
        context = _make_frozen_text_dataset(rows)
        manifest = _manifest(context["version_id"])
        assert manifest["task_type"] == "text_classification", manifest.get("task_type")
        assert manifest["record_count"] == 3, manifest
        by_text = {
            record.get("metadata", {}).get("text"): record for record in manifest["records"]
        }
        for text, label in context["records"].items():
            assert text in by_text, (
                f"manifest is missing metadata.text {text!r}; "
                f"records={[r.get('metadata') for r in manifest['records']]}"
            )
            record_entry = by_text[text]
            assert record_entry["annotation"] is not None, record_entry
            assert record_entry["annotation"]["payload"].get("label") == label, (
                f"manifest annotation label mismatch for {text!r}: {record_entry['annotation']}"
            )

    def test_d2_publication_blocked_while_unreviewed_then_succeeds(self):
        """D2: freeze blocked while any record is unreviewed; succeeds once approved."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [
            {"text": "Freeze gate sample one", "label": "sports"},
            {"text": "Freeze gate sample two", "label": "tech"},
        ]
        resp = _import_file(dataset_id, "gate.csv", _csv_bytes(rows, ["text", "label"]))
        assert resp.status_code == 200, _err(resp)
        record_ids = _accepted_ids(resp.json())

        blocked = _freeze(dataset_id)
        assert blocked.status_code == 422, _err(blocked)
        assert "review" in _body_text(blocked).lower(), (
            f"blocking reason should mention unresolved reviews: {_body_text(blocked)}"
        )

        _approve_all(record_ids)
        allowed = _freeze(dataset_id)
        assert allowed.status_code == 200, _err(allowed)
        assert allowed.json()["record_count"] == 2, allowed.json()

    def test_d3_published_version_is_immutable_and_manifest_reproducible(self):
        """D3: no API path mutates a published version; manifest bytes are stable."""
        rows = [
            {"text": "Immutable sample one", "label": "sports", "split": "train"},
            {"text": "Immutable sample two", "label": "tech", "split": "train"},
        ]
        context = _make_frozen_text_dataset(rows)
        version_id = context["version_id"]

        manifest_first = _manifest(version_id)
        manifest_second = _manifest(version_id)
        assert manifest_first == manifest_second, "manifest is not reproducible across reads"

        version_detail = client.get(f"/api/v1/versions/{version_id}")
        assert version_detail.status_code == 200, _err(version_detail)
        hash_before = version_detail.json()["manifest_hash"]

        # Mutate the mutable workspace: add a new record after publication.
        extra = _import_file(
            context["dataset_id"],
            "post_publish.csv",
            _csv_bytes([{"text": "Post publish workspace edit", "label": "finance"}], ["text", "label"]),
        )
        assert extra.status_code == 200, _err(extra)

        manifest_after = _manifest(version_id)
        assert manifest_after == manifest_first, (
            "a published version manifest changed after a workspace edit"
        )
        assert manifest_after["record_count"] == 2, manifest_after
        version_detail_after = client.get(f"/api/v1/versions/{version_id}")
        assert version_detail_after.json()["manifest_hash"] == hash_before, (
            "published version hash changed after a workspace edit"
        )


# ===========================================================================
# E. Export
# ===========================================================================
class TestEExport:
    def test_e1_jsonl_and_csv_export_real_text_and_label(self):
        """E1: jsonl + csv contain the real text and decided label; no placeholders."""
        rows = [
            {"text": "Quarterly revenue exceeded expectations.", "label": "finance", "split": "train"},
            {"text": "The team shipped the feature on schedule.", "label": "tech", "split": "train"},
            {"text": "Markets rallied after the announcement.", "label": "finance", "split": "test"},
        ]
        context = _make_frozen_text_dataset(rows)
        for fmt, data_name in (("jsonl", "data.jsonl"), ("csv", "data.csv")):
            artifact = _export(context["version_id"], fmt)
            assert artifact["record_count"] == 3, artifact
            archive = _download_zip(artifact["id"])
            texts = _zip_texts(archive)
            assert data_name in texts, (
                f"{fmt} export is missing {data_name}; members={list(texts)}"
            )
            blob = texts[data_name]
            for text, label in context["records"].items():
                assert text in blob, f"{fmt} export is missing real text {text!r}"
                assert label in blob, f"{fmt} export is missing label {label!r}"
            for fabricated in FABRICATION_STRINGS:
                assert fabricated not in blob, (
                    f"{fmt} export contains fabricated placeholder {fabricated!r}"
                )

    def test_e2_framework_presets_use_real_text_and_no_fabrication(self):
        """E2: preset exports use real metadata.text and never fabricated placeholders."""
        rows = [
            {"text": "The compiler reduced build times by half.", "label": "tech", "split": "train"},
            {"text": "The striker scored in the final minute.", "label": "sports", "split": "train"},
            {"text": "Interest rates held steady this quarter.", "label": "finance", "split": "test"},
        ]
        context = _make_frozen_text_dataset(rows)
        for fmt in ("unsloth_sharegpt_vlm", "axolotl_alpaca_chatml", "llama_factory_bundle"):
            artifact = _export(context["version_id"], fmt)
            archive = _download_zip(artifact["id"])
            texts = _zip_texts(archive)
            blob = "\n".join(texts.values())
            data_blob = _data_blob(texts)
            for text in context["records"]:
                assert text in blob, (
                    f"{fmt} export is missing the real record text {text!r}; "
                    f"members={list(texts)}"
                )
            _assert_no_fabrication(blob, f"{fmt} export")
            # The dataset has no "positive" class: any such label in the exported
            # training data is a leftover fabricated placeholder.
            assert "positive" not in data_blob.lower(), (
                f"{fmt} export contains fabricated label 'positive' in the data files"
            )

    def test_e3_empty_val_split_never_aliases_train(self):
        """E3: empty val split yields an empty file; val never receives train rows."""
        # Case 1: train-only dataset -> val file must be genuinely empty.
        train_only_rows = [
            {"text": "Split aware train sample one", "label": "sports", "split": "train"},
            {"text": "Split aware train sample two", "label": "tech", "split": "train"},
        ]
        context = _make_frozen_text_dataset(train_only_rows)
        artifact = _export(context["version_id"], "unsloth_sharegpt_vlm")
        texts = _zip_texts(_download_zip(artifact["id"]))
        train_members = [n for n in texts if "train" in n.lower() and n.lower().endswith(".jsonl")]
        val_members = [n for n in texts if "val" in n.lower() and n.lower().endswith(".jsonl")]
        assert train_members, f"no train split file in export; members={list(texts)}"
        train_blob = "\n".join(texts[name] for name in train_members)
        assert train_blob.strip(), "train split file is empty"
        for row in train_only_rows:
            assert row["text"] in train_blob, f"train.jsonl missing {row['text']!r}"
        assert val_members, (
            "E3 requires a val split file in the export; export members="
            f"{list(texts)}"
        )
        for name in val_members:
            assert texts[name].strip() == "", (
                f"{name} must be empty for a train-only dataset (never a train copy), "
                f"got: {texts[name][:300]!r}"
            )

        # Case 2: explicit val split -> val file has its own records, never train rows.
        ordered_rows = [
            {"text": "Split aware second train sample", "label": "sports", "split": "train"},
            {"text": "Split aware second val sample", "label": "tech", "split": "val"},
            {"text": "Split aware second train too", "label": "finance", "split": "train"},
        ]
        context2 = _make_frozen_text_dataset(ordered_rows)
        artifact2 = _export(context2["version_id"], "unsloth_sharegpt_vlm")
        texts2 = _zip_texts(_download_zip(artifact2["id"]))
        train_members2 = [n for n in texts2 if "train" in n.lower() and n.lower().endswith(".jsonl")]
        val_members2 = [n for n in texts2 if "val" in n.lower() and n.lower().endswith(".jsonl")]
        assert train_members2 and val_members2, list(texts2)
        train_blob2 = "\n".join(texts2[name] for name in train_members2)
        val_blob2 = "\n".join(texts2[name] for name in val_members2)
        assert "Split aware second val sample" in val_blob2, (
            f"val.jsonl missing the val-split record: {val_blob2[:300]!r}"
        )
        for train_row in (ordered_rows[0], ordered_rows[2]):
            assert train_row["text"] in train_blob2, (
                f"train.jsonl missing {train_row['text']!r}"
            )
            assert train_row["text"] not in val_blob2, (
                "val.jsonl must never contain train-split records: "
                f"{train_row['text']!r}"
            )

    def test_e4_export_is_byte_deterministic(self):
        """E4: same version + format exported twice -> identical SHA-256."""
        rows = [
            {"text": "Deterministic export sample one", "label": "sports", "split": "train"},
            {"text": "Deterministic export sample two", "label": "tech", "split": "train"},
        ]
        context = _make_frozen_text_dataset(rows)
        for fmt in ("jsonl", "csv"):
            first = _export(context["version_id"], fmt)
            second = _export(context["version_id"], fmt)
            assert first["sha256"] == second["sha256"], (
                f"{fmt} export is not byte-deterministic: "
                f"{first['sha256']} != {second['sha256']}"
            )
            assert first["byte_size"] == second["byte_size"]


# ===========================================================================
# F. Accuracy
# ===========================================================================
def _build_gold_and_model_dataset(
    records: list[dict],
) -> tuple[str, str]:
    """Create a test-split dataset with approved HUMAN gold and model proposals.

    ``records`` is a list of {"text": ..., "gold": ..., "csv_label": ...}.
    Returns (dataset_id, ai_annotate_run_id).
    """
    _project_id, dataset_id = _fresh_dataset(BIN_LABELS)
    rows = [{"text": item["text"], "label": item["csv_label"]} for item in records]
    resp = _import_file(
        dataset_id,
        "accuracy.csv",
        _csv_bytes(rows, ["text", "label"]),
        split="test",
    )
    assert resp.status_code == 200, _err(resp)
    report = resp.json()
    assert report["accepted_count"] == len(records), report
    text_to_record = {_text_of(rid): rid for rid in _accepted_ids(report)}
    for item in records:
        record_id = text_to_record[item["text"]]
        human = _create_human_annotation(record_id, item["gold"])
        _transition(human["id"], "approved", "human gold label")

    run_resp = client.post(
        f"/api/v1/datasets/{dataset_id}/ai-annotate",
        json={
            "provider": "fake",
            "model": "fake-classifier-v1",
            "only_unannotated": False,
            "limit": 50,
        },
    )
    assert run_resp.status_code == 202, _err(run_resp)
    return dataset_id, run_resp.json()["id"]


class TestFEvaluation:
    def test_f2_evaluation_without_comparable_pairs_returns_422(self):
        """F2: no gold-vs-model comparable pairs -> HTTP 422 with a clear reason."""
        _project_id, dataset_id = _fresh_dataset(BIN_LABELS)
        rows = [
            {"text": "The documentation is excellent and the UI is great.", "label": "positive"},
            {"text": "The screen is defective and the battery is terrible.", "label": "negative"},
        ]
        resp = _import_file(
            dataset_id, "nopairs.csv", _csv_bytes(rows, ["text", "label"]), split="test"
        )
        assert resp.status_code == 200, _err(resp)
        report = resp.json()
        for record_id in _accepted_ids(report):
            human = _create_human_annotation(record_id, "positive")
            _transition(human["id"], "approved", "human gold label")

        evaluation = _evaluation_run(dataset_id, split="test")
        assert evaluation.status_code == 422, (
            "evaluation with no comparable model proposals must be 422, got "
            f"{_err(evaluation)}"
        )
        reason = _body_text(evaluation).lower()
        assert any(word in reason for word in ("compar", "model", "proposal", "review")), (
            f"422 must explain the missing comparable pairs: {_body_text(evaluation)}"
        )

    def test_f1_f3_f5_accuracy_is_hand_computed_gold_vs_model(self):
        """F1/F3/F5: accuracy compares approved human gold vs model proposals; 2/3 exact."""
        records = [
            {
                "text": "The documentation is excellent and the UI is great.",
                "gold": "positive",
                "csv_label": "positive",
            },
            {
                "text": "The screen is defective and the battery is terrible.",
                "gold": "negative",
                "csv_label": "negative",
            },
            {
                "text": "The build is excellent and the tests are great.",
                "gold": "negative",
                "csv_label": "negative",
            },
        ]
        dataset_id, _run_id = _build_gold_and_model_dataset(records)

        evaluation = _evaluation_run(dataset_id, split="test")
        assert evaluation.status_code == 200, _err(evaluation)
        report = evaluation.json()
        assert report["total_samples"] == 3, report
        # Hand-computed: model predicts positive/negative/positive for the three
        # texts; gold is positive/negative/negative -> 2 correct of 3.
        assert report["accuracy"] == pytest.approx(2 / 3, abs=1e-4), (
            f"accuracy is not the hand-computed 0.6667 (self-comparison bug?): {report}"
        )
        assert report["gold_source"] == "human_approved", report
        assert report["candidate_source"] == "model", report
        assert report["dataset_id"] == dataset_id, report
        assert set(report["classes"]) == {"positive", "negative"}, report
        assert report["confusion_matrix"], report
        assert report["per_class_metrics"], report

    def test_f4_evaluation_run_persisted_and_listed(self):
        """F4: each evaluation run is persisted and retrievable with provenance."""
        records = [
            {
                "text": "The documentation is excellent and the UI is great.",
                "gold": "positive",
                "csv_label": "positive",
            },
            {
                "text": "The screen is defective and the battery is terrible.",
                "gold": "negative",
                "csv_label": "negative",
            },
        ]
        dataset_id, _run_id = _build_gold_and_model_dataset(records)
        evaluation = _evaluation_run(dataset_id, split="test")
        assert evaluation.status_code == 200, _err(evaluation)

        runs_resp = _runs(dataset_id)
        assert runs_resp.status_code == 200, _err(runs_resp)
        runs = runs_resp.json()
        assert isinstance(runs, list) and runs, f"no persisted evaluation runs: {runs}"
        entry = runs[0]
        assert entry.get("dataset_id") == dataset_id, entry
        assert entry.get("id"), entry
        assert "accuracy" in entry, entry
        assert entry.get("created_at"), entry
        assert "provider" in entry or "model" in entry, (
            f"persisted run must record provider/model provenance: {entry}"
        )


# ===========================================================================
# G. Queue exposure + end-to-end flow
# ===========================================================================
class TestGQueueAndFlow:
    def test_g_queue_exposes_metadata_text_and_selector_annotation(self):
        """G: queue exposes metadata.text and the selector-chosen annotation."""
        _project_id, dataset_id = _fresh_dataset()
        rows = [
            {"text": "Queue visible text alpha", "label": "sports"},
            {"text": "Queue visible text beta", "label": "tech"},
        ]
        resp = _import_file(dataset_id, "queue.csv", _csv_bytes(rows, ["text", "label"]))
        assert resp.status_code == 200, _err(resp)
        record_ids = _accepted_ids(resp.json())
        text_by_record = {rid: _text_of(rid) for rid in record_ids}

        approved_id = _annotation_id(record_ids[0])
        _transition(approved_id, "approved", "approved for queue test")
        _create_human_annotation(record_ids[0], "finance")  # newer pending annotation

        queue = _queue(dataset_id, limit=50)
        assert queue["total"] == 2, queue
        items = {item["id"]: item for item in queue["items"]}
        for record_id, expected_text in text_by_record.items():
            item = items[record_id]
            assert item["metadata"].get("text") == expected_text, (
                f"queue item does not expose metadata.text: {item.get('metadata')}"
            )
        queue_ann_id, queue_payload, queue_status = _queue_active_annotation(items[record_ids[0]])
        assert queue_ann_id == approved_id, (
            "queue must expose the selector-chosen (approved) annotation, got "
            f"{queue_ann_id} expected {approved_id}"
        )
        assert queue_payload and queue_payload.get("label") == "sports", queue_payload
        assert queue_status == "approved", queue_status

    def test_g1_full_text_lifecycle_end_to_end(self):
        """G1: create -> import -> label/approve -> validate -> freeze -> export."""
        project_id = _create_project()
        dataset_id = _create_text_dataset(project_id)
        rows = [
            {"text": "Lifecycle end to end sample one", "label": "sports"},
            {"text": "Lifecycle end to end sample two", "label": "tech"},
        ]
        imported = _import_file(
            dataset_id, "lifecycle.csv", _csv_bytes(rows, ["text", "label"])
        )
        assert imported.status_code == 200, _err(imported)
        report = imported.json()
        assert report["accepted_count"] == 2, report

        for record_id in _accepted_ids(report):
            _approve_imported(record_id)

        quality = _validate(dataset_id)
        assert quality["is_publishable"] is True, (
            f"approved, non-duplicate text dataset should be publishable: {quality}"
        )
        version_resp = _freeze(dataset_id)
        assert version_resp.status_code == 200, _err(version_resp)
        assert version_resp.json()["record_count"] == 2, version_resp.json()

        artifact = _export(version_resp.json()["id"], "csv")
        assert artifact["record_count"] == 2, artifact
        texts = _zip_texts(_download_zip(artifact["id"]))
        assert "data.csv" in texts, list(texts)
        blob = texts["data.csv"]
        for text in (row["text"] for row in rows):
            assert text in blob, f"end-to-end export is missing {text!r}"
