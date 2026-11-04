"""
Simple-Mode generation API: plan drafting, job start, live progress, cancel, history.

These endpoints exist to make the guided wizard possible: one text box in, an editable plan with at
most three plain-language questions, then a background job whose progress and ETA the UI can poll.
ETA is measured from real throughput (see ``packages/generation_jobs/service.py``), never invented.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_core.exceptions import DomainValidationError
from packages.dataset_security.auth import get_auth_user, verify_project_access
from packages.dataset_security.rate_limiter import global_rate_limiter
from packages.generation_jobs.sample_analysis import analyze_sample
from packages.generation_jobs.service import (
    cancel_job,
    create_job,
    draft_plan,
    get_job,
    list_jobs,
    start_job,
)
from packages.provider_gateway.gateway import ProviderGateway

router = APIRouter(tags=["generate"])


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(..., min_length=3, max_length=4000)


class JobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(..., min_length=3, max_length=4000)
    classes: list[str] = Field(..., min_length=1, max_length=12)
    per_class: int = Field(..., ge=1, le=500)
    task_type: str = Field("text_classification", max_length=64)
    provider: str = Field(..., min_length=1, max_length=64)
    model: str = Field(..., min_length=1, max_length=128)
    verifier_providers: list[dict[str, str]] = Field(default_factory=list, max_length=3)
    project_id: str | None = None
    dataset_name: str | None = Field(None, max_length=180)
    difficulty: str = Field("mixed", pattern="^(beginner|mixed|hard)$")
    min_label_preservation: float = Field(0.85, gt=0.0, le=1.0)
    max_class_share: float = Field(0.6, gt=0.0, le=1.0)
    target_split: str = Field("train", pattern="^(train|val|test)$")
    style_hint: str = Field("", max_length=500)
    seed_examples: list[str] = Field(default_factory=list, max_length=5)
    description: str = Field("", max_length=2000)


@router.post("/api/v1/generate/analyze-sample")
async def analyze_uploaded_sample(
    file: UploadFile = File(...),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Infer labels + style from an uploaded sample and propose an editable plan.

    Honest scope: text-bearing files are read; images are accepted as a label/style reference only
    (this build does not synthesise images).
    """
    global_rate_limiter.check(f"analyze_{user_id}", max_requests=30, window_seconds=60)
    data = await file.read()
    analysis = analyze_sample(file.filename or "sample.txt", data)
    payload = analysis.to_dict()

    named_rows = [{"label": label} for label in analysis.classes]
    plan = draft_plan(
        f"Dataset like the uploaded sample ({analysis.row_count} rows)", sample_rows=named_rows
    )
    plan_dict = plan.to_dict()
    if analysis.classes:
        plan_dict["classes"] = analysis.classes
    if analysis.row_count:
        plan_dict["suggested_total"] = max(50, min(1000, analysis.row_count * 2))
        plan_dict["per_class"] = max(1, plan_dict["suggested_total"] // max(1, len(plan_dict["classes"])))
    plan_dict["notes"] = [*analysis.notes, "Change anything on the next screen before generating."]
    payload["plan"] = plan_dict
    return payload

@router.post("/api/v1/generate/plan")
def create_plan(req: PlanRequest) -> dict[str, Any]:
    """Draft an editable plan + at most three questions from a natural-language request."""
    return draft_plan(req.prompt).to_dict()


@router.post("/api/v1/generate/jobs", status_code=201)
def create_generation_job(
    req: JobRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Create the target dataset, enqueue the job, and return its initial state."""
    global_rate_limiter.check(f"generate_{user_id}", max_requests=20, window_seconds=60)
    if req.project_id:
        verify_project_access(session, req.project_id, user_id, required_role="editor")

    cleaned_classes = [str(label).strip() for label in req.classes if str(label).strip()]
    total_items = req.per_class * max(1, len(cleaned_classes))
    if total_items > 2000:
        raise DomainValidationError(
            f"That is too many examples for one run ({total_items:,}). "
            "Keep it to 2,000 or fewer, or split it into several runs.",
            field="total_items",
        )

    gateway = ProviderGateway.get_instance()
    try:
        gateway.get_provider(req.provider)
    except Exception as exc:  # noqa: BLE001 - surface a clear API error instead of a stack trace
        return {
            "error": {
                "code": "PROVIDER_UNAVAILABLE",
                "message": f"provider '{req.provider}' is not registered: {exc}",
            }
        }

    job = create_job(
        session,
        prompt=req.prompt,
        classes=cleaned_classes,
        per_class=req.per_class,
        task_type=req.task_type,
        provider=req.provider,
        model=req.model,
        verifier_providers=req.verifier_providers,
        project_id=req.project_id,
        dataset_name=req.dataset_name,
        difficulty=req.difficulty,
        min_label_preservation=req.min_label_preservation,
        max_class_share=req.max_class_share,
        target_split=req.target_split,
        style_hint=req.style_hint,
        seed_examples=req.seed_examples,
        description=req.description,
    )
    session.commit()
    start_job(job.id)
    return get_job(session, job.id)


@router.get("/api/v1/generate/jobs")
def recent_jobs(
    limit: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> list[dict[str, Any]]:
    """Recent generation jobs — the Home dashboard history feed."""
    return list_jobs(session, limit=limit)


@router.get("/api/v1/generate/jobs/{job_id}")
def job_status(
    job_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Live status, progress, measured ETA, and (when finished) the gate result."""
    return get_job(session, job_id)


@router.post("/api/v1/generate/jobs/{job_id}/cancel")
def cancel_generation_job(
    job_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Request cancellation; the runner stops before the next item and discards the batch."""
    job = cancel_job(session, job_id)
    session.commit()
    return get_job(session, job.id)
