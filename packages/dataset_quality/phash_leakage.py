"""
pHash Cross-Split Leakage Blocker:
Detects perceptual duplicates across train and test/validation splits using 64-bit DCT pHash.
If Hamming distance d_H <= 6 across different splits, raises a hard BLOCKING finding.
"""
from dataclasses import dataclass

from packages.dataset_quality.models import ValidationFinding, ValidationSeverity


@dataclass
class PHashSplitItem:
    record_id: str
    asset_id: str
    phash: str
    split: str


def hamming_distance(hex1: str, hex2: str) -> int:
    """Computes the bitwise Hamming distance between two 16-char hex pHash strings."""
    try:
        val1 = int(hex1, 16)
        val2 = int(hex2, 16)
        return (val1 ^ val2).bit_count()
    except (ValueError, TypeError):
        return 64


class PHashLeakageDetector:
    THRESHOLD = 6  # Hamming distance <= 6 indicates near-identical visual content

    @classmethod
    def audit_split_leakage(cls, items: list[PHashSplitItem]) -> list[ValidationFinding]:
        findings: list[ValidationFinding] = []
        train_items = [it for it in items if it.split == "train" and it.phash]
        eval_items = [it for it in items if it.split in {"val", "validation", "test"} and it.phash]

        leaked_record_ids: set[str] = set()

        for t in train_items:
            for e in eval_items:
                dist = hamming_distance(t.phash, e.phash)
                if dist <= cls.THRESHOLD:
                    leaked_record_ids.add(t.record_id)
                    leaked_record_ids.add(e.record_id)

        if leaked_record_ids:
            findings.append(
                ValidationFinding(
                    rule_id="RULE_SPLIT_LEAK_PERCEPTUAL_PHASH",
                    severity=ValidationSeverity.BLOCKING,
                    title="Perceptual Split Leakage Detected (pHash d_H ≤ 6)",
                    description=(
                        f"Found {len(leaked_record_ids)} records containing near-duplicate visual assets "
                        f"shared across train and validation/test splits (Hamming distance ≤ {cls.THRESHOLD})."
                    ),
                    remediation="Reassign split partitions or remove near-duplicate images so evaluation benchmarks remain untainted.",
                    affected_record_ids=sorted(leaked_record_ids)[:50],
                    count=len(leaked_record_ids),
                )
            )

        return findings
