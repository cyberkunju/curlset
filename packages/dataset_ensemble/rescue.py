"""
Evidence-source complementarity: rescue rate, flip rate and submodular source selection.

The ensemble accuracy obtainable from a set of sources is the accuracy of an *oracle router*
over that set::

    A(S) = mean_x  max_{s in S} 1[pred_s(x) == truth(x)]

`A` is monotone submodular in `S` (a sum of per-item maxima), so greedy selection is within
`1 - 1/e` of the best subset of the same size, and the marginal gain of a source is exactly
the probability that it is right where **every** already-selected source is wrong — its
*rescue rate*. Symmetrically, a source can flip items the current set already gets right; that
is its *flip rate*, and it is the cost side of the same arithmetic.

Consequences the rest of the platform relies on:

* diminishing returns is a theorem, not an observation — a fourth vendor usually adds nothing;
* a source is worth admitting iff `c * rho_plus > (1 - c) * rho_minus`, where `c` is the
  fraction of items no existing source solves;
* the measurement needs gold labels, which is why the audit set is load-bearing.

Pure functions: no I/O, no DB, no network.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


def _check_aligned(predictions: Sequence[str], truth: Sequence[str]) -> None:
    if len(predictions) != len(truth):
        raise ValueError("predictions and truth must have equal length")


def blind_spot_mask(source_predictions: Sequence[Sequence[str]], truth: Sequence[str]) -> list[bool]:
    """Items where *no* source in the set is correct."""
    if not source_predictions:
        return [True] * len(truth)
    for preds in source_predictions:
        _check_aligned(preds, truth)
    return [not any(p[i] == truth[i] for p in source_predictions) for i in range(len(truth))]


def agreement_mask(source_predictions: Sequence[Sequence[str]], truth: Sequence[str]) -> list[bool]:
    """Items where *every* source in the set is correct."""
    if not source_predictions:
        return [True] * len(truth)
    for preds in source_predictions:
        _check_aligned(preds, truth)
    return [all(p[i] == truth[i] for p in source_predictions) for i in range(len(truth))]


def oracle_accuracy(source_predictions: Sequence[Sequence[str]], truth: Sequence[str]) -> float:
    """Accuracy achievable by a perfect per-item selector over these sources."""
    _check_aligned(source_predictions[0], truth) if source_predictions else None
    if not source_predictions:
        return 0.0
    hits = sum(
        1
        for i in range(len(truth))
        if any(p[i] == truth[i] for p in source_predictions)
    )
    return hits / len(truth)


@dataclass(frozen=True)
class SourceProfile:
    name: str
    accuracy: float
    rescue_rate: float      # P(source correct | every selected source wrong)
    flip_rate: float        # P(source wrong | every selected source right)
    marginal_gain: float    # A(selected + source) - A(selected)
    rescue_count: int       # items rescued
    blind_spot_count: int   # items in the blind spot
    net_value: float        # marginal_gain expressed as accuracy points

    def as_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "accuracy": round(self.accuracy, 6),
            "rescue_rate": round(self.rescue_rate, 6),
            "flip_rate": round(self.flip_rate, 6),
            "marginal_gain": round(self.marginal_gain, 6),
            "rescue_count": self.rescue_count,
            "blind_spot_count": self.blind_spot_count,
            "net_value": round(self.net_value, 6),
        }


def profile_source(
    name: str,
    predictions: Sequence[str],
    truth: Sequence[str],
    selected: Sequence[Sequence[str]] = (),
) -> SourceProfile:
    """Rescue/flip behaviour of one candidate source against an already-selected set."""
    _check_aligned(predictions, truth)
    if selected:
        for preds in selected:
            _check_aligned(preds, truth)
    blind = blind_spot_mask(selected, truth) if selected else [True] * len(truth)
    agree = agreement_mask(selected, truth) if selected else [True] * len(truth)

    rescued = sum(1 for i, b in enumerate(blind) if b and predictions[i] == truth[i])
    flipped = sum(1 for i, a in enumerate(agree) if a and predictions[i] != truth[i])
    blind_count = sum(blind)
    agree_count = sum(agree)

    before = oracle_accuracy(selected, truth) if selected else 0.0
    after = oracle_accuracy(list(selected) + [predictions], truth)

    return SourceProfile(
        name=name,
        accuracy=sum(1 for p, t in zip(predictions, truth, strict=True) if p == t) / len(truth),
        rescue_rate=rescued / blind_count if blind_count else 0.0,
        flip_rate=flipped / agree_count if agree_count else 0.0,
        marginal_gain=after - before,
        rescue_count=rescued,
        blind_spot_count=blind_count,
        net_value=after - before,
    )


def greedy_source_selection(
    candidates: dict[str, Sequence[str]],
    truth: Sequence[str],
    max_sources: int | None = None,
    min_marginal: float = 0.0,
) -> list[SourceProfile]:
    """
    Submodular greedy over candidate sources. Returns the admitted sources in selection
    order, each with the profile measured against everything selected before it.

    Stops when no candidate has positive marginal gain (or below `min_marginal`), which is the
    point where further evidence is redundant by construction.
    """
    if not candidates:
        return []
    names = list(candidates)
    selected: list[Sequence[str]] = []
    chosen: list[SourceProfile] = []
    remaining = set(names)
    budget = len(names) if max_sources is None else max_sources

    while remaining and len(chosen) < budget:
        best_name = None
        best_profile: SourceProfile | None = None
        for name in sorted(remaining):
            prof = profile_source(name, candidates[name], truth, selected)
            if best_profile is None or prof.marginal_gain > best_profile.marginal_gain:
                best_name, best_profile = name, prof
        if best_name is None or best_profile is None or best_profile.marginal_gain <= min_marginal:
            break
        selected.append(candidates[best_name])
        chosen.append(best_profile)
        remaining.discard(best_name)

    return chosen


def route_with_specialist(
    panel_predictions: Sequence[str],
    specialist_predictions: Sequence[str],
    specialist_confidence: Sequence[float],
    threshold: float,
) -> list[str]:
    """
    Route, do not average. The specialist may only override the panel when it is confident and
    actually disagrees; otherwise the panel stands. Averaging a high-flip specialist loses
    accuracy — see the flip_rate on the rescue profile.
    """
    if len(panel_predictions) != len(specialist_predictions):
        raise ValueError("panel and specialist predictions must have equal length")
    if len(panel_predictions) != len(specialist_confidence):
        raise ValueError("specialist confidence must have one value per prediction")
    return [
        spec
        if conf > threshold and spec != panel
        else panel
        for panel, spec, conf in zip(
            panel_predictions, specialist_predictions, specialist_confidence, strict=True
        )
    ]
