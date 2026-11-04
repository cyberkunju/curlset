"""
Integration tests for the gated synthetic-data generation pipeline.

Verifies the write path end to end: an admitted batch becomes real records with
``origin=synthetic`` annotations at ``pending_review`` plus lineage; a batch that fails the gate
(collapse, or a missing independent verifier) writes nothing.
"""
from __future__ import annotations

import uuid
from typing import ClassVar

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.models import (
    AnnotationModel,
    DatasetRecordModel,
    SourceRecordModel,
)
from packages.dataset_core.db.session import get_db_session
from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.simulated_provider import SimulatedEnsembleProvider
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderRequest,
    ProviderResponse,
    ProviderUsage,
)
from services.api.main import app

LABELS = ["billing", "technical_support", "feature_request", "general_inquiry"]

GOLD_ROWS = [
    ("I was charged twice for my subscription, please refund.", "billing"),
    ("My invoice shows the wrong amount for this month.", "billing"),
    ("The payment failed and my account is locked.", "billing"),
    ("The card on file was declined during renewal.", "billing"),
    ("The subscription price changed without notice.", "billing"),
    ("A refund for the cancelled plan never arrived.", "billing"),
    ("The app crashes when I export a dataset.", "technical_support"),
    ("Uploading a file returns a 500 error.", "technical_support"),
    ("The queue spins forever after refresh.", "technical_support"),
    ("The keyboard shortcut does nothing now.", "technical_support"),
    ("Export to JSONL fails with an error.", "technical_support"),
    ("The canvas lags while drawing boxes.", "technical_support"),
    ("Please add dark mode to the editor.", "feature_request"),
    ("It would help to add bulk approval.", "feature_request"),
    ("Could you add support for parquet files?", "feature_request"),
    ("We would like to schedule exports weekly.", "feature_request"),
    ("Please add a search box to the queue.", "feature_request"),
    ("Add multi-label support to the schema.", "feature_request"),
    ("How do I invite a reviewer to the project?", "general_inquiry"),
    ("Where can I find the documentation?", "general_inquiry"),
    ("Is there a free trial for the team plan?", "general_inquiry"),
    ("Which browsers are supported by the app?", "general_inquiry"),
    ("Do you offer training for new annotators?", "general_inquiry"),
    ("How long do you retain deleted records?", "general_inquiry"),
]

# Generator templates per class: varied slots keep trigram overlap low enough to pass the gate,
# while each sentence contains the class cue an independent verifier will pick up.
_TEMPLATES = {
    "billing": [
        "I was charged for {a} {b} and need a refund.",
        "My invoice lists {a} that I never bought ({b}).",
        "The payment for {a} failed again {b}.",
        "Please refund {a} from the last {b}.",
    ],
    "technical_support": [
        "The app crashes on {a} after {b}.",
        "Uploading {a} returns an error during {b}.",
        "The {a} queue spins forever after {b}.",
        "Export to {a} fails with a 500 error {b}.",
    ],
    "feature_request": [
        "Please add {a} for the {b} screen.",
        "It would help to add {a} to {b}.",
        "Could you add support for {a} in {b}?",
        "We would like to schedule {a} for {b}.",
    ],
    "general_inquiry": [
        "How do I {a} inside the {b}?",
        "Where can I find documentation about {a} in {b}?",
        "Is there a limit on {a} for {b}?",
        "Do you offer training for {a} in {b}?",
    ],
}
_SLOTS = {
    "a": ["storage", "seats", "exports", "reviews", "labels", "archives",
          "webhooks", "templates", "reports", "filters", "versions", "tags"],
    "b": ["yesterday", "last week", "this morning", "during onboarding",
          "after the upgrade", "on mobile", "in the EU region", "at month end"],
}


class _VariedGenerator(BaseProvider):
    """Deterministic generator that emits label-carrying, lexically varied sentences."""

    name = "test-gen"
    capabilities: ClassVar[set[ProviderCapability]] = {
        ProviderCapability.TEXT_GENERATION,
        ProviderCapability.TEXT_CLASSIFICATION,
    }

    def list_available_models(self) -> list[str]:
        return ["test-gen-v1"]

    def annotate(self, request: ProviderRequest) -> ProviderResponse:  # pragma: no cover
        raise NotImplementedError

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        target = str((request.parameters or {}).get("target_class") or "billing")
        index = int((request.parameters or {}).get("index") or 0)
        templates = _TEMPLATES[target]
        template = templates[index % len(templates)]
        a = _SLOTS["a"][(index * 3 + len(target)) % len(_SLOTS["a"])]
        b = _SLOTS["b"][(index * 5 + 1) % len(_SLOTS["b"])]
        text = template.format(a=a, b=b)
        return ProviderResponse(
            payload={"text": text, "target_class": target},
            confidence=0.95,
            model=request.model or "test-gen-v1",
            usage=ProviderUsage(input_tokens=10, output_tokens=20, total_tokens=30),
        )


class _CollapsingGenerator(_VariedGenerator):
    """Emits one skeleton with different suffixes: must be rejected as template collapse."""

    name = "test-collapse"

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        target = str((request.parameters or {}).get("target_class") or "billing")
        index = int((request.parameters or {}).get("index") or 0)
        base = _TEMPLATES[target][0].format(a="storage", b="yesterday")
        return ProviderResponse(
            payload={"text": f"{base} [variant {index}]", "target_class": target},
            confidence=0.95,
            model="test-collapse-v1",
            usage=ProviderUsage(input_tokens=10, output_tokens=20, total_tokens=30),
        )


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def providers():
    gateway = ProviderGateway.get_instance()
    generator = _VariedGenerator()
    collapsing = _CollapsingGenerator()
    verifier = SimulatedEnsembleProvider("test-verifier", accuracy=0.97)
    for provider in (generator, collapsing, verifier):
        gateway.register_provider(provider)
    yield {"gen": generator.name, "collapse": collapsing.name, "verifier": verifier.name}
    for name in ("test-gen", "test-collapse", "test-verifier"):
        gateway._providers.pop(name, None)


def _dataset(client: TestClient) -> str:
    project = client.post("/api/v1/projects", json={"name": f"Gen {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "gen-target", "task_type": "text_classification", "label_schema": {"labels": LABELS},
    }).json()
    csv = "text,label,split\n" + "\n".join(
        f'"{text} #{index}","{label}","train"' for index, (text, label) in enumerate(GOLD_ROWS)
    ) + "\n"
    imported = client.post(f"/api/v1/datasets/{dataset['id']}/import/file",
                           files={"file": ("gold.csv", csv.encode(), "text/csv")}).json()
    assert imported["accepted_count"] == len(GOLD_ROWS), imported
    return dataset["id"]


def test_gated_generation_persists_accepted_batch_with_lineage(client, providers):
    dsid = _dataset(client)
    response = client.post(f"/api/v1/datasets/{dsid}/generate-gated", json={
        "provider": providers["gen"],
        "model": "test-gen-v1",
        "verifier_providers": [{"provider": providers["verifier"], "model": "test-verifier-classifier-v1"}],
        "per_class": 4,
        "max_class_share": 0.6,
        "min_label_preservation": 0.8,
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["verdict"] == "accept", body
    assert body["accepted"] > 0
    assert body["accepted"] == len(body["record_ids"])
    assert body["label_preservation"] >= 0.8

    with get_db_session() as session:
        records = session.scalars(
            select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dsid)
        ).all()
        synthetic = [record for record in records if (record.extra_metadata or {}).get("synthetic")]
        assert len(synthetic) == body["accepted"]
        lineage = (synthetic[0].extra_metadata or {}).get("lineage") or {}
        assert lineage.get("generator") and lineage.get("intended_label")
        assert "batch_label_preservation" in lineage

        annotations = session.scalars(
            select(AnnotationModel).where(
                AnnotationModel.dataset_id == dsid,
                AnnotationModel.origin == AnnotationOrigin.SYNTHETIC.value,
            )
        ).all()
        assert len(annotations) == body["accepted"]
        assert {annotation.status for annotation in annotations} == {
            ReviewStatus.PENDING_REVIEW.value
        }
        # synthetic provenance is recorded
        sources = session.scalars(
            select(SourceRecordModel).join(
                DatasetRecordModel, DatasetRecordModel.id == SourceRecordModel.record_id
            ).where(DatasetRecordModel.dataset_id == dsid)
        ).all()
        assert any(source.source_type == "synthetic" for source in sources)

    # synthetic data must never be silently approved -> dataset is not publishable
    validation = client.post(f"/api/v1/datasets/{dsid}/validate").json()
    assert validation["is_publishable"] is False
    assert any(finding["rule_id"] == "RULE_UNRESOLVED_REVIEWS" for finding in validation["findings"])


def test_collapsing_generator_batch_is_rejected_and_writes_nothing(client, providers):
    dsid = _dataset(client)
    response = client.post(f"/api/v1/datasets/{dsid}/generate-gated", json={
        "provider": providers["collapse"],
        "model": "test-collapse-v1",
        "verifier_providers": [{"provider": providers["verifier"], "model": "test-verifier-classifier-v1"}],
        "per_class": 4,
        "max_class_share": 0.6,
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["verdict"] == "reject", body
    assert body["accepted"] == 0            # nothing admitted
    assert body["passed_filters"] > 0       # it passed lexical filters, then failed the batch gate
    assert body["record_ids"] == []
    assert any("collapse" in reason for reason in body["rejection_reasons"]), body

    with get_db_session() as session:
        records = session.scalars(
            select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dsid)
        ).all()
        assert not [record for record in records if (record.extra_metadata or {}).get("synthetic")]


def test_generation_without_verifier_fails_closed(client, providers):
    dsid = _dataset(client)
    response = client.post(f"/api/v1/datasets/{dsid}/generate-gated", json={
        "provider": providers["gen"],
        "model": "test-gen-v1",
        "per_class": 2,
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["verdict"] == "reject"
    assert "verifier" in " ".join(body["rejection_reasons"]).lower()


def test_generation_requires_editor_role(client, providers):
    dsid = _dataset(client)
    response = client.post(
        f"/api/v1/datasets/{dsid}/generate-gated",
        json={"provider": providers["gen"], "model": "test-gen-v1", "per_class": 2,
              "verifier_providers": [{"provider": providers["verifier"],
                                      "model": "test-verifier-classifier-v1"}]},
        headers={"X-User-Id": "intruder-tenant"},
    )
    assert response.status_code == 403, response.text
