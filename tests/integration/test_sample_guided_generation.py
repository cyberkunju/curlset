"""Integration tests for sample-guided generation: upload analysis -> job -> generator guidance."""
from __future__ import annotations

import time
import uuid
from typing import Any, ClassVar

import pytest
from fastapi.testclient import TestClient

from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderRequest,
    ProviderResponse,
    ProviderUsage,
)
from services.api.main import app

CSV = (
    "text,label\n"
    "I was charged twice,billing\n"
    "The app crashes on export,technical_support\n"
    "Please refund my invoice,billing\n"
)


class _RecordingGenerator(BaseProvider):
    """Generates label-carrying text and records the guidance it was given."""

    name = "recording-gen"
    capabilities: ClassVar[set[ProviderCapability]] = {
        ProviderCapability.TEXT_GENERATION,
        ProviderCapability.TEXT_CLASSIFICATION,
    }

    def __init__(self) -> None:
        self.seen: list[dict[str, Any]] = []

    def list_available_models(self) -> list[str]:
        return ["recording-gen-v1"]

    def annotate(self, request: ProviderRequest):  # pragma: no cover - not used
        raise NotImplementedError

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        parameters = dict(request.parameters or {})
        self.seen.append(parameters)
        target = str(parameters.get("target_class") or "billing")
        index = int(parameters.get("index") or 0)
        style = str(parameters.get("style_hint") or "")
        text = (
            f"Invoice issue number {index} about {target}. The billing statement was charged twice. "
            f"This example illustrates {target}."
        )
        if style:
            text += f" ({style[:20]})"
        return ProviderResponse(
            payload={"text": text, "target_class": target},
            confidence=0.9,
            model="recording-gen-v1",
            usage=ProviderUsage(input_tokens=20, output_tokens=20, total_tokens=40),
        )


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def generator():
    gateway = ProviderGateway.get_instance()
    provider = _RecordingGenerator()
    gateway.register_provider(provider)
    yield provider
    gateway._providers.pop("recording-gen", None)


def test_analyze_sample_returns_detection_and_prefilled_plan(client):
    response = client.post(
        "/api/v1/generate/analyze-sample",
        files={"file": ("sample.csv", CSV.encode(), "text/csv")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["modality"] == "text"
    assert body["row_count"] == 3
    assert body["classes"] == ["billing", "technical_support"]
    assert body["text_column"] == "text"
    assert body["label_column"] == "label"
    assert body["style_hint"]
    assert body["samples"]

    plan = body["plan"]
    assert plan["classes"] == ["billing", "technical_support"]
    assert plan["suggested_total"] >= 50
    assert [question["id"] for question in plan["questions"]] == ["count", "classes", "difficulty"]
    assert any("change anything" in note.lower() for note in plan["notes"])


def test_analyze_sample_accepts_images_with_honest_note(client):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40
    response = client.post(
        "/api/v1/generate/analyze-sample",
        files={"file": ("photo.png", png, "image/png")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["modality"] == "image"
    assert any("not reproduce" in note.lower() for note in body["notes"])


def test_job_passes_sample_guidance_to_the_generator(client, generator):
    created = client.post("/api/v1/generate/jobs", json={
        "prompt": "tickets like the uploaded sample",
        "classes": ["billing", "technical_support"],
        "per_class": 2,
        "provider": "recording-gen",
        "model": "recording-gen-v1",
        "min_label_preservation": 0.5,
        "style_hint": "short sentences (~4 words each)",
        "seed_examples": ["I was charged twice", "The app crashes on export"],
        "description": "support tickets",
        "dataset_name": f"From sample {uuid.uuid4().hex[:5]}",
    })
    assert created.status_code == 201, created.text
    job = created.json()

    deadline = time.time() + 30
    final = job
    while time.time() < deadline:
        final = client.get(f"/api/v1/generate/jobs/{job['id']}").json()
        if final["status"] in {"completed", "failed", "cancelled"}:
            break
        time.sleep(0.05)

    assert final["status"] == "completed", final
    assert generator.seen, "generator was never called"
    first = generator.seen[0]
    assert first["style_hint"] == "short sentences (~4 words each)"
    assert first["seed_examples"] == ["I was charged twice", "The app crashes on export"]
    assert first["difficulty"] == "mixed"
    assert first["labels"] == ["billing", "technical_support"]
    assert first["description"] == "support tickets"
