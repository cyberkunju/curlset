"""
End-to-end test of the ensemble pipeline using simulated models with known error profiles.

This is the pre-key validation: it proves fan-out, idempotency, budget capping, calibration,
weighting, aggregation, threshold solving and correlated-error diagnostics all work on a real
database and real HTTP-less provider calls — before a single paid token is spent.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus
from packages.dataset_core.db.models import (
    AnnotationModel,
    EnsembleVoteModel,
)
from packages.dataset_core.db.session import get_db_session
from packages.dataset_ensemble.fanout import FanoutConfig, ModelSpec
from packages.dataset_ensemble.service import materialize_annotations, run_ensemble
from packages.dataset_ensemble.types import Band
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.simulated_provider import (
    SimulatedEnsembleProvider,
    truth_proxy,
)
from services.api.main import app

LABELS = ["billing", "technical_support", "feature_request", "general_inquiry"]

ROWS = [
    ("I was charged twice for my subscription. Please refund.", "billing", "train"),
    ("My invoice shows a higher amount than expected.", "billing", "train"),
    ("The payment failed and my account is suspended.", "billing", "train"),
    ("The app crashes when I open the export screen.", "technical_support", "train"),
    ("Uploading a file larger than 100 MB never completes.", "technical_support", "train"),
    ("The keyboard shortcut does nothing in the editor.", "technical_support", "train"),
    ("Please add dark mode to the annotation editor.", "feature_request", "train"),
    ("It would help to have bulk actions for approvals.", "feature_request", "train"),
    ("Could you support Parquet files in addition to CSV?", "feature_request", "train"),
    ("How do I invite a teammate to review my dataset?", "general_inquiry", "train"),
    ("Where can I find the documentation for this feature?", "general_inquiry", "train"),
    ("Do you offer a free trial?", "general_inquiry", "train"),
] * 6  # 72 rows -> enough for calibration + threshold halves


@pytest.fixture()
def client():
    """This repo has no conftest.py; provide a scoped TestClient locally."""
    with TestClient(app) as test_client:
        yield test_client


def _csv() -> str:
    # The simulated models derive "truth" from a keyword proxy; the fixture must be consistent
    # with it, otherwise the achievable accuracy ceiling would be < 1.0 for reasons unrelated to
    # the ensemble under test.
    for text, label, _split in ROWS:
        assert truth_proxy(text) == label, f"fixture/proxy mismatch: {text!r} -> {truth_proxy(text)} != {label}"
    lines = ["text,label,split"]
    for index, (text, label, split) in enumerate(ROWS):
        lines.append(f'"{text} #{index}","{label}","{split}"')
    return "\n".join(lines) + "\n"


def _register_simulated(
    hard_rate: float = 0.0,
    suffix: str = "",
    strong: float = 0.93,
    medium: float = 0.88,
    weak: float = 0.80,
) -> list[tuple[str, str]]:
    gateway = ProviderGateway.get_instance()
    providers = [
        SimulatedEnsembleProvider(f"sim-alpha{suffix}", accuracy=strong, overconfidence=3.5,
                                  hard_rate=hard_rate, shared_bias={"general_inquiry": 0.06}),
        SimulatedEnsembleProvider(f"sim-beta{suffix}", accuracy=medium, overconfidence=2.5,
                                  hard_rate=hard_rate, shared_bias={"billing": 0.08}),
        SimulatedEnsembleProvider(f"sim-gamma{suffix}", accuracy=weak, overconfidence=5.0,
                                  hard_rate=hard_rate, shared_bias={"technical_support": 0.10}),
    ]
    for provider in providers:
        gateway.register_provider(provider)
    return [(provider.name, provider.list_available_models()[0]) for provider in providers]


def _cleanup(specs: list[tuple[str, str]]) -> None:
    gateway = ProviderGateway.get_instance()
    for provider_name, _model in specs:
        gateway._providers.pop(provider_name.lower(), None)


def _make_dataset(client, name_suffix: str) -> str:
    project = client.post("/api/v1/projects", json={"name": f"Ensemble {name_suffix}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": f"Ensemble text {name_suffix}",
        "task_type": "text_classification",
        "label_schema": {"labels": LABELS},
    }).json()
    response = client.post(
        f"/api/v1/datasets/{dataset['id']}/import/file",
        files={"file": ("rows.csv", _csv().encode(), "text/csv")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["accepted_count"] == len(ROWS), response.json()
    queue = client.get(f"/api/v1/datasets/{dataset['id']}/queue", params={"limit": 200}).json()
    ids = [item["id"] for item in queue["items"]]
    bulk = client.post(f"/api/v1/datasets/{dataset['id']}/review/bulk",
                       json={"record_ids": ids, "action": "approve", "reason": "gold"})
    assert bulk.status_code == 200, bulk.text
    return dataset["id"]


def test_ensemble_pipeline_is_measurable_idempotent_and_budget_safe(client):
    specs = _register_simulated(strong=0.97, medium=0.95, weak=0.92)
    try:
        dataset_id = _make_dataset(client, uuid.uuid4().hex[:6])
        models = [ModelSpec(provider=provider, model=model) for provider, model in specs]
        config = FanoutConfig(models=models, split=None, limit=200, budget_cap_usd=5.0)

        with get_db_session() as session:
            outcome = run_ensemble(session, dataset_id, config, target_precision=0.85, min_support=20)
            session.commit()

        # --- fan-out actually called every model for every record ---------------
        expected_calls = len(ROWS) * len(models)
        assert outcome.fanout.calls_made == expected_calls, outcome.fanout
        assert outcome.fanout.failures == 0
        with get_db_session() as session:
            stored = session.scalar(
                select(func.count()).select_from(EnsembleVoteModel).where(
                    EnsembleVoteModel.dataset_id == dataset_id
                )
            )
        assert stored == expected_calls, stored

        # --- aggregation + measurement -----------------------------------------
        assert outcome.records_aggregated == len(ROWS)
        assert outcome.gold_pairs == len(ROWS)
        assert outcome.classes == LABELS
        assert set(outcome.aggregator_scores) == {"log_odds", "majority", "weighted_vote", "mean_probs"}
        # votes are keyed by model id (the identifier the provider was asked for)\n        assert set(outcome.single_model_scores) == {model for _provider, model in specs}
        # the fused label must beat the weakest individual model
        weakest = min(outcome.single_model_scores, key=lambda name: outcome.single_model_scores[name]["macro_f1"])
        assert outcome.ensemble_macro_f1 > outcome.single_model_scores[weakest]["macro_f1"], outcome.to_dict()

        # --- calibration was fitted -------------------------------------------
        assert len(outcome.calibration) == len(models)
        assert all(report.temperature > 0 for report in outcome.calibration)
        assert all(0.0 <= report.ece_calibrated <= 1.0 for report in outcome.calibration)
        assert sum(outcome.model_weights.values()) > 0.99

        # --- thresholds and routing -------------------------------------------
        assert "__all__" in outcome.thresholds
        overall = outcome.thresholds["__all__"]
        assert overall["support"] > 0
        # a good ensemble on clean data must be able to certify the requested floor
        assert overall["met_target"] is True, overall
        assert overall["wilson_low"] >= 0.85, overall
        assert sum(outcome.band_counts.values()) == len(outcome.aggregates)

        # --- correlated-error diagnostic present for every model pair ---------
        assert len(outcome.correlated_error) == 3
        assert all(-1.0 <= value <= 1.0 for value in outcome.correlated_error.values())

        # --- idempotency: re-running must not re-call providers ---------------
        with get_db_session() as session:
            second = run_ensemble(session, dataset_id, config, target_precision=0.85, min_support=20)
            session.commit()
        assert second.fanout.calls_made == 0, second.fanout
        assert second.fanout.calls_reused == expected_calls, second.fanout

        # --- with uncorrelated models the pipeline should certify a usable band -----
        assert outcome.band_counts[Band.AUTO_ACCEPT.value] > 0, outcome.band_counts

        # --- materialisation writes candidates, never approvals ---------------
        with get_db_session() as session:
            created = materialize_annotations(session, outcome, band=Band.AUTO_ACCEPT)
            session.commit()
        assert created == outcome.band_counts[Band.AUTO_ACCEPT.value]
        with get_db_session() as session:
            ensemble_annotations = session.execute(
                select(AnnotationModel).where(
                    AnnotationModel.dataset_id == dataset_id,
                    AnnotationModel.origin == AnnotationOrigin.ENSEMBLE.value,
                )
            ).scalars().all()
            assert len(ensemble_annotations) == created
            assert {annotation.status for annotation in ensemble_annotations} == {
                ReviewStatus.PENDING_REVIEW.value
            }
            assert all(annotation.payload.get("ensemble", {}).get("n_models") == len(models)
                       for annotation in ensemble_annotations)
    finally:
        _cleanup(specs)


def test_budget_cap_prevents_all_calls(client):
    """A zero budget must abort before any provider call is issued."""
    gateway = ProviderGateway.get_instance()
    expensive = SimulatedEnsembleProvider("sim-expensive", accuracy=0.9, cost_per_1k_tokens=1.0)
    gateway.register_provider(expensive)
    try:
        dataset_id = _make_dataset(client, uuid.uuid4().hex[:6])
        config = FanoutConfig(
            models=[ModelSpec(provider="sim-expensive", model=expensive.list_available_models()[0])],
            limit=50,
            budget_cap_usd=0.0,
        )
        with get_db_session() as session:
            outcome = run_ensemble(session, dataset_id, config)
            session.commit()
        assert outcome.fanout.calls_made == 0, outcome.fanout
        assert outcome.fanout.aborted_reason is not None
        assert "budget" in outcome.fanout.aborted_reason
        # simulated providers are unpriced -> the cap is reported as unenforceable, not assumed free
        assert "sim-expensive" in outcome.fanout.unpriced_providers
        assert "PROVIDER_PRICES" in outcome.fanout.aborted_reason
        with get_db_session() as session:
            stored = session.scalar(
                select(func.count()).select_from(EnsembleVoteModel).where(
                    EnsembleVoteModel.dataset_id == dataset_id
                )
            )
        assert stored == 0
    finally:
        gateway._providers.pop("sim-expensive", None)


def test_ensemble_imports_records_that_have_no_gold(client):
    """No gold labels means no calibration; the run must still aggregate and say so."""
    specs = _register_simulated()
    try:
        project = client.post("/api/v1/projects", json={"name": f"Ensemble ungold {uuid.uuid4().hex[:6]}"}).json()
        dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
            "name": "ungold", "task_type": "text_classification",
            "label_schema": {"labels": LABELS},
        }).json()
        response = client.post(
            f"/api/v1/datasets/{dataset['id']}/import/file",
            files={"file": ("rows.csv", _csv().encode(), "text/csv")},
        )
        assert response.status_code == 200
        assert response.json()["accepted_count"] == len(ROWS)

        models = [ModelSpec(provider=provider, model=model) for provider, model in specs]
        with get_db_session() as session:
            outcome = run_ensemble(session, dataset["id"], FanoutConfig(models=models, limit=50))
            session.commit()
        assert outcome.gold_pairs == 0
        assert outcome.records_aggregated > 0
        assert outcome.aggregator_scores["log_odds"]["n"] == 0
        # no gold -> uniform fallback weights, no crash
        assert len(outcome.model_weights) == len(models)
        assert sum(outcome.band_counts.values()) == len(outcome.aggregates)
    finally:
        _cleanup(specs)
def test_correlated_errors_block_auto_accept(client):
    """If models fail together, unanimous agreement is not evidence: nothing may be auto-accepted."""
    specs = _register_simulated(hard_rate=0.5, suffix="-corr")
    try:
        dataset_id = _make_dataset(client, uuid.uuid4().hex[:6])
        models = [ModelSpec(provider=provider, model=model) for provider, model in specs]
        with get_db_session() as session:
            outcome = run_ensemble(
                session, dataset_id,
                FanoutConfig(models=models, limit=200, budget_cap_usd=5.0),
                target_precision=0.9, min_support=20,
            )
            session.commit()

        # shared, ambiguous failures must show up as high pairwise error correlation
        assert outcome.correlated_error, "no pairwise diagnostics produced"
        assert max(outcome.correlated_error.values()) > 0.6, outcome.correlated_error
        # ... and the safety behaviour must follow: everything goes to human review
        assert outcome.band_counts[Band.AUTO_ACCEPT.value] == 0, outcome.band_counts
        assert outcome.band_counts[Band.HUMAN_REVIEW.value] > 0, outcome.band_counts
        with get_db_session() as session:
            created = materialize_annotations(session, outcome, band=Band.AUTO_ACCEPT)
            session.commit()
        assert created == 0
    finally:
        _cleanup(specs)

def test_role_prompt_votes_are_idempotent_and_nested(client):
    """Prompt-diversity runs must reuse role-scoped votes (regression: they used to re-call).

    The bug: idempotency keys omitted ``prompt_version``, so a role-prefixed re-run never matched
    stored votes and re-issued every model call — an expensive failure discovered during E1d.
    """
    specs = _register_simulated(suffix="-role")
    try:
        dataset_id = _make_dataset(client, uuid.uuid4().hex[:6])
        models = [ModelSpec(provider=provider, model=model) for provider, model in specs]
        config = FanoutConfig(
            models=models,
            limit=60,
            budget_cap_usd=5.0,
            prompt_version="rolev1",
            role_prompts=["role A", "role B", "role C"],
        )
        with get_db_session() as session:
            first = run_ensemble(session, dataset_id, config, target_precision=0.8, min_support=10)
            session.commit()
        assert first.fanout.calls_made == len(ROWS[:60]) * len(models), first.fanout
        assert first.gold_pairs > 0, "role-prefixed votes must be picked up by the service"

        with get_db_session() as session:
            second = run_ensemble(session, dataset_id, config, target_precision=0.8, min_support=10)
            session.commit()
        assert second.fanout.calls_made == 0, f"re-run re-called models: {second.fanout}"
        assert second.fanout.calls_reused == first.fanout.calls_made

        # distinct role-scoped votes exist (one version per expert)
        with get_db_session() as session:
            versions = set(session.scalars(
                select(EnsembleVoteModel.prompt_version).where(
                    EnsembleVoteModel.dataset_id == dataset_id
                )
            ).all())
        assert len(versions) == len(models), versions
        assert all(version.startswith("rolev1#role") for version in versions), versions
    finally:
        _cleanup(specs)
