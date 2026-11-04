"""
Per-model, per-class reliability weights.

The whole point of a confidence-weighted ensemble is that a model is not trusted equally
everywhere: a model can be excellent at `billing` and mediocre at `general_inquiry`. Weights
are therefore estimated **per class from gold data only** — never from pseudo-labels.

w(m, c) ∝ accuracy(m | c)^alpha · calibration_trust(m)^beta, normalised per class.

Pure functions: no I/O.
"""
from __future__ import annotations

from collections.abc import Sequence

DEFAULT_ALPHA = 2.0   # weight accuracy strongly
DEFAULT_BETA = 1.0    # calibration quality matters, but less than accuracy
ACCURACY_FLOOR = 0.05  # never give a model literally zero weight (kl_div ergence blowups)


def class_accuracy(
    predictions: Sequence[str],
    truths: Sequence[str],
) -> dict[str, float]:
    """Accuracy per true class. Classes absent from ``truths`` are omitted."""
    if len(predictions) != len(truths):
        raise ValueError("predictions and truths must have equal length")
    totals: dict[str, int] = {}
    hits: dict[str, int] = {}
    for predicted, truth in zip(predictions, truths, strict=True):
        totals[truth] = totals.get(truth, 0) + 1
        if predicted == truth:
            hits[truth] = hits.get(truth, 0) + 1
    return {label: round(hits.get(label, 0) / count, 6) for label, count in totals.items()}


def calibration_trust(ece: float) -> float:
    """Map ECE (lower is better) to a trust multiplier in ``(0, 1]``."""
    return 1.0 / (1.0 + max(0.0, float(ece)))


def reliability_weights(
    model_class_accuracy: dict[str, dict[str, float]],
    model_ece: dict[str, float],
    classes: Sequence[str],
    *,
    alpha: float = DEFAULT_ALPHA,
    beta: float = DEFAULT_BETA,
    fallback_accuracy: float = 0.5,
) -> dict[tuple[str, str], float]:
    """Compute normalised per-(model, class) weights.

    ``model_class_accuracy``: ``{model: {class: accuracy}}`` measured on gold.
    ``model_ece``: ``{model: ece}`` measured on gold.
    Missing (model, class) accuracy falls back to ``fallback_accuracy`` (not to 0) so a class a
    model was never measured on does not silently disqualify it.
    """
    if not model_class_accuracy:
        return {}
    models = list(model_class_accuracy)
    per_class_raw: dict[str, dict[str, float]] = {label: {} for label in classes}

    for model in models:
        trust = calibration_trust(model_ece.get(model, 0.0))
        for label in classes:
            accuracy = model_class_accuracy[model].get(label)
            if accuracy is None:
                accuracy = fallback_accuracy
            accuracy = max(ACCURACY_FLOOR, min(1.0, float(accuracy)))
            per_class_raw[label][model] = (accuracy ** alpha) * (trust ** beta)

    weights: dict[tuple[str, str], float] = {}
    for label, raw in per_class_raw.items():
        total = sum(raw.values())
        if total <= 0:
            even = 1.0 / max(1, len(raw))
            for model in raw:
                weights[(model, label)] = round(even, 6)
            continue
        for model, value in raw.items():
            weights[(model, label)] = round(value / total, 6)
    return weights


def collapse_to_model_weights(
    per_class_weights: dict[tuple[str, str], float],
    class_prior: dict[str, float] | None = None,
) -> dict[str, float]:
    """Collapse per-class weights into one scalar per model for scalar-weight aggregators.

    Uses the gold class prior as the mixture weight (uniform when no prior is supplied).
    """
    if not per_class_weights:
        return {}
    classes = sorted({label for _, label in per_class_weights})
    prior = class_prior or {label: 1.0 / len(classes) for label in classes}
    total_prior = sum(prior.get(label, 0.0) for label in classes) or 1.0

    models = sorted({model for model, _ in per_class_weights})
    collapsed: dict[str, float] = {}
    for model in models:
        collapsed[model] = round(
            sum(
                per_class_weights.get((model, label), 0.0) * prior.get(label, 0.0) / total_prior
                for label in classes
            ),
            6,
        )
    return collapsed
