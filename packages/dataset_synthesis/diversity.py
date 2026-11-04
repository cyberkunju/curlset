"""
Diversity and anti-collapse filters for generated training data.

Generating data with a strong model is easy; generating data that *improves* a dataset is not.
The failure modes are well known and all of them are cheap to detect:

  * **duplicates / near-duplicates** of existing samples (memorisation, not new information);
  * **template collapse** — the generator emits one sentence with a different suffix;
  * **label drift** — the generated text does not actually belong to its intended class;
  * **class flooding** — generated data swamps the natural class distribution.

This module implements the deterministic, provider-independent part. Label-preservation is checked
by the caller (`scripts/generation_experiment.py` uses the ensemble; production can use any
verifier), because it needs model calls.

Everything here is pure: text in, verdicts out. Design: docs/ENSEMBLE_PSEUDO_LABELING.md §6.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

_WS_RE = re.compile(r"\s+")
_WORD_RE = re.compile(r"[a-z0-9]+")


def normalize_text(text: str) -> str:
    """Case/whitespace/punctuation-insensitive form used for duplicate detection."""
    return _WS_RE.sub(" ", text.strip().lower())


def tokens(text: str) -> list[str]:
    return _WORD_RE.findall(text.lower())


def trigrams(text: str) -> frozenset[tuple[str, str, str]]:
    words = tokens(text)
    if len(words) < 3:
        return frozenset()
    return frozenset(zip(words, words[1:], words[2:], strict=False))


def jaccard(a: frozenset, b: frozenset) -> float:
    """Jaccard similarity; 0.0 when either set is empty (no evidence of similarity)."""
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    union = len(a | b)
    return intersection / union if union else 0.0


@dataclass(frozen=True)
class GenerationCandidate:
    """One generated sample proposed for inclusion in the dataset."""

    text: str
    intended_label: str
    generator_model: str = ""
    prompt_version: str = "v1"
    source_record_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class DiversityPolicy:
    """Thresholds for admitting generated data. Deliberately conservative defaults."""

    min_chars: int = 20
    max_chars: int = 2_000
    #: max trigram Jaccard similarity to ANY existing sample (memorisation guard)
    max_similarity: float = 0.75
    #: max trigram Jaccard similarity to another accepted sample (batch dedupe)
    max_batch_similarity: float = 0.90
    #: Maximum share of a class that may be generated: generated/(existing+generated) <= this.
    #: Classes with no existing samples are treated as gap-filling and allowed (documented).
    max_class_share: float = 0.50
    #: below this ratio of unique trigrams the batch is flagged as template collapse
    min_batch_unique_trigram_ratio: float = 0.35


@dataclass
class RejectedCandidate:
    text: str
    reason: str
    intended_label: str = ""


@dataclass
class FilterReport:
    accepted: list[GenerationCandidate] = field(default_factory=list)
    rejected: list[RejectedCandidate] = field(default_factory=list)
    #: True when the batch as a whole looks like template collapse
    collapsed: bool = False
    stats: dict[str, float | int] = field(default_factory=dict)

    @property
    def acceptance_rate(self) -> float:
        total = len(self.accepted) + len(self.rejected)
        return round(len(self.accepted) / total, 6) if total else 0.0

    def rejection_reasons(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for item in self.rejected:
            key = item.reason.split(":")[0]
            counts[key] = counts.get(key, 0) + 1
        return counts


def _batch_unique_trigram_ratio(texts: Sequence[str]) -> float:
    """unique trigrams / total trigrams over a batch — a cheap collapse detector."""
    seen: set[tuple[str, str, str]] = set()
    total = 0
    for text in texts:
        grams = trigrams(text)
        seen |= grams
        total += max(0, len(tokens(text)) - 2)
    return round(len(seen) / total, 6) if total else 0.0


def filter_candidates(
    candidates: Iterable[GenerationCandidate],
    *,
    existing_texts: Sequence[str],
    existing_class_counts: dict[str, int],
    existing_total: int,
    policy: DiversityPolicy | None = None,
) -> FilterReport:
    """Apply every deterministic guard and return what survived, with reasons."""
    rules = policy or DiversityPolicy()
    report = FilterReport()

    normalized_existing = {normalize_text(text) for text in existing_texts}
    existing_trigrams = [trigrams(text) for text in existing_texts]
    accepted_trigrams: list[frozenset] = []
    projected_counts = dict(existing_class_counts)
    generated_counts: dict[str, int] = {}
    projected_total = max(1, existing_total)

    for candidate in candidates:
        text = candidate.text.strip()
        key = normalize_text(text)

        if not text:
            report.rejected.append(RejectedCandidate(text, "empty", candidate.intended_label))
            continue
        if len(text) < rules.min_chars:
            report.rejected.append(RejectedCandidate(text, "too_short", candidate.intended_label))
            continue
        if len(text) > rules.max_chars:
            report.rejected.append(RejectedCandidate(text, "too_long", candidate.intended_label))
            continue
        if key in normalized_existing:
            report.rejected.append(RejectedCandidate(text, "duplicate_existing", candidate.intended_label))
            continue

        candidate_grams = trigrams(text)
        worst = 0.0
        for existing_grams in existing_trigrams:
            worst = max(worst, jaccard(candidate_grams, existing_grams))
            if worst > rules.max_similarity:
                break
        if worst > rules.max_similarity:
            report.rejected.append(
                RejectedCandidate(text, f"too_similar_to_existing:{worst:.2f}", candidate.intended_label)
            )
            continue

        worst_batch = 0.0
        for hit_grams in accepted_trigrams:
            worst_batch = max(worst_batch, jaccard(candidate_grams, hit_grams))
            if worst_batch > rules.max_batch_similarity:
                break
        if worst_batch > rules.max_batch_similarity:
            report.rejected.append(
                RejectedCandidate(text, f"too_similar_in_batch:{worst_batch:.2f}", candidate.intended_label)
            )
            continue

        existing_for_class = existing_class_counts.get(candidate.intended_label, 0)
        generated_for_class = generated_counts.get(candidate.intended_label, 0) + 1
        # A class may not become more than `max_class_share` generated:
        #   generated / (existing + generated) <= max_class_share
        # A class with no existing data is legitimate gap filling, so it is allowed.
        if existing_for_class > 0:
            share = generated_for_class / (existing_for_class + generated_for_class)
            if share > rules.max_class_share:
                report.rejected.append(
                    RejectedCandidate(
                        text,
                        f"class_share_cap:{candidate.intended_label}",
                        candidate.intended_label,
                    )
                )
                continue

        report.accepted.append(candidate)
        accepted_trigrams.append(candidate_grams)
        generated_counts[candidate.intended_label] = generated_for_class
        projected_counts[candidate.intended_label] = existing_for_class + generated_for_class
        projected_total += 1

    accepted_texts = [candidate.text for candidate in report.accepted]
    unique_ratio = _batch_unique_trigram_ratio(accepted_texts)
    report.stats = {
        "accepted": len(report.accepted),
        "rejected": len(report.rejected),
        "acceptance_rate": report.acceptance_rate,
        "batch_unique_trigram_ratio": unique_ratio,
        "class_counts_after": dict(sorted(projected_counts.items())),
        "rejection_reasons": report.rejection_reasons(),
    }
    report.collapsed = bool(accepted_texts) and unique_ratio < rules.min_batch_unique_trigram_ratio
    if report.collapsed:
        report.stats["warning"] = (
            "batch flagged as template collapse: unique trigram ratio "
            f"{unique_ratio:.3f} < {rules.min_batch_unique_trigram_ratio:.2f}"
        )
    return report
