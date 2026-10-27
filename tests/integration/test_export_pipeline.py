"""
Integration tests for Phase 8: Training-ready reproducible dataset exports
(CSV, JSONL, Manifest bundling, ZIP distribution, and download).
"""
import io
import json
import zipfile

from fastapi.testclient import TestClient

from packages.dataset_core.db.session import get_db_session, init_database
from packages.dataset_core.services.record_service import RecordService
from services.api.main import app

client = TestClient(app)


def setup_function():
    init_database()


def test_export_pipeline_csv_and_jsonl_round_trip():
    # 1. Setup project and dataset
    p_resp = client.post("/api/v1/projects", json={"name": "Export Test Project"})
    assert p_resp.status_code == 201
    project_id = p_resp.json()["id"]

    d_resp = client.post(
        f"/api/v1/projects/{project_id}/datasets",
        json={
            "name": "Exportable Corpus",
            "task_type": "text_classification",
            "label_schema": {"labels": ["tech", "sports"]},
        },
    )
    assert d_resp.status_code == 201
    dataset_id = d_resp.json()["id"]

    # 2. Add approved records
    with get_db_session() as session:
        r1 = RecordService.create_record(
            session, dataset_id=dataset_id, split="train", metadata={"text": "Deep learning models."}
        )
        r2 = RecordService.create_record(
            session, dataset_id=dataset_id, split="test", metadata={"text": "Championship match."}
        )
        session.commit()
        r1_id = r1.id
        r2_id = r2.id

    client.post(f"/api/v1/records/{r1_id}/annotations", json={"payload": {"label": "tech"}, "status": "approved"})
    client.post(f"/api/v1/records/{r2_id}/annotations", json={"payload": {"label": "sports"}, "status": "approved"})

    # 3. Publish Version v1.0.0
    v_resp = client.post(f"/api/v1/datasets/{dataset_id}/versions", json={"version_tag": "v1.0.0"})
    assert v_resp.status_code == 200
    version_id = v_resp.json()["id"]

    # 4. Trigger CSV Export
    csv_exp_resp = client.post(f"/api/v1/versions/{version_id}/exports", json={"format": "csv"})
    assert csv_exp_resp.status_code == 200
    csv_art = csv_exp_resp.json()
    assert csv_art["format"] == "csv"
    assert csv_art["record_count"] == 2
    assert len(csv_art["sha256"]) == 64
    assert csv_art["byte_size"] > 0
    csv_art_id = csv_art["id"]

    # 5. Download and Inspect CSV ZIP Archive
    dl_csv = client.get(f"/api/v1/exports/{csv_art_id}/download")
    assert dl_csv.status_code == 200
    assert dl_csv.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(dl_csv.content)) as zf:
        namelist = zf.namelist()
        assert "data.csv" in namelist
        assert "manifest.json" in namelist
        assert "README.md" in namelist

        csv_content = zf.read("data.csv").decode("utf-8")
        assert "record_id,split,external_key,text,label,origin,confidence" in csv_content
        assert r1_id in csv_content
        assert "tech" in csv_content
        assert "Deep learning models." in csv_content

        manifest_content = json.loads(zf.read("manifest.json").decode("utf-8"))
        assert manifest_content["version_id"] == version_id
        assert manifest_content["record_count"] == 2

    # 6. Trigger JSONL Export
    jsonl_exp_resp = client.post(f"/api/v1/versions/{version_id}/exports", json={"format": "jsonl"})
    assert jsonl_exp_resp.status_code == 200
    jsonl_art = jsonl_exp_resp.json()
    assert jsonl_art["format"] == "jsonl"
    jsonl_art_id = jsonl_art["id"]

    # 7. Download and Inspect JSONL ZIP Archive
    dl_jsonl = client.get(f"/api/v1/exports/{jsonl_art_id}/download")
    assert dl_jsonl.status_code == 200

    with zipfile.ZipFile(io.BytesIO(dl_jsonl.content)) as zf:
        assert "data.jsonl" in zf.namelist()
        jsonl_lines = zf.read("data.jsonl").decode("utf-8").strip().split("\n")
        assert len(jsonl_lines) == 2
        line1 = json.loads(jsonl_lines[0])
        assert "record_id" in line1
        assert "annotation" in line1
        assert line1["annotation"]["payload"]["label"] in ("tech", "sports")

    # 8. List exports for version
    list_resp = client.get(f"/api/v1/versions/{version_id}/exports")
    assert list_resp.status_code == 200
    exports_list = list_resp.json()
    assert len(exports_list) >= 2

    # 9. Test Invalid format returns 422
    bad_resp = client.post(f"/api/v1/versions/{version_id}/exports", json={"format": "unsupported_xyz"})
    assert bad_resp.status_code == 422
