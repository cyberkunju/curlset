"""
Integration tests for Phase 9: Object Detection, Geometry Validation,
COCO JSON Exporter, and YOLO Dataset Exporter.
"""
import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from packages.dataset_core.constants import TaskType
from packages.dataset_core.db.session import get_db_session, init_database
from packages.dataset_core.exceptions import DomainValidationError
from packages.dataset_core.services.record_service import RecordService
from packages.dataset_core.task_schemas import validate_annotation_payload
from packages.dataset_io.storage import get_storage_backend
from services.api.main import app

client = TestClient(app)


def setup_function():
    init_database()


def test_object_detection_geometry_validation():
    label_schema = {"classes": ["vehicle", "person"]}

    # 1. Valid box coordinates
    valid_payload = {
        "boxes": [
            {"label": "vehicle", "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4},
            {"label": "person", "x": 50, "y": 60, "w": 30, "h": 80},
        ]
    }
    validate_annotation_payload(
        TaskType.OBJECT_DETECTION, payload=valid_payload, label_schema=label_schema
    )

    # 2. Reject negative coordinates
    with pytest.raises(DomainValidationError) as exc1:
        validate_annotation_payload(
            TaskType.OBJECT_DETECTION,
            payload={"boxes": [{"label": "vehicle", "x": -5, "y": 10, "w": 20, "h": 20}]},
            label_schema=label_schema,
        )
    assert "cannot be negative" in str(exc1.value)

    # 3. Reject zero or negative dimensions (degenerate boxes)
    with pytest.raises(DomainValidationError) as exc2:
        validate_annotation_payload(
            TaskType.OBJECT_DETECTION,
            payload={"boxes": [{"label": "vehicle", "x": 10, "y": 10, "w": 0, "h": 20}]},
            label_schema=label_schema,
        )
    assert "invalid non-positive dimensions" in str(exc2.value)


def test_object_detection_coco_and_yolo_exports():
    # 1. Create project and dataset
    p_resp = client.post("/api/v1/projects", json={"name": "OD Project"})
    assert p_resp.status_code == 201
    project_id = p_resp.json()["id"]

    d_resp = client.post(
        f"/api/v1/projects/{project_id}/datasets",
        json={
            "name": "Traffic Scene",
            "task_type": "object_detection",
            "label_schema": {"classes": ["car", "pedestrian"]},
        },
    )
    assert d_resp.status_code == 201
    dataset_id = d_resp.json()["id"]

    # 2. Add record with image asset
    storage = get_storage_backend()
    dummy_img = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00" + b"\x00" * 300
    storage.write_bytes(f"assets/{dataset_id}/img_01.jpg", dummy_img)

    with get_db_session() as session:
        rec = RecordService.create_record(
            session, dataset_id=dataset_id, split="train", external_key="traffic_01"
        )
        asset = RecordService.create_asset(
            session,
            dataset_id=dataset_id,
            storage_key=f"assets/{dataset_id}/img_01.jpg",
            modality="image",
            mime_type="image/jpeg",
            byte_size=len(dummy_img),
            sha256="c" * 64,
            original_filename="traffic_01.jpg",
            dimensions={"width": 640, "height": 480},
        )
        RecordService.link_asset_to_record(session, record_id=rec.id, asset_id=asset.id)
        session.commit()
        record_id = rec.id

    # 3. Add approved bounding boxes
    ann_payload = {
        "boxes": [
            {"label": "car", "x": 100, "y": 150, "w": 200, "h": 120},
            {"label": "pedestrian", "x": 350, "y": 180, "w": 40, "h": 100},
        ]
    }
    client.post(
        f"/api/v1/records/{record_id}/annotations",
        json={"payload": ann_payload, "status": "approved"},
    )

    # 4. Freeze Version Snapshot
    v_resp = client.post(
        f"/api/v1/datasets/{dataset_id}/versions",
        json={"version_tag": "v1.0.0"},
    )
    assert v_resp.status_code == 200
    version_id = v_resp.json()["id"]

    # 5. COCO Export Test
    coco_resp = client.post(f"/api/v1/versions/{version_id}/exports", json={"format": "coco"})
    assert coco_resp.status_code == 200
    coco_art = coco_resp.json()
    assert coco_art["format"] == "coco"

    dl_coco = client.get(f"/api/v1/exports/{coco_art['id']}/download")
    assert dl_coco.status_code == 200
    with zipfile.ZipFile(io.BytesIO(dl_coco.content)) as zf:
        assert "annotations/instances_default.json" in zf.namelist()
        coco_data = json.loads(zf.read("annotations/instances_default.json").decode("utf-8"))

        assert len(coco_data["categories"]) == 2
        assert len(coco_data["images"]) == 1
        assert len(coco_data["annotations"]) == 2

        # Check category mapping
        cat_names = [c["name"] for c in coco_data["categories"]]
        assert "car" in cat_names
        assert "pedestrian" in cat_names

        # Check box area and coordinates
        b1 = coco_data["annotations"][0]
        assert b1["bbox"] == [100.0, 150.0, 200.0, 120.0]
        assert b1["area"] == 24000.0

    # 6. YOLO Export Test
    yolo_resp = client.post(f"/api/v1/versions/{version_id}/exports", json={"format": "yolo"})
    assert yolo_resp.status_code == 200
    yolo_art = yolo_resp.json()
    assert yolo_art["format"] == "yolo"

    dl_yolo = client.get(f"/api/v1/exports/{yolo_art['id']}/download")
    assert dl_yolo.status_code == 200
    with zipfile.ZipFile(io.BytesIO(dl_yolo.content)) as zf:
        namelist = zf.namelist()
        assert "data.yaml" in namelist
        assert "labels/train/traffic_01.txt" in namelist

        yaml_content = zf.read("data.yaml").decode("utf-8")
        assert "nc: 2" in yaml_content
        assert "0: car" in yaml_content
        assert "1: pedestrian" in yaml_content

        txt_lines = zf.read("labels/train/traffic_01.txt").decode("utf-8").strip().split("\n")
        assert len(txt_lines) == 2
        # Verify YOLO format: <class_idx> <x_c> <y_c> <w> <h>
        parts = txt_lines[0].split()
        assert len(parts) == 5
        assert parts[0] == "0"
        for val in parts[1:]:
            assert 0.0 <= float(val) <= 1.0
