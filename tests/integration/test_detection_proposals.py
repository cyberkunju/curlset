"""Integration: AI box proposals on an object-detection dataset (fake SAM provider, no cost)."""
from __future__ import annotations

import io
import time
import uuid
from typing import Any, ClassVar

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.models import AnnotationModel
from packages.dataset_core.db.session import get_db_session
from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderRequest,
    ProviderResponse,
    ProviderUsage,
)
from services.api.main import app


def _png(rgb=(200, 30, 30), size: int = 64) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (size, size), rgb).save(buffer, format="PNG")
    return buffer.getvalue()


class _FakeSamProvider(BaseProvider):
    """Deterministic boxes; can be configured to return none for the 'missing' concept."""

    name = "fake-sam"
    capabilities: ClassVar[set[ProviderCapability]] = {ProviderCapability.OBJECT_DETECTION}
    empty_for: ClassVar[set[str]] = set()

    def list_available_models(self) -> list[str]:
        return ["fake-sam-v1"]

    def annotate(self, request: ProviderRequest):  # pragma: no cover
        raise NotImplementedError

    def detect(self, request: ProviderRequest) -> ProviderResponse:
        concept = str((request.parameters or {}).get("concept") or "")
        if concept in self.empty_for:
            return ProviderResponse(payload={"boxes": [], "concept": concept}, model="fake-sam-v1")
        boxes: list[dict[str, Any]] = [
            {"x": 10, "y": 12, "width": 30, "height": 20, "confidence": 0.9,
             "frame": {"width": 64, "height": 64}, "object_id": 1, "frame_index": 0},
            {"x": 40, "y": 30, "width": 15, "height": 15, "confidence": None,
             "frame": {"width": 64, "height": 64}, "object_id": 2, "frame_index": 0},
        ]
        return ProviderResponse(
            payload={"boxes": boxes, "concept": concept, "model": "fake-sam-v1"},
            model="fake-sam-v1",
            usage=ProviderUsage(),
        )


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


class _ImageGenOnlyProvider(BaseProvider):
    name = "stub-image"
    capabilities: ClassVar[set[ProviderCapability]] = {ProviderCapability.IMAGE_GENERATION}

    def list_available_models(self) -> list[str]:
        return ["stub-image-v1"]

    def annotate(self, request: ProviderRequest):  # pragma: no cover
        raise NotImplementedError

    def generate(self, request: ProviderRequest) -> ProviderResponse:  # pragma: no cover
        raise NotImplementedError


@pytest.fixture()
def fake_sam():
    gateway = ProviderGateway.get_instance()
    provider = _FakeSamProvider()
    gateway.register_provider(provider)
    yield provider
    gateway._providers.pop(provider.name, None)


def _detection_dataset(client: TestClient, images: int = 3) -> str:
    project = client.post("/api/v1/projects", json={"name": f"Proposals {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "Box proposals",
        "task_type": "object_detection",
        "label_schema": {"labels": ["apple"]},
    }).json()
    for index in range(images):
        client.post(
            f"/api/v1/datasets/{dataset['id']}/import/file",
            files={"file": (f"img-{index}.png", _png((40 + index * 20, 20, 20)), "image/png")},
        )
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


def test_proposals_create_model_annotations_at_pending_review(client, fake_sam):
    dsid = _detection_dataset(client)
    created = client.post(f"/api/v1/datasets/{dsid}/proposals/detect", json={
        "concepts": ["apple"], "provider": "fake-sam", "model": "fake-sam-v1", "limit": 3,
    })
    assert created.status_code == 201, created.text
    job = created.json()
    assert job["kind"] == "detection_proposals"
    assert job["total_items"] == 3

    final = _wait(client, job["id"])
    assert final["status"] == "completed", final
    assert final["accepted"] == 3, final
    assert final["boxes"] == 6, final

    with get_db_session() as session:
        rows = [
            {"origin": row.origin, "status": row.status, "payload": row.payload}
            for row in session.scalars(
                select(AnnotationModel).where(AnnotationModel.dataset_id == dsid)
            ).all()
        ]
    assert len(rows) == 3
    for row in rows:
        assert row["origin"] == AnnotationOrigin.MODEL.value
        assert row["status"] == ReviewStatus.PENDING_REVIEW.value
        payload = row["payload"]
        assert payload["coordinate_system"] == "pixel-intrinsic"
        assert payload["image_dimensions"] == {"width": 64, "height": 64}
        assert len(payload["boxes"]) == 2
        for box in payload["boxes"]:
            assert box["label"] == "apple"
            assert 0 <= box["x"] < 64 and 0 <= box["y"] < 64
            assert box["x"] + box["w"] <= 64 and box["y"] + box["h"] <= 64

    # proposals are not approved: the queue shows pending review
    queue = client.get(f"/api/v1/datasets/{dsid}/queue", params={"limit": 10}).json()
    assert all(item["review_status"] == "pending_review" for item in queue["items"])


def test_zero_matches_leave_records_unannotated(client, fake_sam):
    dsid = _detection_dataset(client, images=2)
    fake_sam.empty_for = {"apple"}
    try:
        job = client.post(f"/api/v1/datasets/{dsid}/proposals/detect", json={
            "concepts": ["apple"], "provider": "fake-sam", "model": "fake-sam-v1", "limit": 2,
        }).json()
        final = _wait(client, job["id"])
    finally:
        fake_sam.empty_for = set()
    assert final["status"] == "completed", final
    assert final["accepted"] == 0
    assert final["empty"] == 2
    with get_db_session() as session:
        assert session.scalars(
            select(AnnotationModel).where(AnnotationModel.dataset_id == dsid)
        ).all() == []


def test_proposals_require_detection_capability_and_object_detection_task(client, fake_sam):
    project = client.post("/api/v1/projects", json={"name": f"Wrong {uuid.uuid4().hex[:6]}"}).json()
    text_ds = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "text", "task_type": "text_classification", "label_schema": {"labels": ["a"]},
    }).json()
    response = client.post(f"/api/v1/datasets/{text_ds['id']}/proposals/detect", json={
        "concepts": ["apple"], "provider": "fake-sam", "model": "fake-sam-v1",
    })
    assert response.status_code == 422, response.text

    dsid = _detection_dataset(client, images=1)
    from packages.provider_gateway.gateway import ProviderGateway as _Gateway

    _Gateway.get_instance().register_provider(_ImageGenOnlyProvider())
    response = client.post(f"/api/v1/datasets/{dsid}/proposals/detect", json={
        "concepts": ["apple"], "provider": "stub-image", "model": "stub-image-v1",
    })
    assert response.status_code == 201
    assert (response.json().get("error") or {}).get("code") == "CAPABILITY_NOT_SUPPORTED"


def test_proposals_require_editor_role(client, fake_sam):
    dsid = _detection_dataset(client, images=1)
    response = client.post(
        f"/api/v1/datasets/{dsid}/proposals/detect",
        json={"concepts": ["apple"], "provider": "fake-sam", "model": "fake-sam-v1"},
        headers={"X-User-Id": "intruder-tenant"},
    )
    assert response.status_code == 403, response.text
