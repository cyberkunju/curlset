"""
Selection: turn ensemble confidences into an auto-accept / human-review / reject decision, and
produce an honest precision estimate for the auto-accepted band.

The central operation is solving a per-class confidence threshold so that the **Wilson lower
bound** of precision on a gold set meets the target. Reporting a point estimate as a guarantee
would be dishonest, so every number we surface carries its interval.

Pure functions: no I/O.
"""
from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from packages.dataset_ensemble.types import (
    AggregatedLabel,
    Band,
    RoutingDecision,
)

Z_95 = 1.959963984540054


def wilson_lower_bound(successes: int, n: int, z: float = Z_95) -> float:
    """Wilson score interval lower bound for a binomial proportion.

    Robust for small ``n`` and proportions near 0 or 1 — which is exactly our regime
    (target precision 99 %, audit samples of a few hundred).
    """
    if n <= 0:
        return 0.0
    p_hat = successes / n
    denominator = 1.0 + z * z / n
    centre = p_hat + z * z / (2.0 * n)
    margin = z * math.sqrt(p_hat * (1.0 - p_hat) / n + z * z / (4.0 * n * n))
    return max(0.0, min(1.0, (centre - margin) / denominator))


def wilson_interval(successes: int, n: int, z: float = Z_95) -> tuple[float, float]:
    """Full Wilson interval ``(low, high)``."""
    if n <= 0:
        return (0.0, 0.0)
    p_hat = successes / n
    denominator = 1.0 + z * z / n
    centre = p_hat + z * z / (2.0 * n)
    margin = z * math.sqrt(p_hat * (1.0 - p_hat) / n + z * z / (4.0 * n * n))
    low = max(0.0, (centre - margin) / denominator)
    high = min(1.0, (centre + margin) / denominator)
    return (round(low, 6), round(high, 6))


def precision_with_interval(correct: Sequence[bool]) -> tuple[float, float, float]:
    """Return ``(precision, wilson_low, wilson_high)`` for a boolean correctness sample."""
    n = len(correct)
    if n == 0:
        return (0.0, 0.0, 0.0)
    successes = sum(1 for ok in correct if ok)
    low, high = wilson_interval(successes, n)
    return (round(successes / n, 6), low, high)


@dataclass(frozen=True)
class ThresholdSolution:
    """Solved auto-accept threshold for one class (or the whole dataset)."""

    label: str
    threshold: float
    accepted: int
    support: int
    precision: float
    wilson_low: float
    wilson_high: float
    target_precision: float
    met_target: bool

    @property
    def yield_fraction(self) -> float:
        return round(self.accepted / self.support, 6) if self.support else 0.0


def solve_threshold_for_precision(
    confidences: Sequence[float],
    correct: Sequence[bool],
    *,
    label: str = "__all__",
    target_precision: float = 0.99,
    min_support: int = 30,
) -> ThresholdSolution:
    """Smallest threshold whose accepted set has Wilson-LB precision ≥ target.

    Walks candidates from most to least confident and keeps the **largest** accepted set that
    still satisfies the target (i.e. maximises yield subject to the precision floor).
    """
    if len(confidences) != len(correct):
        raise ValueError("confidences and correct must have equal length")
    n = len(confidences)
    if n == 0:
        return ThresholdSolution(label, 1.0, 0, 0, 0.0, 0.0, 0.0, target_precision, False)

    ordered = sorted(
        zip(confidences, correct, strict=True), key=lambda item: item[0], reverse=True
    )

    best: ThresholdSolution | None = None
    successes = 0
    for index, (confidence, ok) in enumerate(ordered, start=1):
        successes += 1 if ok else 0
        if index < min_support:
            continue
        low = wilson_lower_bound(successes, index)
        if low >= target_precision:
            precision = successes / index
            high = wilson_interval(successes, index)[1]
            best = ThresholdSolution(
                label=label,
                threshold=round(confidence, 6),
                accepted=index,
                support=n,
                precision=round(precision, 6),
                wilson_low=round(low, 6),
                wilson_high=high,
                target_precision=target_precision,
                met_target=True,
            )

    if best is not None:
        return best

    # No threshold met the target: report the most confident set for diagnostics.
    take = min(n, max(min_support, 1))
    head = ordered[:take]
    successes_head = sum(1 for _, ok in head if ok)
    low, high = wilson_interval(successes_head, take)
    return ThresholdSolution(
        label=label,
        threshold=round(head[-1][0], 6),
        accepted=take,
        support=n,
        precision=round(successes_head / take, 6),
        wilson_low=low,
        wilson_high=high,
        target_precision=target_precision,
        met_target=False,
    )


def solve_class_thresholds(
    rows: Sequence[tuple[str, float, bool]],
    *,
    target_precision: float = 0.99,
    min_support: int = 30,
) -> dict[str, ThresholdSolution]:
    """Solve one threshold per predicted label, plus an ``__all__`` fallback."""
    buckets: dict[str, list[tuple[float, bool]]] = {}
    for label, confidence, ok in rows:
        buckets.setdefault(label, []).append((confidence, ok))

    solutions: dict[str, ThresholdSolution] = {}
    for label, bucket in buckets.items():
        confidences = [c for c, _ in bucket]
        correct = [ok for _, ok in bucket]
        solutions[label] = solve_threshold_for_precision(
            confidences,
            correct,
            label=label,
            target_precision=target_precision,
            min_support=min(min_support, len(bucket)) if bucket else min_support,
        )
    all_conf = [c for _, c, _ in rows]
    all_ok = [ok for _, _, ok in rows]
    solutions["__all__"] = solve_threshold_for_precision(
        all_conf, all_ok, target_precision=target_precision, min_support=min(min_support, len(rows))
    )
    return solutions


def audit_sample_size(
    expected_precision: float,
    *,
    target_lower_bound: float = 0.99,
    max_n: int = 100_000,
    start_n: int = 30,
) -> int:
    """Smallest audit sample ``n`` whose Wilson LB would reach ``target_lower_bound``.

    Used to size the human audit before claiming a precision floor. Assumes the observed
    precision equals ``expected_precision``.
    """
    if expected_precision <= target_lower_bound:
        raise ValueError(
            "expected_precision must exceed target_lower_bound for a finite sample to certify it"
        )
    for n in range(start_n, max_n + 1, 10):
        successes = round(expected_precision * n)
        if wilson_lower_bound(successes, n) >= target_lower_bound:
            return n
    return max_n


def route_votes(
    aggregated: AggregatedLabel,
    *,
    tau_hi: float,
    tau_lo: float,
    kappa_min: float = 0.0,
    agreement_floor: float = 0.5,
    correlated_error_flagged: bool = False,
) -> RoutingDecision:
    """Three-band routing for one aggregated label.

    ``tau_hi`` / ``tau_lo`` come from :func:`solve_class_thresholds` on a gold set.
    ``correlated_error_flagged`` widens the review band: when models are known to fail together,
    trust in unanimous agreement must drop.
    """
    confidence = aggregated.confidence
    unanimity = 1.0 - aggregated.disagreement

    if correlated_error_flagged:
        return RoutingDecision(
            record_id=aggregated.record_id,
            band=Band.HUMAN_REVIEW,
            label=aggregated.label,
            confidence=confidence,
            threshold_hi=tau_hi,
            threshold_lo=tau_lo,
            reason="models flagged for correlated errors: confidence is not trustworthy enough",
            priority=0.0,
        )

    if confidence >= tau_hi and unanimity >= agreement_floor and aggregated.kappa >= kappa_min:
        return RoutingDecision(
            record_id=aggregated.record_id,
            band=Band.AUTO_ACCEPT,
            label=aggregated.label,
            confidence=confidence,
            threshold_hi=tau_hi,
            threshold_lo=tau_lo,
            reason=f"confidence {confidence:.3f} ≥ τ_hi {tau_hi:.3f}; agreement {unanimity:.2f}",
            priority=0.0,
        )

    if confidence >= tau_lo:
        return RoutingDecision(
            record_id=aggregated.record_id,
            band=Band.HUMAN_REVIEW,
            label=aggregated.label,
            confidence=confidence,
            threshold_hi=tau_hi,
            threshold_lo=tau_lo,
            reason=f"confidence {confidence:.3f} in review band [{tau_lo:.3f}, {tau_hi:.3f})",
            priority=round(1.0 - confidence, 6),
        )

    return RoutingDecision(
        record_id=aggregated.record_id,
        band=Band.REJECT,
        label=aggregated.label,
        confidence=confidence,
        threshold_hi=tau_hi,
        threshold_lo=tau_lo,
        reason=f"confidence {confidence:.3f} below τ_lo {tau_lo:.3f}",
        priority=round(1.0 - confidence, 6),
    )
