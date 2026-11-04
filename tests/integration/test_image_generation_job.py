"""Integration tests: bounded image-generation jobs (stub provider, no network, no cost)."""
from __future__ import annotations

import io
import time
import uuid
from typing import ClassVar

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from packages.image_generation.service import MAX_IMAGES_PER_RUN
from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderRequest,
    ProviderResponse,
    ProviderUsage,
)
from services.api.main import app

LABELS = ["red", "green", "blue"]


def _png(rgb: tuple[int, int, int], size: int = 24) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (size, size), rgb).save(buffer, format="PNG")
    return buffer.getvalue()


class _StubImageProvider(BaseProvider):
    """Deterministic offline image generator: one solid-colour PNG per class."""

    name = "stub-image"
    capabilities: ClassVar[set[ProviderCapability]] = {ProviderCapability.IMAGE_GENERATION}
    colours: ClassVar[dict[str, tuple[int, int, int]]] = {
        "red": (220, 40, 40), "green": (40, 200, 60), "blue": (50, 60, 230),
    }

    def list_available_models(self) -> list[str]:
        return ["stub-image-v1"]

    def annotate(self, request: ProviderRequest):  # pragma: no cover - not used
        raise NotImplementedError

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        label = str((request.parameters or {}).get("label") or "red")
        variation = int((request.parameters or {}).get("variation") or 1)
        rgb = self.colours.get(label, (128, 128, 128))
        shifted = tuple(min(255, channel + variation * 2 % 20) for channel in rgb)
        return ProviderResponse(
            payload={
                "image_bytes": _png(shifted),
                "mime_type": "image/png",
                "prompt": str((request.parameters or {}).get("prompt") or ""),
                "priced": False,
            },
            confidence=1.0,
            model="stub-image-v1",
            usage=ProviderUsage(estimated_cost_usd=0.0),
        )


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def stub_provider():
    gateway = ProviderGateway.get_instance()
    provider = _StubImageProvider()
    gateway.register_provider(provider)
    yield provider
    gateway._providers.pop(provider.name, None)


def _dataset(client: TestClient) -> str:
    project = client.post("/api/v1/projects", json={"name": f"ImgGen {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "Generated images",
        "task_type": "image_classification",
        "label_schema": {"labels": LABELS},
    }).json()
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


def test_image_generation_job_creates_records_assets_and_annotations(client, stub_provider):
    dsid = _dataset(client)
    created = client.post(f"/api/v1/datasets/{dsid}/generate-images", json={
        "prompt": "a simple flat illustration of a geometric shape",
        "count": 6,
        "provider": "stub-image",
        "model": "stub-image-v1",
        "quality": "low",
        "style": "minimal",
    })
    assert created.status_code == 201, created.text
    job = created.json()
    assert job["kind"] == "image_generation"
    assert job["total_items"] == 6

    final = _wait(client, job["id"])
    assert final["status"] == "completed", final
    assert final["accepted"] == 6
    assert final["processed_items"] == 6
    assert final["priced"] is False  # stub reports no price

    queue = client.get(f"/api/v1/datasets/{dsid}/queue", params={"limit": 20}).json()
    assert len(queue["items"]) == 6
    labels = {(item.get("metadata") or {}).get("label") for item in queue["items"]}
    assert labels == set(LABELS)
    for item in queue["items"]:
        assert item["metadata"].get("synthetic") is True
        assert item["review_status"] == "pending_review"
        asset = item.get("primary_asset")
        assert asset, item
        raw = client.get(f"/api/v1/assets/{asset['id']}/raw")
        assert raw.status_code == 200
        assert raw.content.startswith(b"\x89PNG")


def test_image_generation_cap_is_enforced_server_side(client, stub_provider):
    dsid = _dataset(client)
    response = client.post(f"/api/v1/datasets/{dsid}/generate-images", json={
        "prompt": "anything",
        "count": MAX_IMAGES_PER_RUN + 1,
        "provider": "stub-image",
        "model": "stub-image-v1",
    })
    assert response.status_code == 422, response.text
    # Either the clean domain envelope or FastAPI field validation is acceptable; both name 25.
    assert str(MAX_IMAGES_PER_RUN) in response.text, response.text


def test_image_generation_requires_image_capability(client):
    dsid = _dataset(client)
    response = client.post(f"/api/v1/datasets/{dsid}/generate-images", json={
        "prompt": "anything", "count": 2, "provider": "fake", "model": "fake-text-generator-v1",
    })
    assert response.status_code == 201
    assert (response.json().get("error") or {}).get("code") == "CAPABILITY_NOT_SUPPORTED"


def test_image_generation_requires_editor_role(client, stub_provider):
    dsid = _dataset(client)
    response = client.post(
        f"/api/v1/datasets/{dsid}/generate-images",
        json={"prompt": "anything", "count": 1, "provider": "stub-image", "model": "stub-image-v1"},
        headers={"X-User-Id": "intruder-tenant"},
    )
    assert response.status_code == 403, response.text


def test_image_generation_refuses_non_image_dataset(client, stub_provider):
    project = client.post("/api/v1/projects", json={"name": f"Text {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "text ds", "task_type": "text_classification", "label_schema": {"labels": ["a", "b"]},
    }).json()
    response = client.post(f"/api/v1/datasets/{dataset['id']}/generate-images", json={
        "prompt": "anything", "count": 1, "provider": "stub-image", "model": "stub-image-v1",
    })
    assert response.status_code == 422, response.text


def test_detection_dataset_generation_creates_unannotated_base_images(client, stub_provider):
    """Detection runs generate pixels only; boxes are drawn by a human afterwards."""
    project = client.post("/api/v1/projects", json={"name": f"DetGen {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "Bottle inspection base images",
        "task_type": "object_detection",
        "label_schema": {"labels": ["bottle", "label"]},
    }).json()
    created = client.post(f"/api/v1/datasets/{dataset['id']}/generate-images", json={
        "prompt": "A photo of a bottle in a factory inspection line",
        "count": 3,
        "provider": "stub-image",
        "model": "stub-image-v1",
        "quality": "low",
    })
    assert created.status_code == 201, created.text
    final = _wait(client, created.json()["id"])
    assert final["status"] == "completed", final
    assert final["accepted"] == 3

    queue = client.get(f"/api/v1/datasets/{dataset['id']}/queue", params={"limit": 10}).json()
    assert len(queue["items"]) == 3
    for item in queue["items"]:
        assert item.get("primary_asset"), item
        # no annotation was fabricated: detection requires human/detector boxes
        assert item.get("annotation_payload") in (None, {}), item.get("annotation_payload")
        assert item.get("review_status") in {None, "unannotated"}, item.get("review_status")
