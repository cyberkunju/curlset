"""Integration tests for Phase 13: Audio Transcription and Document Modalities Pipeline.

Tests:
1. Ingestion of WAV audio files, extracting sample rate, channels, and duration safely.
2. Ingestion and sniffing of PDF / document modalities.
3. Schema and timestamp validation for audio transcription cues.
4. QualityEngine audio timestamp invariant checks (exceeding track duration, inverted cues).
5. WebVTT subtitle export format producing W3C-compliant WebVTT subtitle archives.
"""

import io
import uuid
import wave

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from packages.dataset_core.constants import (
    AnnotationOrigin,
    AssetRole,
    ReviewStatus,
    TaskType,
)
from packages.dataset_core.db import (
    AnnotationModel,
    AssetModel,
    Base,
    DatasetModel,
    ProjectModel,
)
from packages.dataset_core.exceptions import DomainValidationError
from packages.dataset_core.task_schemas import validate_annotation_payload
from packages.dataset_export.webvtt_exporter import (
    export_to_webvtt_files,
    format_timestamp_vtt,
)
from packages.dataset_io.ingestion_service import IngestionService
from packages.dataset_io.safety import validate_file_safety
from packages.dataset_io.storage import LocalStorageBackend
from packages.dataset_quality.engine import QualityEngine


@pytest.fixture
def db_session(tmp_path):
    db_file = tmp_path / "test_phase13.db"
    engine = create_engine(
        f"sqlite:///{db_file}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def storage(tmp_path):
    storage_dir = tmp_path / "storage"
    return LocalStorageBackend(root_dir=str(storage_dir))


def generate_wav_bytes(duration_seconds: float = 1.0, sample_rate: int = 16000, channels: int = 1) -> bytes:
    """Generate minimal valid PCM WAV bytes using Python stdlib wave module."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        num_frames = int(duration_seconds * sample_rate)
        # Write silent PCM samples
        wf.writeframes(b"\x00\x00" * num_frames * channels)
    return buf.getvalue()


class TestAdditionalModalitiesPipeline:
    def test_audio_sniffing_and_metadata_ingestion(self, db_session, storage, tmp_path):
        """Verify WAV magic bytes are detected and metadata is safely parsed."""
        wav_bytes = generate_wav_bytes(duration_seconds=2.5, sample_rate=16000, channels=1)

        # Test validate_file_safety
        mime, modality = validate_file_safety("interview.wav", wav_bytes)
        assert modality == "audio"
        assert mime == "audio/wav"

        # Ingest through IngestionService.ingest_bytes
        project = ProjectModel(id=str(uuid.uuid4()), name="Audio Project", owner_id="user-1")
        db_session.add(project)
        db_session.flush()

        dataset = DatasetModel(
            id=str(uuid.uuid4()),
            project_id=project.id,
            name="Speech Corpus",
            task_type=TaskType.AUDIO_TRANSCRIPTION.value,
        )
        db_session.add(dataset)
        db_session.flush()

        report = IngestionService.ingest_bytes(
            session=db_session,
            dataset_id=dataset.id,
            filename="interview.wav",
            data=wav_bytes,
            split="train",
            storage=storage,
        )
        db_session.commit()

        assert report.accepted_count == 1
        asset = db_session.get(AssetModel, report.accepted_items[0].asset_id)
        assert asset is not None
        assert report.accepted_items[0].role == AssetRole.PRIMARY_AUDIO.value
        assert asset.dimensions is not None
        assert asset.dimensions["sample_rate_hz"] == 16000
        assert asset.dimensions["channels"] == 1
        assert abs(asset.dimensions["duration_seconds"] - 2.5) < 0.05

    def test_pdf_document_sniffing(self):
        """Verify PDF document detection via magic bytes."""
        pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        mime, modality = validate_file_safety("doc.pdf", pdf_bytes)
        assert modality == "document"
        assert mime == "application/pdf"

    def test_audio_transcription_schema_validation(self):
        """Verify task schema enforces text and ordered cue segment bounds."""
        # Valid payload - should execute cleanly without raising exception
        valid_payload = {
            "text": "The quick brown fox jumps over the lazy dog.",
            "segments": [
                {"start_time": 0.0, "end_time": 1.2, "speaker": "Speaker 1", "text": "The quick brown fox"},
                {"start_time": 1.3, "end_time": 2.4, "speaker": "Speaker 2", "text": "jumps over the lazy dog."},
            ],
        }
        validate_annotation_payload(TaskType.AUDIO_TRANSCRIPTION.value, valid_payload)

        # Invalid: missing text
        with pytest.raises(DomainValidationError, match="requires a non-empty 'text' string"):
            validate_annotation_payload(TaskType.AUDIO_TRANSCRIPTION.value, {"segments": []})

        # Invalid: inverted segment timestamps
        with pytest.raises(DomainValidationError, match="greater than end_time"):
            validate_annotation_payload(
                TaskType.AUDIO_TRANSCRIPTION.value,
                {
                    "text": "Invalid timing",
                    "segments": [{"start_time": 5.0, "end_time": 2.0, "text": "Backwards"}],
                },
            )

    def test_quality_engine_audio_timestamp_checks(self, db_session, storage):
        """Verify QualityEngine identifies audio segment violations."""
        project = ProjectModel(id=str(uuid.uuid4()), name="Audio Quality Project", owner_id="user-1")
        db_session.add(project)
        db_session.flush()

        dataset = DatasetModel(
            id=str(uuid.uuid4()),
            project_id=project.id,
            name="Audio QA Dataset",
            task_type=TaskType.AUDIO_TRANSCRIPTION.value,
        )
        db_session.add(dataset)
        db_session.flush()

        # Ingest audio record with 1.0 second duration
        wav_bytes = generate_wav_bytes(duration_seconds=1.0)
        report = IngestionService.ingest_bytes(
            session=db_session,
            dataset_id=dataset.id,
            filename="one_sec.wav",
            data=wav_bytes,
            storage=storage,
        )
        db_session.flush()
        rec_id = report.accepted_items[0].record_id

        # Annotation segment goes up to 5.0 seconds (exceeding track duration)
        bad_annotation = AnnotationModel(
            id=str(uuid.uuid4()),
            record_id=rec_id,
            dataset_id=dataset.id,
            task_type=TaskType.AUDIO_TRANSCRIPTION.value,
            origin=AnnotationOrigin.HUMAN.value,
            status=ReviewStatus.PENDING_REVIEW.value,
            payload={
                "text": "This audio exceeds the track length.",
                "segments": [{"start_time": 0.0, "end_time": 5.0, "text": "Exceeds track"}],
            },
        )
        db_session.add(bad_annotation)
        db_session.commit()

        quality_report = QualityEngine.validate_dataset(session=db_session, dataset_id=dataset.id, storage=storage)
        assert not quality_report.is_publishable
        assert any(f.rule_id == "RULE_AUDIO_TIMESTAMPS" for f in quality_report.findings)
        audio_finding = next(f for f in quality_report.findings if f.rule_id == "RULE_AUDIO_TIMESTAMPS")
        assert rec_id in audio_finding.affected_record_ids

    def test_webvtt_formatting_and_export(self):
        """Verify WebVTT cue generation and timestamp formatting."""
        # Test timestamp formatting
        assert format_timestamp_vtt(0.0) == "00:00:00.000"
        assert format_timestamp_vtt(65.123) == "00:01:05.123"
        assert format_timestamp_vtt(3661.050) == "01:01:01.050"

        # Test export_to_webvtt_files with manifest structure
        manifest_mock = {
            "dataset_name": "Podcast Corpus",
            "version_tag": "v1.0.0",
            "records": [
                {
                    "record_id": "rec_001",
                    "split": "train",
                    "annotation": {
                        "payload": {
                            "text": "Welcome everyone. Let us begin.",
                            "segments": [
                                {"start_time": 0.0, "end_time": 1.5, "speaker": "Alice", "text": "Welcome everyone."},
                                {"start_time": 1.6, "end_time": 3.0, "speaker": "Bob", "text": "Let us begin."},
                            ],
                        }
                    },
                }
            ],
        }

        vtt_files = export_to_webvtt_files(manifest_mock)
        assert "subtitles/rec_001.vtt" in vtt_files
        assert "subtitles/master_combined.vtt" in vtt_files

        cue_content = vtt_files["subtitles/rec_001.vtt"].decode("utf-8")
        assert cue_content.startswith("WEBVTT")
        assert "00:00:00.000 --> 00:00:01.500" in cue_content
        assert "<v Alice>Welcome everyone." in cue_content
        assert "00:00:01.600 --> 00:00:03.000" in cue_content
        assert "<v Bob>Let us begin." in cue_content
