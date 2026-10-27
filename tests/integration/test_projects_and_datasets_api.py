"""
Integration tests for Project and Dataset REST API routes.
"""
import pytest
from httpx import ASGITransport, AsyncClient

from packages.dataset_core.db.session import init_database
from services.api.main import app


@pytest.fixture(autouse=True)
def setup_database():
    init_database()


@pytest.mark.asyncio
async def test_project_crud_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Create Project
        create_resp = await client.post(
            "/api/v1/projects",
            json={"name": "Audio & Vision Multi-modal", "description": "Testing project API"},
        )
        assert create_resp.status_code == 201
        project_data = create_resp.json()
        assert project_data["name"] == "Audio & Vision Multi-modal"
        project_id = project_data["id"]

        # 2. Get Project
        get_resp = await client.get(f"/api/v1/projects/{project_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == project_id

        # 3. List Projects
        list_resp = await client.get("/api/v1/projects")
        assert list_resp.status_code == 200
        projects = list_resp.json()
        assert any(p["id"] == project_id for p in projects)

        # 4. Update Project
        update_resp = await client.patch(
            f"/api/v1/projects/{project_id}",
            json={"name": "Updated Project Name"},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["name"] == "Updated Project Name"

        # 5. Archive Project
        archive_resp = await client.post(f"/api/v1/projects/{project_id}/archive")
        assert archive_resp.status_code == 200
        assert archive_resp.json()["is_archived"] is True

        # Unarchived list should not include it
        active_list_resp = await client.get("/api/v1/projects")
        assert not any(p["id"] == project_id for p in active_list_resp.json())

        # With include_archived=true it should appear
        all_list_resp = await client.get("/api/v1/projects?include_archived=true")
        assert any(p["id"] == project_id for p in all_list_resp.json())


@pytest.mark.asyncio
async def test_dataset_lifecycle_and_validation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Create a parent project first
        p_resp = await client.post("/api/v1/projects", json={"name": "Vision Lab"})
        assert p_resp.status_code == 201
        project_id = p_resp.json()["id"]

        # 2. Reject invalid task type
        bad_task_resp = await client.post(
            f"/api/v1/projects/{project_id}/datasets",
            json={"name": "Bad Task DS", "task_type": "quantum_classification"},
        )
        assert bad_task_resp.status_code == 422
        assert bad_task_resp.json()["error"]["code"] == "VALIDATION_ERROR"

        # 3. Create valid dataset
        ds_resp = await client.post(
            f"/api/v1/projects/{project_id}/datasets",
            json={
                "name": "Cat vs Dog Images",
                "task_type": "image_classification",
                "description": "Binary pet classification",
                "annotation_instructions": "Choose cat or dog accurately.",
                "label_schema": {"labels": ["cat", "dog"]},
            },
        )
        assert ds_resp.status_code == 201
        ds_data = ds_resp.json()
        dataset_id = ds_data["id"]
        assert ds_data["task_type"] == "image_classification"
        assert ds_data["schema_version"] == 1

        # 4. List datasets under project
        list_resp = await client.get(f"/api/v1/projects/{project_id}/datasets")
        assert list_resp.status_code == 200
        datasets = list_resp.json()
        assert len(datasets) >= 1
        assert any(d["id"] == dataset_id for d in datasets)

        # 5. Get Dataset Detail with live statistics
        detail_resp = await client.get(f"/api/v1/datasets/{dataset_id}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert detail["dataset"]["id"] == dataset_id
        assert detail["stats"]["total_records"] == 0
        assert detail["stats"]["approved"] == 0

        # 6. Update Dataset schema and verify schema_version bumps
        update_resp = await client.patch(
            f"/api/v1/datasets/{dataset_id}",
            json={
                "label_schema": {"labels": ["cat", "dog", "unknown"]},
                "annotation_instructions": "Updated: choose cat, dog, or unknown.",
            },
        )
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["schema_version"] == 2
        assert "unknown" in updated["label_schema"]["labels"]

        # 7. List records on empty dataset
        records_resp = await client.get(f"/api/v1/datasets/{dataset_id}/records")
        assert records_resp.status_code == 200
        assert records_resp.json() == []


@pytest.mark.asyncio
async def test_nonexistent_resource_returns_404():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        resp = await client.get("/api/v1/projects/prj_nonexistent_9999")
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "RESOURCE_NOT_FOUND"

        ds_resp = await client.get("/api/v1/datasets/ds_nonexistent_9999")
        assert ds_resp.status_code == 404
        assert ds_resp.json()["error"]["code"] == "RESOURCE_NOT_FOUND"
