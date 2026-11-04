"""
Calibration of model-reported confidences.

LLM confidence is systematically overconfident. Before a model's opinion is allowed to carry
weight in an ensemble it is calibrated against a gold set with **temperature scaling**, and its
calibration quality is measured with ECE and the Brier score.

Everything here is pure: lists in, numbers out. No network, no DB.
"""
from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from packages.dataset_ensemble.types import EPS

# Search bounds for the temperature fit.
T_MIN = 0.05
T_MAX = 20.0


def _softmax(logits: Sequence[float]) -> list[float]:
    if not logits:
        return []
    peak = max(logits)
    exps = [math.exp(x - peak) for x in logits]
    total = sum(exps)
    if total <= 0:
        return [1.0 / len(logits)] * len(logits)
    return [e / total for e in exps]


def _log(values: Sequence[float]) -> list[float]:
    return [math.log(max(float(v), EPS)) for v in values]


def apply_temperature(probs: Sequence[float], temperature: float) -> list[float]:
    """Soften/sharpen a probability vector: ``softmax(log(p) / T)``.

    ``T > 1`` softens an overconfident model; ``T < 1`` sharpens an underconfident one.
    """
    if temperature <= 0:
        raise ValueError("temperature must be positive")
    if not probs:
        return []
    return _softmax([value / temperature for value in _log(probs)])


def _nll(probs_rows: Sequence[Sequence[float]], true_indices: Sequence[int], temperature: float) -> float:
    total = 0.0
    for row, idx in zip(probs_rows, true_indices, strict=True):
        calibrated = apply_temperature(row, temperature)
        total -= math.log(max(calibrated[idx], EPS))
    return total / max(1, len(true_indices))


def fit_temperature(
    probs_rows: Sequence[Sequence[float]],
    true_indices: Sequence[int],
    *,
    iterations: int = 200,
) -> float:
    """Fit one temperature by minimising NLL on a gold set (ternary search, no scipy).

    Returns ``1.0`` when there is nothing to fit (fewer than 2 samples).
    """
    if len(probs_rows) < 2 or len(probs_rows) != len(true_indices):
        return 1.0

    low, high = T_MIN, T_MAX
    for _ in range(iterations):
        third = (high - low) / 3.0
        left = low + third
        right = high - third
        if _nll(probs_rows, true_indices, left) < _nll(probs_rows, true_indices, right):
            high = right
        else:
            low = left
        if high - low < 1e-6:
            break
    temperature = (low + high) / 2.0
    return round(min(T_MAX, max(T_MIN, temperature)), 6)


def expected_calibration_error(
    confidences: Sequence[float],
    correct: Sequence[bool],
    *,
    n_bins: int = 10,
) -> float:
    """ECE with equal-width confidence bins (the standard formulation).

    Equal-width binning is used deliberately: equal-mass binning mis-bins tied confidences
    (e.g. 100 samples all reporting 0.5) and produces a non-zero ECE for a perfectly calibrated
    model. Widths are ``1/n_bins`` over ``[0, 1]``; the last bin is closed at 1.0.
    """
    if not confidences or len(confidences) != len(correct):
        return 0.0
    n = len(confidences)
    bin_count = max(1, min(n_bins, n))
    sums = [0.0] * bin_count
    total = [0] * bin_count
    hits = [0] * bin_count

    for confidence, ok in zip(confidences, correct, strict=True):
        value = min(1.0, max(0.0, float(confidence)))
        index = min(bin_count - 1, int(value * bin_count))
        sums[index] += value
        total[index] += 1
        hits[index] += 1 if ok else 0

    ece = 0.0
    for index in range(bin_count):
        if total[index] == 0:
            continue
        mean_conf = sums[index] / total[index]
        accuracy = hits[index] / total[index]
        ece += (total[index] / n) * abs(accuracy - mean_conf)
    return round(ece, 6)


def brier_score(probs_rows: Sequence[Sequence[float]], true_indices: Sequence[int]) -> float:
    """Multi-class Brier score (mean squared error against the one-hot truth). Lower is better."""
    if not probs_rows or len(probs_rows) != len(true_indices):
        return 0.0
    total = 0.0
    for row, idx in zip(probs_rows, true_indices, strict=True):
        total += sum(
            (float(p) - (1.0 if position == idx else 0.0)) ** 2
            for position, p in enumerate(row)
        )
    return round(total / len(probs_rows), 6)


@dataclass(frozen=True)
class CalibrationReport:
    """Per-model calibration diagnostics computed on a gold set."""

    model: str
    temperature: float
    ece_raw: float
    ece_calibrated: float
    brier_raw: float
    brier_calibrated: float
    accuracy_raw: float
    accuracy_calibrated: float
    n_samples: int

    @property
    def ece_improvement(self) -> float:
        if self.ece_raw <= 0:
            return 0.0
        return round((self.ece_raw - self.ece_calibrated) / self.ece_raw, 4)


def calibrate_model(
    model: str,
    probs_rows: Sequence[Sequence[float]],
    true_indices: Sequence[int],
) -> CalibrationReport:
    """Fit a temperature for one model and report before/after diagnostics."""
    temperature = fit_temperature(probs_rows, true_indices)
    calibrated_rows = [apply_temperature(row, temperature) for row in probs_rows]

    def _conf(rows: Sequence[Sequence[float]]) -> tuple[list[float], list[bool]]:
        confidences = [max(row) for row in rows]
        correct = [
            max(range(len(row)), key=lambda i: row[i]) == idx
            for row, idx in zip(rows, true_indices, strict=True)
        ] if rows else []
        return confidences, correct

    conf_raw, correct_raw = _conf(probs_rows)
    conf_cal, correct_cal = _conf(calibrated_rows)
    return CalibrationReport(
        model=model,
        temperature=temperature,
        ece_raw=expected_calibration_error(conf_raw, correct_raw),
        ece_calibrated=expected_calibration_error(conf_cal, correct_cal),
        brier_raw=brier_score(probs_rows, true_indices),
        brier_calibrated=brier_score(calibrated_rows, true_indices),
        accuracy_raw=round(sum(correct_raw) / len(correct_raw), 6) if correct_raw else 0.0,
        accuracy_calibrated=round(sum(correct_cal) / len(correct_cal), 6) if correct_cal else 0.0,
        n_samples=len(probs_rows),
    )
