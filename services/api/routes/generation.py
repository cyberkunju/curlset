"""
Gated synthetic-data generation API.

``POST /datasets/{id}/generate-gated`` runs the full generation pipeline: provider generation, the
deterministic diversity/anti-collapse gate, an independent label-preservation check by verifier
models, and — only when the whole batch passes — persistence as ``origin=synthetic`` /
``pending_review`` records with lineage.

Nothing generated is ever approved automatically, and a batch that fails the gate writes no rows.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import get_auth_user, verify_dataset_access
from packages.dataset_security.rate_limiter import global_rate_limiter
from packages.dataset_synthesis.generation_pipeline import (
    GenerationSpec,
    run_generation,
)
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderError,
    ProviderRequest,
)

router = APIRouter(tags=["generation"])


class ModelRef(BaseModel):
    provider: str = Field(..., min_length=1, max_length=64)
    model: str = Field(..., min_length=1, max_length=128)


class GatedGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str = Field(..., min_length=1, max_length=64,
                          description="Provider used to generate (must advertise text_generation)")
    model: str = Field(..., min_length=1, max_length=128)
    verifier_providers: list[ModelRef] = Field(
        default_factory=list,
        description="Independent models that check the intended label of every generated sample",
    )
    per_class: int = Field(10, ge=1, le=100)
    target_split: str = Field("train", pattern="^(train|val|test|unassigned)$")
    prompt_version: str = Field("gen-v1", min_length=1, max_length=32)
    max_class_share: float = Field(0.5, gt=0.0, le=1.0)
    min_label_preservation: float = Field(0.90, gt=0.0, le=1.0)


def _build_verifier(refs: list[ModelRef], dataset_task: str, label_schema: dict[str, Any]):
    """Majority vote of independent verifier models; fails closed on provider errors."""

    def _verify(text: str) -> str:
        gateway = ProviderGateway.get_instance()
        labels: list[str] = []
        for ref in refs:
            try:
                provider = gateway.get_provider(ref.provider)
                response = provider.annotate(ProviderRequest(
                    model=ref.model,
                    task_type=dataset_task,
                    input_text=text,
                    label_schema=label_schema,
                ))
                label = str((response.payload or {}).get("label") or "")
                if label:
                    labels.append(label)
            except ProviderError:
                continue
        if not labels:
            return ""
        return Counter(labels).most_common(1)[0][0]

    return _verify


@router.post("/api/v1/datasets/{dataset_id}/generate-gated")
def generate_gated(
    dataset_id: str,
    req: GatedGenerationRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> dict[str, Any]:
    """Generate, gate and (only if the batch passes) persist synthetic records."""
    dataset = verify_dataset_access(session, dataset_id, user_id, required_role="editor")
    global_rate_limiter.check(f"generation_{user_id}", max_requests=10, window_seconds=60)

    if not req.verifier_providers:
        # Fail closed: without an independent verifier we cannot claim label preservation.
        return {
            "dataset_id": dataset_id,
            "generated": 0,
            "accepted": 0,
            "rejected": 0,
            "verdict": "reject",
            "rejection_reasons": ["no verifier_providers supplied; refusing to admit unverified data"],
        }

    gateway = ProviderGateway.get_instance()
    try:
        generator = gateway.get_provider(req.provider)
    except ProviderError as exc:
        return {
            "dataset_id": dataset_id,
            "generated": 0,
            "accepted": 0,
            "rejected": 0,
            "verdict": "reject",
            "rejection_reasons": [f"provider '{req.provider}' is not registered: {exc.message}"],
        }
    if not generator.supports_capability(ProviderCapability.TEXT_GENERATION):
        return {
            "dataset_id": dataset_id,
            "generated": 0,
            "accepted": 0,
            "rejected": 0,
            "verdict": "reject",
            "rejection_reasons": [
                f"provider '{req.provider}' does not advertise text_generation capability"
            ],
        }

    spec = GenerationSpec(
        per_class=req.per_class,
        target_split=req.target_split,
        prompt_version=req.prompt_version,
        max_class_share=req.max_class_share,
        min_label_preservation=req.min_label_preservation,
    )
    outcome = run_generation(
        session,
        dataset_id,
        generator=generator,
        generator_model=req.model,
        verifier=_build_verifier(req.verifier_providers, dataset.task_type, dataset.label_schema or {}),
        spec=spec,
    )
    AuditService.record_event(
        session=session,
        project_id=dataset.project_id,
        user_id=user_id,
        action="SYNTHETIC_GENERATION_GATED",
        resource_type="Dataset",
        resource_id=dataset_id,
        details={
            "verdict": outcome.verdict,
            "accepted": outcome.accepted,
            "label_preservation": outcome.label_preservation,
            "generator": req.provider,
            "model": req.model,
        },
    )
    session.commit()
    return outcome.to_dict()
