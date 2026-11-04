"""Integration tests for the autonomous labelling engine."""
from __future__ import annotations

import time
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from packages.autolabel.service import decide
from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.models import AnnotationModel, AnnotationRevisionModel
from packages.dataset_core.db.session import get_db_session
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.simulated_provider import SimulatedEnsembleProvider
from services.api.main import app

LABELS = ["positive", "negative", "neutral"]
CSV = (
    "text,label\n"
    '"Great product, love using it",positive\n'
    '"The app crashed twice today",negative\n'
    '"It is fine, does the job",neutral\n'
    '"Support answered quickly and fixed it",positive\n'
    '"Export fails with an error",negative\n'
    '"The update changed nothing visible",neutral\n'
)


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def providers():
    gateway = ProviderGateway.get_instance()
    created = [
        SimulatedEnsembleProvider("auto-strong", accuracy=0.97),
        SimulatedEnsembleProvider("auto-medium", accuracy=0.93),
    ]
    for provider in created:
        gateway.register_provider(provider)
    yield created
    for provider in created:
        gateway._providers.pop(provider.name, None)


def _dataset(client: TestClient) -> str:
    project = client.post("/api/v1/projects", json={"name": f"Auto {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "Auto label target",
        "task_type": "text_classification",
        "label_schema": {"labels": LABELS},
    }).json()
    imported = client.post(
        f"/api/v1/datasets/{dataset['id']}/import/file",
        files={"file": ("rows.csv", CSV.encode(), "text/csv")},
    ).json()
    assert imported["accepted_count"] == 6, imported
    return dataset["id"]


def _wait(client: TestClient, job_id: str, timeout: float = 60.0) -> dict:
    deadline = time.time() + timeout
    job: dict = {}
    while time.time() < deadline:
        job = client.get(f"/api/v1/generate/jobs/{job_id}").json()
        if job.get("status") in {"completed", "failed", "cancelled", "interrupted"}:
            return job
        time.sleep(0.05)
    return job


def test_decision_routes_by_agreement_and_confidence():
    unanimous = decide(["a", "a", "a"], [0.95, 0.9, 0.92])
    assert unanimous is not None
    assert unanimous.band == "auto_accept"
    assert unanimous.label == "a"

    split = decide(["a", "b"], [0.95, 0.9])
    assert split is not None
    assert split.band == "human_review"
    assert split.agreement is False

    unsure = decide(["a", "a"], [0.6, 0.55])
    assert unsure is not None
    assert unsure.band == "human_review"

    assert decide([], []) is None


def test_automated_run_labels_records_and_keeps_provenance_honest(client, providers):
    dsid = _dataset(client)
    refs = [{"provider": p.name, "model": p.list_available_models()[0]} for p in providers]
    created = client.post(f"/api/v1/datasets/{dsid}/auto-label", json={
        "providers": refs,
        "auto_accept_confidence": 0.9,
        "limit": 50,
    })
    assert created.status_code == 201, created.text
    job = created.json()
    assert job["kind"] == "auto_label"
    assert job["total_items"] == 6

    final = _wait(client, job["id"])
    assert final["status"] == "completed", final
    assert final["processed_items"] == 6
    auto = final["auto_approved"]
    review = final["needs_review"]
    assert auto + review + (final.get("rejected") or 0) == 6
    assert auto > 0, final
    assert final["eta_seconds"] is None

    with get_db_session() as session:
        # extract primitives inside the session: ORM instances detach when it closes
        annotations = [
            {"origin": row.origin, "status": row.status}
            for row in session.scalars(
                select(AnnotationModel).where(AnnotationModel.dataset_id == dsid)
            ).all()
        ]
        engine_actors = [
            row.actor_id for row in session.scalars(
                select(AnnotationRevisionModel).where(
                    AnnotationRevisionModel.annotation_id.in_(
                        select(AnnotationModel.id).where(AnnotationModel.dataset_id == dsid)
                    ),
                    AnnotationRevisionModel.origin.in_(
                        [AnnotationOrigin.ENSEMBLE.value, AnnotationOrigin.MODEL.value]
                    ),
                )
            ).all()
        ]
    engine_rows = [row for row in annotations
                   if row["origin"] in {AnnotationOrigin.ENSEMBLE.value, AnnotationOrigin.MODEL.value}]
    assert engine_rows, "no engine annotations were created"
    assert engine_actors and all(actor == "auto-labeler" for actor in engine_actors), engine_actors
    approved = [row for row in engine_rows if row["status"] == ReviewStatus.APPROVED.value]
    pending = [row for row in engine_rows if row["status"] == ReviewStatus.PENDING_REVIEW.value]
    assert len(approved) == auto, (len(approved), auto)
    assert len(pending) == review, (len(pending), review)
    assert not any(row["origin"] == AnnotationOrigin.HUMAN.value for row in annotations)


def test_auto_label_can_be_cancelled(client, providers):
    dsid = _dataset(client)
    refs = [{"provider": p.name, "model": p.list_available_models()[0]} for p in providers]
    job = client.post(f"/api/v1/datasets/{dsid}/auto-label", json={
        "providers": refs, "limit": 50,
    }).json()
    cancelled = client.post(f"/api/v1/generate/jobs/{job['id']}/cancel")
    assert cancelled.status_code == 200
    final = _wait(client, job["id"])
    assert final["status"] in {"cancelled", "completed"}


def test_auto_label_requires_editor_role(client, providers):
    dsid = _dataset(client)
    refs = [{"provider": p.name, "model": p.list_available_models()[0]} for p in providers]
    response = client.post(
        f"/api/v1/datasets/{dsid}/auto-label",
        json={"providers": refs, "limit": 10},
        headers={"X-User-Id": "intruder-tenant"},
    )
    assert response.status_code == 403, response.text
