"""Active Learning, Baseline Evaluation, and Semantic Cluster API Routes."""

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_evaluation.clustering import ClusterMapResponse
from packages.dataset_evaluation.metrics import EvaluationReport
from packages.dataset_evaluation.service import EvaluationService

router = APIRouter(prefix="/api/v1/datasets", tags=["evaluation"])


class EvaluationRunRequest(BaseModel):
    split: str = "test"
    candidate_origin: str = "model"
    reference_origin: str = "human"


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
) -> EvaluationReport:
    """Run an evaluation comparing model candidate predictions against gold-standard human reference labels."""
    return EvaluationService.run_baseline_evaluation(
        session=session,
        dataset_id=dataset_id,
        split=payload.split,
        candidate_origin=payload.candidate_origin,
        reference_origin=payload.reference_origin,
    )


@router.get("/{dataset_id}/clusters", response_model=ClusterMapResponse)
def get_dataset_clusters(
    dataset_id: str,
    session: Session = Depends(get_db),
) -> ClusterMapResponse:
    """Compute 2D semantic projection map, local cluster densities, and coverage gap boundary cells."""
    return EvaluationService.get_cluster_map(session=session, dataset_id=dataset_id)
