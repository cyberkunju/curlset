"""
Gated synthetic-data generation pipeline.

The generation *gate* (``diversity.py``) decides what may be admitted; this module is the write path
that turns an admitted batch into real dataset rows with full, immutable lineage.

Non-negotiable rules encoded here:
  * generated data is **only** admitted as a whole batch that passes the diversity + collapse checks
    *and* the label-preservation check — a partially-mislabelled synthetic batch is rejected wholesale;
  * accepted records are stored with ``origin=synthetic`` annotations at ``pending_review`` — synthetic
    data is never auto-approved and never counts as human ground truth;
  * every record carries generator lineage (model, prompt version, seed, intended label, filter scores)
    so a reviewer can audit or delete it later;
  * the class-share cap prevents synthetic data from flooding a class's distribution.

Design: docs/ENSEMBLE_PSEUDO_LABELING.md §6.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.models import DatasetModel, DatasetRecordModel
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_core.services.record_service import RecordService
from packages.dataset_synthesis.diversity import (
    DiversityPolicy,
    GenerationCandidate,
    filter_candidates,
)
from packages.provider_gateway.types import ProviderError, ProviderRequest

#: A verifier maps generated text to the label an independent model would assign.
Verifier = Callable[[str], str]


@dataclass
class GenerationSpec:
    """What to generate and how strictly to gate it."""

    per_class: int = 10
    target_split: str = "train"
    prompt_version: str = "gen-v1"
    max_class_share: float = 0.5
    min_label_preservation: float = 0.90
    max_similarity: float = 0.75
    max_batch_similarity: float = 0.90
    min_batch_unique_trigram_ratio: float = 0.35
    #: optional style guidance inferred from an uploaded sample (see generation_jobs.sample_analysis)
    labels: list[str] = field(default_factory=list)
    difficulty: str = "mixed"
    style_hint: str = ""
    seed_examples: list[str] = field(default_factory=list)
    description: str = ""
    #: shifts the per-item index so a retry wave asks the generator for different samples
    attempt_offset: int = 0


@dataclass
class GenerationOutcome:
    """What happened, with enough detail to audit the decision."""

    dataset_id: str
    #: rows actually admitted into the dataset (0 when the batch is rejected)
    accepted: int = 0
    #: rows that passed the deterministic diversity filters (may still be rejected at batch level)
    passed_filters: int = 0
    rejected: int = 0
    generated: int = 0
    verdict: str = "reject"
    rejection_reasons: list[str] = field(default_factory=list)
    rejection_breakdown: dict[str, int] = field(default_factory=dict)
    label_preservation: float = 0.0
    batch_unique_trigram_ratio: float = 0.0
    collapsed: bool = False
    record_ids: list[str] = field(default_factory=list)
    class_counts_after: dict[str, int] = field(default_factory=dict)
    policy: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "dataset_id": self.dataset_id,
            "generated": self.generated,
            "accepted": self.accepted,
            "passed_filters": self.passed_filters,
            "rejected": self.rejected,
            "verdict": self.verdict,
            "rejection_reasons": self.rejection_reasons,
            "rejection_breakdown": self.rejection_breakdown,
            "label_preservation": self.label_preservation,
            "batch_unique_trigram_ratio": self.batch_unique_trigram_ratio,
            "collapsed": self.collapsed,
            "record_ids": self.record_ids,
            "class_counts_after": self.class_counts_after,
            "policy": self.policy,
        }


def _existing_texts_and_counts(session: Session, dataset_id: str) -> tuple[list[str], dict[str, int]]:
    records = session.scalars(
        select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset_id)
    ).all()
    texts: list[str] = []
    counts: dict[str, int] = {}
    for record in records:
        metadata = record.extra_metadata or {}
        text = str(metadata.get("text") or "")
        if text:
            texts.append(text)
        label = metadata.get("label")
        if label:
            counts[str(label)] = counts.get(str(label), 0) + 1
    return texts, counts


def _generate_candidates(
    dataset: DatasetModel,
    labels: list[str],
    spec: GenerationSpec,
    generator: Any,
    generator_model: str,
) -> list[GenerationCandidate]:
    candidates: list[GenerationCandidate] = []
    for label in labels:
        for index in range(spec.per_class):
            request = ProviderRequest(
                model=generator_model,
                task_type=dataset.task_type,
                parameters={
                    "target_class": label,
                    "index": spec.attempt_offset + index,
                    "seed": index,
                    "prompt_version": spec.prompt_version,
                    "labels": spec.labels or labels,
                    "difficulty": spec.difficulty,
                    "style_hint": spec.style_hint,
                    "seed_examples": spec.seed_examples,
                    "description": spec.description,
                },
                prompt_template=spec.prompt_version,
            )
            try:
                response = generator.generate(request)
            except ProviderError as exc:
                raise DomainValidationError(
                    f"Generation provider failed: {exc.message}", field="provider"
                ) from exc
            text = str((response.payload or {}).get("text") or "").strip()
            if text:
                candidates.append(GenerationCandidate(
                    text=text,
                    intended_label=label,
                    generator_model=str(response.model or generator_model),
                    prompt_version=spec.prompt_version,
                ))
    return candidates


def run_generation(
    session: Session,
    dataset_id: str,
    *,
    generator: Any,
    generator_model: str,
    verifier: Verifier,
    spec: GenerationSpec | None = None,
) -> GenerationOutcome:
    """Generate -> gate -> label-preservation check -> persist (or reject the whole batch)."""
    dataset = session.get(DatasetModel, dataset_id)
    if not dataset:
        raise ResourceNotFoundError("Dataset", dataset_id)
    rules = spec or GenerationSpec()

    label_schema = dataset.label_schema or {}
    labels = [
        str(label) for label in (label_schema.get("labels") or label_schema.get("classes") or [])
    ]
    if not labels:
        raise DomainValidationError(
            "Dataset has no label schema; generation needs allowed classes.", field="label_schema"
        )

    outcome = GenerationOutcome(
        dataset_id=dataset_id,
        policy={
            "per_class": rules.per_class,
            "target_split": rules.target_split,
            "max_class_share": rules.max_class_share,
            "min_label_preservation": rules.min_label_preservation,
            "max_similarity": rules.max_similarity,
            "min_batch_unique_trigram_ratio": rules.min_batch_unique_trigram_ratio,
            "prompt_version": rules.prompt_version,
        },
    )

    existing_texts, existing_counts = _existing_texts_and_counts(session, dataset_id)
    candidates = _generate_candidates(dataset, labels, rules, generator, generator_model)
    outcome.generated = len(candidates)

    policy = DiversityPolicy(
        max_class_share=rules.max_class_share,
        max_similarity=rules.max_similarity,
        max_batch_similarity=rules.max_batch_similarity,
        min_batch_unique_trigram_ratio=rules.min_batch_unique_trigram_ratio,
    )
    report = filter_candidates(
        candidates,
        existing_texts=existing_texts,
        existing_class_counts=existing_counts,
        existing_total=len(existing_texts),
        policy=policy,
    )
    outcome.passed_filters = len(report.accepted)
    outcome.rejected = len(report.rejected)
    outcome.rejection_breakdown = report.rejection_reasons()
    outcome.batch_unique_trigram_ratio = float(report.stats.get("batch_unique_trigram_ratio") or 0.0)
    outcome.class_counts_after = dict(report.stats.get("class_counts_after") or {})
    outcome.collapsed = report.collapsed

    # --- label preservation: an independent verifier must agree with the intended class -------
    preserved = 0
    for candidate in report.accepted:
        try:
            verdict_label = verifier(candidate.text)
        except ProviderError:
            verdict_label = ""
        if verdict_label == candidate.intended_label:
            preserved += 1
    outcome.label_preservation = (
        round(preserved / len(report.accepted), 6) if report.accepted else 0.0
    )

    if report.collapsed:
        outcome.rejection_reasons.append(
            "template collapse: unique trigram ratio "
            f"{outcome.batch_unique_trigram_ratio} < {rules.min_batch_unique_trigram_ratio}"
        )
    if outcome.generated == 0:
        outcome.rejection_reasons.append("generator returned no usable samples")
    if outcome.label_preservation < rules.min_label_preservation:
        outcome.rejection_reasons.append(
            f"label preservation {outcome.label_preservation:.1%} < "
            f"{rules.min_label_preservation:.0%} required"
        )

    if outcome.rejection_reasons or not report.accepted:
        outcome.verdict = "reject"
        outcome.accepted = 0  # a rejected batch admits nothing
        return outcome

    # --- persist: origin=synthetic, pending_review, full lineage ---------------------------
    for candidate in report.accepted:
        record = RecordService.create_record(
            session=session,
            dataset_id=dataset_id,
            split=rules.target_split,
            metadata={
                "text": candidate.text,
                "label": candidate.intended_label,
                "synthetic": True,
                "lineage": {
                    "generator": candidate.generator_model,
                    "prompt_version": candidate.prompt_version,
                    "intended_label": candidate.intended_label,
                    "batch_label_preservation": outcome.label_preservation,
                    "batch_unique_trigram_ratio": outcome.batch_unique_trigram_ratio,
                },
            },
        )
        RecordService.attach_source_record(session, record.id, source_type="synthetic")
        AnnotationService.create_annotation(
            session=session,
            record_id=record.id,
            payload={"label": candidate.intended_label, "synthetic": True},
            origin=AnnotationOrigin.SYNTHETIC,
            status=ReviewStatus.PENDING_REVIEW,
            confidence=outcome.label_preservation,
            actor_id="generator",
        )
        outcome.record_ids.append(record.id)

    session.flush()
    outcome.accepted = len(outcome.record_ids)
    outcome.verdict = "accept"
    return outcome
