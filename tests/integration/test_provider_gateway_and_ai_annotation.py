"""
Integration tests for Phase 5: Provider Gateway, Deterministic Fake Inference,
AI Annotation Orchestrator, Consensus Verifier, and Secret Redaction.
"""
from fastapi.testclient import TestClient

from packages.dataset_core.constants import ReviewStatus, TaskType
from packages.dataset_core.db.session import get_db_session
from packages.dataset_core.services.dataset_service import DatasetService
from packages.dataset_core.services.project_service import ProjectService
from packages.dataset_core.services.record_service import RecordService
from packages.provider_gateway.fake_provider import FakeProvider
from packages.provider_gateway.gateway import ProviderGateway, redact_secrets
from services.api.main import app

client = TestClient(app)


def test_list_providers_endpoint():
    res = client.get("/api/v1/providers")
    assert res.status_code == 200
    providers = res.json()
    provider_names = [p["name"] for p in providers]
    assert "fake" in provider_names
    assert "ollama" in provider_names


def test_secret_redaction_utility():
    sensitive_data = {
        "model": "gpt-4o",
        "api_key": "sk-proj-secret-12345",
        "headers": {
            "Authorization": "Bearer sk-proj-top-secret",
            "Content-Type": "application/json",
        },
        "nested": [
            {"token": "secret_token_abc", "clean_key": "safe_value"},
        ],
    }
    cleaned = redact_secrets(sensitive_data)
    assert cleaned["api_key"] == "[REDACTED]"
    assert cleaned["headers"]["Authorization"] == "[REDACTED]"
    assert cleaned["headers"]["Content-Type"] == "application/json"
    assert cleaned["nested"][0]["token"] == "[REDACTED]"
    assert cleaned["nested"][0]["clean_key"] == "safe_value"


def test_ai_annotation_batch_and_provenance():
    with get_db_session() as session:
        proj = ProjectService.create_project(session, name="AI Inference Project")
        dataset = DatasetService.create_dataset(
            session,
            project_id=proj.id,
            name="Customer Sentiment AI DS",
            task_type=TaskType.TEXT_CLASSIFICATION,
            label_schema={"classes": ["positive", "neutral", "negative"]},
        )

        # Ingest 3 sample records
        r1 = RecordService.create_record(
            session,
            dataset_id=dataset.id,
            external_key="item_pos",
            metadata={"text": "Outstanding and superb battery life!"},
        )
        r2 = RecordService.create_record(
            session,
            dataset_id=dataset.id,
            external_key="item_neg",
            metadata={"text": "Defective screen and terrible customer service."},
        )
        r3 = RecordService.create_record(
            session,
            dataset_id=dataset.id,
            external_key="item_neu",
            metadata={"text": "Item dimensions are standard."},
        )
        session.commit()

        dataset_id = dataset.id
        r1_id = r1.id
        r2_id = r2.id
        r3_id = r3.id

    # Trigger batch AI annotation with dual-pass consensus enabled
    annotate_res = client.post(
        f"/api/v1/datasets/{dataset_id}/ai-annotate",
        json={
            "provider": "fake",
            "model": "fake-classifier-v1",
            "only_unannotated": True,
            "limit": 10,
            "enable_consensus": True,
        },
    )
    assert annotate_res.status_code == 202
    run = annotate_res.json()
    assert run["status"] == "completed"
    assert run["total_items"] == 3
    assert run["processed_items"] == 3
    assert run["failed_items"] == 0
    run_id = run["id"]

    # Verify Run Detail Endpoint
    run_detail_res = client.get(f"/api/v1/runs/{run_id}")
    assert run_detail_res.status_code == 200
    run_detail = run_detail_res.json()
    assert len(run_detail["items"]) == 3
    assert all(it["status"] == "completed" for it in run_detail["items"])

    # Verify Record 1 annotation provenance and status
    detail1 = client.get(f"/api/v1/records/{r1_id}").json()
    assert detail1["annotation"] is not None
    assert detail1["annotation"]["origin"] == "model"
    assert detail1["annotation"]["status"] == ReviewStatus.PENDING_REVIEW.value
    assert detail1["annotation"]["payload"]["label"] == "positive"
    assert detail1["annotation"]["consensus_score"] is not None
    assert detail1["annotation"]["consensus_score"] >= 0.5

    # Verify Record 2 predicted negative
    detail2 = client.get(f"/api/v1/records/{r2_id}").json()
    assert detail2["annotation"]["payload"]["label"] == "negative"

    # Verify Record 3 predicted neutral
    detail3 = client.get(f"/api/v1/records/{r3_id}").json()
    assert detail3["annotation"]["payload"]["label"] == "neutral"


def test_ai_annotation_graceful_failure_handling():
    # Register a failing simulation provider
    gateway = ProviderGateway.get_instance()
    timeout_provider = FakeProvider(simulation_mode="timeout")
    timeout_provider.name = "fake_timeout"
    gateway.register_provider(timeout_provider)

    with get_db_session() as session:
        proj = ProjectService.create_project(session, name="Failure Test Project")
        dataset = DatasetService.create_dataset(
            session,
            project_id=proj.id,
            name="Error Testing Dataset",
            task_type=TaskType.TEXT_CLASSIFICATION,
            label_schema={"classes": ["cat", "dog"]},
        )
        RecordService.create_record(
            session,
            dataset_id=dataset.id,
            external_key="fail_doc",
            metadata={"text": "Some text for inference"},
        )
        session.commit()
        dataset_id = dataset.id

    # Run with failing provider
    fail_res = client.post(
        f"/api/v1/datasets/{dataset_id}/ai-annotate",
        json={
            "provider": "fake_timeout",
            "model": "fake-classifier-v1",
        },
    )
    assert fail_res.status_code == 202
    run = fail_res.json()
    assert run["status"] == "failed"
    assert run["failed_items"] == 1
    assert run["processed_items"] == 0

    # Ensure queue remains uncorrupted
    queue_res = client.get(f"/api/v1/datasets/{dataset_id}/queue").json()
    assert queue_res["total"] == 1
    assert queue_res["items"][0]["review_status"] == "unannotated"
