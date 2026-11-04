"""
Ensemble orchestration: fan-out -> calibrate -> weight -> aggregate -> threshold -> route.

This is the module that turns raw multi-model votes into a defensible labeling decision.
It deliberately keeps the *measurement* honest:

  * calibration and reliability weights are fitted only on **gold** annotations
    (``origin in {human, imported}`` + ``status == approved``) — never on pseudo-labels;
  * if the gold set is large enough it is split deterministically into a calibration half and a
    threshold-fitting half, so thresholds are not solved on the same data that calibrated the
    models (``optimistic=False``);
  * every reported precision is accompanied by its Wilson lower bound;
  * the correlated-error diagnostic is computed and surfaced, because high error correlation
    inflates ensemble confidence and is the main way an ensemble quietly lies.

Design: docs/LABELING.md
"""
from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.annotation_selector import select_active_annotation
from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.models import (
    AnnotationModel,
    DatasetModel,
    DatasetRecordModel,
    EnsembleVoteModel,
)
from packages.dataset_core.exceptions import ResourceNotFoundError
from packages.dataset_ensemble.aggregation import aggregate
from packages.dataset_ensemble.calibration import CalibrationReport, calibrate_model
from packages.dataset_ensemble.fanout import FanoutConfig, FanoutSummary, run_fanout
from packages.dataset_ensemble.selection import (
    ThresholdSolution,
    route_votes,
    solve_class_thresholds,
)
from packages.dataset_ensemble.types import AggregatedLabel, Band, ModelVote
from packages.dataset_ensemble.weights import (
    class_accuracy,
    collapse_to_model_weights,
    reliability_weights,
)

#: Gold origins that count as ground truth (same policy as the accuracy evaluator).
GOLD_ORIGINS = {AnnotationOrigin.HUMAN.value, AnnotationOrigin.IMPORTED.value}
AGGREGATORS = ("log_odds", "majority", "weighted_vote", "mean_probs")
MIN_GOLD_FOR_SPLIT = 40


@dataclass
class EnsembleOutcome:
    """Everything needed to judge whether an ensemble run is trustworthy."""

    dataset_id: str
    fanout: FanoutSummary
    models: list[str]
    records_aggregated: int
    classes: list[str]
    calibration: list[CalibrationReport] = field(default_factory=list)
    model_weights: dict[str, float] = field(default_factory=dict)
    per_class_weights: dict[tuple[str, str], float] = field(default_factory=dict)
    aggregator_scores: dict[str, dict[str, float]] = field(default_factory=dict)
    single_model_scores: dict[str, dict[str, float]] = field(default_factory=dict)
    thresholds: dict[str, dict[str, Any]] = field(default_factory=dict)
    band_counts: dict[str, int] = field(default_factory=dict)
    correlated_error: dict[str, float] = field(default_factory=dict)
    target_precision: float = 0.99
    weight_alpha: float = 2.0
    weight_beta: float = 1.0
    gold_pairs: int = 0
    optimistic: bool = True
    aggregates: list[AggregatedLabel] = field(default_factory=list)
    routing: dict[str, str] = field(default_factory=dict)

    @property
    def best_single_model(self) -> str | None:
        if not self.single_model_scores:
            return None
        return max(self.single_model_scores, key=lambda name: self.single_model_scores[name]["macro_f1"])

    @property
    def ensemble_macro_f1(self) -> float:
        return self.aggregator_scores.get("log_odds", {}).get("macro_f1", 0.0)

    @property
    def lift_over_best_single(self) -> float:
        best = self.best_single_model
        if best is None:
            return 0.0
        return round(self.ensemble_macro_f1 - self.single_model_scores[best]["macro_f1"], 6)

    def to_dict(self) -> dict[str, Any]:
        return {
            "dataset_id": self.dataset_id,
            "models": self.models,
            "records_aggregated": self.records_aggregated,
            "gold_pairs": self.gold_pairs,
            "optimistic": self.optimistic,
            "target_precision": self.target_precision,
            "fanout": {
                "records": self.fanout.records,
                "calls_made": self.fanout.calls_made,
                "calls_reused": self.fanout.calls_reused,
                "failures": self.fanout.failures,
                "cost_usd": self.fanout.cost_usd,
                "elapsed_s": self.fanout.elapsed_s,
                "aborted_reason": self.fanout.aborted_reason,
            },
            "aggregator_scores": self.aggregator_scores,
            "single_model_scores": self.single_model_scores,
            "best_single_model": self.best_single_model,
            "ensemble_macro_f1": self.ensemble_macro_f1,
            "lift_over_best_single": self.lift_over_best_single,
            "calibration": [
                {
                    "model": report.model,
                    "temperature": report.temperature,
                    "ece_raw": report.ece_raw,
                    "ece_calibrated": report.ece_calibrated,
                    "ece_improvement": report.ece_improvement,
                    "brier_raw": report.brier_raw,
                    "brier_calibrated": report.brier_calibrated,
                    "accuracy": report.accuracy_raw,
                    "n_samples": report.n_samples,
                }
                for report in self.calibration
            ],
            "model_weights": self.model_weights,
            "weight_alpha": self.weight_alpha,
            "weight_beta": self.weight_beta,
            "thresholds": self.thresholds,
            "band_counts": self.band_counts,
            "correlated_error": self.correlated_error,
        }


# --------------------------------------------------------------------- helpers ---


def _split_parity(stable_key: str) -> int:
    """Deterministic 0/1 split of gold into calibration vs threshold halves.

    Uses the *record's stable external key* (e.g. ``csv_row_7``) rather than its generated id:
    ids contain a timestamp + random suffix, which would make the split — and therefore every
    reported metric — change between runs of the same experiment.
    """
    return int(hashlib.sha256(stable_key.encode()).hexdigest()[:8], 16) % 2


def _record_external_keys(session: Session, dataset_id: str) -> dict[str, str]:
    rows = session.execute(
        select(DatasetRecordModel.id, DatasetRecordModel.external_key).where(
            DatasetRecordModel.dataset_id == dataset_id
        )
    ).all()
    return {record_id: (key or record_id) for record_id, key in rows}


def _gold_labels(session: Session, dataset_id: str) -> dict[str, str]:
    rows = session.execute(
        select(AnnotationModel).where(
            AnnotationModel.dataset_id == dataset_id,
            AnnotationModel.status == ReviewStatus.APPROVED.value,
        )
    ).scalars().all()
    by_record: dict[str, list[AnnotationModel]] = defaultdict(list)
    for annotation in rows:
        if annotation.origin in GOLD_ORIGINS and (annotation.payload or {}).get("label"):
            by_record[annotation.record_id].append(annotation)
    gold: dict[str, str] = {}
    for record_id, candidate_group in by_record.items():
        active = select_active_annotation(candidate_group)
        if active is not None:
            gold[record_id] = str(active.payload["label"])
    return gold


def _load_votes(session: Session, dataset_id: str, prompt_version: str) -> dict[str, list[ModelVote]]:
    # Prefix match: prompt-diversity runs store votes as "<base>#roleN", so an exact match would
    # silently find nothing (and report zero gold pairs).
    rows = session.execute(
        select(EnsembleVoteModel).where(
            EnsembleVoteModel.dataset_id == dataset_id,
            EnsembleVoteModel.prompt_version.like(f"{prompt_version}%"),
        )
    ).scalars().all()
    grouped: dict[str, list[ModelVote]] = defaultdict(list)
    for row in rows:
        grouped[row.record_id].append(
            ModelVote(
                model=row.model_name,
                label=row.label or "",
                probs={str(k): float(v) for k, v in (row.probs_json or {}).items()} or None,
                confidence=float(row.confidence or 0.0),
                tokens_in=row.tokens_in,
                tokens_out=row.tokens_out,
                cost_usd=float(row.cost_usd or 0.0),
                latency_ms=float(row.latency_ms or 0.0),
                error=row.error_message,
                prompt_version=row.prompt_version,
            )
        )
    return grouped


def _accuracy_and_macro_f1(truths: list[str], predictions: list[str]) -> dict[str, float]:
    if not truths:
        return {"accuracy": 0.0, "macro_f1": 0.0, "n": 0}
    correct = sum(1 for truth, prediction in zip(truths, predictions, strict=True) if truth == prediction)
    classes = sorted(set(truths))
    f1_scores: list[float] = []
    for label in classes:
        tp = sum(1 for truth, prediction in zip(truths, predictions, strict=True)
                 if truth == label and prediction == label)
        fp = sum(1 for truth, prediction in zip(truths, predictions, strict=True)
                 if truth != label and prediction == label)
        fn = sum(1 for truth, prediction in zip(truths, predictions, strict=True)
                 if truth == label and prediction != label)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1_scores.append(2 * precision * recall / (precision + recall) if precision + recall else 0.0)
    return {
        "accuracy": round(correct / len(truths), 6),
        "macro_f1": round(sum(f1_scores) / len(f1_scores), 6) if f1_scores else 0.0,
        "n": len(truths),
    }


def _phi(errors_a: list[int], errors_b: list[int]) -> float:
    """Phi coefficient between two binary error vectors."""
    n = len(errors_a)
    if n < 2:
        return 0.0
    mean_a = sum(errors_a) / n
    mean_b = sum(errors_b) / n
    covariance = sum((a - mean_a) * (b - mean_b) for a, b in zip(errors_a, errors_b, strict=True)) / n
    std_a = (mean_a * (1 - mean_a)) ** 0.5
    std_b = (mean_b * (1 - mean_b)) ** 0.5
    if std_a == 0 or std_b == 0:
        return 0.0
    return round(covariance / (std_a * std_b), 6)


# ----------------------------------------------------------------------- service ---


def run_ensemble(
    session: Session,
    dataset_id: str,
    config: FanoutConfig,
    *,
    target_precision: float = 0.99,
    min_support: int = 30,
    kappa_min: float = 0.0,
    weight_alpha: float = 2.0,
    weight_beta: float = 1.0,
) -> EnsembleOutcome:
    """Run the full ensemble labeling pass and return its measured outcome."""
    dataset = session.get(DatasetModel, dataset_id)
    if not dataset:
        raise ResourceNotFoundError("Dataset", dataset_id)

    fanout = run_fanout(session, dataset_id, config)
    session.flush()

    votes_by_record = _load_votes(session, dataset_id, config.prompt_version)
    gold = _gold_labels(session, dataset_id)

    label_schema = dataset.label_schema or {}
    classes = [
        str(label) for label in (label_schema.get("labels") or label_schema.get("classes") or [])
    ]
    if not classes:
        observed = {
            vote.label for votes in votes_by_record.values() for vote in votes if vote.label
        } | set(gold.values())
        classes = sorted(observed)

    outcome = EnsembleOutcome(
        dataset_id=dataset_id,
        fanout=fanout,
        models=sorted({vote.model for votes in votes_by_record.values() for vote in votes}),
        records_aggregated=len(votes_by_record),
        classes=classes,
        target_precision=target_precision,
        weight_alpha=weight_alpha,
        weight_beta=weight_beta,
    )
    if not classes or not votes_by_record:
        return outcome

    # --- deterministic split of gold: calibration half vs threshold half -------------
    stable_keys = _record_external_keys(session, dataset_id)
    gold_ids = sorted(gold)
    calibration_ids = {
        record_id for record_id in gold_ids
        if _split_parity(stable_keys.get(record_id, record_id)) == 0
    }
    threshold_ids = set(gold_ids) - calibration_ids
    if len(gold) < MIN_GOLD_FOR_SPLIT or not calibration_ids or not threshold_ids:
        calibration_ids = set(gold_ids)
        threshold_ids = set(gold_ids)
        outcome.optimistic = True
    else:
        outcome.optimistic = False

    # --- calibration + reliability weights from gold --------------------------------
    model_names = outcome.models
    calib_accuracy: dict[str, dict[str, float]] = {}
    per_model_ece: dict[str, float] = {}
    for model in model_names:
        rows: list[list[float]] = []
        truths: list[int] = []
        predictions: list[str] = []
        truth_labels: list[str] = []
        for record_id in sorted(calibration_ids):
            votes = [vote for vote in votes_by_record.get(record_id, []) if vote.model == model]
            if not votes or not votes[0].ok:
                continue
            vote = votes[0]
            probs = vote.probs or {vote.label: 1.0}
            vector = [float(probs.get(label, 0.0)) for label in classes]
            total = sum(vector)
            if total <= 0:
                continue
            vector = [value / total for value in vector]
            truth = gold[record_id]
            if truth not in classes:
                continue
            rows.append(vector)
            truths.append(classes.index(truth))
            predictions.append(vote.label)
            truth_labels.append(truth)
        if not rows:
            continue
        report = calibrate_model(model, rows, truths)
        outcome.calibration.append(report)
        per_model_ece[model] = report.ece_calibrated
        calib_accuracy[model] = class_accuracy(predictions, truth_labels)

    if not outcome.calibration:
        # No usable gold calibration data: fall back to uniform weights but say so.
        outcome.model_weights = {model: round(1.0 / len(model_names), 6) for model in model_names}
    else:
        outcome.per_class_weights = reliability_weights(
            calib_accuracy, per_model_ece, classes, alpha=weight_alpha, beta=weight_beta
        )
        prior = {
            label: sum(1 for value in gold.values() if value == label) / max(1, len(gold))
            for label in classes
        }
        outcome.model_weights = collapse_to_model_weights(outcome.per_class_weights, prior)

    # --- aggregate every record with each strategy (for the comparison) ------------
    aggregates: dict[str, list[AggregatedLabel]] = {name: [] for name in AGGREGATORS}
    for record_id in sorted(votes_by_record):
        votes = votes_by_record[record_id]
        for name in AGGREGATORS:
            result = aggregate(record_id, votes, classes, outcome.model_weights, strategy=name)
            if result.label:
                aggregates[name].append(result)

    outcome.aggregates = aggregates["log_odds"]

    # --- score every strategy and every single model on gold -----------------------
    gold_pairs = 0
    for name in AGGREGATORS:
        truths: list[str] = []
        predictions: list[str] = []
        for result in aggregates[name]:
            if result.record_id not in gold:
                continue
            truths.append(gold[result.record_id])
            predictions.append(result.label)
        outcome.aggregator_scores[name] = _accuracy_and_macro_f1(truths, predictions)
        gold_pairs = max(gold_pairs, len(truths))

    for model in model_names:
        truths = []
        predictions = []
        for record_id in sorted(votes_by_record):
            if record_id not in gold:
                continue
            votes = [vote for vote in votes_by_record[record_id] if vote.model == model and vote.ok]
            if not votes:
                continue
            truths.append(gold[record_id])
            predictions.append(votes[0].label)
        outcome.single_model_scores[model] = _accuracy_and_macro_f1(truths, predictions)

    outcome.gold_pairs = gold_pairs

    # --- thresholds solved on the threshold half -----------------------------------
    threshold_rows = [
        (result.label, result.confidence, gold[result.record_id] == result.label)
        for result in outcome.aggregates
        if result.record_id in threshold_ids
    ]
    solutions = solve_class_thresholds(
        threshold_rows, target_precision=target_precision, min_support=min_support
    )
    outcome.thresholds = {
        label: {
            "tau_hi": solution.threshold,
            "accepted": solution.accepted,
            "support": solution.support,
            "precision": solution.precision,
            "wilson_low": solution.wilson_low,
            "wilson_high": solution.wilson_high,
            "met_target": solution.met_target,
            "yield_fraction": solution.yield_fraction,
        }
        for label, solution in solutions.items()
    }
    overall: ThresholdSolution | None = solutions.get("__all__")

    # --- correlated-error diagnostic on gold pairs ---------------------------------
    model_errors: dict[str, dict[str, int]] = {model: {} for model in model_names}
    for record_id in sorted(set(gold) & set(votes_by_record)):
        for model in model_names:
            votes = [vote for vote in votes_by_record[record_id] if vote.model == model and vote.ok]
            if not votes:
                continue
            model_errors[model][record_id] = int(votes[0].label != gold[record_id])
    for index, model_a in enumerate(model_names):
        for model_b in model_names[index + 1:]:
            shared = sorted(set(model_errors[model_a]) & set(model_errors[model_b]))
            if not shared:
                continue
            outcome.correlated_error[f"{model_a}|{model_b}"] = _phi(
                [model_errors[model_a][record_id] for record_id in shared],
                [model_errors[model_b][record_id] for record_id in shared],
            )
    flagged = any(value > 0.6 for value in outcome.correlated_error.values())

    # --- routing ---------------------------------------------------------------
    tau_hi = overall.threshold if overall else 1.0
    tau_lo = round(tau_hi * 0.5, 6) if overall else 0.0
    band_counts: dict[str, int] = {band.value: 0 for band in Band}
    for result in outcome.aggregates:
        decision = route_votes(
            result,
            tau_hi=tau_hi,
            tau_lo=tau_lo,
            kappa_min=kappa_min,
            correlated_error_flagged=flagged,
        )
        outcome.routing[result.record_id] = decision.band.value
        band_counts[decision.band.value] += 1
    outcome.band_counts = band_counts
    return outcome


def materialize_annotations(
    session: Session,
    outcome: EnsembleOutcome,
    *,
    band: Band = Band.AUTO_ACCEPT,
) -> int:
    """Persist auto-accepted ensemble labels as ``origin=ensemble``/``pending_review`` candidates.

    Never approves anything: an ensemble candidate is a *candidate*. Records that already have an
    ensemble annotation are skipped so re-runs are idempotent.
    """
    from packages.dataset_core.services.annotation_service import AnnotationService

    record_ids = [record_id for record_id, assigned in outcome.routing.items() if assigned == band.value]
    if not record_ids:
        return 0

    existing = set(
        session.execute(
            select(AnnotationModel.record_id).where(
                AnnotationModel.dataset_id == outcome.dataset_id,
                AnnotationModel.origin == AnnotationOrigin.ENSEMBLE.value,
            )
        ).scalars().all()
    )
    by_record = {result.record_id: result for result in outcome.aggregates}
    created = 0
    for record_id in record_ids:
        result = by_record.get(record_id)
        if result is None or record_id in existing:
            continue
        AnnotationService.create_annotation(
            session=session,
            record_id=record_id,
            payload={
                "label": result.label,
                "ensemble": {
                    "confidence": result.confidence,
                    "disagreement": result.disagreement,
                    "n_models": result.n_models,
                    "models": list(result.contributing_models),
                    "probs": result.probs,
                },
            },
            origin=AnnotationOrigin.ENSEMBLE,
            status=ReviewStatus.PENDING_REVIEW,
            confidence=result.confidence,
            actor_id="ensemble",
        )
        created += 1
    session.flush()
    return created
