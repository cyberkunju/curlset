"""
Unit tests for pHash perceptual cross-split leakage detection.
"""
from packages.dataset_quality.models import ValidationSeverity
from packages.dataset_quality.phash_leakage import (
    PHashLeakageDetector,
    PHashSplitItem,
    hamming_distance,
)


def test_hamming_distance_exact_and_different():
    h1 = "ffffffffffffffff"
    h2 = "ffffffffffffffff"
    assert hamming_distance(h1, h2) == 0

    # 1 bit flipped
    h3 = "fffffffffffffffe"
    assert hamming_distance(h1, h3) == 1

    # Completely inverted
    h4 = "0000000000000000"
    assert hamming_distance(h1, h4) == 64


def test_phash_split_leakage_detection():
    items = [
        PHashSplitItem(record_id="rec_train_1", asset_id="ast_1", phash="a1b2c3d4e5f60718", split="train"),
        PHashSplitItem(record_id="rec_train_2", asset_id="ast_2", phash="1111222233334444", split="train"),
        # Near duplicate of rec_train_1 in test split (Hamming distance 1)
        PHashSplitItem(record_id="rec_test_1", asset_id="ast_3", phash="a1b2c3d4e5f60719", split="test"),
    ]

    findings = PHashLeakageDetector.audit_split_leakage(items)
    assert len(findings) == 1
    f = findings[0]
    assert f.rule_id == "RULE_SPLIT_LEAK_PERCEPTUAL_PHASH"
    assert f.severity == ValidationSeverity.BLOCKING
    assert "rec_train_1" in f.affected_record_ids
    assert "rec_test_1" in f.affected_record_ids


def test_phash_no_split_leakage_when_different():
    items = [
        PHashSplitItem(record_id="rec_train_1", asset_id="ast_1", phash="ffff0000ffff0000", split="train"),
        PHashSplitItem(record_id="rec_val_1", asset_id="ast_2", phash="0000ffff0000ffff", split="val"),
    ]
    findings = PHashLeakageDetector.audit_split_leakage(items)
    assert len(findings) == 0
