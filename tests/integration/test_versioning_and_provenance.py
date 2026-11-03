"""
Integration tests for Phase 7: Dataset Versioning, Provenance Tracking,
Cryptographic Manifests, Dataset Cards, and Snapshot Immutability.
"""
from fastapi.testclient import TestClient

from packages.dataset_core.db.session import get_db_session, init_database
from services.api.main import app

client = TestClient(app)


def setup_function():
    init_database()


def test_versioning_blocks_on_unreviewed_records_and_publishes_when_approved():
    # 1. Create project and dataset
    p_resp = client.post("/api/v1/projects", json={"name": "Versioning Test Project"})
    assert p_resp.status_code == 201
    project_id = p_resp.json()["id"]

    d_resp = client.post(
        f"/api/v1/projects/{project_id}/datasets",
        json={
            "name": "Sentiment Corpus",
            "task_type": "text_classification",
            "label_schema": {"labels": ["positive", "negative", "neutral"]},
        },
    )
    assert d_resp.status_code == 201
    dataset_id = d_resp.json()["id"]

    # Ingest 2 records
    with get_db_session() as session:
        from packages.dataset_core.services.record_service import RecordService
        rec1 = RecordService.create_record(
            session,
            dataset_id=dataset_id,
            split="train",
            metadata={"text": "Excellent model architecture."},
        )
        rec2 = RecordService.create_record(
            session,
            dataset_id=dataset_id,
            split="val",
            metadata={"text": "Needs optimization."},
        )
        session.commit()
        r1_id = rec1.id
        r2_id = rec2.id

    # Add annotation in pending_review (status is server-derived; never sent by clients)
    client.post(
        f"/api/v1/records/{r1_id}/annotations",
        json={"payload": {"label": "positive"}},
    )

    # 2. Attempt to publish version while unreviewed -> must be blocked
    block_resp = client.post(
        f"/api/v1/datasets/{dataset_id}/versions",
        json={"version_tag": "v1.0.0", "force": False},
    )
    assert block_resp.status_code == 422
    err_body = block_resp.json()["error"]
    assert err_body["code"] == "PUBLISHING_BLOCKED"
    assert err_body["details"]["blocking_count"] > 0

    # 3. Approve both records
    with get_db_session() as session:
        # Get r1's annotation
        detail_r1 = client.get(f"/api/v1/records/{r1_id}").json()
        ann1_id = detail_r1["annotation"]["id"]
        # Transition to approved
        trans_resp = client.post(
            f"/api/v1/annotations/{ann1_id}/transition",
            json={"next_status": "approved", "reason": "Verified accurate"},
        )
        assert trans_resp.status_code == 200

    # Add annotation for r2, then approve it via the explicit review-decision endpoint
    # (annotation creation always yields pending_review; client-supplied status is ignored).
    r2_ann_resp = client.post(
        f"/api/v1/records/{r2_id}/annotations",
        json={"payload": {"label": "neutral"}},
    )
    assert r2_ann_resp.status_code == 201
    r2_ann_id = r2_ann_resp.json()["id"]
    r2_trans_resp = client.post(
        f"/api/v1/annotations/{r2_ann_id}/transition",
        json={"next_status": "approved", "reason": "Verified accurate"},
    )
    assert r2_trans_resp.status_code == 200

    # 4. Now publish v1.0.0
    v1_resp = client.post(
        f"/api/v1/datasets/{dataset_id}/versions",
        json={"version_tag": "v1.0.0"},
    )
    assert v1_resp.status_code == 200
    v1_data = v1_resp.json()
    assert v1_data["version_tag"] == "v1.0.0"
    assert v1_data["version_number"] == 1
    assert v1_data["record_count"] == 2
    assert len(v1_data["manifest_hash"]) == 64
    assert v1_data["is_published"] is True
    version_1_id = v1_data["id"]

    # 5. Retrieve Manifest
    manifest_resp = client.get(f"/api/v1/versions/{version_1_id}/manifest")
    assert manifest_resp.status_code == 200
    manifest = manifest_resp.json()
    assert manifest["version_id"] == version_1_id
    assert manifest["record_count"] == 2
    assert len(manifest["records"]) == 2
    assert manifest["task_type"] == "text_classification"

    # 6. Retrieve Dataset Card Markdown
    card_resp = client.get(f"/api/v1/versions/{version_1_id}/card")
    assert card_resp.status_code == 200
    card_text = card_resp.text
    assert "Dataset Card: Sentiment Corpus" in card_text
    assert "v1.0.0" in card_text
    assert "| `train` | 1 |" in card_text
    assert "| `val` | 1 |" in card_text
    assert "Limitations & Ethical Disclaimers" in card_text

    # 7. Immutability verification:
    # Add a third record to the live dataset
    with get_db_session() as session:
        from packages.dataset_core.services.record_service import RecordService
        rec3 = RecordService.create_record(
            session,
            dataset_id=dataset_id,
            split="test",
            metadata={"text": "Third test sample."},
        )
        session.commit()
        r3_id = rec3.id

    r3_ann_resp = client.post(
        f"/api/v1/records/{r3_id}/annotations",
        json={"payload": {"label": "negative"}},
    )
    assert r3_ann_resp.status_code == 201
    r3_trans_resp = client.post(
        f"/api/v1/annotations/{r3_ann_resp.json()['id']}/transition",
        json={"next_status": "approved", "reason": "Verified accurate"},
    )
    assert r3_trans_resp.status_code == 200

    # Verify that v1 manifest STILL has exactly 2 records
    manifest_check = client.get(f"/api/v1/versions/{version_1_id}/manifest").json()
    assert manifest_check["record_count"] == 2
    assert len(manifest_check["records"]) == 2

    # 8. Publish v2.0.0
    v2_resp = client.post(
        f"/api/v1/datasets/{dataset_id}/versions",
        json={"version_tag": "v2.0.0"},
    )
    assert v2_resp.status_code == 200
    v2_data = v2_resp.json()
    assert v2_data["version_tag"] == "v2.0.0"
    assert v2_data["version_number"] == 2
    assert v2_data["record_count"] == 3
    version_2_id = v2_data["id"]

    # 9. Version Comparison / Diff
    diff_resp = client.get(f"/api/v1/versions/compare?version_a_id={version_1_id}&version_b_id={version_2_id}")
    assert diff_resp.status_code == 200
    diff = diff_resp.json()
    assert diff["net_record_change"] == 1
    assert r3_id in diff["records_added"]
    assert len(diff["records_removed"]) == 0
