"""Unit tests for provider token pricing (budget-cap enforceability)."""
from __future__ import annotations

import json

import pytest

from packages.provider_gateway import pricing


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv("PROVIDER_PRICES", raising=False)
    yield


def test_unknown_price_is_reported_not_assumed_free():
    cost, priced = pricing.estimate_cost("some-provider", "some-model", 1_000_000, 1_000_000)
    assert cost == 0.0
    assert priced is False
    assert pricing.is_priced("some-provider", "some-model") is False


def test_env_prices_are_used_with_longest_prefix(monkeypatch):
    monkeypatch.setenv("PROVIDER_PRICES", json.dumps({
        "deepseek": {"input": 1.0, "output": 2.0},
        "deepseek-ai/DeepSeek": {"input": 0.30, "output": 0.60},
    }))
    cost, priced = pricing.estimate_cost(
        "deepseek-ai/DeepSeek-V4.1-Flash-1017", "deepseek-ai/DeepSeek-V4.1-Flash-1017", 1_000_000, 1_000_000
    )
    assert priced is True
    # longest matching prefix (the model-specific one) must win
    assert cost == pytest.approx(0.90)


def test_price_math_for_partial_tokens(monkeypatch):
    monkeypatch.setenv("PROVIDER_PRICES", json.dumps({"gpt-6": {"input": 1.0, "output": 10.0}}))
    cost, priced = pricing.estimate_cost("live-openai", "gpt-6-luna", 500_000, 100_000)
    assert priced is True
    assert cost == pytest.approx(0.5 + 1.0)


def test_invalid_json_is_ignored_safely(monkeypatch):
    monkeypatch.setenv("PROVIDER_PRICES", "{not json")
    assert pricing.price_for("x", "y") is None


def test_negative_tokens_are_clamped(monkeypatch):
    monkeypatch.setenv("PROVIDER_PRICES", json.dumps({"m": {"input": 1.0, "output": 1.0}}))
    cost, _priced = pricing.estimate_cost("p", "m", -5, -5)
    assert cost == 0.0