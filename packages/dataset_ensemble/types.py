"""Core value types for ensemble pseudo-labeling (pure data, no I/O)."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

# Probability mass floor used when a model's distribution is partial or degenerate.
EPS = 1e-12


class Band(str, Enum):
    """Where an aggregated label goes."""

    AUTO_ACCEPT = "auto_accept"     # candidate label handed to the dataset as origin=ensemble
    HUMAN_REVIEW = "human_review"   # active-learning queue
    REJECT = "reject"               # do not label; candidate for generation


@dataclass(frozen=True)
class ModelVote:
    """One model's judgment about one record."""

    model: str
    label: str
    #: Full distribution ``{class: p}`` when the provider returns one. Preferred.
    probs: dict[str, float] | None = None
    #: Self-reported confidence. Used only when ``probs`` is absent, and never trusted raw
    #: (it is calibrated before use).
    confidence: float = 1.0
    raw: dict[str, Any] | None = None
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    latency_ms: float = 0.0
    error: str | None = None
    prompt_version: str = "v1"

    @property
    def ok(self) -> bool:
        return self.error is None and bool(self.label)


@dataclass(frozen=True)
class AggregatedLabel:
    """Result of fusing several votes for one record."""

    record_id: str
    label: str
    confidence: float
    probs: dict[str, float]
    entropy: float
    normalized_entropy: float
    kappa: float
    disagreement: float
    n_models: int
    contributing_models: tuple[str, ...] = ()
    failed_models: tuple[str, ...] = ()
    total_cost_usd: float = 0.0

    @property
    def unanimous(self) -> bool:
        return self.disagreement == 0.0 and self.n_models > 1


@dataclass(frozen=True)
class RoutingDecision:
    """Selection outcome for one aggregated label."""

    record_id: str
    band: Band
    label: str
    confidence: float
    threshold_hi: float
    threshold_lo: float
    reason: str
    priority: float = 0.0  # lower = review sooner


@dataclass
class Thresholds:
    """Per-class confidence thresholds plus the achieved gold statistics."""

    tau_hi: dict[str, float] = field(default_factory=dict)
    tau_lo: dict[str, float] = field(default_factory=dict)
    target_precision: float = 0.99
    achieved_precision: float = 0.0
    yield_fraction: float = 0.0
    support: int = 0


def to_distribution(
    vote: ModelVote,
    classes: list[str],
    *,
    spread_residual: bool = True,
) -> dict[str, float]:
    """Convert a vote into a proper probability distribution over ``classes``.

    - If ``probs`` is present: align to ``classes``, floor at ``EPS``, renormalise.
    - Otherwise: put ``confidence`` on the voted label. If the label is not in ``classes``
      (hallucinated class) fall back to uniform — the vote is still usable as evidence of
      *uncertainty* but contributes no label mass.
    - ``spread_residual``: distribute the remaining ``1 - confidence`` equally over the other
      classes instead of concentrating it on the voted label. This makes overconfident models
      less able to dominate pooling before calibration.
    """
    if not classes:
        raise ValueError("classes must not be empty")
    keys = [str(c) for c in classes]

    if vote.probs:
        raw = {str(k): max(float(v), EPS) for k, v in vote.probs.items()}
        aligned = {k: raw.get(k, EPS) for k in keys}
        total = sum(aligned.values())
        if total <= 0:
            return {k: 1.0 / len(keys) for k in keys}
        return {k: v / total for k, v in aligned.items()}

    confidence = min(1.0, max(0.0, float(vote.confidence)))
    if vote.label not in keys:
        return {k: 1.0 / len(keys) for k in keys}

    if len(keys) == 1:
        return {keys[0]: 1.0}

    if spread_residual:
        residual = (1.0 - confidence) / (len(keys) - 1)
        return {k: (confidence if k == vote.label else residual) for k in keys}
    return {k: (confidence if k == vote.label else EPS) for k in keys}
