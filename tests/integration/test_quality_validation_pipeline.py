"""
Integration tests for Phase 6: Dataset Quality Engine, Validation Rules,
Split Leakage Detection, and Publication Readiness Auditing.
"""
from fastapi.testclient import TestClient

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus, TaskType
from packages.dataset_core.db.session import get_db_session
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_core.services.dataset_service import DatasetService
from packages.dataset_core.services.project_service import ProjectService
from packages.dataset_core.services.record_service import RecordService
from packages.dataset_io.storage import get_storage_backend
from services.api.main import app

client = TestClient(app)


def test_validation_on_empty_dataset_blocks_publishing():
    with get_db_session() as session:
        proj = ProjectService.create_project(session, name="Empty Test Proj")
        ds = DatasetService.create_dataset(
            session,
            project_id=proj.id,
            name="Empty DS",
            task_type=TaskType.TEXT_CLASSIFICATION,
        )
        session.commit()
        ds_id = ds.id

    res = client.post(f"/api/v1/datasets/{ds_id}/validate")
    assert res.status_code == 200
    report = res.json()
    assert report["is_publishable"] is False
    assert report["blocking_count"] >= 1
    rule_ids = [f["rule_id"] for f in report["findings"]]
    assert "RULE_EMPTY_DATASET" in rule_ids


def test_validation_detects_unresolved_reviews_and_split_leakage():
    backend = get_storage_backend()
    shared_img_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00" + b"\x00" * 200
    shared_sha = "f" * 64

    with get_db_session() as session:
        proj = ProjectService.create_project(session, name="Audit Proj")
        ds = DatasetService.create_dataset(
            session,
            project_id=proj.id,
            name="Audit Dataset",
            task_type=TaskType.IMAGE_CLASSIFICATION,
            label_schema={"classes": ["cat", "dog"]},
        )
        ds_id = ds.id

        # 1. Record in train
        r_train = RecordService.create_record(session, dataset_id=ds_id, split="train", external_key="train_01")
        key_train = f"assets/{ds_id}/train_01.jpg"
        backend.write_bytes(key_train, shared_img_bytes)
        a_train = RecordService.create_asset(
            session, dataset_id=ds_id, storage_key=key_train, modality="image", mime_type="image/jpeg",
            byte_size=len(shared_img_bytes), sha256=shared_sha,
        )
        RecordService.link_asset_to_record(session, r_train.id, a_train.id)

        # 2. Record in test with IDENTICAL SHA (Split leakage!)
        r_test = RecordService.create_record(session, dataset_id=ds_id, split="test", external_key="test_01")
        key_test = f"assets/{ds_id}/test_01.jpg"
        backend.write_bytes(key_test, shared_img_bytes)
        a_test = RecordService.create_asset(
            session, dataset_id=ds_id, storage_key=key_test, modality="image", mime_type="image/jpeg",
            byte_size=len(shared_img_bytes), sha256=shared_sha,
        )
        RecordService.link_asset_to_record(session, r_test.id, a_test.id)

        # 3. Create annotation on train record but leave in pending_review
        AnnotationService.create_annotation(
            session=session,
            record_id=r_train.id,
            payload={"label": "cat"},
            origin=AnnotationOrigin.HUMAN,
            status=ReviewStatus.PENDING_REVIEW,
        )
        session.commit()

    # Run validation
    res = client.post(f"/api/v1/datasets/{ds_id}/validate")
    assert res.status_code == 200
    report = res.json()

    rule_ids = [f["rule_id"] for f in report["findings"]]
    # Should catch unresolved reviews as BLOCKER
    assert "RULE_UNRESOLVED_REVIEWS" in rule_ids
    assert report["is_publishable"] is False

    # Should catch split leakage and duplicates as WARNING
    assert "RULE_SPLIT_LEAKAGE" in rule_ids
    assert "RULE_EXACT_DUPLICATES" in rule_ids


def test_clean_approved_dataset_passes_quality_check():
    backend = get_storage_backend()
    text_bytes = b"Clean text content for training"

    with get_db_session() as session:
        proj = ProjectService.create_project(session, name="Clean Project")
        ds = DatasetService.create_dataset(
            session,
            project_id=proj.id,
            name="Ready Dataset",
            task_type=TaskType.TEXT_CLASSIFICATION,
            label_schema={"classes": ["clean"]},
        )
        ds_id = ds.id

        # Canonical text contract (docs/TEXT_MVP.md §0): input text must live in
        # record.metadata["text"]; the text asset below is lineage only.
        r = RecordService.create_record(
            session,
            dataset_id=ds_id,
            split="train",
            external_key="clean_01",
            metadata={"text": text_bytes.decode("utf-8")},
        )
        k = f"assets/{ds_id}/clean_01.txt"
        backend.write_bytes(k, text_bytes)
        a = RecordService.create_asset(
            session, dataset_id=ds_id, storage_key=k, modality="text", mime_type="text/plain",
            byte_size=len(text_bytes), sha256="c" * 64,
        )
        RecordService.link_asset_to_record(session, r.id, a.id)

        # Approved human annotation
        AnnotationService.create_annotation(
            session=session,
            record_id=r.id,
            payload={"label": "clean"},
            origin=AnnotationOrigin.HUMAN,
            status=ReviewStatus.APPROVED,
        )
        session.commit()

    res = client.get(f"/api/v1/datasets/{ds_id}/validation-summary")
    assert res.status_code == 200
    report = res.json()
    assert report["is_publishable"] is True
    assert report["blocking_count"] == 0
    assert report["class_distribution"]["clean"] == 1
