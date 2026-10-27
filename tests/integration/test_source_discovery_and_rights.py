"""
Integration test suite for Phase 11:
- SSRF defense engine (blocking loopback, private ranges, link-local metadata, non-http schemes).
- Permitted catalog search with explicit license evidence.
- Import gating (rejecting restricted licenses, allowing review-required).
- Auditable rights review recording with evidentiary validation.
- Dataset source provenance query endpoint.
"""
import pytest
from httpx import ASGITransport, AsyncClient

from packages.dataset_core.constants import LicenseStatus, TaskType
from packages.dataset_core.db.models import DatasetModel, ProjectModel
from packages.dataset_core.db.session import get_db_session, init_database
from packages.dataset_core.exceptions import SSRFBlockedError
from packages.dataset_sources.catalog_adapter import CatalogSourceAdapter
from packages.dataset_sources.ssrf_guard import validate_url_safety
from services.api.main import app


@pytest.fixture(autouse=True)
def setup_database():
    init_database()
    with get_db_session() as session:
        # Pre-seed project and dataset if not already present
        proj = session.query(ProjectModel).filter_by(id="proj_phase11_test").first()
        if not proj:
            proj = ProjectModel(
                id="proj_phase11_test",
                name="Phase 11 Rights Test Project",
                description="Testing source discovery and licensing invariants",
            )
            session.add(proj)

        ds = session.query(DatasetModel).filter_by(id="ds_phase11_rights").first()
        if not ds:
            ds = DatasetModel(
                id="ds_phase11_rights",
                project_id="proj_phase11_test",
                name="Phase 11 Licensing Dataset",
                description="Dataset for testing rights gates",
                task_type=TaskType.TEXT_CLASSIFICATION.value,
                schema_version=1,
            )
            session.add(ds)
        session.commit()


class TestSSRFDefense:
    def test_blocks_disallowed_schemes(self):
        with pytest.raises(SSRFBlockedError) as exc_info:
            validate_url_safety("file:///etc/passwd")
        assert "Only HTTP and HTTPS" in str(exc_info.value)

        with pytest.raises(SSRFBlockedError):
            validate_url_safety("ftp://ftp.example.com/data.csv")

    def test_blocks_loopback_and_local_hostnames(self):
        with pytest.raises(SSRFBlockedError):
            validate_url_safety("http://127.0.0.1:8000/secret")

        with pytest.raises(SSRFBlockedError):
            validate_url_safety("http://localhost:3000/admin")

    def test_blocks_cloud_metadata_service(self):
        with pytest.raises(SSRFBlockedError) as exc_info:
            validate_url_safety("http://169.254.169.254/latest/meta-data/")
        assert "Blocked" in str(exc_info.value) or "disallowed" in str(exc_info.value).lower()

    def test_blocks_private_subnets(self):
        # 10.0.0.0/8
        with pytest.raises(SSRFBlockedError):
            validate_url_safety("http://10.0.1.5:5432/db")

        # 192.168.0.0/16
        with pytest.raises(SSRFBlockedError):
            validate_url_safety("http://192.168.1.100/internal")

        # 172.16.0.0/12
        with pytest.raises(SSRFBlockedError):
            validate_url_safety("http://172.20.0.2/api")

    def test_allows_public_https_domains(self, monkeypatch):
        # Mock DNS resolution for deterministic offline execution
        import socket
        monkeypatch.setattr(socket, "getaddrinfo", lambda host, port: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))])
        url = validate_url_safety("https://example.com/dataset.json")
        assert url.startswith("https://example.com")


class TestCatalogSearch:
    def test_catalog_search_filters_and_license_assertion(self):
        candidates = CatalogSourceAdapter.search(query="arxiv", max_results=5)
        assert len(candidates) >= 1
        cand = candidates[0]
        full_text = f"{cand.title} {cand.description} {cand.publisher or ''}".lower()
        assert "arxiv" in full_text
        # Ensure default status is NOT approved
        status_val = cand.license_status.value if hasattr(cand.license_status, "value") else cand.license_status
        assert status_val != LicenseStatus.APPROVED_FOR_INTENDED_USE.value
        assert cand.license_evidence is not None


class TestImportAndRightsGate:
    @pytest.mark.asyncio
    async def test_import_allowed_candidate_success(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post(
                "/api/v1/sources/import",
                json={
                    "dataset_id": "ds_phase11_rights",
                    "source_id": "src_catalog_arxiv_nlp_01",
                    "split": "train",
                },
            )
            assert res.status_code == 201, res.text
            data = res.json()
            assert data["status"] == "imported"
            record_id = data["record_id"]

            # Verify source listed in dataset
            list_res = await client.get("/api/v1/datasets/ds_phase11_rights/sources")
            assert list_res.status_code == 200
            sources = list_res.json()
            matching = [s for s in sources if s["record_id"] == record_id]
            assert len(matching) == 1
            assert matching[0]["source_uri"] == "https://arxiv.org/abs/2301.00001"
            assert matching[0]["license_status"] == LicenseStatus.REVIEW_REQUIRED.value


    @pytest.mark.asyncio
    async def test_import_restricted_candidate_is_rejected(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post(
                "/api/v1/sources/import",
                json={
                    "dataset_id": "ds_phase11_rights",
                    "source_id": "src_catalog_web_blog_restricted_04",
                    "split": "train",
                },
            )
            assert res.status_code == 403
            data = res.json()
            assert "restricted" in data["detail"]["message"].lower() or "prohibits" in data["detail"]["message"].lower()

    @pytest.mark.asyncio
    async def test_rights_review_recording(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # First import an allowed record
            import_res = await client.post(
                "/api/v1/sources/import",
                json={
                    "dataset_id": "ds_phase11_rights",
                    "source_id": "src_catalog_arxiv_nlp_01",
                    "split": "train",
                },
            )
            assert import_res.status_code == 201
            record_id = import_res.json()["record_id"]

            # Attempt to approve without sufficient evidence (min length is 5)
            fail_review = await client.post(
                f"/api/v1/records/{record_id}/rights-review",
                json={
                    "license_status": "approved_for_intended_use",
                    "evidence_text": "ok",  # too short
                },
            )
            assert fail_review.status_code == 422

            # Valid review with substantive evidence
            success_review = await client.post(
                f"/api/v1/records/{record_id}/rights-review",
                json={
                    "license_status": "approved_for_intended_use",
                    "evidence_text": "Verified CC0 1.0 Universal public domain dedication from project homepage.",
                    "terms_notes": "No attribution legally required; author credited as courtesy.",
                    "attribution_text": "Public Benchmark Initiative",
                },
            )
            assert success_review.status_code == 200, success_review.text
            review_data = success_review.json()
            assert review_data["status"] == "updated"
            assert review_data["license_status"] == LicenseStatus.APPROVED_FOR_INTENDED_USE.value

            # Verify list endpoint reflects updated license status
            list_res = await client.get("/api/v1/datasets/ds_phase11_rights/sources")
            assert list_res.status_code == 200
            sources_list = list_res.json()
            matching = [s for s in sources_list if s["record_id"] == record_id]
            assert len(matching) == 1
            assert matching[0]["license_status"] == LicenseStatus.APPROVED_FOR_INTENDED_USE.value
