"""Unit tests: multimodal provider payloads and deterministic simulated image labels."""
from __future__ import annotations

from typing import ClassVar
from unittest.mock import patch

from packages.provider_gateway.compatible_provider import OpenAICompatibleProvider
from packages.provider_gateway.simulated_provider import SimulatedEnsembleProvider
from packages.provider_gateway.types import ProviderCapability, ProviderRequest

CLASSES = ["red", "green", "blue"]

IMAGES = {
    "red": b"\x89PNG\r\n\x1a\n" + b"A" * 40,
    "green": b"\x89PNG\r\n\x1a\n" + b"B" * 40,
}


def _request(asset: bytes | None = None, text: str | None = None) -> ProviderRequest:
    return ProviderRequest(
        model="m",
        task_type="image_classification",
        asset_bytes=asset,
        input_text=text,
        label_schema={"labels": CLASSES},
    )


def test_simulated_model_accepts_image_capability():
    assert ProviderCapability.IMAGE_CLASSIFICATION in SimulatedEnsembleProvider("sim").capabilities


def test_simulated_image_labels_are_deterministic_and_in_schema():
    strong = SimulatedEnsembleProvider("sim-strong")
    medium = SimulatedEnsembleProvider("sim-medium")
    first = strong.annotate(_request(IMAGES["red"]))
    again = strong.annotate(_request(IMAGES["red"]))
    other_model = medium.annotate(_request(IMAGES["red"]))
    assert first.payload["label"] in CLASSES
    assert first.payload["label"] == again.payload["label"]
    # both models share the underlying truth for the same image bytes
    assert first.payload["label"] == other_model.payload["label"]


def test_image_and_text_inputs_both_work():
    provider = SimulatedEnsembleProvider("sim")
    image = provider.annotate(_request(IMAGES["green"]))
    text = provider.annotate(ProviderRequest(
        model="m", task_type="text_classification", input_text="a plain sentence",
        label_schema={"labels": CLASSES},
    ))
    assert image.payload["label"] in CLASSES
    assert text.payload["label"] in CLASSES


class _FakeResponse:
    status_code = 200
    text = "ok"

    def json(self):
        return {
            "id": "resp_1",
            "choices": [{"message": {"content": '{"label": "red", "confidence": 0.91}'}}],
            "usage": {"prompt_tokens": 12, "completion_tokens": 6},
        }


class _FakeClient:
    captured: ClassVar[dict] = {}

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, url, json=None, headers=None):
        _FakeClient.captured["payload"] = json
        return _FakeResponse()


def test_compatible_adapter_sends_image_as_multimodal_content():
    provider = OpenAICompatibleProvider(
        "live-openai", api_key="k", base_url="https://api.example/v1", default_models=["gpt-6-luna"]
    )
    with patch("packages.provider_gateway.compatible_provider.httpx.Client", _FakeClient):
        response = provider.annotate(
            ProviderRequest(
                model="gpt-6-luna",
                task_type="image_classification",
                asset_bytes=IMAGES["red"],
                label_schema={"labels": CLASSES},
            )
        )
    content = _FakeClient.captured["payload"]["messages"][1]["content"]
    assert isinstance(content, list)
    assert [part["type"] for part in content] == ["text", "image_url"]
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")
    assert response.payload["label"] == "red"


def test_compatible_adapter_keeps_text_calls_as_plain_strings():
    provider = OpenAICompatibleProvider(
        "live-openai", api_key="k", base_url="https://api.example/v1", default_models=["gpt-6-luna"]
    )
    with patch("packages.provider_gateway.compatible_provider.httpx.Client", _FakeClient):
        provider.annotate(ProviderRequest(
            model="gpt-6-luna", task_type="text_classification", input_text="hello",
            label_schema={"labels": CLASSES},
        ))
    content = _FakeClient.captured["payload"]["messages"][1]["content"]
    assert isinstance(content, str)
