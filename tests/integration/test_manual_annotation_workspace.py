"""
Integration tests for Phase 4: Manual Annotation Workflows, Task Schemas,
Append-only Revisions, Review Transitions, and Raw Asset Serving.
"""
from fastapi.testclient import TestClient

from packages.dataset_core.constants import TaskType
from packages.dataset_core.db.session import get_db_session
from packages.dataset_core.services.dataset_service import DatasetService
from packages.dataset_core.services.project_service import ProjectService
from packages.dataset_core.services.record_service import RecordService
from packages.dataset_io.storage import get_storage_backend
from services.api.main import app

client = TestClient(app)


def test_manual_annotation_workflow_and_revisions():
    with get_db_session() as session:
        # 1. Setup Project & Dataset with explicit label schema
        proj = ProjectService.create_project(session, name="Annotation Test Project")
        dataset = DatasetService.create_dataset(
            session,
            project_id=proj.id,
            name="Sentiment Review Dataset",
            task_type=TaskType.TEXT_CLASSIFICATION,
            annotation_instructions="Tag sentences as positive, negative, or neutral.",
            label_schema={"classes": ["positive", "negative", "neutral"]},
        )
        session.commit()

        # 2. Ingest Record and raw text asset
        record = RecordService.create_record(
            session,
            dataset_id=dataset.id,
            external_key="doc_001",
            split="train",
            metadata={"text": "The platform architecture is clean and robust."},
        )
        backend = get_storage_backend()
        text_bytes = b"The platform architecture is clean and robust."
        storage_key = f"assets/{dataset.id}/doc_001.txt"
        backend.write_bytes(storage_key, text_bytes)

        asset = RecordService.create_asset(
            session=session,
            dataset_id=dataset.id,
            storage_key=storage_key,
            modality="text",
            mime_type="text/plain",
            byte_size=len(text_bytes),
            sha256="a" * 64,
            original_filename="doc_001.txt",
        )
        RecordService.link_asset_to_record(session, record.id, asset.id, role="primary_text")
        session.commit()

        dataset_id = dataset.id
        record_id = record.id
        asset_id = asset.id

    # 3. Test raw asset serving endpoint
    raw_res = client.get(f"/api/v1/assets/{asset_id}/raw")
    assert raw_res.status_code == 200
    assert raw_res.content == text_bytes
    assert "text/plain" in raw_res.headers["content-type"]

    # 4. List records before annotation (should show 'unannotated')
    list_res = client.get(f"/api/v1/datasets/{dataset_id}/queue")
    assert list_res.status_code == 200
    data = list_res.json()
    assert data["total"] == 1
    assert data["items"][0]["review_status"] == "unannotated"

    # 5. Out-of-vocabulary label rejected
    invalid_create = client.post(
        f"/api/v1/records/{record_id}/annotations",
        json={
            "payload": {"label": "wildly_invalid_class"},
            "origin": "human",
            "status": "pending_review",
        },
    )
    assert invalid_create.status_code == 422
    assert "not in the allowed label set" in invalid_create.json()["error"]["message"]

    # 6. Valid annotation creation
    create_res = client.post(
        f"/api/v1/records/{record_id}/annotations",
        json={
            "payload": {"label": "positive", "confidence": 0.95},
            "origin": "human",
            "status": "pending_review",
            "actor_id": "annotator_1",
        },
    )
    assert create_res.status_code == 201
    ann = create_res.json()
    assert ann["status"] == "pending_review"
    assert ann["payload"]["label"] == "positive"
    annotation_id = ann["id"]

    # 7. Verify record detail has annotation and revisions
    detail_res = client.get(f"/api/v1/records/{record_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["annotation"]["id"] == annotation_id
    assert len(detail["revisions"]) == 1
    assert detail["revisions"][0]["revision_number"] == 1
    assert detail["revisions"][0]["payload"]["label"] == "positive"

    # 8. Update annotation (human revises to neutral)
    update_res = client.put(
        f"/api/v1/annotations/{annotation_id}",
        json={
            "payload": {"label": "neutral", "confidence": 0.8},
            "actor_id": "annotator_1",
            "change_reason": "Tone is actually objective/neutral",
        },
    )
    assert update_res.status_code == 200
    updated_ann = update_res.json()
    assert updated_ann["payload"]["label"] == "neutral"

    # Verify revision 2 appended and revision 1 preserved
    detail_after = client.get(f"/api/v1/records/{record_id}").json()
    assert len(detail_after["revisions"]) == 2
    assert detail_after["revisions"][0]["payload"]["label"] == "positive"
    assert detail_after["revisions"][1]["payload"]["label"] == "neutral"
    assert detail_after["revisions"][1]["revision_number"] == 2

    # 9. Review transition: approve annotation
    transition_res = client.post(
        f"/api/v1/annotations/{annotation_id}/transition",
        json={
            "next_status": "approved",
            "actor_id": "senior_reviewer",
            "reason": "Verified accurate label.",
        },
    )
    assert transition_res.status_code == 200
    assert transition_res.json()["status"] == "approved"

    # 10. Illegal transition: direct transition approved -> proposed rejected
    illegal_res = client.post(
        f"/api/v1/annotations/{annotation_id}/transition",
        json={"next_status": "proposed"},
    )
    assert illegal_res.status_code == 400  # InvalidStateTransitionError

    # 11. Filtering records by status
    approved_list = client.get(f"/api/v1/datasets/{dataset_id}/queue?review_status=approved").json()
    assert approved_list["total"] == 1

    unannotated_list = client.get(f"/api/v1/datasets/{dataset_id}/queue?review_status=unannotated").json()
    assert unannotated_list["total"] == 0
