"""
Confidence-Weighted Multi-Model Ensemble Pseudo-Labeling (CW-MME-PL).

Design: docs/LABELING.md

This package is deliberately divided into pure math (no I/O, no DB, no network) and
orchestration that uses it. The pure part — calibration, aggregation, weights, selection —
is unit-tested without any provider credentials.
"""
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
    expected_calibration_error,
    fit_temperature,
)
from packages.dataset_ensemble.rescue import (
    SourceProfile,
    agreement_mask,
    blind_spot_mask,
    greedy_source_selection,
    oracle_accuracy,
    profile_source,
    route_with_specialist,
)
from packages.dataset_ensemble.selection import (
    Band,
    audit_sample_size,
    precision_with_interval,
    route_votes,
    solve_threshold_for_precision,
    wilson_lower_bound,
)
from packages.dataset_ensemble.types import (
    AggregatedLabel,
    ModelVote,
    RoutingDecision,
    to_distribution,
)
from packages.dataset_ensemble.weights import class_accuracy, reliability_weights

__all__ = [
    "AggregatedLabel",
    "Band",
    "ModelVote",
    "RoutingDecision",
    "SourceProfile",
    "aggregate",
    "agreement_mask",
    "apply_temperature",
    "audit_sample_size",
    "blind_spot_mask",
    "brier_score",
    "class_accuracy",
    "entropy",
    "expected_calibration_error",
    "fit_temperature",
    "fleiss_kappa",
    "greedy_source_selection",
    "majority_vote",
    "mean_probabilities",
    "normalized_entropy",
    "oracle_accuracy",
    "pairwise_disagreement",
    "precision_with_interval",
    "profile_source",
    "reliability_weights",
    "route_votes",
    "route_with_specialist",
    "solve_threshold_for_precision",
    "to_distribution",
    "weighted_log_odds",
    "weighted_vote",
    "wilson_lower_bound",
]
