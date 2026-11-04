"""API-level tests for ensemble labeling: run, votes inventory, audit sample, authz."""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from packages.dataset_core.db.session import get_db_session
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.simulated_provider import SimulatedEnsembleProvider
from services.api.main import app

LABELS = ["billing", "technical_support", "feature_request", "general_inquiry"]
ROWS = [
    ("I was charged twice for my subscription. Please refund.", "billing"),
    ("My invoice shows a higher amount than expected.", "billing"),
    ("The payment failed and my account is suspended.", "billing"),
    ("The app crashes when I open the export screen.", "technical_support"),
    ("Uploading a file larger than 100 MB never completes.", "technical_support"),
    ("The keyboard shortcut does nothing in the editor.", "technical_support"),
    ("Please add dark mode to the annotation editor.", "feature_request"),
    ("It would help to have bulk actions for approvals.", "feature_request"),
    ("Could you support Parquet files in addition to CSV?", "feature_request"),
    ("How do I invite a teammate to review my dataset?", "general_inquiry"),
    ("Where can I find the documentation for this feature?", "general_inquiry"),
    ("Do you offer a free trial?", "general_inquiry"),
] * 4


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register(prefix: str, hard_rate: float = 0.0) -> list[dict[str, str]]:
    gateway = ProviderGateway.get_instance()
    providers = [
        SimulatedEnsembleProvider(f"{prefix}-a", accuracy=0.97, hard_rate=hard_rate),
        SimulatedEnsembleProvider(f"{prefix}-b", accuracy=0.94, hard_rate=hard_rate),
        SimulatedEnsembleProvider(f"{prefix}-c", accuracy=0.90, hard_rate=hard_rate),
    ]
    specs = []
    for provider in providers:
        gateway.register_provider(provider)
        specs.append({"provider": provider.name, "model": provider.list_available_models()[0]})
    return specs


def _cleanup(prefix: str) -> None:
    gateway = ProviderGateway.get_instance()
    for suffix in ("-a", "-b", "-c"):
        gateway._providers.pop(f"{prefix}{suffix}", None)


def _dataset_with_gold(client: TestClient) -> str:
    project = client.post("/api/v1/projects", json={"name": f"EnsAPI {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "ens-api", "task_type": "text_classification", "label_schema": {"labels": LABELS},
    }).json()
    csv = "text,label,split\n" + "\n".join(
        f'"{text} #{index}","{label}","train"' for index, (text, label) in enumerate(ROWS)
    ) + "\n"
    imported = client.post(f"/api/v1/datasets/{dataset['id']}/import/file",
                           files={"file": ("rows.csv", csv.encode(), "text/csv")}).json()
    assert imported["accepted_count"] == len(ROWS), imported
    queue = client.get(f"/api/v1/datasets/{dataset['id']}/queue", params={"limit": 200}).json()
    ids = [item["id"] for item in queue["items"]]
    client.post(f"/api/v1/datasets/{dataset['id']}/review/bulk",
                json={"record_ids": ids, "action": "approve", "reason": "gold"})
    return dataset["id"]


def test_ensemble_label_endpoint_runs_and_reports(client):
    specs = _register(f"api-{uuid.uuid4().hex[:4]}")
    try:
        dsid = _dataset_with_gold(client)
        response = client.post(f"/api/v1/datasets/{dsid}/ensemble/label", json={
            "models": specs,
            "limit": 200,
            "budget_cap_usd": 1.0,
            "target_precision": 0.85,
            "min_support": 20,
            "materialize": True,
        })
        assert response.status_code == 200, response.text
        body = response.json()

        # measured outcome surface
        assert body["records_aggregated"] == len(ROWS)
        assert body["gold_pairs"] == len(ROWS)
        assert set(body["aggregator_scores"]) == {"log_odds", "majority", "weighted_vote", "mean_probs"}
        assert body["fanout"]["calls_made"] == len(ROWS) * 3
        assert body["fanout"]["failures"] == 0
        assert "calibration" in body and len(body["calibration"]) == 3
        assert "__all__" in body["thresholds"]
        assert body["band_counts"]
        assert body["correlated_error"]
        assert body["materialized_annotations"] == body["band_counts"]["auto_accept"]
        assert body["requested_models"] == specs

        # votes inventory endpoint agrees with the run
        votes = client.get(f"/api/v1/datasets/{dsid}/ensemble/votes").json()
        assert votes["total_votes"] == len(ROWS) * 3
        assert len(votes["models"]) == 3
        assert votes["ensemble_candidates"] == body["materialized_annotations"]

        # idempotent re-run: no new provider calls
        again = client.post(f"/api/v1/datasets/{dsid}/ensemble/label",
                            json={"models": specs, "limit": 200}).json()
        assert again["fanout"]["calls_made"] == 0
        assert again["fanout"]["calls_reused"] == len(ROWS) * 3
    finally:
        _cleanup(specs[0]["provider"].rsplit("-", 1)[0])


def test_audit_sample_endpoint_sizes_the_audit(client):
    dsid = _dataset_with_gold(client)
    # no candidates yet
    empty = client.get(f"/api/v1/datasets/{dsid}/ensemble/audit-sample").json()
    assert empty["population"] == 0
    assert empty["recommended_size"] >= 100
    assert empty["sample_record_ids"] == []


def test_ensemble_requires_editor_on_the_project(client):
    specs = _register(f"auth-{uuid.uuid4().hex[:4]}")
    try:
        dsid = _dataset_with_gold(client)
        # a different tenant cannot run a pass on someone else's dataset
        response = client.post(
            f"/api/v1/datasets/{dsid}/ensemble/label",
            json={"models": specs, "limit": 10},
            headers={"X-User-Id": "intruder-tenant"},
        )
        assert response.status_code == 403, response.text
        # and cannot read the vote inventory either
        assert client.get(
            f"/api/v1/datasets/{dsid}/ensemble/votes",
            headers={"X-User-Id": "intruder-tenant"},
        ).status_code == 403
    finally:
        _cleanup(specs[0]["provider"].rsplit("-", 1)[0])


def test_ensemble_rejects_unknown_fields(client):
    """extra='forbid' keeps a typo from silently doing nothing."""
    dsid = _dataset_with_gold(client)
    response = client.post(f"/api/v1/datasets/{dsid}/ensemble/label", json={
        "models": [{"provider": "fake", "model": "fake-classifier-v1"}],
        "budget_cap": 5.0,
    })
    assert response.status_code == 422, response.text


def _unused() -> None:  # pragma: no cover - keeps imports honest if edited
    get_db_session()
