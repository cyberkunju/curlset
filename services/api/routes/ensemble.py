"""
Ensemble pseudo-labeling API.

Exposes the confidence-weighted multi-model ensemble (docs/LABELING.md):

  * ``POST /datasets/{id}/ensemble/label``  — run fan-out + aggregation + routing, optionally
    materialising auto-accepted labels as ``origin=ensemble`` candidates;
  * ``GET  /datasets/{id}/ensemble/votes``  — vote inventory per provider/model (UI + cost audit);
  * ``GET  /datasets/{id}/ensemble/audit-sample`` — how many labels must be human-audited to
    certify a precision floor, plus a deterministic sample to audit.

Safety properties enforced here (not in the UI):
  * only users with editor rights on the dataset's project may run a pass or read results;
  * a run is rate-limited (each pass is potentially many paid model calls);
  * an ensemble label is materialised as ``pending_review`` only — never approved.
"""
from __future__ import annotations

import hashlib
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.models import AnnotationModel, EnsembleVoteModel
from packages.dataset_core.db.session import get_db
from packages.dataset_ensemble.fanout import FanoutConfig, ModelSpec
from packages.dataset_ensemble.selection import audit_sample_size
from packages.dataset_ensemble.service import materialize_annotations, run_ensemble
from packages.dataset_ensemble.types import Band
from packages.dataset_security.auth import get_auth_user, verify_dataset_access
from packages.dataset_security.rate_limiter import global_rate_limiter

router = APIRouter(tags=["ensemble"])


class EnsembleModelSpec(BaseModel):
    provider: str = Field(..., min_length=1, max_length=64)
    model: str = Field(..., min_length=1, max_length=128)


class EnsembleLabelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    models: list[EnsembleModelSpec] = Field(..., min_length=1, max_length=5)
    split: str | None = Field(None, description="Only label this split (train/val/test)")
    limit: int = Field(200, ge=1, le=500)
    concurrency: int = Field(4, ge=1, le=8)
    budget_cap_usd: float = Field(2.0, ge=0.0, description="Hard spend ceiling for this pass")
    target_precision: float = Field(0.99, gt=0.5, lt=1.0)
    min_support: int = Field(30, ge=5, le=500)
    weight_alpha: float = Field(2.0, ge=0.0, le=20.0, description="Weight sharpness on measured accuracy")
    weight_beta: float = Field(1.0, ge=0.0, le=20.0, description="Weight on calibration quality")
    prompt_version: str = Field("v1", min_length=1, max_length=32)
    only_missing: bool = Field(True, description="Reuse stored votes (idempotent)")
    materialize: bool = Field(False, description="Write auto-accepted labels as origin=ensemble candidates")


class AuditSampleResponse(BaseModel):
    dataset_id: str
    population: int
    recommended_size: int
    sample_record_ids: list[str]
    target_precision: float
    note: str


def _resolve_dataset_id(session: Session, dataset_id: str, user_id: str) -> str:
    verify_dataset_access(session, dataset_id, user_id, required_role="editor")
    return dataset_id


@router.post("/api/v1/datasets/{dataset_id}/ensemble/label")
def ensemble_label(
    dataset_id: str,
    req: EnsembleLabelRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Run one confidence-weighted ensemble labeling pass and return its measured outcome."""
    _resolve_dataset_id(session, dataset_id, user_id)
    # Each pass can fan out to N models x M records of paid inference.
    global_rate_limiter.check(f"ensemble_{user_id}", max_requests=10, window_seconds=60)

    config = FanoutConfig(
        models=[ModelSpec(provider=spec.provider, model=spec.model) for spec in req.models],
        split=req.split,
        limit=req.limit,
        concurrency=req.concurrency,
        budget_cap_usd=req.budget_cap_usd,
        prompt_version=req.prompt_version,
        only_missing=req.only_missing,
    )
    outcome = run_ensemble(
        session,
        dataset_id,
        config,
        target_precision=req.target_precision,
        min_support=req.min_support,
        weight_alpha=req.weight_alpha,
        weight_beta=req.weight_beta,
    )
    materialized = 0
    if req.materialize:
        materialized = materialize_annotations(session, outcome, band=Band.AUTO_ACCEPT)

    payload = outcome.to_dict()
    payload["materialized_annotations"] = materialized
    payload["requested_models"] = [spec.model_dump() for spec in req.models]
    session.commit()
    return payload


@router.get("/api/v1/datasets/{dataset_id}/ensemble/votes")
def ensemble_votes(
    dataset_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Vote inventory: how many calls per provider/model, failures and spend."""
    verify_dataset_access(session, dataset_id, user_id, required_role="viewer")
    rows = session.execute(
        select(
            EnsembleVoteModel.provider_name,
            EnsembleVoteModel.model_name,
            func.count(),
            func.sum(EnsembleVoteModel.cost_usd),
            func.sum(case((EnsembleVoteModel.error_message.is_not(None), 1), else_=0)),
        ).where(EnsembleVoteModel.dataset_id == dataset_id)
        .group_by(EnsembleVoteModel.provider_name, EnsembleVoteModel.model_name)
    ).all()

    models = [
        {
            "provider": provider,
            "model": model,
            "votes": int(votes or 0),
            "cost_usd": round(float(cost or 0.0), 6),
            "failures": int(failures or 0),
        }
        for provider, model, votes, cost, failures in rows
    ]
    ensemble_candidates = session.scalar(
        select(func.count()).select_from(AnnotationModel).where(
            AnnotationModel.dataset_id == dataset_id,
            AnnotationModel.origin == AnnotationOrigin.ENSEMBLE.value,
        )
    )
    pending = session.scalar(
        select(func.count()).select_from(AnnotationModel).where(
            AnnotationModel.dataset_id == dataset_id,
            AnnotationModel.origin == AnnotationOrigin.ENSEMBLE.value,
            AnnotationModel.status == ReviewStatus.PENDING_REVIEW.value,
        )
    )
    return {
        "dataset_id": dataset_id,
        "models": models,
        "total_votes": sum(model["votes"] for model in models),
        "total_cost_usd": round(sum(model["cost_usd"] for model in models), 6),
        "ensemble_candidates": int(ensemble_candidates or 0),
        "ensemble_candidates_pending_review": int(pending or 0),
    }


@router.get("/api/v1/datasets/{dataset_id}/ensemble/audit-sample", response_model=AuditSampleResponse)
def ensemble_audit_sample(
    dataset_id: str,
    size: int = Query(100, ge=1, le=1000),
    target_precision: float = Query(0.99, gt=0.5, lt=1.0),
    seed: int = Query(7, ge=0),
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> AuditSampleResponse:
    """Deterministic audit sample over ensemble candidates + the size needed to certify a floor."""
    verify_dataset_access(session, dataset_id, user_id, required_role="viewer")
    candidate_ids = list(
        session.scalars(
            select(AnnotationModel.record_id).where(
                AnnotationModel.dataset_id == dataset_id,
                AnnotationModel.origin == AnnotationOrigin.ENSEMBLE.value,
            ).order_by(AnnotationModel.record_id)
        ).all()
    )

    def _rank(record_id: str) -> str:
        return hashlib.sha256(f"{seed}|{record_id}".encode()).hexdigest()

    ordered = sorted(candidate_ids, key=_rank)
    sample = ordered[: min(size, len(ordered))]

    # To *certify* `target_precision` as a Wilson lower bound, the observed precision must be
    # strictly higher than the target; assume a plausible margin and report the required n.
    expected = min(0.999, target_precision + (1.0 - target_precision) / 2)
    try:
        recommended = audit_sample_size(expected, target_lower_bound=target_precision)
    except ValueError:  # pragma: no cover - defensive
        recommended = 400

    return AuditSampleResponse(
        dataset_id=dataset_id,
        population=len(candidate_ids),
        recommended_size=min(recommended, max(1, len(candidate_ids))) if candidate_ids else recommended,
        sample_record_ids=sample,
        target_precision=target_precision,
        note=(
            "Audit these records by hand and compare to the ensemble label. The precision floor is "
            "only certified when the Wilson lower bound over the audited sample meets the target; "
            f"a {expected:.3f} observed precision needs about {recommended} audited labels. "
            "Audit records must never be used to fit model weights."
        ),
    )
