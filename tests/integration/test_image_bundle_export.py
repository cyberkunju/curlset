"""Integration: image-bundle export is complete, deterministic and re-importable."""
from __future__ import annotations

import io
import json
import time
import uuid
import zipfile
from typing import ClassVar

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderRequest,
    ProviderResponse,
    ProviderUsage,
)
from services.api.main import app

LABELS = ["red", "green"]
COLOURS = {"red": (220, 40, 40), "green": (40, 200, 60)}


def _png(rgb: tuple[int, int, int], size: int = 20) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (size, size), rgb).save(buffer, format="PNG")
    return buffer.getvalue()


class _StubImageProvider(BaseProvider):
    name = "bundle-stub-image"
    capabilities: ClassVar[set[ProviderCapability]] = {ProviderCapability.IMAGE_GENERATION}

    def list_available_models(self) -> list[str]:
        return ["bundle-stub-image-v1"]

    def annotate(self, request: ProviderRequest):  # pragma: no cover
        raise NotImplementedError

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        label = str((request.parameters or {}).get("label") or "red")
        variation = int((request.parameters or {}).get("variation") or 1)
        base = COLOURS.get(label, (128, 128, 128))
        rgb = tuple(min(255, channel + (variation * 3) % 15) for channel in base)
        return ProviderResponse(
            payload={"image_bytes": _png(rgb), "mime_type": "image/png", "priced": False},
            confidence=1.0,
            model="bundle-stub-image-v1",
            usage=ProviderUsage(),
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


def _wait(client: TestClient, job_id: str, timeout: float = 60.0) -> dict:
    deadline = time.time() + timeout
    job: dict = {}
    while time.time() < deadline:
        job = client.get(f"/api/v1/generate/jobs/{job_id}").json()
        if job.get("status") in {"completed", "failed", "cancelled", "interrupted"}:
            return job
        time.sleep(0.05)
    return job


def _make_image_dataset_with_version(client: TestClient) -> tuple[str, str]:
    project = client.post("/api/v1/projects", json={"name": f"Bundle {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "Bundle dataset",
        "task_type": "image_classification",
        "label_schema": {"labels": LABELS},
    }).json()
    job = client.post(f"/api/v1/datasets/{dataset['id']}/generate-images", json={
        "prompt": "a flat colour square",
        "count": 4,
        "provider": "bundle-stub-image",
        "model": "bundle-stub-image-v1",
        "quality": "low",
    }).json()
    final = _wait(client, job["id"])
    assert final["status"] == "completed" and final["accepted"] == 4, final

    queue = client.get(f"/api/v1/datasets/{dataset['id']}/queue", params={"limit": 20}).json()
    record_ids = [item["id"] for item in queue["items"]]
    approval = client.post(f"/api/v1/datasets/{dataset['id']}/review/bulk", json={
        "record_ids": record_ids, "action": "approve", "reason": "bundle test",
    })
    assert approval.status_code == 200, approval.text
    version = client.post(f"/api/v1/datasets/{dataset['id']}/versions", json={"version_tag": "1.0.0"})
    assert version.status_code == 200, version.text
    return dataset["id"], version.json()["id"]


def test_image_bundle_contains_images_labels_and_provenance(client, stub_provider):
    dataset_id, version_id = _make_image_dataset_with_version(client)
    export = client.post(f"/api/v1/versions/{version_id}/exports", json={"format": "image_bundle"})
    assert export.status_code in (200, 201), export.text
    artifact = export.json()

    archive_bytes = client.get(f"/api/v1/exports/{artifact['id']}/download").content
    archive = zipfile.ZipFile(io.BytesIO(archive_bytes))
    names = archive.namelist()

    image_names = sorted(name for name in names if name.startswith("images/") and name != "images/README.md")
    assert len(image_names) == 4, names
    assert "labels.jsonl" in names and "labels.csv" in names
    assert "manifest.json" in names and "README.md" in names
    assert "images/README.md" in names

    rows = [json.loads(line) for line in archive.read("labels.jsonl").decode("utf-8").splitlines() if line]
    assert len(rows) == 4
    source_queue = client.get(f"/api/v1/datasets/{dataset_id}/queue", params={"limit": 20}).json()
    source_labels = sorted((item.get("metadata") or {}).get("label") for item in source_queue["items"])
    assert sorted(row["label"] for row in rows) == source_labels
    for row in rows:
        assert row["image"] in image_names
        # generated records are synthetic; the bundle must never claim human provenance
        assert row["annotation_origin"] in {"synthetic", "model", "ensemble"}, row
        assert row["review_status"] == "approved"
        assert row["asset_sha256"] and len(row["asset_sha256"]) == 64
        assert row["width"] == 20 and row["height"] == 20
        payload = archive.read(row["image"])
        import hashlib

        assert hashlib.sha256(payload).hexdigest() == row["asset_sha256"]


def test_image_bundle_is_byte_deterministic(client, stub_provider):
    _, version_id = _make_image_dataset_with_version(client)
    first = client.post(f"/api/v1/versions/{version_id}/exports", json={"format": "image_bundle"}).json()
    second = client.post(f"/api/v1/versions/{version_id}/exports", json={"format": "image_bundle"}).json()
    assert first["sha256"] == second["sha256"]


def test_image_bundle_round_trips_into_a_new_dataset(client, stub_provider):
    _, version_id = _make_image_dataset_with_version(client)
    artifact = client.post(f"/api/v1/versions/{version_id}/exports", json={"format": "image_bundle"}).json()
    archive = zipfile.ZipFile(io.BytesIO(client.get(f"/api/v1/exports/{artifact['id']}/download").content))
    rows = [json.loads(line) for line in archive.read("labels.jsonl").decode("utf-8").splitlines() if line]

    project = client.post("/api/v1/projects", json={"name": f"Reimport {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "Reimported bundle",
        "task_type": "image_classification",
        "label_schema": {"labels": LABELS},
    }).json()
    for row in rows:
        payload = archive.read(row["image"])
        imported = client.post(
            f"/api/v1/datasets/{dataset['id']}/import/file",
            files={"file": (row["image"].split("/")[-1], payload, "image/png")},
        ).json()
        assert imported["accepted_count"] == 1, imported
        record_id = imported["accepted_items"][0]["record_id"]
        annotation = client.post(f"/api/v1/records/{record_id}/annotations", json={
            "payload": {"label": row["label"]},
        })
        assert annotation.status_code == 201, annotation.text
        approved = client.post(f"/api/v1/annotations/{annotation.json()['id']}/transition", json={
            "next_status": "approved", "reason": "reimported from bundle labels",
        })
        assert approved.status_code == 200, approved.text

    reimported = client.get(f"/api/v1/datasets/{dataset['id']}/queue", params={"limit": 20}).json()
    assert len(reimported["items"]) == 4
    reimported_labels = sorted(
        (item.get("annotation_payload") or {}).get("label") for item in reimported["items"]
    )
    assert reimported_labels == sorted(row["label"] for row in rows)
    validation = client.post(f"/api/v1/datasets/{dataset['id']}/validate").json()
    assert validation["is_publishable"] is True, validation


def test_image_bundle_rejects_dataset_without_images(client, stub_provider):
    project = client.post("/api/v1/projects", json={"name": f"TextOnly {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "text only", "task_type": "text_classification", "label_schema": {"labels": ["a", "b"]},
    }).json()
    dataset = client.post(f"/api/v1/datasets/{dataset['id']}/import/file", files={
        "file": ("rows.csv", b"text,label\nhello,a\nworld,b\n", "text/csv"),
    }).json()
    queue = client.get(f"/api/v1/datasets/{dataset['dataset_id']}/queue", params={"limit": 10}).json()
    record_ids = [item["id"] for item in queue["items"]]
    client.post(f"/api/v1/datasets/{dataset['dataset_id']}/review/bulk", json={
        "record_ids": record_ids, "action": "approve", "reason": "text",
    })
    version = client.post(f"/api/v1/datasets/{dataset['dataset_id']}/versions", json={})
    assert version.status_code == 200, version.text
    export = client.post(f"/api/v1/versions/{version.json()['id']}/exports", json={"format": "image_bundle"})
    assert export.status_code == 422, export.text
    assert "no image assets" in export.text.lower()
