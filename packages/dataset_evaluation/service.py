"""Evaluation and Active Learning Service.

Orchestrates:
1. Active learning review queue sorting (least confidence, label noise, disagreement, unreviewed).
2. Honest model baseline evaluation: APPROVED ground-truth annotations (gold: origin
   ``human`` or ``imported``; model/synthetic/rule-generated are never gold) vs
   MODEL-origin proposals on the same records (never a label compared to itself),
   persisted per run with explicit ``gold_source``/``gold_origins`` provenance.
3. 2D semantic cluster projection and coverage gap detection.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.annotation_selector import select_active_annotation
from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus, TaskType
from packages.dataset_core.db.models import (
    DatasetModel,
    DatasetRecordModel,
    EvaluationRunModel,
    ProcessingRunModel,
)
from packages.dataset_core.exceptions import (
    DomainError,
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_evaluation.clustering import (
    ClusterMapResponse,
    project_embeddings_to_2d,
)
from packages.dataset_evaluation.confident_learning import (
    extract_simple_text_embedding,
    find_confident_label_errors,
)
from packages.dataset_evaluation.metrics import (
    EvaluationReport,
    compute_classification_metrics,
)

# TEXT_MVP.md F1/F6: only label-bearing classification tasks can be scored with
# precision/recall/F1. Anything else must fail loudly, not render a 0-sample green card.
SUPPORTED_CLASSIFICATION_TASKS = frozenset({
    TaskType.TEXT_CLASSIFICATION.value,
    TaskType.IMAGE_CLASSIFICATION.value,
})
GOLD_SOURCE_HUMAN = "human_approved"
GOLD_SOURCE_IMPORTED = "imported_approved"
GOLD_SOURCE_MIXED = "human_and_imported_approved"
CANDIDATE_SOURCE = "model"

# Gold = pre-existing ground truth, never model output. ``imported`` annotations are
# legitimate pre-existing labels when the user starts from an already-labeled CSV/JSONL
# (TEXT_MVP A7); model/synthetic/rule-generated/augmented labels never qualify as gold.
GOLD_ORIGINS_ALLOWED = frozenset({
    AnnotationOrigin.HUMAN.value,
    AnnotationOrigin.IMPORTED.value,
})
GOLD_ORIGINS_ALLOWED_HUMAN_ONLY = frozenset({AnnotationOrigin.HUMAN.value})
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _gold_source_for_origins(gold_origins: set[str]) -> str:
    """Map the actually-used gold origin set to the report's ``gold_source`` label."""
    human = AnnotationOrigin.HUMAN.value
    imported = AnnotationOrigin.IMPORTED.value
    if gold_origins == {human}:
        return GOLD_SOURCE_HUMAN
    if gold_origins == {imported}:
        return GOLD_SOURCE_IMPORTED
    if gold_origins == {human, imported}:
        return GOLD_SOURCE_MIXED
    # Defensive: never silently label an unexpected origin set as "human_approved".
    return "unknown"


class EvaluationTaskNotSupportedError(DomainValidationError):
    """Dataset task type cannot be scored with classification metrics (TEXT_MVP F6).

    Subclasses ``DomainValidationError`` so the API's existing exception handler maps
    it to HTTP 422 (the generic ``DomainError`` handler would return 400).
    """

    def __init__(self, task_type: str | None):
        DomainError.__init__(
            self,
            f"Task '{task_type}' is not supported for classification metrics. "
            "Only text_classification and image_classification datasets with "
            "label payloads can be evaluated; object detection and other tasks are "
            "not supported for classification metrics.",
            code="EVALUATION_TASK_NOT_SUPPORTED",
            details={
                "task_type": task_type,
                "supported_tasks": sorted(SUPPORTED_CLASSIFICATION_TASKS),
            },
        )


class EvaluationNoComparablePairsError(DomainValidationError):
    """No record had both an approved gold label and a model candidate (TEXT_MVP F2)."""

    def __init__(
        self,
        dataset_id: str,
        split: str,
        records_in_split: int,
        approved_gold: int,
        approved_human: int,
        model_candidates: int,
        gold_origins: list[str],
        allow_imported_gold: bool,
    ):
        DomainError.__init__(
            self,
            "EVALUATION_NO_COMPARABLE_PAIRS: no record in split "
            f"'{split}' has both an approved human or imported gold label "
            f"(allowed gold origins: {', '.join(gold_origins)}) and a model-origin "
            "proposal, so no honest accuracy can be computed. "
            f"({records_in_split} record(s) in split, {approved_gold} with approved "
            f"gold labels ({approved_human} human), {model_candidates} with model "
            "proposals.)",
            code="EVALUATION_NO_COMPARABLE_PAIRS",
            details={
                "dataset_id": dataset_id,
                "split": split,
                "records_in_split": records_in_split,
                "records_with_approved_gold": approved_gold,
                "records_with_approved_human_gold": approved_human,
                "records_with_model_candidate": model_candidates,
                "gold_origins": gold_origins,
                "allow_imported_gold": allow_imported_gold,
                "candidate_source": CANDIDATE_SOURCE,
            },
        )


class EvaluationUnsupportedOriginsError(DomainValidationError):
    """Only approved-human/imported gold vs model candidates is an honest comparison."""

    def __init__(
        self,
        reference_origin: str,
        candidate_origin: str,
        allow_imported_gold: bool = True,
    ):
        DomainError.__init__(
            self,
            "EVALUATION_UNSUPPORTED_ORIGINS: evaluation only compares approved human "
            "or imported annotations (gold) against model-origin proposals; got "
            f"reference_origin='{reference_origin}' and candidate_origin="
            f"'{candidate_origin}'.",
            code="EVALUATION_UNSUPPORTED_ORIGINS",
            details={
                "reference_origin": reference_origin,
                "candidate_origin": candidate_origin,
                "required_reference_origin": AnnotationOrigin.HUMAN.value,
                "required_candidate_origin": AnnotationOrigin.MODEL.value,
                "gold_origins": sorted(
                    GOLD_ORIGINS_ALLOWED if allow_imported_gold else GOLD_ORIGINS_ALLOWED_HUMAN_ONLY
                ),
                "allow_imported_gold": allow_imported_gold,
            },
        )


def _payload_label(payload: dict[str, Any] | None) -> str | None:
    """Return a non-empty string label from an annotation/revision payload."""
    if not isinstance(payload, dict):
        return None
    label = payload.get("label")
    if isinstance(label, str) and label.strip():
        return label.strip()
    return None


def _revision_sort_key(revision: Any) -> tuple[int, datetime, str]:
    created = getattr(revision, "created_at", None)
    number = getattr(revision, "revision_number", 0) or 0
    if not isinstance(created, datetime):
        created = _EPOCH
    elif created.tzinfo is None:
        # SQLite hands back naive datetimes; normalise so comparisons never raise.
        created = created.replace(tzinfo=UTC)
    return (int(number), created, str(getattr(revision, "id", "") or ""))


def _latest_model_revision(annotations: list[Any]) -> Any | None:
    """Newest MODEL-origin revision across a record's annotations (legacy proposal shape)."""
    candidates: list[Any] = []
    for annotation in annotations:
        for revision in getattr(annotation, "revisions", None) or []:
            if (
                getattr(revision, "origin", None) == AnnotationOrigin.MODEL.value
                and _payload_label(getattr(revision, "payload", None))
            ):
                candidates.append(revision)
    if not candidates:
        return None
    return max(candidates, key=_revision_sort_key)


def _extract_provider_model(
    session: Session,
    candidate_annotation: Any | None,
    candidate_revision: Any | None,
    run_cache: dict[str, ProcessingRunModel | None],
) -> tuple[str | None, str | None]:
    """Best-effort provider/model provenance for the model candidate.

    Priority: candidate revision metadata -> annotation revision metadata ->
    linked ProcessingRun configuration snapshot -> ``model:<name>`` actor convention.
    """
    metadata: dict[str, Any] = {}
    if candidate_revision is not None and isinstance(getattr(candidate_revision, "model_metadata", None), dict):
        metadata = candidate_revision.model_metadata or {}
    if not metadata and candidate_annotation is not None:
        revisions = sorted(
            getattr(candidate_annotation, "revisions", None) or [],
            key=_revision_sort_key,
            reverse=True,
        )
        for revision in revisions:
            if getattr(revision, "origin", None) == AnnotationOrigin.MODEL.value and isinstance(
                getattr(revision, "model_metadata", None), dict
            ):
                metadata = revision.model_metadata or {}
                if metadata:
                    break

    provider = metadata.get("provider") if isinstance(metadata.get("provider"), str) else None
    model = metadata.get("model") if isinstance(metadata.get("model"), str) else None

    if not (provider or model) and candidate_annotation is not None:
        run_id = getattr(candidate_annotation, "processing_run_id", None)
        if run_id:
            if run_id not in run_cache:
                run_cache[run_id] = session.get(ProcessingRunModel, run_id)
            run = run_cache[run_id]
            config = (run.configuration_snapshot or {}) if run is not None else {}
            provider = provider or (config.get("provider") if isinstance(config.get("provider"), str) else None)
            model = model or (config.get("model") if isinstance(config.get("model"), str) else None)

    if not model and candidate_revision is not None:
        actor = str(getattr(candidate_revision, "actor_id", "") or "")
        if actor.startswith("model:"):
            model = actor[len("model:"):].strip() or None

    return provider, model


def _resolve_comparable_pair(
    record: Any,
    allow_imported_gold: bool = True,
) -> dict[str, Any] | None:
    """Return a gold/model pair for one record, or ``None`` if it is not comparable.

    Gold: an APPROVED annotation whose origin is ``human`` — or, when
    ``allow_imported_gold`` (default), ``imported`` (pre-existing CSV/JSONL labels).
    Model/synthetic/rule-generated/augmented annotations are *never* gold.
    Candidate: an annotation with ``origin == model`` (AI-labeling path) or, for
    legacy data, the newest MODEL-origin revision recorded on an annotation.
    The candidate is always read from model-origin data and the gold/candidate rows are
    distinct, so ``y_pred`` can never be the gold label copied into both sides.
    """
    annotations = list(getattr(record, "annotations", None) or [])
    if not annotations:
        return None

    allowed_gold_origins = (
        GOLD_ORIGINS_ALLOWED if allow_imported_gold else GOLD_ORIGINS_ALLOWED_HUMAN_ONLY
    )
    approved_gold = [
        annotation
        for annotation in annotations
        if getattr(annotation, "status", None) == ReviewStatus.APPROVED.value
        and getattr(annotation, "origin", None) in allowed_gold_origins
        and _payload_label(getattr(annotation, "payload", None))
    ]
    if not approved_gold:
        return None

    gold_annotation = select_active_annotation(approved_gold)
    if gold_annotation is None:
        return None
    gold_label = _payload_label(gold_annotation.payload)
    if gold_label is None:
        return None

    model_annotations = [
        annotation
        for annotation in annotations
        if getattr(annotation, "origin", None) == AnnotationOrigin.MODEL.value
        and _payload_label(getattr(annotation, "payload", None))
    ]
    candidate_annotation = select_active_annotation(model_annotations) if model_annotations else None
    candidate_revision = None

    if candidate_annotation is not None:
        # Defensive: gold origins and the model candidate are disjoint by construction,
        # but guard explicitly against self-comparison regressions.
        if getattr(candidate_annotation, "id", None) == getattr(gold_annotation, "id", None):
            return None
        candidate_label = _payload_label(candidate_annotation.payload)
    else:
        candidate_revision = _latest_model_revision(annotations)
        candidate_label = _payload_label(getattr(candidate_revision, "payload", None))

    if candidate_label is None:
        return None

    return {
        "gold_annotation": gold_annotation,
        "gold_label": gold_label,
        "gold_origin": str(getattr(gold_annotation, "origin", "") or ""),
        "candidate_annotation": candidate_annotation,
        "candidate_revision": candidate_revision,
        "candidate_label": candidate_label,
    }


def _dataset_schema_classes(dataset: DatasetModel) -> set[str]:
    label_schema = dataset.label_schema or {}
    classes = label_schema.get("classes") or label_schema.get("labels") or []
    if not isinstance(classes, list):
        return set()
    return {str(class_name) for class_name in classes}


class EvaluationService:
    @staticmethod
    def get_active_learning_queue(
        session: Session,
        dataset_id: str,
        strategy: str = "least_confidence",
        split: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Fetch prioritized record queue according to an active learning strategy."""
        dataset = session.get(DatasetModel, dataset_id)
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        query = select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset_id)
        if split:
            query = query.where(DatasetRecordModel.split == split)

        records = session.scalars(query).all()
        if not records:
            return {"items": [], "total": 0, "strategy": strategy}

        scored_records: list[tuple[float, Any, dict[str, Any]]] = []

        if strategy == "least_confidence":
            # Priority: lowest confidence score first
            # Never invent confidence: records with missing confidence get default priority score 0.5 with flag
            for r in records:
                active_ann = select_active_annotation(r.annotations)
                if not active_ann:
                    # Unannotated item needs review
                    score = 0.0
                    info = {"reason": "Unannotated record"}
                elif active_ann.confidence is not None:
                    score = float(active_ann.confidence)
                    info = {"confidence": score, "reason": "Low model confidence"}
                else:
                    score = 0.5
                    info = {"confidence": None, "reason": "Unspecified confidence"}
                scored_records.append((score, r, info))
            scored_records.sort(key=lambda x: x[0])

        elif strategy == "label_noise":
            # Extract embeddings and find confident label errors
            emb_records = []
            for r in records:
                active_ann = select_active_annotation(r.annotations)
                label = active_ann.payload.get("label") if active_ann and active_ann.payload else None
                extra_meta = getattr(r, "extra_metadata", None) or getattr(r, "metadata", {})
                text_content = ""
                if extra_meta and isinstance(extra_meta, dict):
                    text_content = extra_meta.get("text") or extra_meta.get("content") or str(extra_meta)
                emb = extract_simple_text_embedding(text_content or r.id)
                emb_records.append({"record_id": r.id, "label": label, "embedding": emb})

            findings = find_confident_label_errors(emb_records, k=7)
            finding_map = {f.record_id: f for f in findings}

            for r in records:
                finding = finding_map.get(r.id)
                if finding:
                    # Lower agreement score = higher priority
                    scored_records.append((
                        finding.label_quality_score,
                        r,
                        {
                            "reason": f"Likely mislabeled (suggests '{finding.suggested_label}')",
                            "suggested_label": finding.suggested_label,
                            "label_quality_score": finding.label_quality_score,
                        },
                    ))
                else:
                    scored_records.append((1.0, r, {"reason": "No label noise detected"}))
            scored_records.sort(key=lambda x: x[0])

        elif strategy == "disagreement":
            # Records where multiple revisions exist or model proposal changed
            for r in records:
                active_ann = select_active_annotation(r.annotations)
                rev_count = len(active_ann.revisions) if active_ann and active_ann.revisions else 0
                has_model = any(rev.origin == AnnotationOrigin.MODEL.value for rev in (active_ann.revisions or [])) if active_ann else False
                has_human = any(rev.origin == AnnotationOrigin.HUMAN.value for rev in (active_ann.revisions or [])) if active_ann else False

                if has_model and has_human:
                    score = 0.1  # High disagreement priority
                    info = {"reason": "Model vs human revision divergence"}
                elif rev_count > 1:
                    score = 0.3
                    info = {"reason": f"{rev_count} conflicting revisions"}
                else:
                    score = 0.9
                    info = {"reason": "Single revision"}
                scored_records.append((score, r, info))
            scored_records.sort(key=lambda x: x[0])

        else:  # "unreviewed_first" (default)
            status_priority = {
                "unannotated": 0.0,
                ReviewStatus.NEEDS_CORRECTION.value: 0.1,
                ReviewStatus.PENDING_REVIEW.value: 0.2,
                ReviewStatus.REJECTED.value: 0.5,
                ReviewStatus.APPROVED.value: 1.0,
            }
            for r in records:
                active_ann = select_active_annotation(r.annotations)
                st = active_ann.status if active_ann else "unannotated"
                score = status_priority.get(st, 0.5)
                scored_records.append((score, r, {"status": st, "reason": f"Status: {st}"}))
            scored_records.sort(key=lambda x: x[0])

        # Slice paginated output
        total = len(scored_records)
        page = scored_records[offset : offset + limit]

        items = []
        for rank, (_, r, extra) in enumerate(page, start=offset + 1):
            active_ann = select_active_annotation(r.annotations)
            items.append({
                "rank": rank,
                "record_id": r.id,
                "external_key": r.external_key,
                "split": r.split,
                "review_status": active_ann.status if active_ann else "unannotated",
                "label": active_ann.payload.get("label") if active_ann and active_ann.payload else None,
                "confidence": active_ann.confidence if active_ann else None,
                "priority_metadata": extra,
            })

        return {
            "strategy": strategy,
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": items,
        }

    @staticmethod
    def run_baseline_evaluation(
        session: Session,
        dataset_id: str,
        split: str = "test",
        candidate_origin: str = AnnotationOrigin.MODEL.value,
        reference_origin: str = AnnotationOrigin.HUMAN.value,
        provider: str | None = None,
        model: str | None = None,
        allow_imported_gold: bool = True,
    ) -> EvaluationReport:
        """Score APPROVED ground-truth labels (gold) against MODEL proposals; persist the run.

        TEXT_MVP.md F1-F4/F6:
        - gold = APPROVED annotations with ``origin`` in {human, imported} (imported labels
          from an already-labeled CSV/JSONL are pre-existing ground truth); model,
          synthetic, rule-generated and augmented annotations are NEVER gold. Pass
          ``allow_imported_gold=False`` to score human-reviewed labels only (default is
          ``True``: the product's primary use case starts from a labeled file).
        - candidate = model-origin proposals on the *same* record. A record without both
          sides is skipped, and ``y_pred`` is never filled from the gold label (the old
          self-comparison bug is removed);
        - ``gold_source`` reports which gold origins were actually used:
          ``human_approved`` / ``imported_approved`` / ``human_and_imported_approved``,
          and metadata carries ``gold_origins`` (the actually-used set);
        - only classification tasks are supported (object detection -> 422);
        - zero comparable pairs -> 422, never a green 0 %/100 % card;
        - the report carries provenance and a persisted ``EvaluationRunModel`` row.
        """
        dataset = session.get(DatasetModel, dataset_id)
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        if dataset.task_type not in SUPPORTED_CLASSIFICATION_TASKS:
            raise EvaluationTaskNotSupportedError(dataset.task_type)

        if (
            reference_origin != AnnotationOrigin.HUMAN.value
            or candidate_origin != AnnotationOrigin.MODEL.value
        ):
            raise EvaluationUnsupportedOriginsError(
                reference_origin, candidate_origin, allow_imported_gold=allow_imported_gold
            )

        records = session.scalars(
            select(DatasetRecordModel)
            .where(
                DatasetRecordModel.dataset_id == dataset_id,
                DatasetRecordModel.split == split,
            )
            .order_by(DatasetRecordModel.created_at.asc(), DatasetRecordModel.id.asc())
        ).all()

        y_true: list[str] = []
        y_pred: list[str] = []
        skipped_records = 0
        records_with_gold = 0
        records_with_human_gold = 0
        records_with_candidate = 0
        gold_origins_used: set[str] = set()
        imported_gold_pairs = 0
        run_cache: dict[str, ProcessingRunModel | None] = {}
        discovered_provenance: set[tuple[str | None, str | None]] = set()
        out_of_schema_predictions: set[str] = set()
        schema_classes = _dataset_schema_classes(dataset)
        allowed_gold_origins = (
            GOLD_ORIGINS_ALLOWED if allow_imported_gold else GOLD_ORIGINS_ALLOWED_HUMAN_ONLY
        )

        for record in records:
            annotations = list(record.annotations or [])
            if any(
                getattr(annotation, "status", None) == ReviewStatus.APPROVED.value
                and getattr(annotation, "origin", None) in allowed_gold_origins
                and _payload_label(getattr(annotation, "payload", None))
                for annotation in annotations
            ):
                records_with_gold += 1
            if any(
                getattr(annotation, "status", None) == ReviewStatus.APPROVED.value
                and getattr(annotation, "origin", None) == AnnotationOrigin.HUMAN.value
                and _payload_label(getattr(annotation, "payload", None))
                for annotation in annotations
            ):
                records_with_human_gold += 1
            if any(
                getattr(annotation, "origin", None) == AnnotationOrigin.MODEL.value
                and _payload_label(getattr(annotation, "payload", None))
                for annotation in annotations
            ):
                records_with_candidate += 1

            pair = _resolve_comparable_pair(record, allow_imported_gold=allow_imported_gold)
            if pair is None:
                skipped_records += 1
                continue

            y_true.append(pair["gold_label"])
            y_pred.append(pair["candidate_label"])
            gold_origin = str(pair["gold_origin"])
            if gold_origin:
                gold_origins_used.add(gold_origin)
            if gold_origin == AnnotationOrigin.IMPORTED.value:
                imported_gold_pairs += 1

            if schema_classes and pair["candidate_label"] not in schema_classes:
                out_of_schema_predictions.add(pair["candidate_label"])

            provenance = _extract_provider_model(
                session=session,
                candidate_annotation=pair["candidate_annotation"],
                candidate_revision=pair["candidate_revision"],
                run_cache=run_cache,
            )
            if provenance != (None, None):
                discovered_provenance.add(provenance)

        if not y_true:
            raise EvaluationNoComparablePairsError(
                dataset_id=dataset_id,
                split=split,
                records_in_split=len(records),
                approved_gold=records_with_gold,
                approved_human=records_with_human_gold,
                model_candidates=records_with_candidate,
                gold_origins=sorted(allowed_gold_origins),
                allow_imported_gold=allow_imported_gold,
            )

        gold_source = _gold_source_for_origins(gold_origins_used)

        discovered_provider: str | None = None
        discovered_model: str | None = None
        if len(discovered_provenance) == 1:
            discovered_provider, discovered_model = next(iter(discovered_provenance))

        requested_provider = provider.strip() if isinstance(provider, str) and provider.strip() else None
        requested_model = model.strip() if isinstance(model, str) and model.strip() else None
        final_provider = discovered_provider or requested_provider
        final_model = discovered_model or requested_model

        run_id = generate_id("evaluation")
        gold_origins = sorted(gold_origins_used)
        metadata = {
            "dataset_id": dataset_id,
            "dataset_name": dataset.name,
            "split": split,
            "gold_source": gold_source,
            "gold_origins": gold_origins,
            "allow_imported_gold": allow_imported_gold,
            "candidate_source": CANDIDATE_SOURCE,
            "candidate_origin": candidate_origin,
            "reference_origin": reference_origin,
            "provider": final_provider,
            "model": final_model,
            "skipped_records": skipped_records,
            "run_id": run_id,
        }

        report = compute_classification_metrics(y_true, y_pred, metadata=metadata)

        warnings = list(report.warnings)
        if skipped_records:
            warnings.append(
                f"{skipped_records} record(s) in split '{split}' had no comparable "
                "approved-gold + model-candidate pair and were skipped."
            )
        if imported_gold_pairs:
            warnings.append(
                f"{imported_gold_pairs} gold label(s) came from approved imported "
                "annotations (pre-existing CSV/JSONL labels) rather than independent "
                "human review of this evaluation set."
            )
        if len(discovered_provenance) > 1:
            warnings.append(
                "Model candidates came from multiple providers/models; this report "
                "does not attribute the accuracy to a single model."
            )
        if requested_provider and discovered_provider and requested_provider != discovered_provider:
            warnings.append(
                f"Request provider '{requested_provider}' differs from the source "
                f"annotation provider '{discovered_provider}'; the recorded provider is "
                "the annotation source."
            )
        if requested_model and discovered_model and requested_model != discovered_model:
            warnings.append(
                f"Request model '{requested_model}' differs from the source annotation "
                f"model '{discovered_model}'; the recorded model is the annotation source."
            )
        if out_of_schema_predictions:
            warnings.append(
                "Model predictions contain label(s) outside the dataset label schema: "
                + ", ".join(sorted(out_of_schema_predictions))
            )

        report = report.model_copy(
            update={
                "warnings": warnings,
                "gold_source": gold_source,
                "candidate_source": CANDIDATE_SOURCE,
                "split": split,
                "dataset_id": dataset_id,
                "provider": final_provider,
                "model": final_model,
                "skipped_records": skipped_records,
                "run_id": run_id,
            }
        )

        evaluation_run = EvaluationRunModel(
            id=run_id,
            dataset_id=dataset_id,
            split=split,
            gold_source=gold_source,
            candidate_source=CANDIDATE_SOURCE,
            provider=final_provider,
            model=final_model,
            total_samples=report.total_samples,
            accuracy=report.accuracy,
            macro_f1=report.macro_f1,
            metrics_json=report.model_dump(mode="json"),
        )
        session.add(evaluation_run)
        session.flush()
        return report

    @staticmethod
    def list_evaluation_runs(
        session: Session,
        dataset_id: str,
        limit: int = 50,
    ) -> list[EvaluationRunModel]:
        """Newest-first persisted evaluation runs for a dataset (TEXT_MVP F4)."""
        dataset = session.get(DatasetModel, dataset_id)
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        return list(
            session.scalars(
                select(EvaluationRunModel)
                .where(EvaluationRunModel.dataset_id == dataset_id)
                .order_by(
                    EvaluationRunModel.created_at.desc(),
                    EvaluationRunModel.id.desc(),
                )
                .limit(limit)
            ).all()
        )

    @staticmethod
    def get_cluster_map(session: Session, dataset_id: str) -> ClusterMapResponse:
        """Generate 2D semantic projection and coverage gap map for a dataset."""
        dataset = session.get(DatasetModel, dataset_id)
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        records = session.scalars(
            select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset_id)
        ).all()

        record_payloads = []
        for r in records:
            active_ann = select_active_annotation(r.annotations)
            label = active_ann.payload.get("label") if active_ann and active_ann.payload else None
            extra_meta = getattr(r, "extra_metadata", None) or getattr(r, "metadata", {})
            text_val = ""
            if extra_meta and isinstance(extra_meta, dict):
                text_val = extra_meta.get("text") or extra_meta.get("content") or str(extra_meta)
            emb = extract_simple_text_embedding(text_val or r.id)
            record_payloads.append({
                "record_id": r.id,
                "label": label,
                "embedding": emb,
            })

        response = project_embeddings_to_2d(record_payloads)
        response.dataset_id = dataset_id
        return response
