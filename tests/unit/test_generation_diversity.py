"""Unit tests for generated-data diversity and anti-collapse filters."""
from __future__ import annotations

from packages.dataset_synthesis.diversity import (
    DiversityPolicy,
    GenerationCandidate,
    filter_candidates,
    jaccard,
    normalize_text,
    trigrams,
)

EXISTING = [
    "I was charged twice for my subscription this month. Please refund me.",
    "The app crashes when I open the export screen on desktop.",
    "Please add dark mode to the annotation editor.",
    "How do I invite a teammate to review my dataset?",
]


def _candidate(text: str, label: str = "billing") -> GenerationCandidate:
    return GenerationCandidate(text=text, intended_label=label, generator_model="sim-gen")


def test_trigrams_and_jaccard_basics():
    assert trigrams("ab") == frozenset()
    assert jaccard(trigrams("the quick brown fox"), trigrams("the quick brown fox")) == 1.0
    assert jaccard(trigrams("alpha beta gamma"), trigrams("one two three")) == 0.0


def test_normalize_collapses_case_and_whitespace():
    assert normalize_text("  Hello   World  ") == "hello world"


def test_accepts_diverse_new_samples():
    report = filter_candidates(
        [
            _candidate("My invoice shows a duplicate charge for the annual plan.", "billing"),
            _candidate("Uploading a large CSV never finishes and the spinner hangs.", "technical_support"),
        ],
        existing_texts=EXISTING,
        existing_class_counts={"billing": 2, "technical_support": 1, "feature_request": 1},
        existing_total=4,
    )
    assert len(report.accepted) == 2
    assert report.rejected == []
    assert report.collapsed is False


def test_rejects_too_short_and_empty():
    report = filter_candidates(
        [_candidate("too short", "billing"), _candidate("   ", "billing")],
        existing_texts=EXISTING,
        existing_class_counts={"billing": 2},
        existing_total=4,
    )
    assert report.accepted == []
    reasons = report.rejection_reasons()
    assert reasons.get("too_short") == 1
    assert reasons.get("empty") == 1


def test_rejects_exact_duplicate_of_existing():
    duplicate = "I was charged twice for my subscription this month. Please refund me."
    report = filter_candidates(
        [_candidate(duplicate)],
        existing_texts=EXISTING,
        existing_class_counts={"billing": 2},
        existing_total=4,
    )
    assert report.accepted == []
    assert "duplicate_existing" in report.rejection_reasons()


def test_rejects_near_duplicate_of_existing():
    # same wording with a trivial change -> high trigram overlap
    near = "I was charged twice for my subscription this month. Please refund me now."
    report = filter_candidates(
        [_candidate(near)],
        existing_texts=EXISTING,
        existing_class_counts={"billing": 2},
        existing_total=4,
        policy=DiversityPolicy(max_similarity=0.6),
    )
    assert report.accepted == []
    assert any(reason.startswith("too_similar_to_existing") for reason in report.rejection_reasons())


def test_rejects_near_duplicates_within_the_batch():
    base = "My invoice shows a duplicate charge for the annual plan this month."
    variant = "My invoice shows a duplicate charge for the annual plan this month again."
    report = filter_candidates(
        [_candidate(base), _candidate(variant)],
        existing_texts=EXISTING,
        existing_class_counts={"billing": 2},
        existing_total=4,
        policy=DiversityPolicy(max_batch_similarity=0.6, max_similarity=0.9),
    )
    assert len(report.accepted) == 1
    assert any(reason.startswith("too_similar_in_batch") for reason in report.rejection_reasons())


def test_flags_template_collapse_batch():
    """A generator emitting one skeleton with different suffixes must be flagged."""
    skeleton = [
        "The billing statement number {index} shows an unexpected duplicate charge on my account."
        for index in range(6)
    ]
    report = filter_candidates(
        [_candidate(text, "billing") for text in skeleton],
        existing_texts=EXISTING,
        existing_class_counts={"billing": 2},
        existing_total=4,
        policy=DiversityPolicy(
            max_similarity=1.0,
            max_batch_similarity=1.0,
            min_batch_unique_trigram_ratio=0.8,
        ),
    )
    assert report.stats["batch_unique_trigram_ratio"] < 0.8
    assert report.collapsed is True
    assert "template collapse" in str(report.stats.get("warning", ""))


def test_class_share_cap_limits_flooding():
    candidates = [
        _candidate(f"Billing enquiry number {index} about a duplicate charge for annual plan.", "billing")
        for index in range(5)
    ]
    report = filter_candidates(
        candidates,
        existing_texts=EXISTING,
        existing_class_counts={"billing": 1, "technical_support": 3},
        existing_total=4,
        policy=DiversityPolicy(max_similarity=1.0, max_batch_similarity=1.0, max_class_share=0.34),
    )
    rejected_reasons = report.rejection_reasons()
    assert any(reason.startswith("class_share_cap") for reason in rejected_reasons)
    assert len(report.accepted) < len(candidates)


def test_report_stats_are_json_safe():
    report = filter_candidates(
        [_candidate("A brand new billing complaint about a wrong invoice total.", "billing")],
        existing_texts=EXISTING,
        existing_class_counts={"billing": 2},
        existing_total=4,
    )
    import json

    payload = {
        "stats": report.stats,
        "accepted": [candidate.text for candidate in report.accepted],
        "rejected": [{"text": item.text, "reason": item.reason} for item in report.rejected],
    }
    json.dumps(payload)  # must not raise
    assert report.stats["accepted"] == 1
