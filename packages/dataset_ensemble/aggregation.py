"""
Aggregation of several model votes into one ensemble judgment.

Primary aggregator: **weighted log-odds pooling** (product of experts), which lets a model carry
weight proportional to its measured reliability. Baselines (majority vote, weighted vote, mean
probabilities) are implemented alongside it because the experiment (E1) must prove pooling beats
them — otherwise we ship the simpler thing.

Pure functions: no I/O.
"""
from __future__ import annotations

import math
from collections import Counter
from collections.abc import Sequence

from packages.dataset_ensemble.types import (
    EPS,
    AggregatedLabel,
    ModelVote,
    to_distribution,
)


def _normalise(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values())
    if total <= 0:
        n = max(1, len(weights))
        return {k: 1.0 / n for k in weights}
    return {k: v / total for k, v in weights.items()}


def weighted_log_odds(
    votes: Sequence[ModelVote],
    classes: list[str],
    weights: dict[str, float] | None = None,
) -> tuple[str, dict[str, float]]:
    """Weighted log-odds pooling over ``classes``.

    ``weights`` maps model name → competence weight (defaults to uniform). Returns the argmax
    label and the pooled distribution.
    """
    usable = [vote for vote in votes if vote.ok]
    if not usable:
        return "", {}
    if not classes:
        raise ValueError("classes must not be empty")

    model_weights = _normalise(
        {vote.model: (weights or {}).get(vote.model, 1.0) for vote in usable}
    )

    log_odds = {label: 0.0 for label in classes}
    for vote in usable:
        dist = to_distribution(vote, classes)
        w = model_weights[vote.model]
        for label in classes:
            log_odds[label] += w * math.log(max(dist[label], EPS))

    label = max(classes, key=lambda c: log_odds[c])
    return label, _softmax_from_logs([log_odds[c] for c in classes], classes)


def _softmax_from_logs(logs: Sequence[float], classes: Sequence[str]) -> dict[str, float]:
    peak = max(logs)
    exps = [math.exp(value - peak) for value in logs]
    total = sum(exps) or 1.0
    return {label: value / total for label, value in zip(classes, exps, strict=True)}


def majority_vote(votes: Sequence[ModelVote], classes: list[str]) -> tuple[str, dict[str, float]]:
    """Unweighted plurality. Ties break deterministically by class order."""
    usable = [vote for vote in votes if vote.ok and vote.label in classes]
    if not usable:
        return "", {}
    counts = Counter(vote.label for vote in usable)
    label = max(classes, key=lambda c: (counts.get(c, 0), -classes.index(c)))
    total = sum(counts.values()) or 1
    return label, {c: counts.get(c, 0) / total for c in classes}


def weighted_vote(
    votes: Sequence[ModelVote],
    classes: list[str],
    weights: dict[str, float] | None = None,
) -> tuple[str, dict[str, float]]:
    """Reliability-weighted plurality over hard labels."""
    usable = [vote for vote in votes if vote.ok and vote.label in classes]
    if not usable:
        return "", {}
    model_weights = _normalise({vote.model: (weights or {}).get(vote.model, 1.0) for vote in usable})
    mass = {label: 0.0 for label in classes}
    for vote in usable:
        mass[vote.label] += model_weights[vote.model]
    label = max(classes, key=lambda c: mass[c])
    return label, _normalise(mass)


def mean_probabilities(
    votes: Sequence[ModelVote],
    classes: list[str],
    weights: dict[str, float] | None = None,
) -> tuple[str, dict[str, float]]:
    """Arithmetic mean of per-model distributions."""
    usable = [vote for vote in votes if vote.ok]
    if not usable:
        return "", {}
    model_weights = _normalise({vote.model: (weights or {}).get(vote.model, 1.0) for vote in usable})
    pooled = {label: 0.0 for label in classes}
    for vote in usable:
        dist = to_distribution(vote, classes)
        for label in classes:
            pooled[label] += model_weights[vote.model] * dist[label]
    label = max(classes, key=lambda c: pooled[c])
    return label, _normalise(pooled)


def entropy(probs: dict[str, float]) -> float:
    """Shannon entropy in nats."""
    return -sum(p * math.log(max(p, EPS)) for p in probs.values() if p > 0)


def normalized_entropy(probs: dict[str, float]) -> float:
    """Entropy divided by ``log(n_classes)`` so it is comparable across label sets."""
    n = len(probs)
    if n <= 1:
        return 0.0
    return entropy(probs) / math.log(n)


def pairwise_disagreement(votes: Sequence[ModelVote]) -> float:
    """Fraction of model pairs that disagree on the hard label (0 = unanimous)."""
    usable = [vote for vote in votes if vote.ok]
    if len(usable) < 2:
        return 0.0
    pairs = 0
    disagreements = 0
    for i in range(len(usable)):
        for j in range(i + 1, len(usable)):
            pairs += 1
            if usable[i].label != usable[j].label:
                disagreements += 1
    return round(disagreements / pairs, 6)


def fleiss_kappa(label_rows: Sequence[Sequence[str]]) -> float:
    """Fleiss' kappa for ``n`` items x ``m`` raters (categorical, chance-corrected agreement).

    ``1.0`` = unanimous, ``0.0`` = chance. Returns ``1.0`` when there is only one rater.
    """
    rows = [list(row) for row in label_rows if row]
    if not rows:
        return 0.0
    n_raters = len(rows[0])
    if n_raters < 2:
        return 1.0

    categories = sorted({label for row in rows for label in row})
    if len(categories) < 2:
        return 1.0

    # P_i per item
    p_items = []
    for row in rows:
        counts = Counter(row)
        p_items.append(
            (sum(count * count for count in counts.values()) - n_raters) / (n_raters * (n_raters - 1))
        )
    p_bar = sum(p_items) / len(p_items)

    totals = Counter(label for row in rows for label in row)
    n_total = len(rows) * n_raters
    p_expected = sum((totals[c] / n_total) ** 2 for c in categories)

    if p_expected >= 1.0:
        return 1.0
    return round((p_bar - p_expected) / (1.0 - p_expected), 6)


def aggregate(
    record_id: str,
    votes: Sequence[ModelVote],
    classes: list[str],
    weights: dict[str, float] | None = None,
    *,
    strategy: str = "log_odds",
) -> AggregatedLabel:
    """Fuse votes for one record into an :class:`AggregatedLabel`."""
    strategies = {
        "log_odds": weighted_log_odds,
        "majority": majority_vote,
        "weighted_vote": weighted_vote,
        "mean_probs": mean_probabilities,
    }
    if strategy not in strategies:
        raise ValueError(f"unknown strategy '{strategy}' (choose from {sorted(strategies)})")

    return_probabilities = strategy in {"log_odds", "mean_probs"}
    if strategy == "majority":
        # majority_vote is unweighted by definition and takes no weights argument.
        label, probs = majority_vote(votes, classes)
    else:
        label, probs = strategies[strategy](votes, classes, weights)

    usable = [vote for vote in votes if vote.ok]
    if not return_probabilities:
        probs = {c: probs.get(c, 0.0) for c in classes}

    confidence = max(probs.values()) if probs else 0.0
    kappa = fleiss_kappa([[vote.label for vote in usable]]) if len(usable) >= 2 else 1.0
    # NOTE: kappa over a single item is not meaningful; aggregate-level kappa is computed over
    # the whole gold set in the experiment harness. Per-record we expose 1.0 for unanimous and
    # let the selection layer use confidence + disagreement.

    return AggregatedLabel(
        record_id=record_id,
        label=label,
        confidence=round(float(confidence), 6),
        probs=probs,
        entropy=round(entropy(probs), 6) if probs else 0.0,
        normalized_entropy=round(normalized_entropy(probs), 6) if probs else 0.0,
        kappa=kappa,
        disagreement=pairwise_disagreement(votes),
        n_models=len(usable),
        contributing_models=tuple(vote.model for vote in usable),
        failed_models=tuple(vote.model for vote in votes if not vote.ok),
        total_cost_usd=round(sum(vote.cost_usd for vote in votes), 6),
    )
