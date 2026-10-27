"""Dataset Evaluation and Active Learning Package."""

from packages.dataset_evaluation.clustering import (
    ClusterMapResponse,
    ClusterPoint,
    CoverageGap,
    project_embeddings_to_2d,
)
from packages.dataset_evaluation.confident_learning import (
    LabelErrorFinding,
    cosine_similarity,
    extract_simple_text_embedding,
    find_confident_label_errors,
)
from packages.dataset_evaluation.metrics import (
    ClassMetric,
    EvaluationReport,
    compute_classification_metrics,
)
from packages.dataset_evaluation.service import EvaluationService

__all__ = [
    "ClassMetric",
    "ClusterMapResponse",
    "ClusterPoint",
    "CoverageGap",
    "EvaluationReport",
    "EvaluationService",
    "LabelErrorFinding",
    "compute_classification_metrics",
    "cosine_similarity",
    "extract_simple_text_embedding",
    "find_confident_label_errors",
    "project_embeddings_to_2d",
]
