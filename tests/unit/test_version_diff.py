import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from packages.dataset_core.db.models import (
    Base,
    DatasetModel,
    DatasetVersionModel,
    ProjectModel,
)
from packages.dataset_io.storage import LocalStorageBackend
from packages.dataset_versioning.service import VersioningService


@pytest.fixture
def diff_env(tmp_path):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    storage = LocalStorageBackend(root_dir=str(tmp_path / "storage"))

    with Session(engine) as session:
        proj = ProjectModel(id="proj_diff", name="DiffProj", description="")
        session.add(proj)
        ds = DatasetModel(
            id="ds_diff",
            project_id="proj_diff",
            name="Diff Dataset",
            task_type="object_detection",
        )
        session.add(ds)

        # Write manifest 1
        m1 = {
            "records": [
                {
                    "record_id": "r1",
                    "split": "train",
                    "annotation": {
                        "payload": {
                            "boxes": [{"label": "car", "x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2}]
                        },
                        "status": "approved",
                    },
                },
                {
                    "record_id": "r2",
                    "split": "train",
                    "annotation": {"payload": {"label": "car"}, "status": "approved"},
                },
            ]
        }
        k1 = "manifests/v1.json"
        storage.write_bytes(k1, json.dumps(m1).encode("utf-8"))

        v1 = DatasetVersionModel(
            id="ver_001",
            dataset_id="ds_diff",
            version_number=1,
            version_tag="v1.0.0",
            manifest_storage_key=k1,
            manifest_hash="hash1",
            record_count=2,
        )
        session.add(v1)

        # Write manifest 2 with a modified box on r1, r2 removed, and r3 added
        m2 = {
            "records": [
                {
                    "record_id": "r1",
                    "split": "val",  # Split changed from train to val
                    "annotation": {
                        "payload": {
                            # Slightly shifted box (high IoU)
                            "boxes": [{"label": "car", "x": 0.11, "y": 0.1, "w": 0.2, "h": 0.2}]
                        },
                        "status": "approved",
                    },
                },
                {
                    "record_id": "r3",
                    "split": "train",
                    "annotation": {"payload": {"label": "pedestrian"}, "status": "approved"},
                },
            ]
        }
        k2 = "manifests/v2.json"
        storage.write_bytes(k2, json.dumps(m2).encode("utf-8"))

        v2 = DatasetVersionModel(
            id="ver_002",
            dataset_id="ds_diff",
            version_number=2,
            version_tag="v2.0.0",
            manifest_storage_key=k2,
            manifest_hash="hash2",
            record_count=2,
        )
        session.add(v2)
        session.commit()

        yield session, storage


def test_versioning_diff_computes_exact_deltas(diff_env, monkeypatch):
    session, storage = diff_env
    monkeypatch.setattr(
        "packages.dataset_versioning.service.get_storage_backend", lambda: storage
    )

    diff = VersioningService.diff_dataset_versions(
        session=session, dataset_id="ds_diff", v1_id="ver_001", v2_id="ver_002"
    )

    summary = diff["summary"]
    assert summary["records_added"] == 1
    assert summary["records_removed"] == 1
    assert summary["splits_changed"] == 1
    assert summary["annotations_modified"] == 1
    assert summary["mean_iou"] > 0.8  # Slight box shift maintains high IoU

    # Class deltas
    deltas = diff["class_distribution_deltas"]
    car_delta = next(d for d in deltas if d["class_name"] == "car")
    assert car_delta["train"]["delta"] == -2  # 2 car records left train
    assert car_delta["val"]["delta"] == 1    # 1 car record moved to val
