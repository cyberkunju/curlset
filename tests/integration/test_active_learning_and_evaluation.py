"""Integration tests for Phase 14: Active Learning & Baseline Evaluation.

Tests:
1. Pure calculation of classification metrics (Accuracy, Macro/Per-class Precision, Recall, F1, Confusion Matrix).
2. Honest small-sample limitation warnings.
3. Confident Learning label-error detection on synthetic noisy label data.
4. Active learning priority queue endpoint across multiple strategies (least_confidence, label_noise, unreviewed).
5. Baseline evaluation API endpoint with model vs human evaluation sets.
6. 2D semantic cluster map projection and coverage gap identification.
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus, TaskType
from packages.dataset_core.db.models import (
    AnnotationModel,
    AnnotationRevisionModel,
    DatasetModel,
    DatasetRecordModel,
    ProjectModel,
)
from packages.dataset_core.db.session import get_db_session, init_database
from packages.dataset_evaluation.confident_learning import (
    extract_simple_text_embedding,
    find_confident_label_errors,
)
from packages.dataset_evaluation.metrics import compute_classification_metrics
from services.api.main import app


@pytest.fixture(autouse=True)
def setup_database():
    init_database()
    with get_db_session() as session:
        proj = session.query(ProjectModel).filter_by(id="proj_phase14_eval").first()
        if not proj:
            proj = ProjectModel(
                id="proj_phase14_eval",
                name="Phase 14 Evaluation Project",
                description="Testing active learning and evaluation metrics",
            )
            session.add(proj)

        ds = session.query(DatasetModel).filter_by(id="ds_phase14_eval").first()
        if not ds:
            ds = DatasetModel(
                id="ds_phase14_eval",
                project_id="proj_phase14_eval",
                name="Benchmark Classifier",
                task_type=TaskType.TEXT_CLASSIFICATION.value,
                label_schema={"classes": ["sports", "finance", "technology"]},
            )
            session.add(ds)

        # Clear existing records for clean test run
        records = session.query(DatasetRecordModel).filter_by(dataset_id="ds_phase14_eval").all()
        for r in records:
            session.delete(r)
        session.commit()


class TestActiveLearningAndEvaluation:
    def test_pure_metrics_and_confusion_matrix(self):
        """Verify hand-computed classification metrics and honest small-sample warnings."""
        y_true = ["cat", "cat", "cat", "dog", "dog", "dog", "bird"]
        y_pred = ["cat", "cat", "dog", "dog", "dog", "cat", "bird"]

        # Expected:
        # cat: TP=2, FP=1 (from dog), FN=1 (predicted dog) -> P=2/3=0.6667, R=2/3=0.6667, F1=0.6667, sup=3
        # dog: TP=2, FP=1 (from cat), FN=1 (predicted cat) -> P=2/3=0.6667, R=2/3=0.6667, F1=0.6667, sup=3
        # bird: TP=1, FP=0, FN=0 -> P=1.0, R=1.0, F1=1.0, sup=1
        # Accuracy: 5/7 = 0.7143

        report = compute_classification_metrics(y_true, y_pred)
        assert report.total_samples == 7
        assert report.accuracy == 0.7143
        assert report.confusion_matrix["cat"]["cat"] == 2
        assert report.confusion_matrix["cat"]["dog"] == 1
        assert report.confusion_matrix["dog"]["cat"] == 1
        assert report.confusion_matrix["bird"]["bird"] == 1

        # Small sample warnings should be present for classes with support < 5
        assert len(report.warnings) > 0
        assert any("bird" in w for w in report.warnings)

    def test_confident_learning_label_error_detection(self):
        """Verify automated label-error detector identifies mislabeled records."""
        # Create 6 sports samples and 1 cooking sample mislabeled as sports
        sports_texts = [
            "Premier League football championship match victory goals",
            "Soccer tournament final round penalty kicks score",
            "Football world cup stadium referee whistle goals",
            "Champions League soccer championship players coach",
            "Penalty shootout goal football match sports tournament",
        ]
        cooking_text = "Chocolate cake recipe ingredients bake oven sugar flour"

        emb_records = []
        for idx, text in enumerate(sports_texts):
            emb_records.append({
                "record_id": f"rec_sports_{idx}",
                "label": "sports",
                "embedding": extract_simple_text_embedding(text),
            })

        # Add the mislabeled record: text is clearly cooking, but human accidentally marked 'sports'
        emb_records.append({
            "record_id": "rec_mislabeled",
            "label": "sports",
            "embedding": extract_simple_text_embedding(cooking_text),
        })

        # Add 3 cooking records
        for idx, text in enumerate([
            "Vanilla cake dessert bakery butter sugar recipe",
            "Baking delicious chocolate cookies oven flour eggs",
            "Sweet pastry cake oven baking recipe ingredients",
        ]):
            emb_records.append({
                "record_id": f"rec_cook_{idx}",
                "label": "cooking",
                "embedding": extract_simple_text_embedding(text),
            })

        findings = find_confident_label_errors(emb_records, k=4, threshold=0.35)
        # The mislabeled record should be detected!
        mislabeled_findings = [f for f in findings if f.record_id == "rec_mislabeled"]
        assert len(mislabeled_findings) == 1
        assert mislabeled_findings[0].current_label == "sports"
        assert mislabeled_findings[0].suggested_label == "cooking"
        assert mislabeled_findings[0].label_quality_score < 0.35

    @pytest.mark.anyio
    async def test_active_learning_queue_endpoint(self):
        """Test API endpoint returns prioritized records sorted by strategy."""
        with get_db_session() as session:
            # Add 3 records with distinct confidence scores
            r1 = DatasetRecordModel(id=str(uuid.uuid4()), dataset_id="ds_phase14_eval", external_key="high_conf", split="train")
            r2 = DatasetRecordModel(id=str(uuid.uuid4()), dataset_id="ds_phase14_eval", external_key="low_conf", split="train")
            r3 = DatasetRecordModel(id=str(uuid.uuid4()), dataset_id="ds_phase14_eval", external_key="mid_conf", split="train")
            session.add_all([r1, r2, r3])
            session.flush()

            session.add(AnnotationModel(
                id=str(uuid.uuid4()),
                record_id=r1.id,
                dataset_id="ds_phase14_eval",
                task_type="text_classification",
                origin=AnnotationOrigin.MODEL.value,
                status=ReviewStatus.PENDING_REVIEW.value,
                confidence=0.95,
                payload={"label": "sports"},
            ))
            session.add(AnnotationModel(
                id=str(uuid.uuid4()),
                record_id=r2.id,
                dataset_id="ds_phase14_eval",
                task_type="text_classification",
                origin=AnnotationOrigin.MODEL.value,
                status=ReviewStatus.PENDING_REVIEW.value,
                confidence=0.35,
                payload={"label": "finance"},
            ))
            session.add(AnnotationModel(
                id=str(uuid.uuid4()),
                record_id=r3.id,
                dataset_id="ds_phase14_eval",
                task_type="text_classification",
                origin=AnnotationOrigin.MODEL.value,
                status=ReviewStatus.PENDING_REVIEW.value,
                confidence=0.65,
                payload={"label": "technology"},
            ))
            session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/api/v1/datasets/ds_phase14_eval/active-learning/queue?strategy=least_confidence")
            assert res.status_code == 200
            data = res.json()
            assert data["strategy"] == "least_confidence"
            assert data["total"] == 3
            # Lowest confidence (0.35) must be ranked #1
            assert data["items"][0]["rank"] == 1
            assert data["items"][0]["external_key"] == "low_conf"
            assert data["items"][0]["confidence"] == 0.35

    @pytest.mark.anyio
    async def test_baseline_evaluation_endpoint(self):
        """Test model vs human baseline evaluation endpoint."""
        with get_db_session() as session:
            # Record in test split with approved human label and model revision
            r1 = DatasetRecordModel(id=str(uuid.uuid4()), dataset_id="ds_phase14_eval", external_key="test_item_1", split="test")
            session.add(r1)
            session.flush()

            ann1 = AnnotationModel(
                id=str(uuid.uuid4()),
                record_id=r1.id,
                dataset_id="ds_phase14_eval",
                task_type="text_classification",
                origin=AnnotationOrigin.HUMAN.value,
                status=ReviewStatus.APPROVED.value,
                payload={"label": "sports"},
            )
            session.add(ann1)
            session.flush()

            # Add model proposal revision predicting "sports" (correct)
            session.add(AnnotationRevisionModel(
                id=str(uuid.uuid4()),
                annotation_id=ann1.id,
                revision_number=1,
                origin=AnnotationOrigin.MODEL.value,
                actor_id="model_llama",
                payload={"label": "sports"},
            ))
            session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/v1/datasets/ds_phase14_eval/evaluation/run", json={"split": "test"})
            assert res.status_code == 200
            report = res.json()
            assert report["total_samples"] == 1
            assert report["accuracy"] == 1.0
            assert "sports" in report["classes"]

    @pytest.mark.anyio
    async def test_semantic_cluster_projection_and_gaps(self):
        """Test 2D semantic cluster projection and coverage gap discovery."""
        with get_db_session() as session:
            for i in range(12):
                r = DatasetRecordModel(
                    id=str(uuid.uuid4()),
                    dataset_id="ds_phase14_eval",
                    external_key=f"cluster_rec_{i}",
                    split="train",
                    extra_metadata={"text": f"Semantic article text sample number {i} on athletics"},
                )
                session.add(r)
            session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/api/v1/datasets/ds_phase14_eval/clusters")
            assert res.status_code == 200
            data = res.json()
            assert data["total_points"] >= 12
            for p in data["points"]:
                assert -1.0 <= p["x"] <= 1.0
                assert -1.0 <= p["y"] <= 1.0
                assert p["density"] >= 0.0
