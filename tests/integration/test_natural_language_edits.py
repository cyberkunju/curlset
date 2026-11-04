"""Integration tests for natural-language dataset editing (preview -> apply -> undo)."""
from __future__ import annotations

import time
import uuid

import pytest
from fastapi.testclient import TestClient

from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.simulated_provider import SimulatedEnsembleProvider
from services.api.main import app

LABELS = ["billing", "technical_support"]
LONG_CSV = (
    "text,label\n"
    "I was charged twice for my subscription this month and I would like a refund please,billing\n"
    "The application crashes every single time I try to export a dataset to JSONL file,technical_support\n"
    "The invoice shows the wrong amount for my annual plan again this year,billing\n"
    "Uploading a large file returns an error after waiting for several minutes,technical_support\n"
)


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def providers():
    gateway = ProviderGateway.get_instance()
    provider = SimulatedEnsembleProvider("edit-gen", accuracy=0.97)
    gateway.register_provider(provider)
    yield provider
    gateway._providers.pop("edit-gen", None)


def _dataset(client: TestClient) -> str:
    project = client.post("/api/v1/projects", json={"name": f"Edits {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "Editable",
        "task_type": "text_classification",
        "label_schema": {"labels": LABELS},
    }).json()
    imported = client.post(
        f"/api/v1/datasets/{dataset['id']}/import/file",
        files={"file": ("rows.csv", LONG_CSV.encode(), "text/csv")},
    ).json()
    assert imported["accepted_count"] == 4, imported
    return dataset["id"]


def _texts(client: TestClient, dataset_id: str) -> list[str]:
    queue = client.get(f"/api/v1/datasets/{dataset_id}/queue", params={"limit": 50}).json()
    return [item["metadata"].get("text", "") for item in queue["items"]]


def test_preview_shorten_reports_real_counts_without_mutating(client):
    dsid = _dataset(client)
    before = _texts(client, dsid)
    response = client.post(f"/api/v1/datasets/{dsid}/edits/preview",
                           json={"instruction": "shorten examples to 8 words"})
    assert response.status_code == 200, response.text
    plan = response.json()
    assert plan["applies_changes"] is True
    operation = plan["operations"][0]
    assert operation["kind"] == "shorten_text"
    assert operation["supported"] is True
    assert operation["count"] == 4
    assert operation["args"]["target_words"] == 8
    assert plan["reversible"] is True
    # preview must not mutate
    assert _texts(client, dsid) == before


def test_apply_shorten_then_undo_restores_text(client):
    dsid = _dataset(client)
    before = sorted(_texts(client, dsid))

    applied = client.post(f"/api/v1/datasets/{dsid}/edits/apply", json={
        "instruction": "shorten examples to 8 words", "confirm": True,
    })
    assert applied.status_code == 200, applied.text
    result = applied.json()
    assert result["counts"]["shorten_text"] == 4
    after = _texts(client, dsid)
    assert all(len(text.split()) <= 9 for text in after), after
    assert all(text.endswith("…") for text in after), after

    change_set_id = result["change_set_id"]
    history = client.get(f"/api/v1/datasets/{dsid}/edits").json()
    assert any(entry["id"] == change_set_id and entry["undoable"] for entry in history)

    undone = client.post(f"/api/v1/datasets/{dsid}/edits/{change_set_id}/undo")
    assert undone.status_code == 200, undone.text
    assert sorted(_texts(client, dsid)) == before


def test_apply_requires_confirmation_and_returns_preview(client):
    dsid = _dataset(client)
    response = client.post(f"/api/v1/datasets/{dsid}/edits/apply",
                           json={"instruction": "shorten examples to 8 words"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["error"]["code"] == "CONFIRMATION_REQUIRED"
    assert body["preview"]["operations"][0]["kind"] == "shorten_text"


def test_reject_label_is_reversible_not_destructive(client):
    dsid = _dataset(client)
    applied = client.post(f"/api/v1/datasets/{dsid}/edits/apply", json={
        "instruction": "remove examples labelled billing", "confirm": True,
    })
    assert applied.status_code == 200, applied.text
    result = applied.json()
    assert result["counts"]["reject_label"] == 2

    queue = client.get(f"/api/v1/datasets/{dsid}/queue", params={"limit": 50}).json()
    billing = [item for item in queue["items"] if (item.get("metadata") or {}).get("label") == "billing"]
    assert all(item["review_status"] == "rejected" for item in billing), billing
    # rows still exist (reversible state change, not deletion)
    assert len(queue["items"]) == 4

    undone = client.post(f"/api/v1/datasets/{dsid}/edits/{result['change_set_id']}/undo")
    assert undone.status_code == 200, undone.text
    queue_after = client.get(f"/api/v1/datasets/{dsid}/queue", params={"limit": 50}).json()
    billing_after = [item for item in queue_after["items"]
                     if (item.get("metadata") or {}).get("label") == "billing"]
    assert all(item["review_status"] == "pending_review" for item in billing_after), billing_after


def test_rename_label_updates_schema_and_payloads_and_undoes(client):
    dsid = _dataset(client)
    applied = client.post(f"/api/v1/datasets/{dsid}/edits/apply", json={
        "instruction": "rename label billing to invoices", "confirm": True,
    })
    assert applied.status_code == 200, applied.text
    result = applied.json()
    assert result["counts"]["rename_label"] == 2

    detail = client.get(f"/api/v1/datasets/{dsid}").json()
    assert detail["dataset"]["label_schema"]["labels"] == ["invoices", "technical_support"]

    undone = client.post(f"/api/v1/datasets/{dsid}/edits/{result['change_set_id']}/undo")
    assert undone.status_code == 200, undone.text
    detail_after = client.get(f"/api/v1/datasets/{dsid}").json()
    assert detail_after["dataset"]["label_schema"]["labels"] == LABELS


def test_unsupported_instruction_lists_supported_vocabulary(client):
    dsid = _dataset(client)
    response = client.post(f"/api/v1/datasets/{dsid}/edits/preview",
                           json={"instruction": "make the tone more formal and professional"})
    assert response.status_code == 200, response.text
    plan = response.json()
    assert plan["applies_changes"] is False
    assert plan["operations"][0]["kind"] == "unsupported"
    assert "rename" in plan["operations"][0]["warning"].lower()
    assert plan["notes"]


def test_add_examples_starts_a_job_on_the_same_dataset(client, providers):
    dsid = _dataset(client)
    applied = client.post(f"/api/v1/datasets/{dsid}/edits/apply", json={
        "instruction": "add 4 more examples",
        "confirm": True,
        "provider": "edit-gen",
        "model": providers.list_available_models()[0],
        "verifier_providers": [{"provider": "edit-gen", "model": providers.list_available_models()[0]}],
    })
    assert applied.status_code == 200, applied.text
    result = applied.json()
    assert result["job_id"], result
    assert result["counts"]["add_examples"] == 4

    job = client.get(f"/api/v1/generate/jobs/{result['job_id']}").json()
    assert job["dataset_id"] == dsid, job
    # Regression: the runner must be started after commit, otherwise the job sits in "pending".
    deadline = time.time() + 30
    while time.time() < deadline:
        job = client.get(f"/api/v1/generate/jobs/{result['job_id']}").json()
        if job["status"] in {"completed", "failed", "cancelled"}:
            break
        time.sleep(0.05)
    assert job["status"] == "completed", job


def test_edit_requires_editor_role(client):
    dsid = _dataset(client)
    response = client.post(
        f"/api/v1/datasets/{dsid}/edits/preview",
        json={"instruction": "shorten examples to 8 words"},
        headers={"X-User-Id": "intruder-tenant"},
    )
    assert response.status_code == 403, response.text
