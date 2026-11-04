"""
Fan-out: ask several models the same question about the same records, safely.

Properties that matter at 3 models x N records:
  * **bounded concurrency** — a thread pool over records, with the per-model calls inside a
    record kept sequential so budget accounting stays simple and providers are not hammered;
  * **idempotency** — a vote is keyed by ``(dataset, record, provider, model, prompt_version)``;
    re-running never re-pays for a call already stored;
  * **hard budget cap** — cumulative cost is tracked under a lock and no further calls are
    issued once the cap is reached (the platform has no global budget enforcement);
  * **per-vote failure isolation** — a provider error is stored as an error vote, never lost
    and never silently retried forever.

Pure orchestration over the provider gateway; no aggregation logic here.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import (
    DatasetModel,
    DatasetRecordModel,
    EnsembleVoteModel,
)
from packages.dataset_core.exceptions import ResourceNotFoundError
from packages.dataset_core.id_generator import generate_id
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import (
    ProviderError,
    ProviderRequest,
)


@dataclass(frozen=True)
class ModelSpec:
    """One (provider, model) pair to poll."""

    provider: str
    model: str

    @property
    def key(self) -> str:
        return f"{self.provider}::{self.model}"


@dataclass
class FanoutConfig:
    models: list[ModelSpec]
    split: str | None = None
    limit: int = 200
    concurrency: int = 4
    budget_cap_usd: float | None = 2.0
    prompt_version: str = "v1"
    only_missing: bool = True
    #: Optional per-expert system prompts (prompt-diversity ensemble). Expert ``i`` uses
    #: ``role_prompts[i % len(role_prompts)]`` and its votes are stored under a role-specific
    #: prompt_version so idempotency stays correct and roles never share votes.
    role_prompts: list[str] | None = None


@dataclass
class FanoutSummary:
    dataset_id: str
    records: int
    calls_made: int = 0
    calls_reused: int = 0
    failures: int = 0
    cost_usd: float = 0.0
    elapsed_s: float = 0.0
    aborted_reason: str | None = None
    #: providers with no configured price -> spend cannot be enforced for them
    unpriced_providers: list[str] = field(default_factory=list)
    models: list[str] = field(default_factory=list)


class _Budget:
    """Thread-safe cumulative cost tracker with a hard ceiling."""

    def __init__(self, cap: float | None) -> None:
        self.cap = cap
        self.spent = 0.0
        self.exceeded = False
        self._lock = threading.Lock()

    def can_spend(self) -> bool:
        if self.cap is None:
            return True
        with self._lock:
            if self.spent >= self.cap:
                self.exceeded = True
                return False
            return True

    def add(self, amount: float) -> None:
        with self._lock:
            self.spent += max(0.0, float(amount))


def _record_text(record: DatasetRecordModel) -> str:
    metadata = record.extra_metadata or {}
    text = metadata.get("text") or metadata.get("content") or ""
    return str(text)


def _existing_vote_keys(
    session: Session,
    dataset_id: str,
    prompt_version: str,
) -> set[tuple[str, str, str, str]]:
    """Idempotency keys: ``(record, provider, model, prompt_version)``.

    ``prompt_version`` is part of the key because prompt-diversity runs store role-prefixed
    versions ("<base>#roleN"). Omitting it made the membership test never match and re-issued
    every model call on a re-run (a real, expensive bug — see the E1d post-mortem).
    """
    rows = session.execute(
        select(
            EnsembleVoteModel.record_id,
            EnsembleVoteModel.provider_name,
            EnsembleVoteModel.model_name,
            EnsembleVoteModel.prompt_version,
        ).where(
            EnsembleVoteModel.dataset_id == dataset_id,
            EnsembleVoteModel.prompt_version.like(f"{prompt_version}%"),
        )
    ).all()
    return {(record_id, provider, model, version) for record_id, provider, model, version in rows}


def run_fanout(
    session: Session,
    dataset_id: str,
    config: FanoutConfig,
    *,
    gateway: ProviderGateway | None = None,
) -> FanoutSummary:
    """Collect votes for every (record, model) pair, persisting them as we go."""
    started = time.time()
    dataset = session.get(DatasetModel, dataset_id)
    if not dataset:
        raise ResourceNotFoundError("Dataset", dataset_id)
    if not config.models:
        raise ValueError("fanout requires at least one model")

    query = select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset_id)
    if config.split:
        query = query.where(DatasetRecordModel.split == config.split)
    query = query.order_by(DatasetRecordModel.id).limit(config.limit)
    records = list(session.scalars(query).all())

    summary = FanoutSummary(
        dataset_id=dataset_id,
        records=len(records),
        models=[spec.key for spec in config.models],
    )
    if not records:
        summary.elapsed_s = round(time.time() - started, 3)
        return summary

    existing = _existing_vote_keys(session, dataset_id, config.prompt_version) if config.only_missing else set()
    budget = _Budget(config.budget_cap_usd)
    provider_gateway = gateway or ProviderGateway.get_instance()

    label_schema = dataset.label_schema or {}
    task_type = dataset.task_type

    def _work(record: DatasetRecordModel) -> list[dict[str, Any]]:
        """Collect every model's vote for one record (sequential per record)."""
        if budget.exceeded:
            return []
        text = _record_text(record)
        votes: list[dict[str, Any]] = []
        for spec_index, spec in enumerate(config.models):
            role_prompt = None
            if config.role_prompts:
                role_prompt = config.role_prompts[spec_index % len(config.role_prompts)]
            role_version = config.prompt_version if role_prompt is None else f"{config.prompt_version}#role{spec_index % len(config.role_prompts)}"
            if (record.id, spec.provider, spec.model, role_version) in existing:
                continue
            if not budget.can_spend():
                break
            try:
                provider = provider_gateway.get_provider(spec.provider)
            except ProviderError as exc:
                votes.append({
                    "record_id": record.id, "spec": spec, "prompt_version": role_version,
                    "label": None, "confidence": 0.0,
                    "probs": {}, "error": exc.message, "tokens_in": 0, "tokens_out": 0,
                    "cost": 0.0, "latency": 0.0,
                })
                continue
            request = ProviderRequest(
                model=spec.model,
                task_type=task_type,
                input_text=text,
                label_schema=label_schema,
                parameters={
                    "prompt_version": role_version,
                    **({"system_prompt": role_prompt} if role_prompt else {}),
                },
            )
            try:
                response = provider.annotate(request)
                cost = float(response.usage.estimated_cost_usd)
                budget.add(cost)
                probs = response.payload.get("probs") if isinstance(response.payload, dict) else None
                votes.append({
                    "record_id": record.id,
                    "spec": spec,
                    "prompt_version": role_version,
                    "label": str(response.payload.get("label", "")),
                    "confidence": float(response.confidence),
                    "probs": probs if isinstance(probs, dict) else {},
                    "error": None,
                    "tokens_in": response.usage.input_tokens,
                    "tokens_out": response.usage.output_tokens,
                    "cost": cost,
                    "latency": response.latency_ms,
                })
            except ProviderError as exc:
                votes.append({
                    "record_id": record.id, "spec": spec, "prompt_version": role_version,
                    "label": None, "confidence": 0.0,
                    "probs": {}, "error": exc.message, "tokens_in": 0, "tokens_out": 0,
                    "cost": 0.0, "latency": 0.0,
                })
        return votes

    with ThreadPoolExecutor(max_workers=max(1, config.concurrency)) as pool:
        futures = {pool.submit(_work, record): record.id for record in records}
        for future in as_completed(futures):
            for vote in future.result():
                session.add(
                    EnsembleVoteModel(
                        id=generate_id("ensemble_vote"),
                        dataset_id=dataset_id,
                        record_id=vote["record_id"],
                        provider_name=vote["spec"].provider,
                        model_name=vote["spec"].model,
                        prompt_version=vote["prompt_version"],
                        label=vote["label"],
                        confidence=vote["confidence"],
                        probs_json=vote["probs"],
                        error_message=vote["error"],
                        tokens_in=vote["tokens_in"],
                        tokens_out=vote["tokens_out"],
                        cost_usd=vote["cost"],
                        latency_ms=vote["latency"],
                    )
                )
                summary.calls_made += 1
                summary.cost_usd += vote["cost"]
                if vote["error"]:
                    summary.failures += 1
            session.flush()

    summary.calls_reused = len(existing)
    # Surface providers we cannot price: a USD budget cap is only meaningful for priced providers.
    from packages.provider_gateway.pricing import is_priced

    summary.unpriced_providers = sorted({
        spec.provider for spec in config.models if not is_priced(spec.provider, spec.model)
    })
    if summary.unpriced_providers and config.budget_cap_usd is not None:
        note = (
            "budget cap is not enforceable for unpriced provider(s): "
            + ", ".join(summary.unpriced_providers)
            + " — set PROVIDER_PRICES"
        )
        summary.aborted_reason = (summary.aborted_reason + "; " + note) if summary.aborted_reason else note
    summary.cost_usd = round(summary.cost_usd, 6)
    summary.elapsed_s = round(time.time() - started, 3)
    if budget.exceeded:
        budget_note = (
            f"budget cap reached: spent ${budget.spent:.4f} of ${config.budget_cap_usd:.2f}; "
            "remaining calls were not issued"
        )
        summary.aborted_reason = (
            (summary.aborted_reason + "; " + budget_note) if summary.aborted_reason else budget_note
        )
    return summary
