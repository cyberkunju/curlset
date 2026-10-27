"""
Integration tests for deployment, zero-cost demo seeding, and backup/restore integrity.
"""
import os
import tempfile

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine

from packages.dataset_core.db.base import Base
from packages.dataset_core.db.models import (
    DatasetModel,
    DatasetRecordModel,
    DatasetVersionModel,
    ProjectModel,
)
from packages.dataset_core.db.session import close_engine, get_db_session
from scripts.backup_restore import create_backup, restore_backup, verify_backup
from scripts.seed_demo_dataset import seed_demo_data
from services.api.main import app


@pytest.fixture
def isolated_env():
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
        db_path = os.path.join(temp_dir, "test_deploy.db")
        db_url = f"sqlite:///{db_path}"
        storage_dir = os.path.join(temp_dir, "test_storage")
        os.makedirs(storage_dir, exist_ok=True)

        engine = create_engine(db_url, connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)

        try:
            yield {"engine": engine, "db_url": db_url, "storage_dir": storage_dir, "temp_dir": temp_dir}
        finally:
            engine.dispose()
            close_engine()


def test_seed_demo_dataset_creates_multimodal_project_and_version(isolated_env):
    engine = isolated_env["engine"]
    storage_dir = isolated_env["storage_dir"]

    # 1. Run seeder
    seed_result = seed_demo_data(engine=engine, storage_dir=storage_dir)

    assert "project_id" in seed_result
    assert "text_dataset_id" in seed_result
    assert "image_dataset_id" in seed_result
    assert "object_dataset_id" in seed_result
    assert "published_version_id" in seed_result

    # 2. Verify persisted records in database
    with get_db_session(engine) as session:
        proj = session.query(ProjectModel).filter_by(id=seed_result["project_id"]).first()
        assert proj is not None
        assert "Benchmark" in proj.name

        datasets = session.query(DatasetModel).filter_by(project_id=proj.id).all()
        assert len(datasets) == 3

        # Verify object detection dataset has published version
        obj_ds = session.query(DatasetModel).filter_by(id=seed_result["object_dataset_id"]).first()
        assert obj_ds is not None
        assert len(obj_ds.versions) == 1
        assert obj_ds.versions[0].version_tag == "1.0.0"
        assert len(obj_ds.versions[0].manifest_hash) == 64

        # Verify records exist across splits
        records = session.query(DatasetRecordModel).filter_by(dataset_id=obj_ds.id).all()
        assert len(records) >= 4
        splits = {r.split for r in records}
        assert "train" in splits
        assert "val" in splits
        assert "test" in splits


def test_backup_and_restore_cycle_with_integrity_manifest(isolated_env):
    engine = isolated_env["engine"]
    db_url = isolated_env["db_url"]
    storage_dir = isolated_env["storage_dir"]
    temp_dir = isolated_env["temp_dir"]

    # 1. Populate demo data
    seed_demo_data(engine=engine, storage_dir=storage_dir)

    # 2. Create backup archive
    backup_file = os.path.join(temp_dir, "test_backup.tar.gz")
    manifest = create_backup(
        output_archive_path=backup_file,
        database_url=db_url,
        storage_dir=storage_dir,
    )
    assert os.path.exists(backup_file)
    assert "files" in manifest
    assert len(manifest["files"]) > 0

    # 3. Verify backup archive
    verified_manifest = verify_backup(backup_file)
    assert verified_manifest["backup_version"] == "1.0"
    assert len(verified_manifest["files"]) == len(manifest["files"])

    # 4. Prepare restore target
    restore_db_path = os.path.join(temp_dir, "restored.db")
    restore_db_url = f"sqlite:///{restore_db_path}"
    restore_storage_dir = os.path.join(temp_dir, "restored_storage")

    # 5. Restore into clean target
    restore_backup(
        archive_path=backup_file,
        target_database_url=restore_db_url,
        target_storage_dir=restore_storage_dir,
    )

    # 6. Verify restored database contents
    restored_engine = create_engine(restore_db_url, connect_args={"check_same_thread": False})
    try:
        with get_db_session(restored_engine) as session:
            proj = session.query(ProjectModel).filter_by(id="proj_demo_benchmark").first()
            assert proj is not None
            assert session.query(DatasetModel).count() == 3
            assert session.query(DatasetVersionModel).count() >= 1
    finally:
        restored_engine.dispose()


@pytest.mark.asyncio
async def test_health_and_readiness_aliases():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Both root and /api/v1 paths work
        res_h1 = await client.get("/health")
        assert res_h1.status_code == 200
        assert res_h1.json()["status"] == "ok"

        res_h2 = await client.get("/api/v1/health")
        assert res_h2.status_code == 200
        assert res_h2.json()["status"] == "ok"

        res_r1 = await client.get("/readiness")
        assert res_r1.status_code == 200
        assert res_r1.json()["status"] == "ready"

        res_r2 = await client.get("/api/v1/readiness")
        assert res_r2.status_code == 200
        assert res_r2.json()["status"] == "ready"
