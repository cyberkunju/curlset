"""
Image-generation providers behind the existing gateway.

Two concrete implementations, both speaking the OpenAI-compatible
``POST {base}/images/generations`` shape:

* ``openai-image`` — OpenAI ``gpt-image-2`` (returns PNG base64).
* ``meta-image``   — Meta ``muse-image-1.0`` on ``https://api.meta.ai/v1`` (returns WEBP base64).

Design rules:
* Capability is ``IMAGE_GENERATION`` only — these providers cannot classify; callers check capability.
* Results are bytes + mime + prompt; the service stores them as assets (never in the DB row).
* Cost is a *configuration*: per-image prices come from ``IMAGE_PRICES`` (JSON, USD per image by
  quality tier). Unknown pricing is reported as unknown, not assumed free.
"""
from __future__ import annotations

import base64
import json
import os
import time
from typing import Any, ClassVar

import httpx

from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.types import (
    ProviderAuthenticationError,
    ProviderCapability,
    ProviderError,
    ProviderMalformedOutputError,
    ProviderRateLimitError,
    ProviderRequest,
    ProviderResponse,
    ProviderTimeoutError,
    ProviderUsage,
)

#: Fallback per-image prices in USD by model -> quality tier. Overridable with IMAGE_PRICES.
#: Values are configuration approximations, not a billing authority.
_DEFAULT_IMAGE_PRICES: dict[str, dict[str, float]] = {
    "gpt-image-2": {"low": 0.011, "medium": 0.042, "high": 0.167},
    "gpt-image-1": {"low": 0.011, "medium": 0.042, "high": 0.167},
}
#: Meta's public per-image pricing is not known to this build; unset means "unknown", not free.
_META_PRICED = False


def _load_image_prices() -> dict[str, dict[str, float]]:
    raw = os.environ.get("IMAGE_PRICES", "").strip()
    if not raw:
        return dict(_DEFAULT_IMAGE_PRICES)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return dict(_DEFAULT_IMAGE_PRICES)
    if not isinstance(parsed, dict):
        return dict(_DEFAULT_IMAGE_PRICES)
    table: dict[str, dict[str, float]] = {}
    for model, tiers in parsed.items():
        if not isinstance(tiers, dict):
            continue
        try:
            table[str(model).lower()] = {
                str(tier).lower(): float(price) for tier, price in tiers.items()
            }
        except (TypeError, ValueError):
            continue
    return table or dict(_DEFAULT_IMAGE_PRICES)


def estimate_image_cost(model: str, quality: str) -> tuple[float, bool]:
    """Return ``(cost_usd, priced)``; ``(0.0, False)`` when the model has no configured price."""
    table = _load_image_prices()
    tiers = table.get(str(model).lower())
    if not tiers:
        return (0.0, False)
    price = tiers.get(str(quality).lower(), tiers.get("medium"))
    if price is None:
        return (0.0, False)
    return (float(price), True)


class _OpenAICompatibleImageProvider(BaseProvider):
    """Shared ``images/generations`` transport for OpenAI-style image endpoints."""

    capabilities: ClassVar[set[ProviderCapability]] = {ProviderCapability.IMAGE_GENERATION}
    default_base_url: ClassVar[str] = ""
    default_model: ClassVar[str] = ""
    supports_quality: ClassVar[bool] = True

    def __init__(
        self,
        name: str,
        api_key: str,
        base_url: str | None = None,
        default_models: list[str] | None = None,
    ) -> None:
        self.name = name.lower()
        self.api_key = api_key
        self.base_url = (base_url or self.default_base_url).rstrip("/")
        self._models = default_models or [self.default_model]

    def list_available_models(self) -> list[str]:
        return list(self._models)

    def annotate(self, request: ProviderRequest) -> ProviderResponse:  # pragma: no cover
        raise ProviderError(
            f"Provider '{self.name}' generates images only; it cannot classify.", provider=self.name
        )

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        parameters = request.parameters or {}
        model = request.model or self._models[0]
        prompt = str(parameters.get("prompt") or "").strip()
        if not prompt:
            raise ProviderError("Image generation requires a prompt.", provider=self.name)
        quality = str(parameters.get("quality") or "low").lower()
        size = str(parameters.get("size") or "1024x1024")

        payload: dict[str, Any] = {"model": model, "prompt": prompt, "n": 1}
        if self.supports_quality:
            payload["quality"] = quality
        payload["size"] = size

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        endpoint = f"{self.base_url}/images/generations"
        started = time.time()

        try:
            with httpx.Client(timeout=240.0) as client:
                response = client.post(endpoint, json=payload, headers=headers)
                if response.status_code == 400 and self.supports_quality:
                    # Some endpoints reject `quality`/`size`; retry once without the optional fields.
                    stripped = {"model": model, "prompt": prompt, "n": 1}
                    response = client.post(endpoint, json=stripped, headers=headers)
                if response.status_code == 401:
                    raise ProviderAuthenticationError(
                        f"Authentication failed for {self.name}", provider=self.name
                    )
                if response.status_code == 429:
                    raise ProviderRateLimitError(
                        f"Rate limit exceeded for {self.name}", provider=self.name
                    )
                if response.status_code >= 400:
                    raise ProviderError(
                        f"{self.name} returned HTTP {response.status_code}: {response.text[:200]}",
                        provider=self.name,
                    )
                data = response.json()
                items = data.get("data") or []
                if not items:
                    raise ProviderMalformedOutputError(
                        "Image response contained no data items.", provider=self.name
                    )
                b64 = items[0].get("b64_json")
                if not b64:
                    raise ProviderMalformedOutputError(
                        "Image response had no b64_json payload.", provider=self.name
                    )
                image_bytes = base64.b64decode(b64)
                output_format = str(data.get("output_format") or "").lower()
                mime = "image/png"
                if output_format in {"webp", "jpeg", "jpg"}:
                    mime = f"image/{'jpeg' if output_format in {'jpeg', 'jpg'} else output_format}"

                cost_usd, priced = estimate_image_cost(model, quality)
                usage_data = data.get("usage") or {}
                input_tokens = int(usage_data.get("input_tokens") or 0)
                output_tokens = int(usage_data.get("output_tokens") or 0)
                elapsed_ms = (time.time() - started) * 1000

                return ProviderResponse(
                    payload={
                        "image_bytes": image_bytes,
                        "mime_type": mime,
                        "prompt": prompt,
                        "revised_prompt": items[0].get("revised_prompt"),
                        "generation_id": data.get("id") or items[0].get("generation_id"),
                        "model": model,
                        "quality": quality,
                        "priced": priced,
                        "output_format": output_format or mime.split("/")[-1],
                    },
                    confidence=1.0,
                    model=model,
                    usage=ProviderUsage(
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        total_tokens=input_tokens + output_tokens,
                        estimated_cost_usd=cost_usd,
                    ),
                    raw_response={"id": data.get("id"), "priced": priced},
                    latency_ms=round(elapsed_ms, 2),
                )
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError(
                f"Image generation with {self.name} timed out", provider=self.name
            ) from exc
        except httpx.RequestError as exc:
            raise ProviderError(
                f"Connection failure to {self.name}: {exc}", provider=self.name
            ) from exc


class OpenAIImageProvider(_OpenAICompatibleImageProvider):
    """OpenAI image generation (``gpt-image-2`` by default)."""

    default_base_url = "https://api.openai.com/v1"
    default_model = "gpt-image-2"


class MetaImageProvider(_OpenAICompatibleImageProvider):
    """Meta image generation (``muse-image-1.0`` on api.meta.ai)."""

    default_base_url = "https://api.meta.ai/v1"
    default_model = "muse-image-1.0"


def build_live_image_providers() -> list[BaseProvider]:
    """Construct image providers from environment/secrets; skip any without credentials."""
    providers: list[BaseProvider] = []

    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    openai_base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
    openai_model = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2").strip()
    if openai_key:
        providers.append(OpenAIImageProvider(
            "openai-image", api_key=openai_key, base_url=openai_base, default_models=[openai_model]
        ))

    meta_key = os.environ.get("META_API_KEY", "").strip()
    meta_base = os.environ.get("META_BASE_URL", "https://api.meta.ai/v1").strip()
    meta_model = os.environ.get("META_IMAGE_MODEL", "muse-image-1.0").strip()
    if meta_key:
        providers.append(MetaImageProvider(
            "meta-image", api_key=meta_key, base_url=meta_base, default_models=[meta_model]
        ))
    return providers
