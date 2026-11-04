"""
Live 3-model ensemble run against the real providers.

Reads credentials from ``<workspace>/.secrets/providers.json`` (outside the repo — never committed)
and drives the production pipeline: import gold fixture -> fan-out to 3 real models -> calibrate ->
weight -> aggregate -> threshold -> route -> correlated-error audit.

Usage:
    python scripts/live_ensemble_run.py --limit 20            # pilot
    python scripts/live_ensemble_run.py --limit 200 --concurrency 6
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WORKSPACE = REPO.parent
SECRETS = WORKSPACE / ".secrets" / "providers.json"

os.chdir(REPO)
sys.path.insert(0, str(REPO))

LABELS = ["billing", "technical_support", "feature_request", "general_inquiry"]

# Prompt-diversity ensemble (E1d): same models, different expert roles. Different role framing
# produces different reasoning styles, which decorrelates errors far more cheaply than buying
# another model vendor (the baseline had 0.78-0.80 error correlation across vendors).
ROLE_PROMPTS = [
    "You are a customer-support triage agent. Read the message and choose the single primary intent.",
    ("You are a meticulous dataset annotator. Think about what the person is actually trying to "
     "accomplish, then choose exactly one primary intent."),
    ("You are a dataset quality auditor checking a colleague's work. Decide which single intent a "
     "careful human reviewer would assign as the primary intent."),
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--target-precision", type=float, default=0.9)
    parser.add_argument("--min-support", type=int, default=15)
    parser.add_argument("--db", default="./data/live.db")
    parser.add_argument("--csv", default=str(REPO / "examples" / "text_intents_200.csv"))
    # Default FALSE: re-running must reuse stored votes (idempotent) instead of re-paying for
    # every model call. Opt into a clean database explicitly with --reset-db.
    parser.add_argument("--reset-db", action="store_true", default=False)
    parser.add_argument("--prompt-diverse", action="store_true",
                        help="give each expert a different system-prompt role (E1d)")
    args = parser.parse_args()

    os.environ["DATABASE_URL"] = f"sqlite:///{args.db}"
    os.environ.setdefault("LOCAL_STORAGE_DIR", "./data/live_storage")
    os.environ["PRIVACY_MODE"] = "allow_external"  # explicit: this run makes real outbound calls

    if not SECRETS.exists():
        print(f"ABORT: credentials file not found: {SECRETS}")
        return 2
    secrets = json.loads(SECRETS.read_text(encoding="utf-8"))

    from fastapi.testclient import TestClient
    from sqlalchemy import case, func, select

    from packages.dataset_core.db.models import EnsembleVoteModel
    from packages.dataset_core.db.session import (
        get_db_session,
        get_engine,
        reset_database,
    )
    from packages.dataset_ensemble.fanout import FanoutConfig, ModelSpec
    from packages.dataset_ensemble.service import run_ensemble
    from packages.dataset_ensemble.types import Band
    from packages.provider_gateway.compatible_provider import OpenAICompatibleProvider
    from packages.provider_gateway.gateway import ProviderGateway
    from services.api.main import app

    if args.reset_db:
        reset_database(get_engine())

    gateway = ProviderGateway.get_instance()
    specs: list[ModelSpec] = []
    for name, cfg in secrets.items():
        model = cfg.get("model")
        base = cfg.get("base_url") or next(iter(cfg.get("base_url_candidates") or []), None)
        if not model or not base:
            print(f"skip {name}: missing model or base_url")
            continue
        provider = OpenAICompatibleProvider(
            name=f"live-{name}",
            api_key=cfg.get("api_key", ""),
            base_url=base,
            default_models=[model],
            max_completion_tokens=int(cfg.get("max_tokens") or 800),
        )
        gateway.register_provider(provider)
        specs.append(ModelSpec(provider=provider.name, model=model))
        print(f"registered {provider.name}: {model} @ {base}")

    run_id = f"live-{time.strftime('%Y%m%d-%H%M%S')}"
    out_dir = REPO / "experiments" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    with TestClient(app) as client:
        project = client.post("/api/v1/projects", json={"name": f"Live ensemble {run_id}"}).json()
        dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
            "name": f"Live {run_id}", "task_type": "text_classification",
            "label_schema": {"labels": LABELS},
        }).json()
        dsid = dataset["id"]
        fixture = Path(args.csv)
        with fixture.open("rb") as handle:
            imported = client.post(f"/api/v1/datasets/{dsid}/import/file",
                                   files={"file": (fixture.name, handle, "text/csv")}).json()
        print(f"import: accepted={imported['accepted_count']} rejected={imported['rejected_count']}")
        record_ids: list[str] = []
        offset = 0
        while True:
            page = client.get(f"/api/v1/datasets/{dsid}/queue",
                              params={"limit": 200, "offset": offset}).json()
            items = page.get("items") or []
            record_ids.extend(item["id"] for item in items)
            offset += len(items)
            if not items or offset >= int(page.get("total") or 0):
                break
        client.post(f"/api/v1/datasets/{dsid}/review/bulk",
                    json={"record_ids": record_ids, "action": "approve", "reason": "gold fixture"})
        print(f"gold approved: {len(record_ids)} records")

    started = time.time()
    with get_db_session() as session:
        outcome = run_ensemble(
            session, dsid,
            FanoutConfig(models=specs, limit=args.limit, concurrency=args.concurrency,
                         budget_cap_usd=None,
                         prompt_version="rolev1" if args.prompt_diverse else "v1",
                         role_prompts=ROLE_PROMPTS if args.prompt_diverse else None),
            target_precision=args.target_precision,
            min_support=args.min_support,
        )
        session.commit()
    elapsed = round(time.time() - started, 1)

    # token/cost telemetry from stored votes
    with get_db_session() as session:
        rows = session.execute(
            select(
                EnsembleVoteModel.provider_name,
                func.count(),
                func.sum(EnsembleVoteModel.tokens_in),
                func.sum(EnsembleVoteModel.tokens_out),
                func.avg(EnsembleVoteModel.latency_ms),
                func.sum(case((EnsembleVoteModel.error_message.is_not(None), 1), else_=0)),
            ).where(EnsembleVoteModel.dataset_id == dsid)
            .group_by(EnsembleVoteModel.provider_name)
        ).all()
    telemetry = [
        {"provider": provider, "calls": int(calls), "tokens_in": int(tin or 0),
         "tokens_out": int(tout or 0), "avg_latency_ms": round(float(lat or 0), 1),
         "failures": int(fail or 0)}
        for provider, calls, tin, tout, lat, fail in rows
    ]

    overall = outcome.thresholds.get("__all__", {})
    report = {
        "run_id": run_id,
        "live": True,
        "limit": args.limit,
        "elapsed_s": elapsed,
        "gold_pairs": outcome.gold_pairs,
        "optimistic": outcome.optimistic,
        "aggregator_scores": outcome.aggregator_scores,
        "single_model_scores": outcome.single_model_scores,
        "best_single_model": outcome.best_single_model,
        "lift_over_best_single": outcome.lift_over_best_single,
        "calibration": outcome.to_dict()["calibration"],
        "model_weights": outcome.model_weights,
        "thresholds": outcome.thresholds,
        "band_counts": outcome.band_counts,
        "correlated_error": outcome.correlated_error,
        "safety_valve_fired": any(v > 0.6 for v in outcome.correlated_error.values()),
        "fanout": outcome.to_dict()["fanout"],
        "telemetry": telemetry,
        "materialized": 0,
        "band_enum": [band.value for band in Band],
    }
    (out_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\n" + "=" * 78)
    print(f"LIVE ENSEMBLE RUN  {run_id}   ({args.limit} records x {len(specs)} models)")
    print("=" * 78)
    print(f"elapsed {elapsed}s | gold pairs {outcome.gold_pairs} | optimistic split {outcome.optimistic}")
    print(f"fan-out: {outcome.fanout.calls_made} calls, {outcome.fanout.failures} failures, "
          f"{outcome.fanout.calls_reused} reused")
    for row in telemetry:
        print(f"  {row['provider']:16} calls={row['calls']:4} tok_in={row['tokens_in']:7} "
              f"tok_out={row['tokens_out']:6} avg={row['avg_latency_ms']:8.1f}ms failures={row['failures']}")
    print("\nE1 — aggregators (macro-F1 on gold):")
    for name, score in sorted(outcome.aggregator_scores.items(), key=lambda kv: kv[1]["macro_f1"], reverse=True):
        print(f"   {name:15} acc={score['accuracy']:.3f} macroF1={score['macro_f1']:.4f} n={score['n']}")
    print("   single models:")
    for name, score in sorted(outcome.single_model_scores.items(), key=lambda kv: kv[1]["macro_f1"], reverse=True):
        print(f"   {name:24} acc={score['accuracy']:.3f} macroF1={score['macro_f1']:.4f} n={score['n']}")
    print(f"   lift vs best single: {outcome.lift_over_best_single:+.4f}")
    print("\nE2 — calibration:")
    for row in report["calibration"]:
        improvement = row["ece_improvement"] * 100
        print(f"   {row['model']:28} T={row['temperature']:.3f} "
              f"ECE {row['ece_raw']:.3f} -> {row['ece_calibrated']:.3f} ({improvement:+.1f}%)")
    print(f"\nE3 — threshold: tau={overall.get('tau_hi')} accepted={overall.get('accepted')}/"
          f"{overall.get('support')} precision={overall.get('precision')} "
          f"wilson_low={overall.get('wilson_low')} met_target={overall.get('met_target')}")
    print(f"   bands: {outcome.band_counts}")
    print(f"\nE4 — correlated error: {outcome.correlated_error}")
    print(f"   safety valve fired: {report['safety_valve_fired']}")
    print(f"\nreport: {out_dir / 'report.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
