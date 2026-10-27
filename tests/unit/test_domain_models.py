"""
Unit tests for domain contracts, stable IDs, and UTC timestamps.
"""
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from packages.dataset_core.constants import (
    AnnotationOrigin,
    AssetModality,
    ReviewStatus,
    TaskType,
)
from packages.dataset_core.domain_models import (
    AnnotationContract,
    AssetContract,
    DatasetContract,
    DatasetRecordContract,
    ProjectContract,
    utc_now,
)
from packages.dataset_core.id_generator import generate_id


def test_stable_id_prefixes():
    assert generate_id("project").startswith("prj_")
    assert generate_id("dataset").startswith("ds_")
    assert generate_id("record").startswith("rec_")
    assert generate_id("asset").startswith("ast_")
    assert generate_id("annotation").startswith("ann_")
    assert generate_id("revision").startswith("rev_")
    assert generate_id("source").startswith("src_")
    assert generate_id("run").startswith("run_")
    assert generate_id("version").startswith("ver_")
    assert generate_id("export").startswith("exp_")
    assert generate_id("event").startswith("evt_")


def test_utc_now_timezone_aware():
    now = utc_now()
    assert now.tzinfo is not None
    assert now.tzinfo == UTC


def test_project_contract_validation():
    proj = ProjectContract(
        id=generate_id("project"),
        name="Test Vision Project",
        description="Dataset for testing",
    )
    assert proj.name == "Test Vision Project"
    assert proj.is_archived is False
    assert isinstance(proj.created_at, datetime)

    # Empty name fails
    with pytest.raises(ValidationError):
        ProjectContract(id="prj_1", name="")


def test_dataset_contract_validation():
    ds = DatasetContract(
        id=generate_id("dataset"),
        project_id="prj_123",
        name="Defect Images",
        task_type=TaskType.IMAGE_CLASSIFICATION,
    )
    assert ds.task_type == TaskType.IMAGE_CLASSIFICATION
    assert ds.schema_version == 1

    # Invalid task type fails
    with pytest.raises(ValidationError):
        DatasetContract(
            id="ds_1",
            project_id="prj_1",
            name="Bad Dataset",
            task_type="invalid_task_type",  # type: ignore
        )


def test_asset_contract_sha256_length():
    valid_sha256 = "a" * 64
    asset = AssetContract(
        id=generate_id("asset"),
        dataset_id="ds_123",
        storage_key="assets/sample.jpg",
        modality=AssetModality.IMAGE,
        mime_type="image/jpeg",
        byte_size=1024,
        sha256=valid_sha256,
    )
    assert asset.sha256 == valid_sha256

    # Invalid sha256 length fails
    with pytest.raises(ValidationError):
        AssetContract(
            id=generate_id("asset"),
            dataset_id="ds_123",
            storage_key="assets/sample.jpg",
            modality=AssetModality.IMAGE,
            mime_type="image/jpeg",
            byte_size=1024,
            sha256="too_short",
        )


def test_record_split_validation():
    rec = DatasetRecordContract(
        id=generate_id("record"),
        dataset_id="ds_123",
        split="val",
    )
    assert rec.split == "val"

    with pytest.raises(ValidationError):
        DatasetRecordContract(
            id=generate_id("record"),
            dataset_id="ds_123",
            split="invalid_split",
        )


def test_annotation_contract_confidence_bounds():
    ann = AnnotationContract(
        id=generate_id("annotation"),
        record_id="rec_123",
        dataset_id="ds_123",
        task_type=TaskType.TEXT_CLASSIFICATION,
        origin=AnnotationOrigin.HUMAN,
        status=ReviewStatus.APPROVED,
        confidence=0.95,
    )
    assert ann.confidence == 0.95

    # Confidence > 1.0 fails
    with pytest.raises(ValidationError):
        AnnotationContract(
            id=generate_id("annotation"),
            record_id="rec_123",
            dataset_id="ds_123",
            task_type=TaskType.TEXT_CLASSIFICATION,
            origin=AnnotationOrigin.HUMAN,
            confidence=1.5,
        )
