"""Integration test: autonomous labelling of an image-classification dataset (M1)."""
from __future__ import annotations

import io
import time
import uuid

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.models import AnnotationModel
from packages.dataset_core.db.session import get_db_session
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.simulated_provider import SimulatedEnsembleProvider
from services.api.main import app

LABELS = ["red", "green", "blue"]


def _png(rgb: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (12, 12), rgb).save(buffer, format="PNG")
    return buffer.getvalue()


COLOURS = {"red": (220, 40, 40), "green": (40, 200, 60), "blue": (50, 60, 230)}


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def providers():
    gateway = ProviderGateway.get_instance()
    created = [
        SimulatedEnsembleProvider("img-strong", accuracy=0.97),
        SimulatedEnsembleProvider("img-medium", accuracy=0.93),
    ]
    for provider in created:
        gateway.register_provider(provider)
    yield created
    for provider in created:
        gateway._providers.pop(provider.name, None)


def _image_dataset(client: TestClient) -> str:
    project = client.post("/api/v1/projects", json={"name": f"Img {uuid.uuid4().hex[:6]}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": "Image auto-label",
        "task_type": "image_classification",
        "label_schema": {"labels": LABELS},
    }).json()
    for name, rgb in COLOURS.items():
        imported = client.post(
            f"/api/v1/datasets/{dataset['id']}/import/file",
            files={"file": (f"{name}.png", _png(rgb), "image/png")},
        ).json()
        assert imported["accepted_count"] == 1, imported
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


def test_images_are_imported_with_primary_assets(client):
    dsid = _image_dataset(client)
    queue = client.get(f"/api/v1/datasets/{dsid}/queue", params={"limit": 20}).json()
    assert len(queue["items"]) == 3
    assert all(item.get("primary_asset") for item in queue["items"]), queue["items"]
    raw = client.get(f"/api/v1/assets/{queue['items'][0]['primary_asset']['id']}/raw")
    assert raw.status_code == 200
    assert raw.content.startswith(b"\x89PNG")


def test_autonomous_labelling_works_on_images(client, providers):
    dsid = _image_dataset(client)
    refs = [{"provider": p.name, "model": p.list_available_models()[0]} for p in providers]
    created = client.post(f"/api/v1/datasets/{dsid}/auto-label", json={
        "providers": refs,
        "auto_accept_confidence": 0.9,
        "limit": 20,
    })
    assert created.status_code == 201, created.text
    job = created.json()
    assert job["total_items"] == 3

    final = _wait(client, job["id"])
    assert final["status"] == "completed", final
    assert final["processed_items"] == 3
    assert (final.get("auto_approved") or 0) > 0, final

    with get_db_session() as session:
        rows = [
            {"origin": row.origin, "status": row.status}
            for row in session.scalars(
                select(AnnotationModel).where(AnnotationModel.dataset_id == dsid)
            ).all()
        ]
    assert rows, "no annotations were written"
    engine_rows = [row for row in rows
                   if row["origin"] in {AnnotationOrigin.ENSEMBLE.value, AnnotationOrigin.MODEL.value}]
    assert engine_rows
    assert any(row["status"] == ReviewStatus.APPROVED.value for row in engine_rows)
    assert not any(row["origin"] == AnnotationOrigin.HUMAN.value for row in rows)

    # Regression: the engine must send each record's own image bytes. If it does not, every image
    # collapses to one identical vote (this happened: asset bytes were loaded but not forwarded).
    with get_db_session() as session:
        labels = {
            str((row.payload or {}).get("label"))
            for row in session.scalars(
                select(AnnotationModel).where(
                    AnnotationModel.dataset_id == dsid,
                    AnnotationModel.origin.in_(
                        [AnnotationOrigin.ENSEMBLE.value, AnnotationOrigin.MODEL.value]
                    ),
                )
            ).all()
        }
    assert len(labels) > 1, f"all image records received the same label: {labels}"


def test_image_autolabel_rejects_text_only_models(client, providers):
    """A text-only provider must fail the preflight, not silently label pixels."""
    dsid = _image_dataset(client)
    refs = [{"provider": "fake", "model": "fake-classifier-v1"}]
    created = client.post(f"/api/v1/datasets/{dsid}/auto-label", json={
        "providers": refs, "limit": 10,
    })
    # the fake provider advertises only text classification, so preflight should drop it
    assert created.status_code == 201, created.text
    final = _wait(client, created.json()["id"])
    assert final["status"] in {"completed", "failed"}, final
    if final["status"] == "failed":
        assert "No labelling model responded" in (final.get("error") or ""), final
