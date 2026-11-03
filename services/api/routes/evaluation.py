"""Active Learning, Baseline Evaluation, and Semantic Cluster API Routes."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_evaluation.clustering import ClusterMapResponse
from packages.dataset_evaluation.metrics import EvaluationReport
from packages.dataset_evaluation.service import (
    EvaluationNoComparablePairsError,
    EvaluationService,
    EvaluationTaskNotSupportedError,
    EvaluationUnsupportedOriginsError,
)

router = APIRouter(prefix="/api/v1/datasets", tags=["evaluation"])

# Honest-evaluation failures are domain errors. The platform has two error-envelope
# conventions (`{"error": ...}` from main.py handlers, `{"detail": ...}` from routes that
# catch domain errors explicitly); emit both so API clients/tests of either style work.
_EVALUATION_DOMAIN_ERRORS = (
    EvaluationNoComparablePairsError,
    EvaluationTaskNotSupportedError,
    EvaluationUnsupportedOriginsError,
)


def _evaluation_error_response(exc: Any) -> JSONResponse:
    detail = {
        "code": exc.code,
        "message": exc.message,
        "details": exc.details,
    }
    return JSONResponse(status_code=422, content={"error": detail, "detail": detail})


class EvaluationRunRequest(BaseModel):
    split: str = "test"
    candidate_origin: str = "model"
    reference_origin: str = "human"
    provider: str | None = None
    model: str | None = None
    # Imported labels from an already-labeled CSV/JSONL are legitimate pre-existing gold;
    # set false to score independent human-reviewed labels only.
    allow_imported_gold: bool = True


class EvaluationRunSummary(BaseModel):
    """Persisted evaluation-run record (TEXT_MVP.md F4)."""

    id: str
    run_id: str
    dataset_id: str
    split: str
    gold_source: str
    candidate_source: str
    provider: str | None = None
    model: str | None = None
    total_samples: int
    accuracy: float
    macro_f1: float
    metrics: dict[str, Any] = {}
    created_at: datetime


@router.get("/{dataset_id}/active-learning/queue")
def get_active_learning_queue(
    dataset_id: str,
    strategy: str = Query("least_confidence", description="Prioritization strategy: least_confidence, label_noise, disagreement, unreviewed_first"),
    split: str | None = Query(None, description="Optional split filter: train, val, test"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve an explainable active-learning prioritized record queue."""
    return EvaluationService.get_active_learning_queue(
        session=session,
        dataset_id=dataset_id,
        strategy=strategy,
        split=split,
        limit=limit,
        offset=offset,
    )


@router.post("/{dataset_id}/evaluation/run", response_model=EvaluationReport)
def run_baseline_evaluation(
    dataset_id: str,
    payload: EvaluationRunRequest = EvaluationRunRequest(),
    session: Session = Depends(get_db),
) -> EvaluationReport | JSONResponse:
    """Score approved ground-truth labels against model proposals and persist the run.

    Gold = approved annotations with origin in {human, imported} (``allow_imported_gold``
    defaults to true so a labeler that starts from a labeled CSV can report honest
    accuracy); model/synthetic/rule-generated annotations are never gold.

    Raises 422 (``EVALUATION_NO_COMPARABLE_PAIRS``) when no record has both sides, and
    422 (``EVALUATION_TASK_NOT_SUPPORTED``) for non-classification datasets — never a
    green 0 %/100 % report (TEXT_MVP.md F1/F2/F6).
    """
    try:
        return EvaluationService.run_baseline_evaluation(
            session=session,
            dataset_id=dataset_id,
            split=payload.split,
            candidate_origin=payload.candidate_origin,
            reference_origin=payload.reference_origin,
            provider=payload.provider,
            model=payload.model,
            allow_imported_gold=payload.allow_imported_gold,
        )
    except _EVALUATION_DOMAIN_ERRORS as exc:
        return _evaluation_error_response(exc)


@router.get("/{dataset_id}/evaluation/runs", response_model=list[EvaluationRunSummary])
def list_evaluation_runs(
    dataset_id: str,
    limit: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_db),
) -> list[EvaluationRunSummary]:
    """List persisted gold-vs-model accuracy runs for a dataset, newest first."""
    runs = EvaluationService.list_evaluation_runs(
        session=session,
        dataset_id=dataset_id,
        limit=limit,
    )
    return [
        EvaluationRunSummary(
            id=run.id,
            run_id=run.id,
            dataset_id=run.dataset_id,
            split=run.split,
            gold_source=run.gold_source,
            candidate_source=run.candidate_source,
            provider=run.provider,
            model=run.model,
            total_samples=run.total_samples,
            accuracy=run.accuracy,
            macro_f1=run.macro_f1,
            metrics=run.metrics_json or {},
            created_at=run.created_at,
        )
        for run in runs
    ]


@router.get("/{dataset_id}/clusters", response_model=ClusterMapResponse)
def get_dataset_clusters(
    dataset_id: str,
    session: Session = Depends(get_db),
) -> ClusterMapResponse:
    """Compute 2D semantic projection map, local cluster densities, and coverage gap boundary cells."""
    return EvaluationService.get_cluster_map(session=session, dataset_id=dataset_id)
