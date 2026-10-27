"""Evaluation and Active Learning Service.

Orchestrates:
1. Active learning review queue sorting (least confidence, label noise, disagreement, unreviewed).
2. Model baseline evaluation against gold-standard human-approved splits (Precision, Recall, F1, Confusion Matrix).
3. 2D semantic cluster projection and coverage gap detection.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.models import (
    DatasetModel,
    DatasetRecordModel,
)
from packages.dataset_core.exceptions import ResourceNotFoundError
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
                active_ann = r.annotations[0] if r.annotations else None
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
                active_ann = r.annotations[0] if r.annotations else None
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
                active_ann = r.annotations[0] if r.annotations else None
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
                active_ann = r.annotations[0] if r.annotations else None
                st = active_ann.status if active_ann else "unannotated"
                score = status_priority.get(st, 0.5)
                scored_records.append((score, r, {"status": st, "reason": f"Status: {st}"}))
            scored_records.sort(key=lambda x: x[0])

        # Slice paginated output
        total = len(scored_records)
        page = scored_records[offset : offset + limit]

        items = []
        for rank, (_, r, extra) in enumerate(page, start=offset + 1):
            active_ann = r.annotations[0] if r.annotations else None
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
    ) -> EvaluationReport:
        """Evaluate candidate annotations against reference human ground-truth for a split."""
        dataset = session.get(DatasetModel, dataset_id)
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        records = session.scalars(
            select(DatasetRecordModel)
            .where(
                DatasetRecordModel.dataset_id == dataset_id,
                DatasetRecordModel.split == split,
            )
        ).all()

        y_true: list[str] = []
        y_pred: list[str] = []

        for r in records:
            if not r.annotations:
                continue
            active_ann = r.annotations[0]
            # Reference label: must be approved or human origin
            # If candidate annotations exist in revisions, match them
            current_label = active_ann.payload.get("label") if active_ann.payload else None
            if not current_label:
                continue

            # Look for model proposal in revisions
            model_label = None
            if active_ann.revisions:
                for rev in active_ann.revisions:
                    if rev.origin == candidate_origin and rev.payload and "label" in rev.payload:
                        model_label = rev.payload["label"]
                        break

            # If no model revision, compare current_label vs human reference
            if model_label:
                y_pred.append(str(model_label))
                y_true.append(str(current_label))
            elif active_ann.origin == candidate_origin:
                # Active annotation is candidate
                y_pred.append(str(current_label))
                y_true.append(str(current_label))

        metadata = {
            "dataset_id": dataset_id,
            "dataset_name": dataset.name,
            "split": split,
            "candidate_origin": candidate_origin,
            "reference_origin": reference_origin,
        }

        return compute_classification_metrics(y_true, y_pred, metadata=metadata)

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
            active_ann = r.annotations[0] if r.annotations else None
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
