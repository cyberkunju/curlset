"""
Competitor-Killer Feature 4: Cross-Modal Semantic Alignment & Contradiction Scorer.
Identifies logical contradictions between visual object annotations and paired text/captions
(e.g., defect/damage boxes present, but caption asserts 'no damage' / 'pristine' / 'intact').
"""
import re
from dataclasses import dataclass

from packages.dataset_quality.models import ValidationFinding, ValidationSeverity


@dataclass
class CrossModalPair:
    record_id: str
    detected_classes: list[str]  # e.g., ["defect", "scratch", "dent", "crack"]
    caption_text: str            # e.g., "The surface is completely intact with no damage."


NEGATIVE_ASSERTIONS = [
    r"\bno\s+(damage|defect|scratch|crack|dent|flaw|issue|error)s?\b",
    r"\bwithout\s+any\s+(damage|defect|scratch|flaw)s?\b",
    r"\b(intact|pristine|clean|flawless|perfect)\b",
    r"\bzero\s+(damage|defects?)\b",
]

DAMAGE_KEYWORDS = {"defect", "scratch", "damage", "dent", "crack", "flaw", "hole", "break", "stain"}


class CrossModalAlignmentAuditor:
    @classmethod
    def audit_contradictions(cls, pairs: list[CrossModalPair]) -> list[ValidationFinding]:
        contradiction_ids: list[str] = []

        for p in pairs:
            has_damage_box = any(
                any(dmg in cls_name.lower() for dmg in DAMAGE_KEYWORDS)
                for cls_name in p.detected_classes
            )

            caption_lower = p.caption_text.lower()
            asserts_no_damage = any(
                re.search(pattern, caption_lower) for pattern in NEGATIVE_ASSERTIONS
            )

            # Contradiction: Visual defect bounding box exists, but text says no damage!
            if has_damage_box and asserts_no_damage:
                contradiction_ids.append(p.record_id)

        if contradiction_ids:
            return [
                ValidationFinding(
                    rule_id="RULE_CROSS_MODAL_NEGATION_CONTRADICTION",
                    severity=ValidationSeverity.WARNING,
                    title="Cross-Modal Semantic Contradiction Detected",
                    description=(
                        f"Found {len(contradiction_ids)} record(s) where visual defect/damage bounding boxes "
                        f"contradict paired text asserting the absence of defects (e.g. 'no damage' or 'intact')."
                    ),
                    remediation="Align paired text captions with visual bounding box ground truth.",
                    affected_record_ids=contradiction_ids[:50],
                    count=len(contradiction_ids),
                )
            ]

        return []
