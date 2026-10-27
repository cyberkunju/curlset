"""
Integration tests for the multi-modal ingestion pipeline, duplicate detection,
multimodal pairing, and file upload API.
"""
import io
import zipfile

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from packages.dataset_core.db.base import Base
from packages.dataset_core.db.session import init_database
from packages.dataset_core.services.dataset_service import DatasetService
from packages.dataset_core.services.project_service import ProjectService
from packages.dataset_io.ingestion_service import IngestionService
from packages.dataset_io.storage import LocalStorageBackend
from services.api.main import app


@pytest.fixture
def test_setup(tmp_path):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    storage = LocalStorageBackend(root_dir=str(tmp_path / "storage"))

    project = ProjectService.create_project(session, name="Ingestion Test Lab")
    dataset = DatasetService.create_dataset(
        session, project.id, "Multi-modal Dataset", "image_classification"
    )

    yield session, dataset, storage
    session.close()
    Base.metadata.drop_all(bind=engine)


def create_synthetic_png_bytes(width=64, height=64, color="blue") -> bytes:
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_single_image_ingestion_and_duplicate_detection(test_setup):
    session, dataset, storage = test_setup

    img_bytes = create_synthetic_png_bytes(64, 64, "blue")

    # 1. Ingest original image
    report1 = IngestionService.ingest_bytes(
        session=session,
        dataset_id=dataset.id,
        filename="blue_cube.png",
        data=img_bytes,
        storage=storage,
    )
    assert report1.accepted_count == 1
    assert report1.duplicate_count == 0
    assert report1.rejected_count == 0
    assert len(report1.accepted_items) == 1
    item = report1.accepted_items[0]
    assert item.filename == "blue_cube.png"
    assert item.modality == "image"

    # 2. Ingest identical bytes again with different filename -> exact duplicate detected!
    report2 = IngestionService.ingest_bytes(
        session=session,
        dataset_id=dataset.id,
        filename="blue_cube_copy.png",
        data=img_bytes,
        storage=storage,
    )
    assert report2.accepted_count == 0
    assert report2.duplicate_count == 1
    assert report2.rejected_count == 0
    assert len(report2.duplicates) == 1
    dup = report2.duplicates[0]
    assert dup.filename == "blue_cube_copy.png"
    assert dup.existing_asset_id == item.asset_id


def test_csv_ingestion(test_setup):
    session, dataset, storage = test_setup

    csv_data = b"id,text,label\n101,Great product,positive\n102,Broken on arrival,negative\n"
    report = IngestionService.ingest_bytes(
        session=session,
        dataset_id=dataset.id,
        filename="reviews.csv",
        data=csv_data,
        storage=storage,
    )
    assert report.accepted_count == 2
    assert report.rejected_count == 0


def test_jsonl_ingestion(test_setup):
    session, dataset, storage = test_setup

    jsonl_data = b'{"id": "doc_1", "text": "First sample"}\n{"id": "doc_2", "text": "Second sample"}\n'
    report = IngestionService.ingest_bytes(
        session=session,
        dataset_id=dataset.id,
        filename="samples.jsonl",
        data=jsonl_data,
        storage=storage,
    )
    assert report.accepted_count == 2
    assert report.rejected_count == 0


def test_multimodal_zip_pairing_and_traversal_protection(test_setup):
    session, dataset, storage = test_setup

    # Create ZIP in memory containing paired image + text and a traversal attempt
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr("defect_01.png", create_synthetic_png_bytes(32, 32, "green"))
        zf.writestr("defect_01.txt", "Description of visible surface defect 01.")
        # Malicious traversal entry
        zf.writestr("../../etc/traversal.txt", "Traversing outside safe dir")

    zip_bytes = zip_buffer.getvalue()

    report = IngestionService.ingest_bytes(
        session=session,
        dataset_id=dataset.id,
        filename="bundle.zip",
        data=zip_bytes,
        storage=storage,
    )

    # defect_01.png + defect_01.txt are paired into 1 accepted multimodal record!
    assert report.accepted_count == 1
    accepted = report.accepted_items[0]
    assert accepted.modality == "multimodal"
    assert "primary_image+paired_text" in accepted.role

    # The traversal attempt was safely rejected
    assert report.rejected_count >= 1
    assert any("traversal" in r.reason.lower() for r in report.rejected_items)


@pytest.mark.asyncio
async def test_api_file_upload_endpoint():
    init_database()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Create project & dataset
        p_res = await client.post("/api/v1/projects", json={"name": "API Ingest Project"})
        project_id = p_res.json()["id"]

        d_res = await client.post(
            f"/api/v1/projects/{project_id}/datasets",
            json={"name": "API Upload DS", "task_type": "text_classification"},
        )
        dataset_id = d_res.json()["id"]

        # 2. Upload text file via multipart POST
        csv_payload = b"text,label\nSuperb battery,positive\nDefective screen,negative\n"
        files = {"file": ("reviews.csv", csv_payload, "text/csv")}
        upload_res = await client.post(
            f"/api/v1/datasets/{dataset_id}/import/file",
            files=files,
            data={"split": "train"},
        )
        assert upload_res.status_code == 200
        report = upload_res.json()
        assert report["accepted_count"] == 2
        assert report["dataset_id"] == dataset_id

        # 3. Check records now present in dataset
        rec_res = await client.get(f"/api/v1/datasets/{dataset_id}/records")
        assert rec_res.status_code == 200
        records = rec_res.json()
        assert len(records) == 2
