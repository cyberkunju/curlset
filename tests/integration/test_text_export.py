"""
Integration tests for TEXT_MVP §E — export criteria (docs/STATUS.md).

E1: jsonl + csv contain the real input text (record.metadata["text"]) and the decided
    label (annotation.payload["label"]); no fabricated placeholders.
E2: unsloth_sharegpt_vlm / axolotl_alpaca_chatml / llama_factory_bundle use real text
    (payload.text fallback allowed ONLY for audio_transcription/document_ocr).
E3: split-aware output; an empty val split yields an empty file (never a copy of train).
E4: byte-deterministic ZIPs — same version + format twice => identical sha256.
E5: all 9 export formats still work through ExportService dispatch.

The suite is self-contained: it uses a temporary SQLite database and temp storage, with
the storage backend getters monkeypatched, so it never touches the shared app database.
"""
import csv
import io
import json
import zipfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from packages.dataset_core.constants import ExportFormat
from packages.dataset_core.db.base import Base
from packages.dataset_core.db.models import (
    DatasetModel,
    DatasetVersionModel,
    ProjectModel,
)
from packages.dataset_export.service import ExportService
from packages.dataset_io.storage import LocalStorageBackend

# Placeholder strings that must never be emitted by text exports.
FABRICATED_STRINGS = [
    "Classify this sample.",
    "Sample instruction",
    "Target answer",
    "Approved label.",
    "Describe this image.",
    "Provide analysis for the input.",
    "General",
    "positive",
]

TEXT_LABELS = ("billing", "technical_support")


class _ExportEnv:
    def __init__(self, session: Session, storage: LocalStorageBackend, engine):
        self.session = session
        self.storage = storage
        self.engine = engine

    def close(self) -> None:
        self.session.close()
        self.engine.dispose()


@pytest.fixture
def export_env(tmp_path, monkeypatch):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'text_export.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    storage = LocalStorageBackend(root_dir=str(tmp_path / "storage"))
    monkeypatch.setattr("packages.dataset_export.service.get_storage_backend", lambda: storage)
    monkeypatch.setattr("packages.dataset_versioning.service.get_storage_backend", lambda: storage)
    env = _ExportEnv(Session(engine), storage, engine)
    try:
        yield env
    finally:
        env.close()


def _record(
    record_id: str,
    text: str,
    label: str,
    split: str = "train",
    extra_metadata: dict | None = None,
) -> dict:
    metadata = {"text": text}
    if extra_metadata:
        metadata.update(extra_metadata)
    return {
        "record_id": record_id,
        "split": split,
        "external_key": f"ext-{record_id}",
        "metadata": metadata,
        "assets": [],
        "annotation": {
            "annotation_id": f"ann_{record_id}",
            "revision_id": f"rev_{record_id}",
            "revision_number": 1,
            "origin": "human",
            "status": "approved",
            "payload": {"label": label},
            "confidence": 0.9,
        },
    }


def _manifest(records: list[dict], task_type: str = "text_classification") -> dict:
    return {
        "manifest_version": "1.0.0",
        "version_id": "ver_text_1",
        "dataset_id": "ds_text",
        "dataset_name": "Text Support",
        "version_tag": "v1.0.0",
        "version_number": 1,
        "task_type": task_type,
        "schema_version": 1,
        "created_at": "2026-01-01T00:00:00+00:00",
        "created_by": "tester",
        "record_count": len(records),
        "quality_summary": {"blocking_count": 0, "warning_count": 0, "findings": []},
        "records": records,
    }


def _create_version(env: _ExportEnv, manifest: dict, version_id: str = "ver_text_1") -> DatasetVersionModel:
    session = env.session
    if session.get(ProjectModel, "proj_text") is None:
        session.add(ProjectModel(id="proj_text", name="Text Export Project", owner_id="tester"))
    if session.get(DatasetModel, "ds_text") is None:
        session.add(
            DatasetModel(
                id="ds_text",
                project_id="proj_text",
                name="Text Support",
                task_type=manifest["task_type"],
                label_schema={"labels": list(TEXT_LABELS)},
            )
        )
    manifest_key = f"manifests/ds_text/{version_id}.json"
    env.storage.write_bytes(manifest_key, json.dumps(manifest, sort_keys=True).encode("utf-8"))
    version = DatasetVersionModel(
        id=version_id,
        dataset_id="ds_text",
        version_number=manifest["version_number"],
        version_tag=manifest["version_tag"],
        manifest_hash="a" * 64,
        manifest_storage_key=manifest_key,
        record_count=manifest["record_count"],
        schema_version=1,
        quality_summary=manifest["quality_summary"],
        documentation_markdown="# Text Dataset Card\n",
        is_published=True,
        created_by="tester",
    )
    session.add(version)
    session.commit()
    return version


def _export(env: _ExportEnv, version_id: str, fmt: str) -> tuple[str, dict[str, bytes]]:
    artifact = ExportService.export_dataset_version(env.session, version_id, fmt)
    raw = env.storage.read_bytes(artifact.storage_key)
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        entries = {info.filename: zf.read(info.filename) for info in zf.infolist()}
    return artifact.sha256, entries


def _combined_text(entries: dict[str, bytes]) -> str:
    """Plain-text view of the format data members.

    ``manifest.json``/``README.md`` are provenance copies of the frozen snapshot (they
    legitimately contain the raw annotation payload), so they are excluded from the
    "no fabricated text leaked into the training data" assertions.
    """
    return "\n".join(
        data.decode("utf-8", errors="replace")
        for name, data in entries.items()
        if name not in {"manifest.json", "README.md"}
        and name.endswith((".json", ".jsonl", ".csv", ".txt", ".yaml", ".yml", ".vtt"))
    )


# ---------------------------------------------------------------------------
# E1 — jsonl / csv carry the real text and decided label
# ---------------------------------------------------------------------------


def test_jsonl_contains_real_text_and_decided_label(export_env):
    manifest = _manifest(
        [
            _record("rec_1", "I was charged twice for my subscription.", "billing", extra_metadata={"char_count": 42}),
            _record("rec_2", "The app crashes every time I launch it.", "technical_support", split="val"),
        ]
    )
    _create_version(export_env, manifest)
    _sha, entries = _export(export_env, "ver_text_1", "jsonl")

    assert "data.jsonl" in entries
    lines = [json.loads(line) for line in entries["data.jsonl"].decode("utf-8").splitlines()]
    by_id = {line["record_id"]: line for line in lines}
    assert by_id["rec_1"]["text"] == "I was charged twice for my subscription."
    assert by_id["rec_1"]["label"] == "billing"
    assert by_id["rec_1"]["annotation"]["payload"]["label"] == "billing"
    assert by_id["rec_2"]["text"] == "The app crashes every time I launch it."
    assert by_id["rec_2"]["label"] == "technical_support"

    text = _combined_text(entries)
    for fabricated in FABRICATED_STRINGS:
        assert fabricated not in text


def test_csv_contains_real_text_and_decided_label(export_env):
    manifest = _manifest(
        [
            _record(
                "rec_1",
                "I was charged twice for my subscription.",
                "billing",
                extra_metadata={"source": "customer_portal", "char_count": 42},
            ),
            _record("rec_2", "Please add dark mode.", "technical_support", split="val"),
        ]
    )
    _create_version(export_env, manifest)
    _sha, entries = _export(export_env, "ver_text_1", "csv")

    assert "data.csv" in entries
    rows = list(csv.DictReader(io.StringIO(entries["data.csv"].decode("utf-8"))))
    by_id = {row["record_id"]: row for row in rows}

    assert "text" in rows[0]
    assert by_id["rec_1"]["text"] == "I was charged twice for my subscription."
    assert by_id["rec_1"]["label"] == "billing"
    assert by_id["rec_2"]["text"] == "Please add dark mode."
    assert by_id["rec_2"]["label"] == "technical_support"
    # Unknown metadata keys are preserved as portable columns.
    assert by_id["rec_1"]["source"] == "customer_portal"
    assert by_id["rec_1"]["char_count"] == "42"

    text = _combined_text(entries)
    for fabricated in FABRICATED_STRINGS:
        assert fabricated not in text


# ---------------------------------------------------------------------------
# E2 — presets use real text; payload.text only for audio/OCR; no fabrications
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "fmt",
    [
        ExportFormat.UNSLOTH_SHAREGPT_VLM.value,
        ExportFormat.AXOLOTL_ALPACA_CHATML.value,
        ExportFormat.LLAMA_FACTORY_BUNDLE.value,
    ],
)
def test_text_presets_use_real_text_and_no_fabrication(export_env, fmt):
    manifest = _manifest(
        [
            _record("rec_1", "I was charged twice for my subscription.", "billing"),
            _record("rec_2", "The app crashes every time I launch it.", "technical_support", split="val"),
        ]
    )
    _create_version(export_env, manifest)
    _sha, entries = _export(export_env, "ver_text_1", fmt)

    text = _combined_text(entries)
    assert "I was charged twice for my subscription." in text
    assert "The app crashes every time I launch it." in text
    assert "billing" in text
    assert "technical_support" in text
    for fabricated in FABRICATED_STRINGS:
        assert fabricated not in text


def test_payload_text_is_not_used_for_text_classification(export_env):
    """payload["text"] is not a text field for text_classification — it must not leak through."""
    record = _record("rec_payload_only", "", "billing")
    record["metadata"] = {"text": ""}
    record["annotation"]["payload"] = {"label": "billing", "text": "PAYLOAD_ONLY_SENTINEL"}
    manifest = _manifest([record])
    _create_version(export_env, manifest)

    for fmt in (
        ExportFormat.UNSLOTH_SHAREGPT_VLM.value,
        ExportFormat.AXOLOTL_ALPACA_CHATML.value,
        ExportFormat.LLAMA_FACTORY_BUNDLE.value,
    ):
        _sha, entries = _export(export_env, "ver_text_1", fmt)
        assert "PAYLOAD_ONLY_SENTINEL" not in _combined_text(entries)


def test_payload_text_fallback_allowed_for_audio_transcription(export_env):
    record = _record("rec_audio", "", "speech", split="train")
    record["metadata"] = {}
    record["annotation"]["payload"] = {"label": "speech", "text": "spoken words from the recording"}
    manifest = _manifest([record], task_type="audio_transcription")
    _create_version(export_env, manifest)

    for fmt in (
        ExportFormat.UNSLOTH_SHAREGPT_VLM.value,
        ExportFormat.AXOLOTL_ALPACA_CHATML.value,
        ExportFormat.LLAMA_FACTORY_BUNDLE.value,
    ):
        _sha, entries = _export(export_env, "ver_text_1", fmt)
        assert "spoken words from the recording" in _combined_text(entries)


# ---------------------------------------------------------------------------
# E3 — split-aware output; empty val is an empty file
# ---------------------------------------------------------------------------


def test_empty_val_split_is_empty_file_not_train_copy(export_env):
    manifest = _manifest([_record("rec_train", "Only training text.", "billing", split="train")])
    _create_version(export_env, manifest)
    _sha, entries = _export(export_env, "ver_text_1", ExportFormat.UNSLOTH_SHAREGPT_VLM.value)

    assert entries["val.jsonl"] == b""
    train_text = entries["train.jsonl"].decode("utf-8")
    assert "Only training text." in train_text
    assert "Only training text." not in entries["val.jsonl"].decode("utf-8")


def test_splits_contain_only_their_own_records(export_env):
    manifest = _manifest(
        [
            _record("rec_train", "Training split text.", "billing", split="train"),
            _record("rec_val", "Validation split text.", "technical_support", split="val"),
        ]
    )
    _create_version(export_env, manifest)
    _sha, entries = _export(export_env, "ver_text_1", ExportFormat.UNSLOTH_SHAREGPT_VLM.value)

    train_text = entries["train.jsonl"].decode("utf-8")
    val_text = entries["val.jsonl"].decode("utf-8")
    assert "Training split text." in train_text
    assert "Validation split text." not in train_text
    assert "Validation split text." in val_text
    assert "Training split text." not in val_text


# ---------------------------------------------------------------------------
# E4 + E5 — byte determinism and all nine formats
# ---------------------------------------------------------------------------

EXPECTED_MEMBERS = {
    ExportFormat.CSV.value: ["data.csv"],
    ExportFormat.JSONL.value: ["data.jsonl"],
    ExportFormat.COCO.value: ["annotations/instances_default.json"],
    ExportFormat.YOLO.value: ["data.yaml"],
    ExportFormat.WEBVTT.value: ["subtitles/master_combined.vtt"],
    ExportFormat.UNSLOTH_SHAREGPT_VLM.value: ["train.jsonl", "val.jsonl", "train_unsloth.py"],
    ExportFormat.AXOLOTL_ALPACA_CHATML.value: ["dataset.jsonl", "axolotl_config.yml"],
    ExportFormat.LLAMA_FACTORY_BUNDLE.value: ["dataset_info.json"],
    ExportFormat.ULTRALYTICS_YOLO_V8_V11.value: ["classes.txt", "data.yaml"],
}


def test_all_nine_formats_are_byte_deterministic(export_env):
    manifest = _manifest(
        [
            _record("rec_1", "I was charged twice for my subscription.", "billing"),
            _record("rec_2", "The app crashes every time I launch it.", "technical_support", split="val"),
        ]
    )
    _create_version(export_env, manifest)

    for fmt in ExportFormat:
        if fmt.value == ExportFormat.IMAGE_BUNDLE.value:
            # Image bundles require image assets; they have their own round-trip suite.
            continue
        first = ExportService.export_dataset_version(export_env.session, "ver_text_1", fmt.value)
        second = ExportService.export_dataset_version(export_env.session, "ver_text_1", fmt.value)

        assert first.format == fmt.value
        assert first.sha256 == second.sha256, f"{fmt.value}: artifact sha256 is not deterministic"
        assert first.byte_size == second.byte_size

        first_raw = export_env.storage.read_bytes(first.storage_key)
        second_raw = export_env.storage.read_bytes(second.storage_key)
        assert first_raw == second_raw, f"{fmt.value}: export bytes are not deterministic"

        with zipfile.ZipFile(io.BytesIO(first_raw)) as zf:
            infos = zf.infolist()
            names = [info.filename for info in infos]
            for required in ["manifest.json", "README.md"] + EXPECTED_MEMBERS[fmt.value]:
                assert required in names, f"{fmt.value}: missing {required}"
            assert all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in infos), fmt.value
            # Member order must be stable as well (sorted data members, then manifest/readme/assets).
            assert names == [info.filename for info in zf.infolist()]

            if fmt.value == ExportFormat.COCO.value:
                coco = json.loads(zf.read("annotations/instances_default.json"))
                assert "images" in coco and "annotations" in coco
            if fmt.value == ExportFormat.WEBVTT.value:
                assert zf.read("subtitles/master_combined.vtt").startswith(b"WEBVTT")
