"""Integration tests for Simple-Mode generation jobs: plan -> job -> progress -> result -> cancel."""
from __future__ import annotations

import time
import uuid

import pytest
from fastapi.testclient import TestClient

from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.simulated_provider import SimulatedEnsembleProvider
from services.api.main import app

CLASSES = ["correct usage", "incorrect usage"]


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def providers():
    gateway = ProviderGateway.get_instance()
    generator = SimulatedEnsembleProvider("job-gen", accuracy=0.97)
    verifier = SimulatedEnsembleProvider("job-ver", accuracy=0.97)
    gateway.register_provider(generator)
    gateway.register_provider(verifier)
    yield {"generator": generator, "verifier": verifier}
    for name in ("job-gen", "job-ver"):
        gateway._providers.pop(name, None)


def _wait_for_job(client: TestClient, job_id: str, timeout: float = 30.0) -> dict:
    deadline = time.time() + timeout
    last: dict = {}
    while time.time() < deadline:
        last = client.get(f"/api/v1/generate/jobs/{job_id}").json()
        if last.get("status") in {"completed", "failed", "cancelled"}:
            return last
        time.sleep(0.05)
    return last


def test_plan_endpoint_returns_editable_plan(client):
    response = client.post("/api/v1/generate/plan", json={
        "prompt": "A dataset for identifying whether an English sentence uses these correctly, "
                  "about 120 examples: correct usage, incorrect usage",
    })
    assert response.status_code == 200, response.text
    plan = response.json()
    assert plan["suggested_total"] == 120
    assert plan["classes"] == CLASSES
    assert plan["per_class"] == 60
    assert [question["id"] for question in plan["questions"]] == ["count", "classes", "difficulty"]
    assert all(question["example"] for question in plan["questions"])


def test_generation_job_runs_reports_progress_and_creates_dataset(client, providers):
    project = client.post("/api/v1/projects", json={"name": f"Wizard {uuid.uuid4().hex[:6]}"}).json()
    created = client.post("/api/v1/generate/jobs", json={
        "prompt": "grammar dataset for 'these'",
        "classes": CLASSES,
        "per_class": 3,
        "provider": providers["generator"].name,
        "model": providers["generator"].list_available_models()[0],
        "verifier_providers": [{
            "provider": providers["verifier"].name,
            "model": providers["verifier"].list_available_models()[0],
        }],
        "project_id": project["id"],
        "dataset_name": "Generated grammar set",
        "min_label_preservation": 0.6,
    })
    assert created.status_code == 201, created.text
    job = created.json()
    assert job["total_items"] == 6
    assert job["status"] in {"pending", "running", "completed"}
    assert job["dataset_id"]

    final = _wait_for_job(client, job["id"])
    assert final["status"] == "completed", final
    assert final["processed_items"] == 6
    assert final["progress"] == 1.0
    # ETA is either a measured number or null once finished (never invented)
    assert final["eta_seconds"] is None or final["eta_seconds"] >= 0
    assert final["verdict"] in {"accept", "reject"}
    assert final["label_preservation"] is not None

    # the dataset exists and, when the gate accepted, contains synthetic pending-review rows
    dataset = client.get(f"/api/v1/datasets/{job['dataset_id']}")
    assert dataset.status_code == 200, dataset.text
    records = client.get(f"/api/v1/datasets/{job['dataset_id']}/queue", params={"limit": 50}).json()
    if final["verdict"] == "accept":
        assert final["accepted"] == len(records["items"])
        assert all(item["metadata"].get("synthetic") for item in records["items"])
        assert all(item["review_status"] == "pending_review" for item in records["items"])

    history = client.get("/api/v1/generate/jobs").json()
    assert any(entry["id"] == job["id"] for entry in history)


def test_job_can_be_cancelled(client, providers):
    created = client.post("/api/v1/generate/jobs", json={
        "prompt": "large grammar dataset",
        "classes": CLASSES,
        "per_class": 60,               # 120 items -> enough time to cancel
        "provider": providers["generator"].name,
        "model": providers["generator"].list_available_models()[0],
        "verifier_providers": [{
            "provider": providers["verifier"].name,
            "model": providers["verifier"].list_available_models()[0],
        }],
    }).json()
    cancelled = client.post(f"/api/v1/generate/jobs/{created['id']}/cancel")
    assert cancelled.status_code == 200, cancelled.text
    state = cancelled.json()["status"]
    assert state in {"cancelling", "cancelled", "completed"}
    final = _wait_for_job(client, created["id"])
    assert final["status"] in {"cancelled", "completed"}


def test_generation_job_requires_editor_on_project(client, providers):
    project = client.post("/api/v1/projects", json={"name": f"Wizard auth {uuid.uuid4().hex[:6]}"}).json()
    response = client.post(
        "/api/v1/generate/jobs",
        json={
            "prompt": "grammar dataset",
            "classes": CLASSES,
            "per_class": 1,
            "provider": providers["generator"].name,
            "model": providers["generator"].list_available_models()[0],
            "verifier_providers": [{
                "provider": providers["verifier"].name,
                "model": providers["verifier"].list_available_models()[0],
            }],
            "project_id": project["id"],
        },
        headers={"X-User-Id": "intruder-tenant"},
    )
    assert response.status_code == 403, response.text

def test_too_many_examples_for_one_run_is_rejected_with_a_plain_message(client, providers):
    """The user must get a readable sentence, not FastAPI's raw validation JSON."""
    response = client.post("/api/v1/generate/jobs", json={
        "prompt": "grammar dataset",
        "classes": ["a", "b", "c", "d", "e"],   # 5 classes x 500 = 2,500 > 2,000 limit
        "per_class": 500,
        "provider": providers["generator"].name,
        "model": providers["generator"].list_available_models()[0],
    })
    assert response.status_code == 422, response.text
    body = response.json()
    assert "error" in body and "message" in body["error"], body
    assert "2,000" in body["error"]["message"], body["error"]["message"]


def test_per_class_over_the_cap_is_a_domain_error_not_raw_validation_json(client, providers):
    response = client.post("/api/v1/generate/jobs", json={
        "prompt": "grammar dataset",
        "classes": ["a", "b"],
        "per_class": 501,
        "provider": providers["generator"].name,
        "model": providers["generator"].list_available_models()[0],
    })
    assert response.status_code == 422, response.text
    detail = response.json().get("detail")
    assert isinstance(detail, list), detail  # pydantic shape, translated client-side
    assert any(item.get("loc", [])[-1] == "per_class" for item in detail), detail


def test_documented_large_run_is_accepted(client, providers):
    """1,000 examples across 2 classes (500 per class) is within the documented limits."""
    created = client.post("/api/v1/generate/jobs", json={
        "prompt": "large grammar dataset",
        "classes": ["correct usage", "incorrect usage"],
        "per_class": 500,
        "provider": providers["generator"].name,
        "model": providers["generator"].list_available_models()[0],
        "verifier_providers": [{
            "provider": providers["verifier"].name,
            "model": providers["verifier"].list_available_models()[0],
        }],
        "min_label_preservation": 0.5,
    })
    assert created.status_code == 201, created.text
    job = created.json()
    assert job["total_items"] == 1000
    client.post(f"/api/v1/generate/jobs/{job['id']}/cancel")
