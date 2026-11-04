"""Unit tests for the ensemble math core (pure functions, no providers, no DB)."""
from __future__ import annotations

import math
import random

import pytest

from packages.dataset_ensemble.aggregation import (
    aggregate,
    entropy,
    fleiss_kappa,
    majority_vote,
    mean_probabilities,
    normalized_entropy,
    pairwise_disagreement,
    weighted_log_odds,
    weighted_vote,
)
from packages.dataset_ensemble.calibration import (
    apply_temperature,
    brier_score,
    calibrate_model,
    expected_calibration_error,
    fit_temperature,
)
from packages.dataset_ensemble.selection import (
    audit_sample_size,
    precision_with_interval,
    route_votes,
    solve_class_thresholds,
    solve_threshold_for_precision,
    wilson_interval,
    wilson_lower_bound,
)
from packages.dataset_ensemble.types import Band, ModelVote, to_distribution
from packages.dataset_ensemble.weights import (
    class_accuracy,
    collapse_to_model_weights,
    reliability_weights,
)

CLASSES = ["billing", "technical_support", "feature_request", "general_inquiry"]


# ------------------------------------------------------------------ helpers ---


def _vote(model: str, label: str, confidence: float = 0.9, **kwargs) -> ModelVote:
    return ModelVote(model=model, label=label, confidence=confidence, **kwargs)


def _softmax(logits: list[float]) -> list[float]:
    peak = max(logits)
    exps = [math.exp(value - peak) for value in logits]
    total = sum(exps)
    return [value / total for value in exps]


def _calibration_dataset(
    sharpness: float,
    n: int = 600,
    seed: int = 7,
) -> tuple[list[list[float]], list[int]]:
    """Labels sampled from the true distribution q; model reports ``normalise(q**sharpness)``.

    ``sharpness > 1`` means the model is **overconfident** (sharper than the truth), so the
    temperature that undoes it is ``T ≈ sharpness`` (> 1, i.e. softening).
    """
    rng = random.Random(seed)
    rows: list[list[float]] = []
    truths: list[int] = []
    for _ in range(n):
        logits = [rng.uniform(-1.5, 1.5) for _ in range(len(CLASSES))]
        truth_probs = _softmax(logits)
        draw = rng.random()
        cumulative = 0.0
        truth = len(CLASSES) - 1
        for index, prob in enumerate(truth_probs):
            cumulative += prob
            if draw <= cumulative:
                truth = index
                break
        sharpened = [prob ** sharpness for prob in truth_probs]
        total = sum(sharpened)
        rows.append([value / total for value in sharpened])
        truths.append(truth)
    return rows, truths


def _aggregated(confidence: float, label: str = "billing", other: str = "x"):
    """Unanimous aggregate whose pooled confidence is exactly ``confidence``."""
    votes = [
        ModelVote(model="a", label=label, probs={label: confidence, other: 1.0 - confidence}),
        ModelVote(model="b", label=label, probs={label: confidence, other: 1.0 - confidence}),
    ]
    return aggregate("rec", votes, [label, other])


# ------------------------------------------------------------- to_distribution ---


def test_to_distribution_prefers_explicit_probs_and_normalises():
    vote = ModelVote(model="m", label="billing", probs={"billing": 2.0, "technical_support": 2.0})
    dist = to_distribution(vote, ["billing", "technical_support", "feature_request"])
    assert pytest.approx(sum(dist.values())) == 1.0
    assert dist["billing"] == pytest.approx(0.5)
    assert dist["feature_request"] < 1e-6


def test_to_distribution_unknown_label_falls_back_to_uniform():
    vote = ModelVote(model="m", label="spaceship", confidence=0.99)
    dist = to_distribution(vote, CLASSES)
    assert all(value == pytest.approx(1 / len(CLASSES)) for value in dist.values())


def test_to_distribution_spreads_residual_when_no_probs():
    vote = ModelVote(model="m", label="billing", confidence=0.6)
    dist = to_distribution(vote, ["billing", "technical_support"])
    assert dist["billing"] == pytest.approx(0.6)
    assert dist["technical_support"] == pytest.approx(0.4)


# ---------------------------------------------------------------- calibration ---


def test_temperature_is_identity_at_one():
    probs = [0.7, 0.2, 0.1]
    assert apply_temperature(probs, 1.0) == pytest.approx(probs, abs=1e-9)


def test_temperature_softening_increases_entropy():
    probs = [0.95, 0.03, 0.02]
    names = ["a", "b", "c"]
    before = entropy(dict(zip(names, probs, strict=True)))
    after = entropy(dict(zip(names, apply_temperature(probs, 4.0), strict=True)))
    assert after > before


def test_fit_temperature_is_near_one_for_calibrated_model():
    rowses, truths = _calibration_dataset(sharpness=1.0)
    assert fit_temperature(rowses, truths) == pytest.approx(1.0, rel=0.30)


@pytest.mark.parametrize("sharpness", [2.0, 3.0])
def test_fit_temperature_recovers_overconfidence(sharpness):
    """A model whose probs are `q**sharpness` needs T ≈ sharpness to be recalibrated."""
    rowses, truths = _calibration_dataset(sharpness=sharpness)
    fitted = fit_temperature(rowses, truths)
    assert fitted > 1.2, f"expected softening temperature > 1.2, got {fitted}"
    assert fitted == pytest.approx(sharpness, rel=0.5), (
        f"expected ≈{sharpness}, got {fitted}"
    )


def test_fit_temperature_handles_underconfident_model():
    rowses, truths = _calibration_dataset(sharpness=0.5)
    assert fit_temperature(rowses, truths) < 1.0


def test_fit_temperature_needs_two_samples():
    assert fit_temperature([[0.9, 0.1]], [0]) == 1.0


def test_ece_is_low_for_well_calibrated_and_high_for_overconfident():
    calibrated_conf = [0.5] * 100
    calibrated_correct = [True] * 50 + [False] * 50
    assert expected_calibration_error(calibrated_conf, calibrated_correct) == pytest.approx(0.0, abs=1e-6)

    overconfident_conf = [0.99] * 100
    overconfident_correct = [True] * 60 + [False] * 40
    assert expected_calibration_error(overconfident_conf, overconfident_correct) > 0.3


def test_brier_score_is_zero_for_perfect_predictions():
    rows = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
    assert brier_score(rows, [0, 1]) == pytest.approx(0.0, abs=1e-9)


def test_calibrate_model_improves_overconfident_model():
    rowses, truths = _calibration_dataset(sharpness=2.5)
    report = calibrate_model("model-a", rowses, truths)
    assert report.n_samples == len(truths)
    assert report.temperature > 1.0
    assert report.ece_calibrated <= report.ece_raw
    assert report.ece_improvement >= 0.0
    assert report.brier_calibrated <= report.brier_raw


# ---------------------------------------------------------------- aggregation ---


def test_weighted_log_odds_follows_the_trusted_model():
    votes = [
        ModelVote(model="reliable", label="billing",
                  probs={"billing": 0.95, "technical_support": 0.05}),
        ModelVote(model="weak", label="technical_support",
                  probs={"billing": 0.05, "technical_support": 0.95}),
    ]
    classes = ["billing", "technical_support"]
    label, probs = weighted_log_odds(votes, classes, {"reliable": 0.95, "weak": 0.05})
    assert label == "billing"
    assert probs["billing"] > probs["technical_support"]


def test_majority_vote_and_tie_determinism():
    votes = [_vote("a", "billing"), _vote("b", "billing"), _vote("c", "technical_support")]
    label, probs = majority_vote(votes, ["billing", "technical_support"])
    assert label == "billing"
    assert probs["billing"] == pytest.approx(2 / 3)


def test_weighted_vote_respects_model_weights():
    votes = [_vote("a", "billing"), _vote("b", "technical_support")]
    label, _ = weighted_vote(votes, ["billing", "technical_support"], {"a": 0.1, "b": 0.9})
    assert label == "technical_support"


def test_mean_probabilities_averages_distributions():
    votes = [
        ModelVote(model="a", label="billing", probs={"billing": 1.0, "technical_support": 0.0}),
        ModelVote(model="b", label="technical_support",
                  probs={"billing": 0.0, "technical_support": 1.0}),
    ]
    label, probs = mean_probabilities(votes, ["billing", "technical_support"])
    assert probs["billing"] == pytest.approx(0.5)
    assert probs["technical_support"] == pytest.approx(0.5)
    assert label in {"billing", "technical_support"}


def test_entropy_bounds():
    assert entropy({"a": 1.0}) == pytest.approx(0.0, abs=1e-9)
    assert normalized_entropy({"a": 0.5, "b": 0.5}) == pytest.approx(1.0)
    assert normalized_entropy({"a": 1.0}) == 0.0


def test_pairwise_disagreement_counts_pairs():
    unanimous = [_vote("a", "billing"), _vote("b", "billing"), _vote("c", "billing")]
    assert pairwise_disagreement(unanimous) == 0.0

    all_different = [_vote("a", "billing"), _vote("b", "technical_support"),
                     _vote("c", "feature_request")]
    assert pairwise_disagreement(all_different) == pytest.approx(1.0)

    two_of_three = [_vote("a", "billing"), _vote("b", "billing"), _vote("c", "technical_support")]
    # pairs: (a,b) agree, (a,c) disagree, (b,c) disagree -> 2 of 3 pairs disagree
    assert pairwise_disagreement(two_of_three) == pytest.approx(2 / 3)


def test_fleiss_kappa_extremes():
    assert fleiss_kappa([["a", "a", "a"], ["b", "b", "b"]]) == pytest.approx(1.0)
    assert fleiss_kappa([["a"]]) == pytest.approx(1.0)  # single rater
    low = fleiss_kappa([["a", "b", "c"], ["a", "b", "c"], ["b", "a", "c"]])
    assert -1.0 <= low <= 1.0


def test_aggregate_exposes_cost_and_failed_models():
    votes = [
        ModelVote(model="a", label="billing", confidence=0.9, cost_usd=0.001),
        ModelVote(model="b", label="billing", confidence=0.8, cost_usd=0.002),
        ModelVote(model="c", label="", error="timeout"),
    ]
    result = aggregate("rec-1", votes, ["billing", "technical_support"])
    assert result.label == "billing"
    assert result.n_models == 2
    assert result.failed_models == ("c",)
    assert result.total_cost_usd == pytest.approx(0.003)
    assert pytest.approx(sum(result.probs.values())) == 1.0
    assert 0.0 <= result.entropy <= math.log(2) + 1e-9


def test_aggregate_rejects_unknown_strategy():
    with pytest.raises(ValueError):
        aggregate("r", [_vote("a", "billing")], ["billing"], strategy="magic")


# -------------------------------------------------------------------- weights ---


def test_class_accuracy_per_class():
    predictions = ["billing", "billing", "technical_support"]
    truths = ["billing", "technical_support", "technical_support"]
    assert class_accuracy(predictions, truths) == {"billing": 1.0, "technical_support": 0.5}


def test_reliability_weights_normalise_per_class_and_reward_accuracy():
    per_class_acc = {
        "strong": {"billing": 0.95, "technical_support": 0.9},
        "weak": {"billing": 0.6, "technical_support": 0.55},
    }
    ece = {"strong": 0.05, "weak": 0.2}
    weights = reliability_weights(per_class_acc, ece, ["billing", "technical_support"])
    for label in ("billing", "technical_support"):
        total = sum(weights[(model, label)] for model in ("strong", "weak"))
        assert total == pytest.approx(1.0, abs=1e-6)
        assert weights[("strong", label)] > weights[("weak", label)]


def test_collapse_to_model_weights_uses_prior():
    per_class = {
        ("a", "billing"): 0.8, ("b", "billing"): 0.2,
        ("a", "technical_support"): 0.5, ("b", "technical_support"): 0.5,
    }
    prior = {"billing": 0.8, "technical_support": 0.2}
    assert collapse_to_model_weights(per_class, prior)["a"] == pytest.approx(0.74)
    assert collapse_to_model_weights(per_class, prior)["b"] == pytest.approx(0.26)


# ------------------------------------------------------------------- selection ---


def test_wilson_lower_bound_is_conservative():
    assert wilson_lower_bound(10, 10) < 0.75          # small perfect sample is not proof
    assert wilson_lower_bound(300, 300) > 0.98        # larger perfect sample approaches 1
    assert wilson_lower_bound(99, 100) == pytest.approx(0.945, abs=0.01)
    assert wilson_lower_bound(0, 0) == 0.0


def test_wilson_interval_brackets_point_estimate():
    low, high = wilson_interval(80, 100)
    assert low < 0.8 < high


def test_precision_with_interval():
    precision, low, high = precision_with_interval([True] * 90 + [False] * 10)
    assert precision == pytest.approx(0.9)
    assert low < precision < high


def test_solve_threshold_maximises_yield_subject_to_precision_floor():
    # 400 samples, all correct: to certify 99% precision the Wilson LB needs ~400 perfect
    # audits (at n=350 the LB is ~0.9891, just below target). This is the point of the metric.
    confidences = [round(1.0 - index * 0.0005, 6) for index in range(400)]
    correct = [True] * 400
    solution = solve_threshold_for_precision(
        confidences, correct, target_precision=0.99, min_support=30
    )
    assert solution.met_target is True
    assert solution.accepted == 400
    assert solution.wilson_low >= 0.99
    assert solution.yield_fraction == pytest.approx(1.0)


def test_solve_threshold_reports_failure_instead_of_lying():
    rng = random.Random(3)
    confidences = [rng.uniform(0.5, 1.0) for _ in range(200)]
    correct = [rng.random() < 0.7 for _ in range(200)]  # ~70% precision everywhere
    solution = solve_threshold_for_precision(
        confidences, correct, target_precision=0.99, min_support=30
    )
    assert solution.met_target is False
    assert solution.wilson_low < 0.99


def test_solve_class_thresholds_produces_all_key():
    rows = [(label, 0.95, True) for label in CLASSES for _ in range(60)]
    solutions = solve_class_thresholds(rows, target_precision=0.9, min_support=30)
    assert set(solutions) == {*CLASSES, "__all__"}
    assert solutions["__all__"].met_target is True


def test_audit_sample_size_grows_as_tolerance_tightens():
    loose = audit_sample_size(0.995, target_lower_bound=0.98)
    tight = audit_sample_size(0.995, target_lower_bound=0.99)
    assert loose < tight
    assert wilson_lower_bound(round(0.995 * tight), tight) >= 0.99


def test_audit_sample_size_rejects_impossible_target():
    with pytest.raises(ValueError):
        audit_sample_size(0.99, target_lower_bound=0.99)


def test_routing_bands():
    assert route_votes(_aggregated(0.99), tau_hi=0.9, tau_lo=0.6).band is Band.AUTO_ACCEPT
    assert route_votes(_aggregated(0.75), tau_hi=0.9, tau_lo=0.6).band is Band.HUMAN_REVIEW
    assert route_votes(_aggregated(0.55), tau_hi=0.9, tau_lo=0.6).band is Band.REJECT


def test_routing_never_auto_accepts_disagreement():
    votes = [
        ModelVote(model="a", label="billing", probs={"billing": 0.99, "x": 0.01}),
        ModelVote(model="b", label="x", probs={"billing": 0.01, "x": 0.99}),
    ]
    split_aggregate = aggregate("rec", votes, ["billing", "x"])
    assert split_aggregate.disagreement == pytest.approx(1.0)
    decision = route_votes(split_aggregate, tau_hi=0.4, tau_lo=0.1, agreement_floor=0.8)
    assert decision.band is not Band.AUTO_ACCEPT


def test_routing_downgrades_when_correlated_errors_flagged():
    decision = route_votes(_aggregated(0.99), tau_hi=0.9, tau_lo=0.6, correlated_error_flagged=True)
    assert decision.band is Band.HUMAN_REVIEW
    assert "correlated" in decision.reason
