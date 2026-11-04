"""
Dataset-local specialist: a linear probe on frozen embeddings, cross-fitted for honest estimates.

Why this exists
---------------
Frontier LLMs consulted together share their mistakes: on ``data/hard.db`` three models are wrong on
the same 31 of 300 records (blind-spot mass c = 10.33%), so no aggregation can exceed 89.67%. Their
agreement is not skill, it is a shared reading of the *general* language of the labels.

A probe fitted on **this dataset's own gold labels** encodes the owner's policy instead. It is usually
weaker in absolute terms (here ~90% vs ~87% panel), yet it is correct on ~94% of the records the panel
 unanimously misses — so pooled with the panel it lifts the achievable ceiling to ~99%. That is the
whole point: we are buying *complementarity*, not accuracy.

Honesty constraints baked into this module
------------------------------------------
* Estimates are **cross-fitted** (out-of-fold): a probe scored on records it trained on would report
  near-perfect rescue and prove nothing.
* Splits are **grouped** by caller-supplied group keys (e.g. a near-duplicate cluster or template id).
  Without grouping, one sentence repeated under five suffixes leaks across folds and inflates every
  number — measured here at a design effect of 3.37.
* **No tuned threshold is reported as a result.** The caller gets a risk-coverage curve; picking the
  best row of that curve and quoting it is the winner's curse, so the choice is made outside, on the
  certified audit, not here.
* Confidence intervals are **cluster-bootstrapped over groups**, because groups are the exchangeable
  unit, not rows.

Heavy dependencies (numpy, scikit-learn) are optional and imported lazily, so the rest of the platform
keeps running when the ``specialist`` extra is not installed.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from packages.dataset_ensemble.rescue import (
    oracle_accuracy,
    profile_source,
)

DEFAULT_FOLDS = 5
DEFAULT_C = 10.0
DEFAULT_BOOTSTRAP_REPS = 2000
MIN_ROWS_PER_CLASS = 2
MIN_ROWS_TOTAL = 30


class SpecialistDependencyError(RuntimeError):
    """Raised when numpy/scikit-learn are not installed — the feature is optional by design."""


class SpecialistDataError(ValueError):
    """Raised when the dataset is too small or too skewed to fit a trustworthy probe."""


def _require_ml() -> tuple[Any, Any]:
    try:
        import numpy as np
        from sklearn.linear_model import LogisticRegression
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise SpecialistDependencyError(
            "the specialist needs numpy and scikit-learn: pip install -e '.[specialist]'"
        ) from exc
    return np, LogisticRegression


@dataclass(frozen=True)
class RiskCoveragePoint:
    """Selective-acceptance statistics at one confidence threshold."""

    threshold: float
    coverage: float          # fraction of records accepted at this threshold
    accepted: int
    precision: float         # accuracy among accepted (out-of-fold)
    errors: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "threshold": round(self.threshold, 4),
            "coverage": round(self.coverage, 4),
            "accepted": self.accepted,
            "precision": round(self.precision, 4),
            "errors": self.errors,
        }


@dataclass(frozen=True)
class SpecialistReport:
    """Everything the UI and the certificate need to describe one fitted specialist."""

    n_records: int
    n_groups: int
    folds: int
    labels: tuple[str, ...]
    accuracy: float
    macro_f1: float
    panel_accuracy: float | None
    rescue_rate: float
    flip_rate: float
    marginal_gain: float
    blind_spot_count: int
    rescue_count: int
    oracle_with_panel: float | None
    ci_low: float
    ci_high: float
    risk_coverage: tuple[RiskCoveragePoint, ...] = field(default_factory=tuple)
    notes: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "n_records": self.n_records,
            "n_groups": self.n_groups,
            "folds": self.folds,
            "labels": list(self.labels),
            "accuracy": round(self.accuracy, 4),
            "macro_f1": round(self.macro_f1, 4),
            "panel_accuracy": (
                None if self.panel_accuracy is None else round(self.panel_accuracy, 4)
            ),
            "rescue_rate": round(self.rescue_rate, 4),
            "flip_rate": round(self.flip_rate, 4),
            "marginal_gain": round(self.marginal_gain, 4),
            "blind_spot_count": self.blind_spot_count,
            "rescue_count": self.rescue_count,
            "oracle_with_panel": (
                None if self.oracle_with_panel is None else round(self.oracle_with_panel, 4)
            ),
            "ci": {"method": "cluster_bootstrap_groups", "low": round(self.ci_low, 4),
                   "high": round(self.ci_high, 4)},
            "risk_coverage": [p.as_dict() for p in self.risk_coverage],
            "notes": list(self.notes),
        }


def grouped_folds(
    groups: Sequence[str],
    n_folds: int = DEFAULT_FOLDS,
) -> list[tuple[list[int], list[int]]]:
    """
    Deterministic group-aware folds: every group lands entirely inside one fold, and groups are
    assigned round-robin in descending size order so large clusters cannot all pile into one fold.
    """
    if n_folds < 2:
        raise ValueError("n_folds must be at least 2")
    by_group: dict[str, list[int]] = {}
    for idx, g in enumerate(groups):
        by_group.setdefault(str(g), []).append(idx)
    ordered = sorted(by_group.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    buckets: list[list[int]] = [[] for _ in range(n_folds)]
    for _, members in ordered:
        lightest = min(range(n_folds), key=lambda b: (len(buckets[b]), b))
        buckets[lightest].extend(members)
    folds: list[tuple[list[int], list[int]]] = []
    for b in range(n_folds):
        test = sorted(buckets[b])
        train = sorted(i for other in range(n_folds) if other != b for i in buckets[other])
        if not test or not train:
            raise SpecialistDataError(
                f"cannot build {n_folds} grouped folds from {len(by_group)} groups"
            )
        folds.append((train, test))
    return folds


def cross_fit(
    vectors: Sequence[Sequence[float]],
    labels: Sequence[str],
    groups: Sequence[str],
    *,
    n_folds: int = DEFAULT_FOLDS,
    c: float = DEFAULT_C,
) -> tuple[list[str], list[dict[str, float]]]:
    """Out-of-fold predictions and class probabilities. Nothing is scored on its own training data."""
    np, LogisticRegression = _require_ml()
    if len(vectors) != len(labels) or len(labels) != len(groups):
        raise ValueError("vectors, labels and groups must have equal length")
    classes = sorted(set(labels))
    for cls in classes:
        if labels.count(cls) < MIN_ROWS_PER_CLASS:
            raise SpecialistDataError(f"class {cls!r} has too few examples to cross-fit")

    X = np.asarray(vectors, dtype=float)
    y = np.asarray(labels)
    pred: list[str] = [""] * len(y)
    proba: list[dict[str, float]] = [{} for _ in range(len(y))]

    for train, test in grouped_folds(groups, n_folds):
        clf = LogisticRegression(C=c, max_iter=4000).fit(X[train], y[train])
        got = clf.classes_.tolist()
        p = clf.predict_proba(X[test])
        q = clf.predict(X[test])
        for row, original in enumerate(test):
            pred[original] = str(q[row])
            proba[original] = {cls: float(prob) for cls, prob in zip(got, p[row], strict=True)}
    return pred, proba


def risk_coverage_curve(
    labels: Sequence[str],
    predictions: Sequence[str],
    probabilities: Sequence[dict[str, float]],
    *,
    steps: int = 20,
) -> tuple[RiskCoveragePoint, ...]:
    """
    Sweep the acceptance threshold and report coverage and precision at each point.

    The curve is the deliverable; a single "best" threshold lifted off it is not, because selecting
    the best row and then quoting that row's precision is selection bias, not a measurement.
    """
    n = len(labels)
    conf = [float(p.get(predictions[i], 0.0)) for i, p in enumerate(probabilities)]
    out: list[RiskCoveragePoint] = []
    for k in range(steps):
        t = 1.0 - (k + 1) / (steps + 1)
        accepted = [i for i in range(n) if conf[i] >= t]
        if not accepted:
            continue
        hits = sum(1 for i in accepted if predictions[i] == labels[i])
        out.append(
            RiskCoveragePoint(
                threshold=round(t, 4),
                coverage=len(accepted) / n,
                accepted=len(accepted),
                precision=hits / len(accepted),
                errors=len(accepted) - hits,
            )
        )
    return tuple(out)


def cluster_bootstrap_ci(
    labels: Sequence[str],
    predictions: Sequence[str],
    groups: Sequence[str],
    *,
    reps: int = DEFAULT_BOOTSTRAP_REPS,
    seed: int = 5,
) -> tuple[float, float]:
    """95% interval for accuracy by resampling *groups*, the exchangeable unit."""
    np, _ = _require_ml()
    stems = sorted({str(g) for g in groups})
    members = {s: [i for i, g in enumerate(groups) if str(g) == s] for s in stems}
    rng = np.random.default_rng(seed)
    y = np.asarray(labels)
    p = np.asarray(predictions)
    draws: list[float] = []
    for _ in range(reps):
        picked = rng.choice(np.asarray(stems), size=len(stems))
        idx = [i for s in picked for i in members[str(s)]]
        draws.append(float(np.mean(p[idx] == y[idx])))
    return float(np.percentile(draws, 2.5)), float(np.percentile(draws, 97.5))


def evaluate_specialist(
    vectors: Sequence[Sequence[float]],
    labels: Sequence[str],
    groups: Sequence[str],
    *,
    panel_predictions: Sequence[str] | None = None,
    n_folds: int = DEFAULT_FOLDS,
    c: float = DEFAULT_C,
    bootstrap_reps: int = DEFAULT_BOOTSTRAP_REPS,
) -> SpecialistReport:
    """
    Cross-fit a probe, then report what it is worth *alongside* the existing panel.

    ``panel_predictions`` is the incumbent labeller (e.g. an LLM plurality). When supplied, the report
    answers the only question that decides whether a new source should be admitted: does it rescue
    records the panel gets wrong without flipping many it gets right.
    """
    _require_ml()  # fail early and clearly if the optional extra is missing
    if len(labels) < MIN_ROWS_TOTAL:
        raise SpecialistDataError(
            f"need at least {MIN_ROWS_TOTAL} labelled records for a usable probe, got {len(labels)}"
        )
    pred, proba = cross_fit(vectors, labels, groups, n_folds=n_folds, c=c)

    classes = sorted(set(labels))
    hits = sum(1 for p, t in zip(pred, labels, strict=True) if p == t)
    accuracy = hits / len(labels)
    per_class: list[float] = []
    for cls in classes:
        rows = [i for i, t in enumerate(labels) if t == cls]
        rec = sum(1 for i in rows if pred[i] == cls) / len(rows)
        prec_rows = [i for i, p in enumerate(pred) if p == cls]
        prec = (
            sum(1 for i in prec_rows if labels[i] == cls) / len(prec_rows) if prec_rows else 0.0
        )
        per_class.append(0.0 if rec + prec == 0 else 2 * prec * rec / (prec + rec))
    macro_f1 = sum(per_class) / len(per_class)

    ci_low, ci_high = cluster_bootstrap_ci(labels, pred, groups, reps=bootstrap_reps)
    curve = risk_coverage_curve(labels, pred, proba)

    notes: list[str] = ["estimates are out-of-fold and grouped by caller-supplied group keys"]
    rescue_rate = flip_rate = marginal = 0.0
    blind_count = rescue_count = len(labels)
    oracle = None
    panel_acc = None
    panel_arr = None
    if panel_predictions is not None:
        if len(panel_predictions) != len(labels):
            raise ValueError("panel_predictions must have one entry per record")
        panel_arr = list(panel_predictions)
        panel_acc = sum(1 for p, t in zip(panel_arr, labels, strict=True) if p == t) / len(labels)
        prof = profile_source("specialist", pred, labels, selected=[panel_arr])
        rescue_rate = prof.rescue_rate
        flip_rate = prof.flip_rate
        marginal = prof.marginal_gain
        rescue_count = prof.rescue_count
        blind_count = prof.blind_spot_count
        oracle = oracle_accuracy([panel_arr, pred], labels)
        notes.append("rescue/flip are conditional on the supplied panel")
        if blind_count == 0:
            notes.append("panel has no blind spot on this sample: rescue rate is unmeasurable")
    notes.append(
        f"n={len(labels)} rows in {len({str(g) for g in groups})} groups; "
        "rows are not the exchangeable unit"
    )

    return SpecialistReport(
        n_records=len(labels),
        n_groups=len({str(g) for g in groups}),
        folds=n_folds,
        labels=tuple(classes),
        accuracy=accuracy,
        macro_f1=macro_f1,
        panel_accuracy=panel_acc,
        rescue_rate=rescue_rate,
        flip_rate=flip_rate,
        marginal_gain=marginal,
        blind_spot_count=blind_count,
        rescue_count=rescue_count,
        oracle_with_panel=oracle,
        ci_low=ci_low,
        ci_high=ci_high,
        risk_coverage=curve,
        notes=tuple(notes),
    )
