"""
Token pricing and cost estimation for provider calls.

Why this exists: the ensemble fan-out has a hard USD budget cap, but the OpenAI-compatible adapter
reported ``estimated_cost_usd = 0`` for every call, so the cap could never trigger — a real spend
hazard discovered during live runs (see docs/ENSEMBLE_PSEUDO_LABELING.md "Cost post-mortem").

Pricing is **configuration**, not code: public list prices change and self-hosted endpoints have
their own economics. Set ``PROVIDER_PRICES`` as a JSON object mapping a provider/model prefix to
``{"input": <usd per 1M input tokens>, "output": <usd per 1M output tokens>}``:

    PROVIDER_PRICES='{"deepseek-ai/": {"input": 0.28, "output": 0.42},
                      "gpt-6": {"input": 1.25, "output": 10.0}}'

An unpriced provider is reported as *unknown* rather than assumed free, and the fan-out surfaces
that so a budget cap is never silently unenforceable.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Price:
    input_per_mtok: float
    output_per_mtok: float

    def cost(self, tokens_in: int, tokens_out: int) -> float:
        return round(
            max(0, tokens_in) / 1_000_000.0 * self.input_per_mtok
            + max(0, tokens_out) / 1_000_000.0 * self.output_per_mtok,
            6,
        )


def _load_prices() -> dict[str, Price]:
    raw = os.environ.get("PROVIDER_PRICES", "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    prices: dict[str, Price] = {}
    if not isinstance(parsed, dict):
        return {}
    for prefix, value in parsed.items():
        if not isinstance(value, dict):
            continue
        try:
            prices[str(prefix).lower()] = Price(
                input_per_mtok=float(value.get("input", 0.0)),
                output_per_mtok=float(value.get("output", 0.0)),
            )
        except (TypeError, ValueError):
            continue
    return prices


def price_for(provider: str, model: str) -> Price | None:
    """Longest-prefix match on ``provider::model`` / model / provider. ``None`` means unknown."""
    prices = _load_prices()
    if not prices:
        return None
    identifiers = [f"{provider}::{model}".lower(), (model or "").lower(), (provider or "").lower()]
    best: tuple[int, Price] | None = None
    for prefix, price in prices.items():
        for identifier in identifiers:
            if identifier.startswith(prefix):
                score = len(prefix)
                if best is None or score > best[0]:
                    best = (score, price)
    return best[1] if best else None


def estimate_cost(provider: str, model: str, tokens_in: int, tokens_out: int) -> tuple[float, bool]:
    """Return ``(cost_usd, priced?)``. Unknown pricing yields ``(0.0, False)`` — never guessed."""
    price = price_for(provider, model)
    if price is None:
        return (0.0, False)
    return (price.cost(tokens_in, tokens_out), True)


def is_priced(provider: str, model: str) -> bool:
    return price_for(provider, model) is not None
