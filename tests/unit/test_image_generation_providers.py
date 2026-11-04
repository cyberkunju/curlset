"""Unit tests for image-generation providers and per-image cost estimation."""
from __future__ import annotations

import base64
import io
from typing import ClassVar
from unittest.mock import patch

import pytest
from PIL import Image

from packages.provider_gateway.image_generation import (
    MetaImageProvider,
    OpenAIImageProvider,
    estimate_image_cost,
)
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderError,
    ProviderRequest,
)


def _png_bytes(rgb=(200, 40, 40)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (16, 16), rgb).save(buffer, format="PNG")
    return buffer.getvalue()


class _FakeResponse:
    def __init__(self, status_code: int, body: dict):
        self.status_code = status_code
        self._body = body
        self.text = str(body)

    def json(self):
        return self._body


class _FakeClient:
    captured: ClassVar[dict] = {}
    response: ClassVar[_FakeResponse] = _FakeResponse(200, {})

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, url, json=None, headers=None):
        _FakeClient.captured["url"] = url
        _FakeClient.captured["payload"] = json
        return _FakeClient.response


def _request(quality: str = "low", model: str = "gpt-image-2") -> ProviderRequest:
    return ProviderRequest(
        model=model,
        task_type="image_classification",
        parameters={"prompt": "a red apple", "quality": quality, "size": "1024x1024"},
    )


def test_openai_provider_posts_images_request_and_decodes_png():
    png = _png_bytes()
    _FakeClient.response = _FakeResponse(200, {
        "data": [{"b64_json": base64.b64encode(png).decode()}],
        "usage": {"input_tokens": 22, "output_tokens": 196},
    })
    provider = OpenAIImageProvider("openai-image", api_key="k")
    with patch("packages.provider_gateway.image_generation.httpx.Client", _FakeClient):
        response = provider.generate(_request(model="gpt-image-2"))
    assert _FakeClient.captured["url"].endswith("/images/generations")
    assert _FakeClient.captured["payload"]["model"] == "gpt-image-2"
    assert _FakeClient.captured["payload"]["quality"] == "low"
    assert response.payload["image_bytes"] == png
    assert response.payload["mime_type"] == "image/png"
    assert response.usage.estimated_cost_usd > 0


def test_meta_provider_handles_webp_output_and_price_unknown():
    webp = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 40
    _FakeClient.response = _FakeResponse(200, {
        "output_format": "webp",
        "data": [{"b64_json": base64.b64encode(webp).decode()}],
        "usage": {},
    })
    provider = MetaImageProvider("meta-image", api_key="k")
    with patch("packages.provider_gateway.image_generation.httpx.Client", _FakeClient):
        response = provider.generate(_request(model="muse-image-1.0"))
    assert _FakeClient.captured["payload"]["model"] == "muse-image-1.0"
    assert response.payload["mime_type"] == "image/webp"
    assert response.payload["priced"] is False
    assert response.usage.estimated_cost_usd == 0.0


def test_authentication_error_is_mapped():
    _FakeClient.response = _FakeResponse(401, {"error": "bad key"})
    provider = OpenAIImageProvider("openai-image", api_key="k")
    with patch("packages.provider_gateway.image_generation.httpx.Client", _FakeClient), \
         pytest.raises(ProviderError) as info:
        provider.generate(_request())
    assert "Authentication" in str(info.value.message) or "401" in str(info.value.message)


def test_missing_image_payload_is_rejected():
    _FakeClient.response = _FakeResponse(200, {"data": [{}]})
    provider = OpenAIImageProvider("openai-image", api_key="k")
    with patch("packages.provider_gateway.image_generation.httpx.Client", _FakeClient), \
         pytest.raises(ProviderError):
        provider.generate(_request())


def test_providers_advertise_only_image_generation():
    for provider in (OpenAIImageProvider("a", api_key="k"), MetaImageProvider("b", api_key="k")):
        assert ProviderCapability.IMAGE_GENERATION in provider.capabilities
        assert ProviderCapability.TEXT_CLASSIFICATION not in provider.capabilities


def test_image_cost_estimation_and_unknown_model():
    cost, priced = estimate_image_cost("gpt-image-2", "low")
    assert priced is True and cost > 0
    medium_cost, _ = estimate_image_cost("gpt-image-2", "medium")
    assert medium_cost > cost
    unknown_cost, unknown_priced = estimate_image_cost("mystery-model", "low")
    assert (unknown_cost, unknown_priced) == (0.0, False)
