"""
Integration tests for Provider Credentials, auto-detection, key masking,
and OpenAI/Anthropic/Ollama adapter initialization and lifecycle.
"""
from fastapi.testclient import TestClient

from packages.provider_gateway.anthropic_provider import AnthropicProvider
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.openai_provider import OpenAIProvider
from packages.provider_gateway.types import ProviderAuthenticationError, ProviderRequest
from services.api.main import app


def test_provider_gateway_lists_supported_models():
    gateway = ProviderGateway.get_instance()
    providers = gateway.list_providers()
    prov_names = {p["name"] for p in providers}

    assert "fake" in prov_names
    assert "ollama" in prov_names
    assert "openai" in prov_names
    assert "anthropic" in prov_names

    openai_prov = gateway.get_provider("openai")
    assert "gpt-4o" in openai_prov.list_available_models()
    assert "gpt-4o-mini" in openai_prov.list_available_models()

    anthropic_prov = gateway.get_provider("anthropic")
    assert "claude-3-5-sonnet-20241022" in anthropic_prov.list_available_models()
    assert "claude-3-5-haiku-20241022" in anthropic_prov.list_available_models()


def test_unconfigured_providers_raise_authentication_error():
    openai_prov = OpenAIProvider(api_key="")
    anthropic_prov = AnthropicProvider(api_key="")

    req = ProviderRequest(model="gpt-4o-mini", task_type="text_classification", input_text="hello")

    try:
        openai_prov.annotate(req)
        assert False, "Should raise ProviderAuthenticationError"
    except ProviderAuthenticationError as e:
        assert "OpenAI API key not configured" in str(e)

    try:
        anthropic_prov.annotate(req)
        assert False, "Should raise ProviderAuthenticationError"
    except ProviderAuthenticationError as e:
        assert "Anthropic API key not configured" in str(e)


def test_provider_credentials_api_lifecycle():
    client = TestClient(app)

    # 1. Test auto-detection endpoint
    detect_res = client.post(
        "/api/v1/provider-credentials/detect",
        json={"api_key": "sk-ant-api03-testkey123456789"},
    )
    assert detect_res.status_code == 200
    assert detect_res.json()["provider"] == "anthropic"

    detect_res_openai = client.post(
        "/api/v1/provider-credentials/detect",
        json={"api_key": "sk-proj-testkey123456789"},
    )
    assert detect_res_openai.status_code == 200
    assert detect_res_openai.json()["provider"] == "openai"

    detect_res_ollama = client.post(
        "/api/v1/provider-credentials/detect",
        json={"base_url": "http://localhost:11434"},
    )
    assert detect_res_ollama.status_code == 200
    assert detect_res_ollama.json()["provider"] == "ollama"

    # 2. Add an Anthropic key (masked)
    create_res = client.post(
        "/api/v1/provider-credentials",
        json={
            "api_key": "sk-ant-live9876543210abcd",
            "label": "Research Team Claude",
            "is_default": True,
        },
        headers={"x-user-id": "test_user_prov"},
    )
    assert create_res.status_code == 201
    cred = create_res.json()
    assert cred["provider"] == "anthropic"
    assert cred["label"] == "Research Team Claude"
    assert "sk-ant-live9876543210abcd" not in str(cred)
    assert "sk-ant-••••••••abcd" in cred["key_mask"]
    cred_id = cred["id"]

    # 3. Add an Ollama local node
    create_ollama = client.post(
        "/api/v1/provider-credentials",
        json={
            "provider": "ollama",
            "label": "Workstation Ollama",
            "base_url": "http://127.0.0.1:11434",
        },
        headers={"x-user-id": "test_user_prov"},
    )
    assert create_ollama.status_code == 201
    assert create_ollama.json()["provider"] == "ollama"
    ollama_id = create_ollama.json()["id"]

    # 4. List credentials
    list_res = client.get("/api/v1/provider-credentials", headers={"x-user-id": "test_user_prov"})
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) >= 2
    for it in items:
        # Secrets must never leak in listing
        assert "live9876543210" not in str(it)

    # 5. Delete credential
    del_res = client.delete(f"/api/v1/provider-credentials/{cred_id}", headers={"x-user-id": "test_user_prov"})
    assert del_res.status_code == 204

    del_ollama = client.delete(f"/api/v1/provider-credentials/{ollama_id}", headers={"x-user-id": "test_user_prov"})
    assert del_ollama.status_code == 204
