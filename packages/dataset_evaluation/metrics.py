"""Deterministic baseline classification metrics computation.

Computes accuracy, precision, recall, F1 (macro and per-class),
and confusion matrices without requiring paid or heavy external libraries.
Includes honest small-sample warnings to avoid misleading statistical claims.
"""

from collections import Counter
from typing import Any

from pydantic import BaseModel, Field


class ClassMetric(BaseModel):
    precision: float = Field(ge=0.0, le=1.0)
    recall: float = Field(ge=0.0, le=1.0)
    f1_score: float = Field(ge=0.0, le=1.0)
    support: int = Field(ge=0)


class EvaluationReport(BaseModel):
    total_samples: int
    accuracy: float = Field(ge=0.0, le=1.0)
    macro_precision: float = Field(ge=0.0, le=1.0)
    macro_recall: float = Field(ge=0.0, le=1.0)
    macro_f1: float = Field(ge=0.0, le=1.0)
    per_class_metrics: dict[str, ClassMetric] = Field(default_factory=dict)
    confusion_matrix: dict[str, dict[str, int]] = Field(default_factory=dict)
    classes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


def compute_classification_metrics(
    y_true: list[str],
    y_pred: list[str],
    metadata: dict[str, Any] | None = None,
) -> EvaluationReport:
    """Compute deterministic classification metrics and confusion matrix.

    y_true: Ground-truth class labels (human-approved reference)
    y_pred: Predicted class labels (model proposal or candidate revision)
    """
    if len(y_true) != len(y_pred):
        raise ValueError(
            f"Length mismatch between y_true ({len(y_true)}) and y_pred ({len(y_pred)})."
        )

    if not y_true:
        return EvaluationReport(
            total_samples=0,
            accuracy=0.0,
            macro_precision=0.0,
            macro_recall=0.0,
            macro_f1=0.0,
            warnings=["Evaluation dataset contains 0 ground-truth samples."],
            metadata=metadata or {},
        )

    # Collect all unique class names deterministically sorted
    all_classes = sorted(set(y_true) | set(y_pred))

    # Compute confusion matrix: confusion[actual][predicted]
    conf_matrix: dict[str, dict[str, int]] = {
        act: {pred: 0 for pred in all_classes} for act in all_classes
    }
    for act, pred in zip(y_true, y_pred, strict=True):
        conf_matrix[act][pred] += 1

    # True positives, False positives, False negatives per class
    tp: Counter[str] = Counter()
    fp: Counter[str] = Counter()
    fn: Counter[str] = Counter()
    support: Counter[str] = Counter(y_true)

    total_correct = 0
    for act in all_classes:
        for pred in all_classes:
            cnt = conf_matrix[act][pred]
            if act == pred:
                tp[act] += cnt
                total_correct += cnt
            else:
                fp[pred] += cnt
                fn[act] += cnt

    total_samples = len(y_true)
    accuracy = round(total_correct / float(total_samples), 4)

    per_class_metrics: dict[str, ClassMetric] = {}
    precisions: list[float] = []
    recalls: list[float] = []
    f1s: list[float] = []
    warnings: list[str] = []

    for cls in all_classes:
        sup = support[cls]
        t = tp[cls]
        p = t / float(t + fp[cls]) if (t + fp[cls]) > 0 else 0.0
        r = t / float(t + fn[cls]) if (t + fn[cls]) > 0 else 0.0
        f1 = (2.0 * p * r) / (p + r) if (p + r) > 0 else 0.0

        p = round(p, 4)
        r = round(r, 4)
        f1 = round(f1, 4)

        per_class_metrics[cls] = ClassMetric(
            precision=p,
            recall=r,
            f1_score=f1,
            support=sup,
        )

        precisions.append(p)
        recalls.append(r)
        f1s.append(f1)

        # Honest small-sample limitations warning (Rule: avoid unsupported statistical claims)
        if sup < 5:
            warnings.append(
                f"Class '{cls}' has very small test support ({sup} sample{'s' if sup != 1 else ''}). "
                "Metrics for this class carry high variance and should not be used as proof of generalization."
            )

    macro_precision = round(sum(precisions) / float(len(all_classes)), 4) if all_classes else 0.0
    macro_recall = round(sum(recalls) / float(len(all_classes)), 4) if all_classes else 0.0
    macro_f1 = round(sum(f1s) / float(len(all_classes)), 4) if all_classes else 0.0

    return EvaluationReport(
        total_samples=total_samples,
        accuracy=accuracy,
        macro_precision=macro_precision,
        macro_recall=macro_recall,
        macro_f1=macro_f1,
        per_class_metrics=per_class_metrics,
        confusion_matrix=conf_matrix,
        classes=all_classes,
        warnings=warnings,
        metadata=metadata or {},
    )
