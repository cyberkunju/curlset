"""TEXT_MVP.md criteria F1-F6: honest gold-vs-model accuracy evaluation.

Regression contract being locked in:
- F1: accuracy compares APPROVED ground-truth annotations (gold: origin ``human`` or
  ``imported`` — imported labels from an already-labeled CSV/JSONL are legitimate
  pre-existing gold; model/synthetic/rule-generated are NEVER gold) with MODEL-origin
  proposals on the same record; a label is never compared to itself, and one-sided
  records are skipped. ``allow_imported_gold`` (default true) can restrict gold to
  human-reviewed labels only.
- F2: no comparable pairs -> HTTP 422 (``EVALUATION_NO_COMPARABLE_PAIRS``), never a green card.
- F3: report carries total_samples/accuracy/per-class/confusion-matrix/classes/warnings and
  gold/candidate provenance (split, dataset, provider, model, gold_origins).
- F4: each run is persisted and retrievable via GET /datasets/{id}/evaluation/runs.
- F5: a hand-computed fixture proves the reported accuracy equals the expected value.
- F6: object-detection / non-classification tasks -> HTTP 422, not a silent 0-sample report.
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus, TaskType
from packages.dataset_core.db.models import (
    AnnotationModel,
    AnnotationRevisionModel,
    DatasetModel,
    DatasetRecordModel,
    EvaluationRunModel,
    ProjectModel,
)
from packages.dataset_core.db.session import get_db_session, init_database
from packages.dataset_evaluation.metrics import compute_classification_metrics
from services.api.main import app

PROJECT_ID = "proj_text_accuracy_tests"


def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


@pytest.fixture(autouse=True)
def setup_database():
    init_database()
    with get_db_session() as session:
        if session.get(ProjectModel, PROJECT_ID) is None:
            session.add(
                ProjectModel(
                    id=PROJECT_ID,
                    name="Text Accuracy Test Project",
                    description="TEXT_MVP F1-F6 evaluation tests",
                )
            )


def _make_dataset(
    session: Any,
    *,
    task_type: str = TaskType.TEXT_CLASSIFICATION.value,
    classes: tuple[str, ...] = ("positive", "negative"),
    dataset_id: str | None = None,
) -> DatasetModel:
    dataset = DatasetModel(
        id=dataset_id or _uid("ds_acc"),
        project_id=PROJECT_ID,
        name="Accuracy Evaluation Dataset",
        task_type=task_type,
        schema_version=1,
        label_schema={"classes": list(classes)},
    )
    session.add(dataset)
    session.flush()
    return dataset


def _add_annotation(
    session: Any,
    record_id: str,
    dataset_id: str,
    *,
    origin: str,
    status: str,
    label: str,
    provider: str | None = None,
    model: str | None = None,
    created_at: datetime | None = None,
    with_revision: bool = True,
) -> AnnotationModel:
    annotation = AnnotationModel(
        id=_uid("ann"),
        record_id=record_id,
        dataset_id=dataset_id,
        task_type="text_classification",
        schema_version=1,
        origin=origin,
        status=status,
        payload={"label": label},
        created_at=created_at or datetime.now(UTC),
    )
    session.add(annotation)
    session.flush()
    if with_revision:
        model_metadata: dict[str, Any] = {}
        if provider or model:
            model_metadata = {"provider": provider, "model": model}
        revision = AnnotationRevisionModel(
            id=_uid("rev"),
            annotation_id=annotation.id,
            revision_number=1,
            payload={"label": label},
            origin=origin,
            actor_id=f"model:{model}" if origin == AnnotationOrigin.MODEL.value and model else "default_user",
            model_metadata=model_metadata,
            created_at=annotation.created_at,
        )
        session.add(revision)
        session.flush()
        annotation.current_revision_id = revision.id
    return annotation


def _add_pair(
    session: Any,
    dataset_id: str,
    *,
    gold_label: str,
    pred_label: str | None,
    split: str = "test",
    provider: str | None = "fake",
    model: str | None = "fake-classifier-v1",
    text: str = "hand-computed fixture sample",
    gold_origin: str = AnnotationOrigin.HUMAN.value,
) -> DatasetRecordModel:
    record = DatasetRecordModel(
        id=_uid("rec"),
        dataset_id=dataset_id,
        split=split,
        extra_metadata={"text": text},
    )
    session.add(record)
    session.flush()
    _add_annotation(
        session,
        record.id,
        dataset_id,
        origin=gold_origin,
        status=ReviewStatus.APPROVED.value,
        label=gold_label,
        created_at=datetime.now(UTC) - timedelta(seconds=1),
    )
    if pred_label is not None:
        _add_annotation(
            session,
            record.id,
            dataset_id,
            origin=AnnotationOrigin.MODEL.value,
            status=ReviewStatus.PENDING_REVIEW.value,
            label=pred_label,
            provider=provider,
            model=model,
        )
    return record


def _make_client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


@pytest.mark.anyio
async def test_f1_f3_f5_accuracy_matches_hand_computed_fixture():
    """Five hand-labelled pairs -> accuracy 3/5 = 0.6 with full per-class provenance."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        # (gold, predicted) pairs:
        #   positive/positive (correct)
        #   positive/negative (wrong)
        #   negative/negative (correct)
        #   negative/negative (correct)
        #   positive/negative (wrong)
        # -> accuracy = 3/5 = 0.6
        pairs = [
            ("positive", "positive"),
            ("positive", "negative"),
            ("negative", "negative"),
            ("negative", "negative"),
            ("positive", "negative"),
        ]
        for gold, predicted in pairs:
            _add_pair(session, dataset.id, gold_label=gold, pred_label=predicted)
        dataset_id = dataset.id

    async with _make_client() as client:
        response = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test"},
        )

    assert response.status_code == 200, response.text
    report = response.json()

    # F5: reported accuracy == hand-computed value.
    assert report["total_samples"] == 5
    assert report["accuracy"] == 0.6
    expected_correct = sum(1 for gold, predicted in pairs if gold == predicted)
    assert report["accuracy"] == round(expected_correct / len(pairs), 4)

    # F3: classification detail.
    assert report["classes"] == ["negative", "positive"]
    positive = report["per_class_metrics"]["positive"]
    negative = report["per_class_metrics"]["negative"]
    assert positive["support"] == 3
    assert positive["precision"] == 1.0
    assert positive["recall"] == 0.3333
    assert positive["f1_score"] == 0.5
    assert negative["support"] == 2
    assert negative["precision"] == 0.5
    assert negative["recall"] == 1.0
    assert negative["f1_score"] == 0.6667
    assert report["macro_f1"] == pytest.approx(0.5833, abs=1e-3)
    assert report["confusion_matrix"]["positive"]["positive"] == 1
    assert report["confusion_matrix"]["positive"]["negative"] == 2
    assert report["confusion_matrix"]["negative"]["negative"] == 2
    assert report["confusion_matrix"]["negative"]["positive"] == 0

    # F3: provenance — this is a human-gold vs model-candidate comparison.
    assert report["gold_source"] == "human_approved"
    assert report["metadata"]["gold_origins"] == ["human"]
    assert report["metadata"]["allow_imported_gold"] is True
    assert report["candidate_source"] == "model"
    assert report["split"] == "test"
    assert report["dataset_id"] == dataset_id
    assert report["provider"] == "fake"
    assert report["model"] == "fake-classifier-v1"
    assert report["skipped_records"] == 0
    assert report["run_id"]
    assert report["warnings"], "honest small-sample warning expected for 5 samples"

    # Independent expectation check from the pure metric function.
    y_true = [gold for gold, _ in pairs]
    y_pred = [predicted for _, predicted in pairs]
    pure = compute_classification_metrics(y_true, y_pred)
    assert pure.accuracy == report["accuracy"]


@pytest.mark.anyio
async def test_f1_model_only_record_is_not_compared_to_itself():
    """Regression for the old y_pred = y_true bug: a lone MODEL annotation has no gold."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        record = DatasetRecordModel(
            id=_uid("rec"),
            dataset_id=dataset.id,
            split="test",
            extra_metadata={"text": "model only sample"},
        )
        session.add(record)
        session.flush()
        # Old code path: active annotation origin == candidate -> y_pred = y_true = "positive"
        # and would report a perfect 100 % accuracy from a single model label.
        _add_annotation(
            session,
            record.id,
            dataset.id,
            origin=AnnotationOrigin.MODEL.value,
            status=ReviewStatus.PENDING_REVIEW.value,
            label="positive",
            provider="fake",
            model="fake-classifier-v1",
        )
        dataset_id = dataset.id

    async with _make_client() as client:
        response = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test"},
        )
        runs_response = await client.get(f"/api/v1/datasets/{dataset_id}/evaluation/runs")

    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "EVALUATION_NO_COMPARABLE_PAIRS"
    assert error["details"]["records_with_approved_gold"] == 0
    assert error["details"]["gold_origins"] == ["human", "imported"]
    assert error["details"]["allow_imported_gold"] is True
    assert error["details"]["candidate_source"] == "model"
    # A failed evaluation must not be persisted as a green run.
    assert runs_response.status_code == 200
    assert runs_response.json() == []


@pytest.mark.anyio
async def test_f2_no_comparable_pairs_returns_422():
    """Records with only one side of the comparison must not produce a 0 %/100 % report."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        # Record with only an approved human label (no candidate).
        human_only = _add_pair(session, dataset.id, gold_label="positive", pred_label=None)
        assert human_only is not None
        # Record with only a pending human label and a model proposal (human not approved).
        record = DatasetRecordModel(
            id=_uid("rec"),
            dataset_id=dataset.id,
            split="test",
            extra_metadata={"text": "human pending + model"},
        )
        session.add(record)
        session.flush()
        _add_annotation(
            session,
            record.id,
            dataset.id,
            origin=AnnotationOrigin.HUMAN.value,
            status=ReviewStatus.PENDING_REVIEW.value,
            label="positive",
        )
        _add_annotation(
            session,
            record.id,
            dataset.id,
            origin=AnnotationOrigin.MODEL.value,
            status=ReviewStatus.PENDING_REVIEW.value,
            label="negative",
            provider="fake",
            model="fake-classifier-v1",
        )
        dataset_id = dataset.id

    async with _make_client() as client:
        response = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test"},
        )

    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "EVALUATION_NO_COMPARABLE_PAIRS"
    assert "approved human" in error["message"]
    assert error["details"]["records_in_split"] == 2
    assert error["details"]["records_with_approved_gold"] == 1
    assert error["details"]["records_with_approved_human_gold"] == 1
    assert error["details"]["records_with_model_candidate"] == 1
    assert error["details"]["gold_origins"] == ["human", "imported"]
    assert error["details"]["allow_imported_gold"] is True

    # An empty split has no pairs either.
    with get_db_session() as session:
        empty_dataset = _make_dataset(session)
        empty_dataset_id = empty_dataset.id
    async with _make_client() as client:
        empty_response = await client.post(
            f"/api/v1/datasets/{empty_dataset_id}/evaluation/run",
            json={"split": "test"},
        )
    assert empty_response.status_code == 422
    assert empty_response.json()["error"]["code"] == "EVALUATION_NO_COMPARABLE_PAIRS"


@pytest.mark.anyio
async def test_f1_imported_approved_gold_is_comparable():
    """A labeler starting from a labeled CSV: imported approved gold vs model candidates."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        pairs = [
            ("positive", "positive"),  # correct
            ("positive", "negative"),  # wrong
            ("negative", "negative"),  # correct
            ("negative", "negative"),  # correct
        ]
        for gold, predicted in pairs:
            _add_pair(
                session,
                dataset.id,
                gold_label=gold,
                pred_label=predicted,
                gold_origin=AnnotationOrigin.IMPORTED.value,
            )
        dataset_id = dataset.id

    async with _make_client() as client:
        response = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test"},
        )
        listed = await client.get(f"/api/v1/datasets/{dataset_id}/evaluation/runs")

    assert response.status_code == 200, response.text
    report = response.json()
    # 3 of the 4 imported gold labels agree with the model -> 0.75.
    assert report["total_samples"] == 4
    assert report["accuracy"] == 0.75
    assert report["gold_source"] == "imported_approved"
    assert report["candidate_source"] == "model"
    assert report["metadata"]["gold_origins"] == ["imported"]
    assert report["metadata"]["allow_imported_gold"] is True
    assert any("imported" in warning.lower() for warning in report["warnings"])

    persisted = listed.json()
    assert len(persisted) == 1
    assert persisted[0]["gold_source"] == "imported_approved"
    assert persisted[0]["total_samples"] == 4
    assert persisted[0]["accuracy"] == 0.75
    assert persisted[0]["metrics"]["metadata"]["gold_origins"] == ["imported"]


@pytest.mark.anyio
async def test_allow_imported_gold_false_skips_imported_gold():
    """The explicit opt-out restores human-only gold; imported-only data then has no pairs."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        for gold, predicted in (("positive", "positive"), ("negative", "negative")):
            _add_pair(
                session,
                dataset.id,
                gold_label=gold,
                pred_label=predicted,
                gold_origin=AnnotationOrigin.IMPORTED.value,
            )
        dataset_id = dataset.id

    async with _make_client() as client:
        strict = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test", "allow_imported_gold": False},
        )
        permissive = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test", "allow_imported_gold": True},
        )

    assert strict.status_code == 422, strict.text
    error = strict.json()["error"]
    assert error["code"] == "EVALUATION_NO_COMPARABLE_PAIRS"
    assert error["details"]["allow_imported_gold"] is False
    assert error["details"]["gold_origins"] == ["human"]
    assert error["details"]["records_with_approved_gold"] == 0
    assert error["details"]["records_with_approved_human_gold"] == 0

    assert permissive.status_code == 200, permissive.text
    assert permissive.json()["gold_source"] == "imported_approved"
    assert permissive.json()["accuracy"] == 1.0


@pytest.mark.anyio
async def test_f1_model_or_synthetic_approved_annotation_is_never_gold():
    """Approval status alone is not gold: model/synthetic/rule-generated labels never qualify."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        for forbidden_origin in (
            AnnotationOrigin.MODEL.value,
            AnnotationOrigin.SYNTHETIC.value,
            AnnotationOrigin.RULE_GENERATED.value,
        ):
            record = DatasetRecordModel(
                id=_uid("rec"),
                dataset_id=dataset.id,
                split="test",
                extra_metadata={"text": f"forbidden gold origin {forbidden_origin}"},
            )
            session.add(record)
            session.flush()
            _add_annotation(
                session,
                record.id,
                dataset.id,
                origin=forbidden_origin,
                status=ReviewStatus.APPROVED.value,
                label="positive",
            )
        dataset_id = dataset.id

    async with _make_client() as client:
        response = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test"},
        )

    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "EVALUATION_NO_COMPARABLE_PAIRS"
    assert error["details"]["records_with_approved_gold"] == 0
    assert error["details"]["records_with_approved_human_gold"] == 0
    # Only the approved model annotation doubles as a (non-gold) candidate.
    assert error["details"]["records_with_model_candidate"] == 1


@pytest.mark.anyio
async def test_f1_mixed_human_and_imported_gold_provenance():
    """Mixed gold reports human_and_imported_approved and the actually-used origin set."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        # human gold: correct, wrong; imported gold: correct, wrong -> accuracy 2/4 = 0.5
        _add_pair(session, dataset.id, gold_label="positive", pred_label="positive")
        _add_pair(session, dataset.id, gold_label="positive", pred_label="negative")
        _add_pair(
            session,
            dataset.id,
            gold_label="negative",
            pred_label="negative",
            gold_origin=AnnotationOrigin.IMPORTED.value,
        )
        _add_pair(
            session,
            dataset.id,
            gold_label="negative",
            pred_label="positive",
            gold_origin=AnnotationOrigin.IMPORTED.value,
        )
        dataset_id = dataset.id

    async with _make_client() as client:
        response = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test"},
        )
        listed = await client.get(f"/api/v1/datasets/{dataset_id}/evaluation/runs")

    assert response.status_code == 200, response.text
    report = response.json()
    assert report["total_samples"] == 4
    assert report["accuracy"] == 0.5
    assert report["gold_source"] == "human_and_imported_approved"
    assert report["metadata"]["gold_origins"] == ["human", "imported"]
    assert any("imported" in warning.lower() for warning in report["warnings"])

    persisted = listed.json()
    assert len(persisted) == 1
    assert persisted[0]["gold_source"] == "human_and_imported_approved"
    assert persisted[0]["metrics"]["metadata"]["gold_origins"] == ["human", "imported"]


@pytest.mark.anyio
async def test_f6_non_classification_task_returns_422():
    """Object detection (and other non-classification tasks) must fail loudly."""
    for task_type in (
        TaskType.OBJECT_DETECTION.value,
        TaskType.AUDIO_TRANSCRIPTION.value,
    ):
        with get_db_session() as session:
            dataset = _make_dataset(session, task_type=task_type, classes=())
            dataset_id = dataset.id

        async with _make_client() as client:
            response = await client.post(
                f"/api/v1/datasets/{dataset_id}/evaluation/run",
                json={"split": "test"},
            )

        assert response.status_code == 422, response.text
        error = response.json()["error"]
        assert error["code"] == "EVALUATION_TASK_NOT_SUPPORTED"
        assert "not supported for classification metrics" in error["message"]
        assert error["details"]["task_type"] == task_type


@pytest.mark.anyio
async def test_f4_run_persisted_and_listed():
    """Every run is stored with provenance/timestamp and retrievable newest-first."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        for gold, predicted in (("positive", "positive"), ("negative", "positive"), ("positive", "positive")):
            _add_pair(session, dataset.id, gold_label=gold, pred_label=predicted)
        dataset_id = dataset.id

    async with _make_client() as client:
        first = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test"},
        )
        # Windows clock granularity can be ~1 ms; space the runs so "newest first" is
        # deterministic rather than decided by the random id suffix on a timestamp tie.
        await asyncio.sleep(0.05)
        second = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test", "provider": "fake", "model": "fake-classifier-v1"},
        )
        listed = await client.get(f"/api/v1/datasets/{dataset_id}/evaluation/runs")

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    first_report = first.json()
    second_report = second.json()
    assert first_report["total_samples"] == 3
    assert first_report["accuracy"] == 0.6667
    assert second_report["run_id"] != first_report["run_id"]

    assert listed.status_code == 200, listed.text
    runs = listed.json()
    assert len(runs) == 2
    newest = runs[0]
    assert newest["id"] == second_report["run_id"]
    assert newest["run_id"] == second_report["run_id"]
    assert newest["dataset_id"] == dataset_id
    assert newest["split"] == "test"
    assert newest["gold_source"] == "human_approved"
    assert newest["candidate_source"] == "model"
    assert newest["provider"] == "fake"
    assert newest["model"] == "fake-classifier-v1"
    assert newest["total_samples"] == 3
    assert newest["accuracy"] == 0.6667
    assert newest["macro_f1"] == second_report["macro_f1"]
    assert newest["metrics"]["accuracy"] == 0.6667
    assert newest["metrics"]["gold_source"] == "human_approved"
    assert newest["created_at"]

    # Direct DB verification: the persisted row carries the full report.
    with get_db_session() as session:
        persisted = session.scalars(
            select(EvaluationRunModel)
            .where(EvaluationRunModel.dataset_id == dataset_id)
            .order_by(EvaluationRunModel.created_at.desc(), EvaluationRunModel.id.desc())
        ).all()
        assert len(persisted) == 2
        newest_run = persisted[0]
        assert newest_run.total_samples == 3
        assert newest_run.accuracy == 0.6667
        assert newest_run.gold_source == "human_approved"
        assert newest_run.candidate_source == "model"
        assert newest_run.metrics_json["confusion_matrix"]["positive"]["positive"] == 2


@pytest.mark.anyio
async def test_f1_skips_unpaired_records_and_warns():
    """One-sided records are skipped and disclosed, not silently scored."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        _add_pair(session, dataset.id, gold_label="positive", pred_label="positive")
        _add_pair(session, dataset.id, gold_label="negative", pred_label="negative")
        # Two non-comparable records: only a model proposal / only a human gold.
        record = DatasetRecordModel(
            id=_uid("rec"),
            dataset_id=dataset.id,
            split="test",
            extra_metadata={"text": "only model"},
        )
        session.add(record)
        session.flush()
        _add_annotation(
            session,
            record.id,
            dataset.id,
            origin=AnnotationOrigin.MODEL.value,
            status=ReviewStatus.PENDING_REVIEW.value,
            label="positive",
            provider="fake",
            model="fake-classifier-v1",
        )
        _add_pair(session, dataset.id, gold_label="positive", pred_label=None)
        dataset_id = dataset.id

    async with _make_client() as client:
        response = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test"},
        )

    assert response.status_code == 200, response.text
    report = response.json()
    assert report["total_samples"] == 2
    assert report["accuracy"] == 1.0
    assert report["skipped_records"] == 2
    assert any("skipped" in warning.lower() for warning in report["warnings"])


@pytest.mark.anyio
async def test_f1_legacy_model_revision_candidate_is_supported():
    """Model proposals recorded as revisions on a human annotation remain comparable."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        record = DatasetRecordModel(
            id=_uid("rec"),
            dataset_id=dataset.id,
            split="test",
            extra_metadata={"text": "legacy revision proposal"},
        )
        session.add(record)
        session.flush()
        human_annotation = _add_annotation(
            session,
            record.id,
            dataset.id,
            origin=AnnotationOrigin.HUMAN.value,
            status=ReviewStatus.APPROVED.value,
            label="positive",
            created_at=datetime.now(UTC) - timedelta(seconds=1),
        )
        session.add(
            AnnotationRevisionModel(
                id=_uid("rev"),
                annotation_id=human_annotation.id,
                revision_number=2,
                payload={"label": "negative"},
                origin=AnnotationOrigin.MODEL.value,
                actor_id="model_llama",
                model_metadata={"provider": "ollama", "model": "llama3.2"},
                created_at=datetime.now(UTC),
            )
        )
        dataset_id = dataset.id

    async with _make_client() as client:
        response = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test"},
        )

    assert response.status_code == 200, response.text
    report = response.json()
    # Gold is the human-approved "positive"; candidate is the model revision "negative".
    assert report["total_samples"] == 1
    assert report["accuracy"] == 0.0
    assert report["provider"] == "ollama"
    assert report["model"] == "llama3.2"


@pytest.mark.anyio
async def test_unsupported_origin_pairing_returns_422():
    """Only approved-human gold vs model candidates is an honest comparison."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        _add_pair(session, dataset.id, gold_label="positive", pred_label="positive")
        dataset_id = dataset.id

    async with _make_client() as client:
        response = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test", "reference_origin": "imported"},
        )

    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "EVALUATION_UNSUPPORTED_ORIGINS"


@pytest.mark.anyio
async def test_f1_end_to_end_ai_labeling_vs_api_approved_human_gold():
    """Real flow: AI annotate creates model candidates; human API creates + approves gold."""
    with get_db_session() as session:
        dataset = _make_dataset(session)
        record_ids: list[str] = []
        for index in range(3):
            record = DatasetRecordModel(
                id=_uid("rec"),
                dataset_id=dataset.id,
                split="test",
                extra_metadata={"text": f"api flow sample {index} great outstanding product"},
            )
            session.add(record)
            session.flush()
            record_ids.append(record.id)
        dataset_id = dataset.id

    async with _make_client() as client:
        # Candidate path (TEXT_MVP B3): model-origin proposals with run provenance.
        annotate = await client.post(
            f"/api/v1/datasets/{dataset_id}/ai-annotate",
            json={"provider": "fake", "model": "fake-classifier-v1", "limit": 10},
        )
        assert annotate.status_code == 202, annotate.text
        assert annotate.json()["processed_items"] == 3

    with get_db_session() as session:
        model_labels: dict[str, str] = {}
        for record_id in record_ids:
            model_annotations = session.scalars(
                select(AnnotationModel).where(
                    AnnotationModel.record_id == record_id,
                    AnnotationModel.origin == AnnotationOrigin.MODEL.value,
                )
            ).all()
            assert len(model_annotations) == 1
            model_labels[record_id] = model_annotations[0].payload["label"]

    # Gold path (TEXT_MVP B1): create human annotation then approve via transition.
    correct_ids = set(record_ids[:2])
    async with _make_client() as client:
        for record_id in record_ids:
            model_label = model_labels[record_id]
            if record_id in correct_ids:
                gold_label = model_label
            else:
                gold_label = "negative" if model_label == "positive" else "positive"

            create_response = await client.post(
                f"/api/v1/records/{record_id}/annotations",
                json={"payload": {"label": gold_label}},
            )
            assert create_response.status_code == 201, create_response.text
            created = create_response.json()
            # Trust boundary (TEXT_MVP B1): origin/status are server-derived.
            assert created["origin"] == "human"
            assert created["status"] == "pending_review"

            transition_response = await client.post(
                f"/api/v1/annotations/{created['id']}/transition",
                json={"next_status": "approved", "reason": "human review verified sample"},
            )
            assert transition_response.status_code == 200, transition_response.text
            assert transition_response.json()["status"] == "approved"

        run_response = await client.post(
            f"/api/v1/datasets/{dataset_id}/evaluation/run",
            json={"split": "test"},
        )
        listed_response = await client.get(f"/api/v1/datasets/{dataset_id}/evaluation/runs")

    assert run_response.status_code == 200, run_response.text
    report = run_response.json()
    # Two gold labels match the model candidates, one was human-corrected -> 2/3.
    assert report["total_samples"] == 3
    assert report["accuracy"] == 0.6667
    assert report["gold_source"] == "human_approved"
    assert report["candidate_source"] == "model"
    # Provenance comes from the AI-annotation revision metadata, not the request.
    assert report["provider"] == "fake"
    assert report["model"] == "fake-classifier-v1"
    assert report["skipped_records"] == 0

    assert listed_response.status_code == 200
    runs = listed_response.json()
    assert len(runs) == 1
    assert runs[0]["total_samples"] == 3
    assert runs[0]["accuracy"] == 0.6667
    assert runs[0]["provider"] == "fake"
    assert runs[0]["model"] == "fake-classifier-v1"


@pytest.mark.anyio
async def test_missing_dataset_returns_404():
    async with _make_client() as client:
        response = await client.post(
            "/api/v1/datasets/ds_does_not_exist/evaluation/run",
            json={"split": "test"},
        )
    assert response.status_code == 404, response.text
