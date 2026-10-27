"""
Integration tests for FastAPI health and readiness endpoints.
"""
import pytest
from httpx import ASGITransport, AsyncClient

from services.api.main import app


@pytest.mark.asyncio
async def test_health_check_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "ai-dataset-engineering-platform-api"
        assert "uptime_seconds" in data
        assert data["privacy_mode"] == "local_only"


@pytest.mark.asyncio
async def test_readiness_check_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/readiness")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["database"] == "connected"
        assert data["storage"] == "accessible"
