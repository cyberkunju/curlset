"""
Competitor-Killer Feature 1: Confident Learning & Automated Label-Error Finder.
Identifies suspected label noise in training datasets by checking whether a sample's assigned
label contradicts the consensus of its K-nearest semantic neighbors.
"""
import math
from collections import Counter
from dataclasses import dataclass

from packages.dataset_quality.models import ValidationFinding, ValidationSeverity


@dataclass
class LabeledSample:
    record_id: str
    label: str
    feature_vector: list[float]  # Character/word bag or normalized coordinate/hash features
    confidence: float = 1.0


def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    if len(v1) != len(v2) or not v1:
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return dot / (norm1 * norm2)


class ConfidentLearningAuditor:
    K_NEIGHBORS = 7
    CONTRADICTION_THRESHOLD = 0.65  # If >= 65% of neighbors disagree

    @classmethod
    def audit_label_errors(cls, samples: list[LabeledSample]) -> list[ValidationFinding]:
        if len(samples) < cls.K_NEIGHBORS + 1:
            return []

        suspected_noise_ids: list[str] = []
        noise_details: list[str] = []

        for i, target in enumerate(samples):
            # Compute similarities to all other samples
            similarities: list[tuple[float, str]] = []
            for j, neighbor in enumerate(samples):
                if i == j:
                    continue
                sim = cosine_similarity(target.feature_vector, neighbor.feature_vector)
                similarities.append((sim, neighbor.label))

            # Pick top K most similar neighbors
            similarities.sort(key=lambda x: x[0], reverse=True)
            top_k = similarities[:cls.K_NEIGHBORS]

            neighbor_labels = [lbl for _, lbl in top_k]
            label_counts = Counter(neighbor_labels)
            majority_label, _ = label_counts.most_common(1)[0]

            disagreement_ratio = 1.0 - (label_counts.get(target.label, 0) / cls.K_NEIGHBORS)

            if disagreement_ratio >= cls.CONTRADICTION_THRESHOLD and majority_label != target.label:
                suspected_noise_ids.append(target.record_id)
                noise_details.append(
                    f"Record {target.record_id[:8]}: Assigned '{target.label}', but {round(disagreement_ratio * 100)}% "
                    f"of nearest neighbors are '{majority_label}'."
                )

        if suspected_noise_ids:
            return [
                ValidationFinding(
                    rule_id="RULE_CONFIDENT_LABEL_NOISE",
                    severity=ValidationSeverity.WARNING,
                    title="Suspected Label Noise Detected (Confident Learning)",
                    description=(
                        f"Detected {len(suspected_noise_ids)} sample(s) whose assigned label contradicts "
                        f"≥ {int(cls.CONTRADICTION_THRESHOLD * 100)}% of their nearest semantic neighbors."
                    ),
                    remediation="Review suspected noisy labels in the Annotation Workspace to verify ground truth accuracy.",
                    affected_record_ids=suspected_noise_ids[:50],
                    count=len(suspected_noise_ids),
                )
            ]

        return []
