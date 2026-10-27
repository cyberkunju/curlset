"""
Unit tests for Confident Learning label noise auditor.
"""
from packages.dataset_quality.confident_learning import (
    ConfidentLearningAuditor,
    LabeledSample,
    cosine_similarity,
)
from packages.dataset_quality.models import ValidationSeverity


def test_cosine_similarity():
    v1 = [1.0, 0.0, 0.0]
    v2 = [1.0, 0.0, 0.0]
    assert cosine_similarity(v1, v2) == 1.0

    v3 = [0.0, 1.0, 0.0]
    assert cosine_similarity(v1, v3) == 0.0


def test_confident_learning_detects_mislabeled_sample():
    # Create cluster of "cat" samples
    samples: list[LabeledSample] = []
    for i in range(8):
        # High similarity along dimension 0
        samples.append(
            LabeledSample(
                record_id=f"rec_cat_{i}",
                label="cat",
                feature_vector=[1.0, 0.05 * i, 0.0],
            )
        )

    # Add an outlier mislabeled as "dog" inside the "cat" cluster
    samples.append(
        LabeledSample(
            record_id="rec_mislabeled",
            label="dog",  # Mislabelled! All its 7 nearest neighbors are cats!
            feature_vector=[0.98, 0.02, 0.0],
        )
    )

    findings = ConfidentLearningAuditor.audit_label_errors(samples)
    assert len(findings) == 1
    f = findings[0]
    assert f.rule_id == "RULE_CONFIDENT_LABEL_NOISE"
    assert f.severity == ValidationSeverity.WARNING
    assert "rec_mislabeled" in f.affected_record_ids
