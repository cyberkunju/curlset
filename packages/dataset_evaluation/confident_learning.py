"""Confident Learning and Automated Label Error Detection.

Identifies approved or pending records whose assigned label mathematically
disagrees with the neighborhood consensus in semantic embedding space.
Works 100% locally with zero paid API dependencies.
"""

import math
from collections import Counter
from typing import Any

from pydantic import BaseModel, Field


class LabelErrorFinding(BaseModel):
    rule_id: str = "CONFIDENT_LABEL_NOISE"
    severity: str = "warning"
    record_id: str
    current_label: str
    suggested_label: str
    label_quality_score: float
    neighbor_record_ids: list[str] = Field(default_factory=list)
    remediation: str


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Calculate cosine similarity between two float vectors."""
    if len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b, strict=False))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def extract_simple_text_embedding(text: str, dim: int = 32) -> list[float]:
    """Extract a fast, deterministic bag-of-character-trigrams feature vector.

    Produces a fixed-size normalized vector in R^dim without external dependencies.
    """
    if not text:
        return [0.0] * dim

    vec = [0.0] * dim
    clean_text = text.lower().strip()
    words = clean_text.split()

    # Hash word and character n-grams into dimension buckets
    for word in words:
        h = hash(word) % dim
        vec[h] += 1.0

    for i in range(len(clean_text) - 2):
        trigram = clean_text[i : i + 3]
        h = hash(trigram) % dim
        vec[h] += 0.5

    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0.0:
        return [round(x / norm, 4) for x in vec]
    return vec


def find_confident_label_errors(
    records: list[dict[str, Any]],
    k: int = 7,
    threshold: float = 0.25,
) -> list[LabelErrorFinding]:
    """Detect records whose assigned labels disagree with their semantic neighbors.

    records: list of dicts with:
      - record_id: str
      - label: str
      - embedding: list[float]
    """
    valid = [r for r in records if r.get("label") and r.get("embedding")]
    if len(valid) <= 2:
        return []

    # Adjust k dynamically if dataset is smaller than k + 1
    effective_k = min(k, len(valid) - 1)

    findings: list[LabelErrorFinding] = []
    for idx, target in enumerate(valid):
        scored_neighbors: list[tuple[float, str, str]] = []
        for jdx, candidate in enumerate(valid):
            if idx == jdx:
                continue
            sim = max(0.0, cosine_similarity(target["embedding"], candidate["embedding"]))
            scored_neighbors.append((sim, candidate["label"], candidate["record_id"]))

        scored_neighbors.sort(key=lambda x: x[0], reverse=True)
        top_k = scored_neighbors[:effective_k]
        total_weight = sum(sim for sim, _, _ in top_k)
        if total_weight <= 1e-6:
            continue

        same_label_weight = sum(sim for sim, lbl, _ in top_k if lbl == target["label"])
        agreement_score = same_label_weight / total_weight

        alt_counts: Counter[str] = Counter()
        for sim, lbl, _ in top_k:
            if lbl != target["label"]:
                alt_counts[lbl] += sim

        if agreement_score < threshold and alt_counts:
            best_alt_label, best_alt_weight = alt_counts.most_common(1)[0]
            if (best_alt_weight / total_weight) >= 0.60:
                findings.append(
                    LabelErrorFinding(
                        record_id=target["record_id"],
                        current_label=target["label"],
                        suggested_label=best_alt_label,
                        label_quality_score=round(agreement_score, 4),
                        neighbor_record_ids=[rid for _, _, rid in top_k[:3]],
                        remediation=(
                            f"Label '{target['label']}' strongly disagrees with {effective_k} nearest semantic "
                            f"neighbors (which suggest '{best_alt_label}'). Inspect for mislabeling."
                        ),
                    )
                )
    return findings
