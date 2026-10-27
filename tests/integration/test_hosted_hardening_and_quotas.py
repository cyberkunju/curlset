"""
Integration test suite for Phase 15 — Hosted deployment hardening, multi-tenant RBAC, quotas, rate limiting, and audit logging.
"""
import io
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from packages.dataset_core.db.models import DatasetModel, ProjectModel
from packages.dataset_core.db.session import get_db_session, init_database
from packages.dataset_security.rate_limiter import RateLimiter, global_rate_limiter
from packages.dataset_security.redaction import (
    redact_sensitive_data,
    sanitize_error_dict,
)
from services.api.main import app


class TestHostedHardeningAndQuotas:
    """Test multi-tenant RBAC, quotas, rate limiting, and security governance."""

    @classmethod
    def setup_class(cls):
        init_database()
        global_rate_limiter.reset()

    def setup_method(self):
        global_rate_limiter.reset()

    @pytest.mark.anyio
    async def test_multi_tenant_project_isolation_and_rbac(self):
        """Test tenant isolation, access rejection for non-members, and role-based permissions."""
        proj_id = f"proj_iso_{uuid.uuid4().hex[:8]}"
        ds_id = f"ds_iso_{uuid.uuid4().hex[:8]}"

        with get_db_session() as session:
            p = ProjectModel(
                id=proj_id,
                owner_id="tenant_alice",
                name="Alice Private Workspace",
                settings={"storage_quota_bytes": 10_000_000, "record_quota": 5000},
            )
            session.add(p)
            session.flush()

            d = DatasetModel(
                id=ds_id,
                project_id=proj_id,
                name="Alice Dataset",
                task_type="text_classification",
                label_schema={"labels": ["pos", "neg"]},
            )
            session.add(d)
            session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Non-member (Bob) attempts to view project -> 403 Forbidden
            res = await ac.get(f"/api/v1/projects/{proj_id}", headers={"X-User-Id": "tenant_bob"})
            assert res.status_code == 403

            # 2. Owner (Alice) views project -> 200 OK
            res = await ac.get(f"/api/v1/projects/{proj_id}", headers={"X-User-Id": "tenant_alice"})
            assert res.status_code == 200
            assert res.json()["name"] == "Alice Private Workspace"

            # 3. Alice adds Bob as a 'viewer'
            res = await ac.post(
                f"/api/v1/projects/{proj_id}/members",
                json={"user_id": "tenant_bob", "role": "viewer"},
                headers={"X-User-Id": "tenant_alice"},
            )
            assert res.status_code == 201
            assert res.json()["role"] == "viewer"

            # 4. Bob can now view project usage
            res = await ac.get(f"/api/v1/projects/{proj_id}/usage", headers={"X-User-Id": "tenant_bob"})
            assert res.status_code == 200
            assert res.json()["project_id"] == proj_id

            # 5. Bob (viewer) tries to upload file (requires editor) -> 403 Forbidden
            csv_payload = b"text,label\nGreat platform,pos\n"
            files = {"file": ("data.csv", io.BytesIO(csv_payload), "text/csv")}
            res = await ac.post(
                f"/api/v1/datasets/{ds_id}/import/file",
                files=files,
                data={"split": "train"},
                headers={"X-User-Id": "tenant_bob"},
            )
            assert res.status_code == 403

            # 6. Alice elevates Bob to 'editor'
            res = await ac.post(
                f"/api/v1/projects/{proj_id}/members",
                json={"user_id": "tenant_bob", "role": "editor"},
                headers={"X-User-Id": "tenant_alice"},
            )
            assert res.status_code == 201
            assert res.json()["role"] == "editor"

            # 7. Bob can now upload files as editor
            files = {"file": ("data.csv", io.BytesIO(csv_payload), "text/csv")}
            res = await ac.post(
                f"/api/v1/datasets/{ds_id}/import/file",
                files=files,
                data={"split": "train"},
                headers={"X-User-Id": "tenant_bob"},
            )
            assert res.status_code == 200
            assert res.json()["accepted_count"] == 1

            # 8. Non-owner (Bob) attempts to remove member -> 403 Forbidden
            res = await ac.delete(
                f"/api/v1/projects/{proj_id}/members/tenant_bob",
                headers={"X-User-Id": "tenant_bob"},
            )
            assert res.status_code == 403

            # 9. Owner (Alice) removes Bob
            res = await ac.delete(
                f"/api/v1/projects/{proj_id}/members/tenant_bob",
                headers={"X-User-Id": "tenant_alice"},
            )
            assert res.status_code == 204

            # 10. Bob is blocked again
            res = await ac.get(f"/api/v1/projects/{proj_id}/usage", headers={"X-User-Id": "tenant_bob"})
            assert res.status_code == 403

    @pytest.mark.anyio
    async def test_storage_quota_enforcement(self):
        """Test rejection of file uploads when project storage quota is exceeded."""
        proj_id = f"proj_quota_{uuid.uuid4().hex[:8]}"
        ds_id = f"ds_quota_{uuid.uuid4().hex[:8]}"

        # Small 2000-byte storage quota
        with get_db_session() as session:
            p = ProjectModel(
                id=proj_id,
                owner_id="tenant_charlie",
                name="Charlie Strict Storage",
                settings={"storage_quota_bytes": 2000, "record_quota": 100},
            )
            session.add(p)
            session.flush()

            d = DatasetModel(
                id=ds_id,
                project_id=proj_id,
                name="Charlie Dataset",
                task_type="image_classification",
                label_schema={"labels": ["cat", "dog"]},
            )
            session.add(d)
            session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Uploading 3000 bytes (> 2000 byte quota) fails with 413 Payload Too Large
            oversized = b"x" * 3000
            files = {"file": ("big.bin", io.BytesIO(oversized), "application/octet-stream")}
            res = await ac.post(
                f"/api/v1/datasets/{ds_id}/import/file",
                files=files,
                data={"split": "train"},
                headers={"X-User-Id": "tenant_charlie"},
            )
            assert res.status_code == 413
            assert "Quota exceeded for storage" in res.json()["error"]["message"]

            # 2. Uploading valid small PNG succeeds and registers storage bytes
            from PIL import Image
            img = Image.new("RGB", (16, 16), color="blue")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            png_bytes = buf.getvalue()

            files = {"file": ("blue.png", io.BytesIO(png_bytes), "image/png")}
            res = await ac.post(
                f"/api/v1/datasets/{ds_id}/import/file",
                files=files,
                data={"split": "train"},
                headers={"X-User-Id": "tenant_charlie"},
            )
            assert res.status_code == 200
            assert res.json()["accepted_count"] == 1

            # 3. Check live quota usage endpoint
            res = await ac.get(f"/api/v1/projects/{proj_id}/usage", headers={"X-User-Id": "tenant_charlie"})
            assert res.status_code == 200
            usage = res.json()
            assert usage["storage_bytes_used"] > 0
            assert usage["storage_quota_bytes"] == 2000
            assert usage["storage_percentage"] > 0.0

    @pytest.mark.anyio
    async def test_record_quota_enforcement_on_synthesis(self):
        """Test record quota bounds on synthetic batch generation."""
        proj_id = f"proj_rec_{uuid.uuid4().hex[:8]}"
        ds_id = f"ds_rec_{uuid.uuid4().hex[:8]}"

        # Small 3-record quota
        with get_db_session() as session:
            p = ProjectModel(
                id=proj_id,
                owner_id="tenant_diana",
                name="Diana Small Record Limit",
                settings={"storage_quota_bytes": 10_000_000, "record_quota": 3},
            )
            session.add(p)
            session.flush()

            d = DatasetModel(
                id=ds_id,
                project_id=proj_id,
                name="Diana Dataset",
                task_type="text_classification",
                label_schema={"labels": ["sport", "news"]},
            )
            session.add(d)
            session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Requesting 5 records when quota is 3 triggers QuotaExceededError (413)
            res = await ac.post(
                f"/api/v1/datasets/{ds_id}/synthesize",
                json={
                    "target_class": "sport",
                    "count": 5,
                    "prompt_template": "Generate sports: {class_name}",
                    "provider_name": "fake",
                    "model_name": "fake-text-generator-v1",
                },
                headers={"X-User-Id": "tenant_diana"},
            )
            assert res.status_code == 413
            assert "Quota exceeded for records" in res.json()["error"]["message"]

    def test_in_memory_sliding_window_rate_limiter(self):
        """Test sliding-window rate limiter triggers RateLimitExceededError and resets cleanly."""
        limiter = RateLimiter()
        key = "test_client_ip_1"

        # Allow 3 requests within 60s
        limiter.check(key, max_requests=3, window_seconds=60)
        limiter.check(key, max_requests=3, window_seconds=60)
        limiter.check(key, max_requests=3, window_seconds=60)

        # 4th request must raise
        from packages.dataset_core.exceptions import RateLimitExceededError
        with pytest.raises(RateLimitExceededError) as exc_info:
            limiter.check(key, max_requests=3, window_seconds=60)
        assert exc_info.value.retry_after >= 1

        # Resetting clears history
        limiter.reset(key)
        limiter.check(key, max_requests=3, window_seconds=60)

    def test_secret_redaction_and_audit_sanitization(self):
        """Test sensitive key redaction in dictionaries, error payloads, and audit logs."""
        payload = {
            "api_key": "sk-proj-supersecretkey12345",
            "provider_secret": "abcdef123456",
            "nested": {
                "bearer_token": "Bearer token_xyz",
                "normal_field": "public_text",
            },
            "array": [
                {"client_secret": "secret999"},
                "safe_item",
            ],
        }

        redacted = redact_sensitive_data(payload)
        assert redacted["api_key"] == "***REDACTED***"
        assert redacted["provider_secret"] == "***REDACTED***"
        assert redacted["nested"]["bearer_token"] == "***REDACTED***"
        assert redacted["nested"]["normal_field"] == "public_text"
        assert redacted["array"][0]["client_secret"] == "***REDACTED***"
        assert redacted["array"][1] == "safe_item"

        err = sanitize_error_dict("AUTH_ERROR", "Invalid token sk-12345", {"auth_header": "Bearer abc"})
        assert "***REDACTED***" in str(err["message"])
        assert err["details"]["auth_header"] == "***REDACTED***"

    @pytest.mark.anyio
    async def test_audit_log_recording_and_retrieval(self):
        """Test recording and querying immutable audit events."""
        proj_id = f"proj_audit_{uuid.uuid4().hex[:8]}"

        with get_db_session() as session:
            p = ProjectModel(
                id=proj_id,
                owner_id="tenant_auditor",
                name="Audit Test Project",
            )
            session.add(p)
            session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Add member (triggers MEMBER_ADDED audit event)
            await ac.post(
                f"/api/v1/projects/{proj_id}/members",
                json={"user_id": "member_one", "role": "editor"},
                headers={"X-User-Id": "tenant_auditor"},
            )

            # 2. Retrieve audit logs
            res = await ac.get(f"/api/v1/projects/{proj_id}/audit-logs", headers={"X-User-Id": "tenant_auditor"})
            assert res.status_code == 200
            logs = res.json()
            assert len(logs) >= 1
            assert logs[0]["action"] == "MEMBER_ADDED"
            assert logs[0]["user_id"] == "tenant_auditor"
            assert logs[0]["resource_id"] == "member_one"
