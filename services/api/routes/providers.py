"""
Provider Credentials and API Key Management API.
Supports multi-key management, provider auto-recognition, secure key masking,
and live latency/connectivity verification for OpenAI, Claude, Ollama, and compatible providers.
"""
import base64
import time
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import ProviderCredentialModel
from packages.dataset_core.db.session import get_db
from packages.dataset_core.domain_models import ProviderCredentialContract
from packages.dataset_core.id_generator import generate_id
from packages.dataset_security.auth import get_auth_user
from packages.dataset_security.rate_limiter import global_rate_limiter
from packages.provider_gateway.anthropic_provider import AnthropicProvider
from packages.provider_gateway.compatible_provider import OpenAICompatibleProvider
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.ollama_provider import OllamaProvider
from packages.provider_gateway.openai_provider import OpenAIProvider
from packages.provider_gateway.types import ProviderRequest

router = APIRouter(tags=["providers"])

# Simple reversible obfuscation for local SQLite storage without external kms
_SALT = b"ADEP_SECURE_STORAGE_KEY_V1"


def _encrypt_key(raw_key: str) -> str:
    if not raw_key:
        return ""
    raw_bytes = raw_key.encode("utf-8")
    xored = bytes(b ^ _SALT[i % len(_SALT)] for i, b in enumerate(raw_bytes))
    return base64.b64encode(xored).decode("ascii")


def _decrypt_key(encrypted: str) -> str:
    if not encrypted:
        return ""
    try:
        xored = base64.b64decode(encrypted.encode("ascii"))
        raw_bytes = bytes(b ^ _SALT[i % len(_SALT)] for i, b in enumerate(xored))
        return raw_bytes.decode("utf-8")
    except (ValueError, UnicodeDecodeError, OSError):
        return ""


def detect_provider_from_input(api_key: str = "", base_url: str = "", raw_text: str = "") -> dict[str, Any]:
    """Smart heuristic detection from API key patterns, URL patterns, or keywords."""
    key = api_key.strip()
    url = base_url.strip().lower()
    text = raw_text.strip().lower()
    combined = f"{key} {url} {text}".lower()

    # 1. Exact key prefix matches
    if key.startswith("sk-ant-"):
        return {
            "provider": "anthropic",
            "name": "Anthropic Claude",
            "default_models": AnthropicProvider.SUPPORTED_MODELS,
            "default_label": "Anthropic Claude API",
        }
    if (key.startswith(("sk-proj-", "sk-")) or "openai" in combined or "gpt" in combined) and not key.startswith("sk-ant-"):
        return {
            "provider": "openai",
            "name": "OpenAI",
            "default_models": OpenAIProvider.SUPPORTED_MODELS,
            "default_label": "OpenAI API",
        }
    if key.startswith("gsk_") or "groq" in combined:
        return {
            "provider": "groq",
            "name": "Groq Cloud",
            "default_models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
            "default_label": "Groq LPU Inference",
        }
    if key.startswith("AIza") or "gemini" in combined or "google" in combined:
        return {
            "provider": "gemini",
            "name": "Google Gemini",
            "default_models": ["gemini-1.5-pro", "gemini-1.5-flash"],
            "default_label": "Google Gemini API",
        }
    if key.startswith("hf_") or "huggingface" in combined:
        return {
            "provider": "huggingface",
            "name": "Hugging Face",
            "default_models": ["meta-llama/Llama-3.2-3B-Instruct", "mistralai/Mistral-7B-Instruct-v0.3"],
            "default_label": "Hugging Face Inference",
        }
    if "ollama" in combined or ":11434" in url or "11434" in key or "localhost:11434" in combined:
        return {
            "provider": "ollama",
            "name": "Local Ollama",
            "default_models": ["llama3.2", "mistral", "qwen2.5", "phi3"],
            "default_label": "Local Ollama Node",
        }
    if "deepseek" in combined:
        return {
            "provider": "deepseek",
            "name": "DeepSeek",
            "default_models": ["deepseek-chat", "deepseek-coder"],
            "default_label": "DeepSeek API",
        }
    if "mistral" in combined:
        return {
            "provider": "mistral",
            "name": "Mistral AI",
            "default_models": ["mistral-large-latest", "mistral-small-latest"],
            "default_label": "Mistral AI API",
        }
    if "cohere" in combined:
        return {
            "provider": "cohere",
            "name": "Cohere",
            "default_models": ["command-r-plus", "command-r"],
            "default_label": "Cohere API",
        }

    # Default fallback
    return {
        "provider": "custom",
        "name": "Custom Provider",
        "default_models": ["default-model"],
        "default_label": "Custom Model Endpoint",
    }


def _mask_key(prefix: str, suffix: str) -> str:
    if not prefix and not suffix:
        return "Not required (local)"
    return f"{prefix}••••••••{suffix}"


class CreateCredentialRequest(BaseModel):
    provider: str | None = None
    label: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    models: list[str] | None = None
    is_default: bool = False


class DetectProviderRequest(BaseModel):
    input_text: str = ""
    api_key: str = ""
    base_url: str = ""


@router.post("/api/v1/provider-credentials/detect")
def detect_provider(req: DetectProviderRequest) -> dict[str, Any]:
    """Auto-detect provider metadata and recommended models based on user input or key."""
    return detect_provider_from_input(api_key=req.api_key, base_url=req.base_url, raw_text=req.input_text)


@router.get("/api/v1/provider-credentials", response_model=list[ProviderCredentialContract])
def list_credentials(
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> list[ProviderCredentialContract]:
    """List configured provider credentials with strict key masking."""
    creds = session.scalars(
        select(ProviderCredentialModel)
        .where(ProviderCredentialModel.user_id == user_id)
        .order_by(ProviderCredentialModel.created_at.desc())
    ).all()

    contracts = []
    for c in creds:
        mask = _mask_key(c.key_prefix, c.key_suffix) if c.provider != "ollama" else (c.base_url or "http://localhost:11434")
        contract = ProviderCredentialContract(
            id=c.id,
            user_id=c.user_id,
            provider=c.provider,
            label=c.label,
            key_prefix=c.key_prefix,
            key_suffix=c.key_suffix,
            key_mask=mask,
            base_url=c.base_url,
            is_active=c.is_active,
            is_default=c.is_default,
            models=c.models or [],
            status=c.status,
            latency_ms=c.latency_ms,
            last_tested_at=c.last_tested_at,
            error_message=c.error_message,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        contracts.append(contract)
    return contracts


@router.post("/api/v1/provider-credentials", response_model=ProviderCredentialContract, status_code=201)
def create_credential(
    req: CreateCredentialRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> ProviderCredentialContract:
    """Register and store a new provider API key or local endpoint with auto-recognition."""
    global_rate_limiter.check(f"cred_create_{user_id}", max_requests=20, window_seconds=60)

    # Auto-detect if provider not supplied
    detected = detect_provider_from_input(
        api_key=req.api_key or "",
        base_url=req.base_url or "",
        raw_text=req.provider or req.label or "",
    )

    resolved_provider = (req.provider or detected["provider"]).lower().strip()
    resolved_label = req.label.strip() if req.label and req.label.strip() else detected["default_label"]
    resolved_models = req.models if req.models and len(req.models) > 0 else detected["default_models"]

    raw_key = (req.api_key or "").strip()
    prefix = ""
    suffix = ""
    encrypted_key = None

    if raw_key:
        if len(raw_key) > 8:
            prefix = raw_key[:7]
            suffix = raw_key[-4:]
        else:
            prefix = raw_key[:2]
            suffix = raw_key[-2:]
        encrypted_key = _encrypt_key(raw_key)

    # Handle defaults
    if req.is_default:
        existing_defaults = session.scalars(
            select(ProviderCredentialModel).where(
                ProviderCredentialModel.user_id == user_id,
                ProviderCredentialModel.is_default.is_(True),
            )
        ).all()
        for ed in existing_defaults:
            ed.is_default = False

    cred_id = generate_id("cred")
    cred = ProviderCredentialModel(
        id=cred_id,
        user_id=user_id,
        provider=resolved_provider,
        label=resolved_label,
        api_key_encrypted=encrypted_key,
        key_prefix=prefix,
        key_suffix=suffix,
        base_url=req.base_url.strip() if req.base_url else None,
        is_active=True,
        is_default=req.is_default,
        models=resolved_models,
        status="configured",
        created_at=datetime.now(UTC),
    )
    session.add(cred)
    session.commit()
    session.refresh(cred)

    # Register in ProviderGateway
    gateway = ProviderGateway.get_instance()
    if resolved_provider == "openai":
        gateway.register_provider(OpenAIProvider(api_key=raw_key, base_url=req.base_url))
    elif resolved_provider == "anthropic":
        gateway.register_provider(AnthropicProvider(api_key=raw_key, base_url=req.base_url))
    elif resolved_provider == "ollama":
        gateway.register_provider(OllamaProvider(base_url=req.base_url))
    else:
        gateway.register_provider(
            OpenAICompatibleProvider(
                name=resolved_provider,
                api_key=raw_key,
                base_url=req.base_url or "http://localhost:8000/v1",
                default_models=resolved_models,
            )
        )

    mask = _mask_key(prefix, suffix) if resolved_provider != "ollama" else (req.base_url or "http://localhost:11434")
    return ProviderCredentialContract(
        id=cred.id,
        user_id=cred.user_id,
        provider=cred.provider,
        label=cred.label,
        key_prefix=cred.key_prefix,
        key_suffix=cred.key_suffix,
        key_mask=mask,
        base_url=cred.base_url,
        is_active=cred.is_active,
        is_default=cred.is_default,
        models=cred.models or [],
        status=cred.status,
        created_at=cred.created_at,
        updated_at=cred.updated_at,
    )


@router.post("/api/v1/provider-credentials/{cred_id}/test", response_model=ProviderCredentialContract)
def test_credential(
    cred_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> ProviderCredentialContract:
    """Ping provider endpoint to test live connectivity and latency."""
    cred = session.scalar(
        select(ProviderCredentialModel).where(
            ProviderCredentialModel.id == cred_id,
            ProviderCredentialModel.user_id == user_id,
        )
    )
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    raw_key = _decrypt_key(cred.api_key_encrypted) if cred.api_key_encrypted else ""
    start_time = time.time()

    try:
        if cred.provider == "openai":
            prov = OpenAIProvider(api_key=raw_key, base_url=cred.base_url)
            # Send minimal validation request
            test_req = ProviderRequest(
                model=cred.models[0] if cred.models else "gpt-4o-mini",
                task_type="text_classification",
                input_text="ping",
                label_schema={"classes": ["ping", "pong"]},
            )
            prov.annotate(test_req)
        elif cred.provider == "anthropic":
            prov = AnthropicProvider(api_key=raw_key, base_url=cred.base_url)
            test_req = ProviderRequest(
                model=cred.models[0] if cred.models else "claude-3-5-haiku-20241022",
                task_type="text_classification",
                input_text="ping",
                label_schema={"classes": ["ping", "pong"]},
            )
            prov.annotate(test_req)
        elif cred.provider == "ollama":
            prov = OllamaProvider(base_url=cred.base_url)
            test_req = ProviderRequest(
                model=cred.models[0] if cred.models else "llama3.2",
                task_type="text_classification",
                input_text="ping",
                label_schema={"classes": ["ping", "pong"]},
            )
            prov.annotate(test_req)
        else:
            prov = OpenAICompatibleProvider(
                name=cred.provider,
                api_key=raw_key,
                base_url=cred.base_url or "http://localhost:8000/v1",
                default_models=cred.models,
            )
            test_req = ProviderRequest(
                model=cred.models[0] if cred.models else "default-model",
                task_type="text_classification",
                input_text="ping",
                label_schema={"classes": ["ping", "pong"]},
            )
            prov.annotate(test_req)

        latency = round((time.time() - start_time) * 1000, 2)
        cred.status = "operational"
        cred.latency_ms = latency
        cred.error_message = None
        cred.last_tested_at = datetime.now(UTC)

    except Exception as e:  # noqa: BLE001
        latency = round((time.time() - start_time) * 1000, 2)
        cred.status = "failed"
        cred.latency_ms = latency
        cred.error_message = str(e)
        cred.last_tested_at = datetime.now(UTC)

    session.commit()
    session.refresh(cred)

    mask = _mask_key(cred.key_prefix, cred.key_suffix) if cred.provider != "ollama" else (cred.base_url or "http://localhost:11434")
    return ProviderCredentialContract(
        id=cred.id,
        user_id=cred.user_id,
        provider=cred.provider,
        label=cred.label,
        key_prefix=cred.key_prefix,
        key_suffix=cred.key_suffix,
        key_mask=mask,
        base_url=cred.base_url,
        is_active=cred.is_active,
        is_default=cred.is_default,
        models=cred.models or [],
        status=cred.status,
        latency_ms=cred.latency_ms,
        last_tested_at=cred.last_tested_at,
        error_message=cred.error_message,
        created_at=cred.created_at,
        updated_at=cred.updated_at,
    )


@router.delete("/api/v1/provider-credentials/{cred_id}", status_code=204)
def delete_credential(
    cred_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
):
    """Remove a configured provider credential."""
    cred = session.scalar(
        select(ProviderCredentialModel).where(
            ProviderCredentialModel.id == cred_id,
            ProviderCredentialModel.user_id == user_id,
        )
    )
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    session.delete(cred)
    session.commit()

