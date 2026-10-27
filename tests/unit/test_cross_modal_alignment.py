"""
Unit tests for Cross-Modal Semantic Contradiction Scorer.
"""
from packages.dataset_quality.cross_modal_alignment import (
    CrossModalAlignmentAuditor,
    CrossModalPair,
)
from packages.dataset_quality.models import ValidationSeverity


def test_cross_modal_contradiction_detection():
    pairs = [
        # Normal compliant pair
        CrossModalPair(
            record_id="rec_1",
            detected_classes=["car", "wheel"],
            caption_text="A clean sports car parked on the street.",
        ),
        # Contradictory pair: has defect box, but caption says "no damage"
        CrossModalPair(
            record_id="rec_2",
            detected_classes=["defect", "scratch"],
            caption_text="The product arrived in pristine condition with no damage or scratches.",
        ),
    ]

    findings = CrossModalAlignmentAuditor.audit_contradictions(pairs)
    assert len(findings) == 1
    f = findings[0]
    assert f.rule_id == "RULE_CROSS_MODAL_NEGATION_CONTRADICTION"
    assert f.severity == ValidationSeverity.WARNING
    assert "rec_2" in f.affected_record_ids
    assert "rec_1" not in f.affected_record_ids


def test_cross_modal_compliant_when_aligned():
    pairs = [
        CrossModalPair(
            record_id="rec_1",
            detected_classes=["scratch", "dent"],
            caption_text="Visible scratches on the rear bumper.",
        )
    ]
    findings = CrossModalAlignmentAuditor.audit_contradictions(pairs)
    assert len(findings) == 0
