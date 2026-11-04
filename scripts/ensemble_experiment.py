"""
Ensemble experiment harness (E1-E4) — measures whether the ensemble is actually better.

Runs the full pipeline in-process against a throwaway database, then reports:

  E1  aggregator comparison: does weighted log-odds pooling beat every single model?
  E2  calibration: temperature fit and ECE improvement per model
  E3  precision-band selection: threshold, yield, Wilson lower bound, and the head-to-head
      comparison "ensemble vs best single model at the same accepted volume"
  E4  correlated-error audit: pairwise error correlation, Fleiss' kappa, and whether the
      safety valve (block auto-accept) fired

No provider keys required: by default it registers three *simulated* models with known error
profiles. It writes JSON + a markdown report under experiments/.

Usage:
    python scripts/ensemble_experiment.py --scenario diverse
    python scripts/ensemble_experiment.py --scenario correlated --hard-rate 0.6
    python scripts/ensemble_experiment.py --help
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
# Isolated database by default so experiments never touch a real workspace.
os.environ.setdefault("DATABASE_URL", "sqlite:///./data/experiment.db")
os.environ.setdefault("LOCAL_STORAGE_DIR", "./data/experiment_storage")

sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from packages.dataset_core.db.session import get_db_session, get_engine, reset_database
from packages.dataset_ensemble.aggregation import fleiss_kappa
from packages.dataset_ensemble.fanout import FanoutConfig, ModelSpec
from packages.dataset_ensemble.selection import precision_with_interval
from packages.dataset_ensemble.service import run_ensemble
from packages.dataset_ensemble.types import Band
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.simulated_provider import (
    SimulatedEnsembleProvider,
    truth_proxy,
)
from services.api.main import app

LABELS = ["billing", "technical_support", "feature_request", "general_inquiry"]
FIXTURE = ROOT / "examples" / "text_intents_200.csv"


def _register(providers: list[SimulatedEnsembleProvider]) -> list[ModelSpec]:
    gateway = ProviderGateway.get_instance()
    specs: list[ModelSpec] = []
    for provider in providers:
        gateway.register_provider(provider)
        specs.append(ModelSpec(provider=provider.name, model=provider.list_available_models()[0]))
    return specs


def _cleanup(providers: list[SimulatedEnsembleProvider]) -> None:
    gateway = ProviderGateway.get_instance()
    for provider in providers:
        gateway._providers.pop(provider.name.lower(), None)


def _pct(value: float) -> str:
    return f"{value * 100:5.1f}%"


def _topk_precision(
    aggregates: list,
    gold_map: dict[str, str],
    coverage: int,
) -> dict[str, float] | None:
    """Precision of the top-``coverage`` most confident labels (equal-coverage comparison)."""
    ranked = sorted(
        (result for result in aggregates if result.record_id in gold_map),
        key=lambda candidate: candidate.confidence,
        reverse=True,
    )[:coverage]
    if not ranked:
        return None
    hits = [gold_map[result.record_id] == result.label for result in ranked]
    precision, low, high = precision_with_interval(hits)
    return {"precision": precision, "wilson_low": low, "wilson_high": high, "n": len(hits)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", default="diverse",
                        choices=["diverse", "correlated", "weak", "strong"])
    parser.add_argument("--hard-rate", type=float, default=None,
                        help="override the shared-failure rate (diverse=0.10, correlated=0.55, weak=0.10, strong=0.0)")
    parser.add_argument("--target-precision", type=float, default=0.90)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--alpha-sweep", action="store_true",
                        help="re-aggregate stored votes with different weight sharpness (free, no new calls)")
    args = parser.parse_args()

    # hard_rate is the share of items that EVERY model gets wrong with the same wrong answer.
    # It is the honest way to model correlated failure; a high value reproduces the case where
    # an ensemble must NOT be trusted.
    presets = {
        "diverse": {"strong": 0.97, "medium": 0.93, "weak": 0.87, "hard_rate": 0.03},
        "correlated": {"strong": 0.97, "medium": 0.93, "weak": 0.87, "hard_rate": 0.45},
        "weak": {"strong": 0.82, "medium": 0.76, "weak": 0.68, "hard_rate": 0.05},
        "strong": {"strong": 0.99, "medium": 0.97, "weak": 0.94, "hard_rate": 0.0},
    }[args.scenario]
    if args.hard_rate is not None:
        presets["hard_rate"] = args.hard_rate

    providers = [
        SimulatedEnsembleProvider("sim-apex", accuracy=presets["strong"], overconfidence=3.5,
                                  hard_rate=presets["hard_rate"], shared_bias={"general_inquiry": 0.05}),
        SimulatedEnsembleProvider("sim-nova", accuracy=presets["medium"], overconfidence=2.5,
                                  hard_rate=presets["hard_rate"], shared_bias={"billing": 0.07}),
        SimulatedEnsembleProvider("sim-quill", accuracy=presets["weak"], overconfidence=5.0,
                                  hard_rate=presets["hard_rate"], shared_bias={"technical_support": 0.09}),
    ]
    specs = _register(providers)

    run_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{args.scenario}"
    out_dir = ROOT / "experiments" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    reset_database(get_engine())
    try:
        with TestClient(app) as client:
            project = client.post("/api/v1/projects", json={"name": f"Experiment {run_id}"}).json()
            dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
                "name": f"Exp {run_id}", "task_type": "text_classification",
                "label_schema": {"labels": LABELS},
            }).json()
            dsid = dataset["id"]
            # A *controlled* simulation: the gold label of every row is the deterministic
            # keyword proxy the simulated models are noisy observers of. Without this relabel,
            # the fixture's own template labels disagree with the proxy and the measurable
            # accuracy ceiling is < 1.0 for reasons unrelated to the ensemble.
            rows = FIXTURE.read_text(encoding="utf-8").splitlines()
            header, body = rows[0], rows[1:]
            controlled: list[str] = [header]
            for line in body:
                if not line.strip():
                    continue
                # simple CSV split: our fixture has no embedded commas
                text, _label, split = line.rsplit(",", 2)
                text = text.strip().strip('"')
                controlled.append(f'"{text}","{truth_proxy(text)}","{split.strip()}"')
            controlled_path = out_dir / "fixture.csv"
            controlled_path.write_text("\n".join(controlled) + "\n", encoding="utf-8")
            with controlled_path.open("rb") as handle:
                imported = client.post(f"/api/v1/datasets/{dsid}/import/file",
                                       files={"file": ("fixture.csv", handle, "text/csv")}).json()
            record_ids: list[str] = []
            offset = 0
            while True:
                page = client.get(f"/api/v1/datasets/{dsid}/queue", params={"limit": 200, "offset": offset}).json()
                items = page.get("items") or []
                record_ids.extend(item["id"] for item in items)
                offset += len(items)
                if not items or offset >= int(page.get("total") or 0):
                    break
            client.post(f"/api/v1/datasets/{dsid}/review/bulk",
                        json={"record_ids": record_ids, "action": "approve", "reason": "experiment gold"})

            started = time.time()
            with get_db_session() as session:
                outcome = run_ensemble(
                    session, dsid,
                    FanoutConfig(models=specs, limit=args.limit, concurrency=args.concurrency,
                                 budget_cap_usd=5.0),
                    target_precision=args.target_precision, min_support=25,
                )
                session.commit()
            elapsed = time.time() - started

            # --- E4 extra: inter-model agreement on gold -------------------------
            gold_rows: list[list[str]] = []
            with get_db_session() as session:
                from sqlalchemy import select

                from packages.dataset_core.db.models import EnsembleVoteModel
                vote_rows = session.execute(
                    select(
                        EnsembleVoteModel.record_id,
                        EnsembleVoteModel.label,
                    ).where(EnsembleVoteModel.dataset_id == dsid)
                ).all()
            by_record: dict[str, list[str]] = {}
            for record_id, label in vote_rows:
                if label:
                    by_record.setdefault(record_id, []).append(label)
            gold_rows = [labels for labels in by_record.values() if len(labels) == len(specs)]
            gold_kappa = fleiss_kappa(gold_rows) if gold_rows else 0.0

            # --- E3 head-to-head: ensemble vs best single at the same volume ------
            auto_records = [rid for rid, band in outcome.routing.items()
                            if band == Band.AUTO_ACCEPT.value]
            head_to_head: dict[str, object] = {"accepted": len(auto_records)}
            gold_map: dict[str, str] = {}
            with get_db_session() as session:
                from sqlalchemy import select

                from packages.dataset_core.annotation_selector import (
                    select_active_annotation,
                )
                from packages.dataset_core.db.models import AnnotationModel
                rows = session.execute(
                    select(AnnotationModel).where(
                        AnnotationModel.dataset_id == dsid,
                        AnnotationModel.status == "approved",
                    )
                ).scalars().all()
                grouped: dict[str, list] = {}
                for row in rows:
                    if row.origin in {"human", "imported"} and (row.payload or {}).get("label"):
                        grouped.setdefault(row.record_id, []).append(row)
                for rid, group in grouped.items():
                    active = select_active_annotation(group)
                    if active is not None:
                        gold_map[rid] = str(active.payload["label"])

            ensemble_by_record = {result.record_id: result for result in outcome.aggregates}
            if auto_records:
                truth = [gold_map[rid] for rid in auto_records if rid in gold_map]
                ensemble_pred = [ensemble_by_record[rid].label for rid in auto_records if rid in gold_map]
                e_prec, e_low, e_high = precision_with_interval(
                    [t == p for t, p in zip(truth, ensemble_pred, strict=True)]
                )
                head_to_head["ensemble_band"] = {"precision": e_prec, "wilson_low": e_low,
                                                 "wilson_high": e_high, "n": len(truth)}

                # --- EQUAL-COVERAGE comparison (the fair one) ---------------------
                # Comparing models only on the ensemble-selected band is meaningless: that band
                # is where every model agrees, so a single model scores identically. The honest
                # question is: for the SAME number of records labelled, which is more accurate?
                coverage = len(auto_records)
                head_to_head["coverage"] = coverage

                # ensemble: top-K aggregates by confidence among gold-scored records
                ensemble_ranked = sorted(
                    (result for result in outcome.aggregates if result.record_id in gold_map),
                    key=lambda candidate: candidate.confidence,
                    reverse=True,
                )[:coverage]
                if ensemble_ranked:
                    hits = [gold_map[result.record_id] == result.label for result in ensemble_ranked]
                    e2_prec, e2_low, e2_high = precision_with_interval(hits)
                    head_to_head["ensemble"] = {
                        "precision": e2_prec, "wilson_low": e2_low, "wilson_high": e2_high,
                        "n": len(hits),
                    }

                # every single model: top-K of ITS OWN confidences, same coverage
                with get_db_session() as session:
                    from sqlalchemy import select

                    from packages.dataset_core.db.models import EnsembleVoteModel
                    vote_rows_all = session.execute(
                        select(
                            EnsembleVoteModel.model_name,
                            EnsembleVoteModel.record_id,
                            EnsembleVoteModel.label,
                            EnsembleVoteModel.confidence,
                        ).where(EnsembleVoteModel.dataset_id == dsid)
                    ).all()
                per_model: dict[str, dict[str, tuple[str, float]]] = {}
                for model_name, record_id, label, confidence in vote_rows_all:
                    if label:
                        per_model.setdefault(model_name, {})[record_id] = (label, float(confidence or 0.0))

                best_single_name = outcome.best_single_model
                head_to_head["best_single_model"] = best_single_name
                single_at_coverage: dict[str, dict[str, float]] = {}
                for model_name, votes in per_model.items():
                    ranked = sorted(
                        ((votes[rid][1], rid, votes[rid][0]) for rid in gold_map if rid in votes),
                        reverse=True,
                    )[:coverage]
                    if not ranked:
                        continue
                    single_hits = [gold_map[rid] == label for _conf, rid, label in ranked]
                    precision, low, high = precision_with_interval(single_hits)
                    single_at_coverage[model_name] = {
                        "precision": precision, "wilson_low": low, "wilson_high": high,
                        "n": len(single_hits),
                    }
                head_to_head["single_models_at_equal_coverage"] = single_at_coverage

                if best_single_name and best_single_name in single_at_coverage:
                    best = single_at_coverage[best_single_name]
                    head_to_head["best_single"] = best
                    if "ensemble" in head_to_head:
                        head_to_head["precision_delta_vs_best_single"] = round(
                            head_to_head["ensemble"]["precision"] - best["precision"], 6
                        )
                        head_to_head["wilson_low_delta_vs_best_single"] = round(
                            head_to_head["ensemble"]["wilson_low"] - best["wilson_low"], 6
                        )

            # --- E1b: does sharper weighting rescue the "dominant model diluted" case? ---
            alpha_sweep: dict[str, dict[str, float]] = {}
            if args.alpha_sweep:
                coverage = int(head_to_head.get("coverage") or 0) or len(outcome.aggregates)
                baseline = _topk_precision(outcome.aggregates, gold_map, coverage)
                if baseline:
                    alpha_sweep["alpha=2 (baseline)"] = baseline
                for alpha in (0.0, 1.0, 6.0, 20.0):
                    with get_db_session() as session:
                        alt = run_ensemble(
                            session, dsid,
                            FanoutConfig(models=specs, limit=args.limit,
                                         concurrency=args.concurrency, budget_cap_usd=5.0),
                            target_precision=args.target_precision,
                            min_support=25,
                            weight_alpha=float(alpha),
                            weight_beta=1.0,
                        )
                        session.rollback()
                    metrics = _topk_precision(alt.aggregates, gold_map, coverage)
                    if metrics:
                        alpha_sweep[f"alpha={alpha:g}"] = metrics
                best_alpha = max(alpha_sweep, key=lambda name: alpha_sweep[name]["wilson_low"])
                alpha_sweep["_best_by_wilson_low"] = {"precision": 0.0, "wilson_low": 0.0, "n": 0,
                                                      "label": best_alpha}

            report = {
                "run_id": run_id,
                "scenario": args.scenario,
                "presets": presets,
                "import": {k: imported.get(k) for k in ("accepted_count", "duplicate_count", "rejected_count")},
                "fixture": {"source": str(FIXTURE.name), "relabelled_to_proxy": True,
                            "rows": len(controlled) - 1},
                "elapsed_s": round(elapsed, 2),
                "fanout": {
                    "calls": outcome.fanout.calls_made,
                    "failures": outcome.fanout.failures,
                    "cost_usd": outcome.fanout.cost_usd,
                },
                "E1_aggregators": outcome.aggregator_scores,
                "E1_single_models": outcome.single_model_scores,
                "E1_best_single_model": outcome.best_single_model,
                "E1_lift_over_best_single": outcome.lift_over_best_single,
                "E1b_alpha_sweep": alpha_sweep,
                "E2_calibration": [c for c in outcome.to_dict()["calibration"]],
                "E3_thresholds": outcome.thresholds,
                "E3_head_to_head": head_to_head,
                "E3_band_counts": outcome.band_counts,
                "E4_correlated_error": outcome.correlated_error,
                "E4_gold_kappa": gold_kappa,
                "E4_correlated_flagged": any(v > 0.6 for v in outcome.correlated_error.values()),
                "optimistic": outcome.optimistic,
                "gold_pairs": outcome.gold_pairs,
                "model_weights": outcome.model_weights,
                "outcome": outcome.to_dict(),
            }
            (out_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

            # ------------------------------------------------------------ print ---
            print("=" * 78)
            print(f"ENSEMBLE EXPERIMENT  {run_id}   scenario={args.scenario}")
            print("=" * 78)
            print(f"import: {report['import']} | gold pairs: {outcome.gold_pairs} | "
                  f"optimistic split: {outcome.optimistic}")
            print(f"fan-out: {outcome.fanout.calls_made} calls, {outcome.fanout.failures} failures, "
                  f"${outcome.fanout.cost_usd:.4f}, {elapsed:.1f}s")

            print("\nE1 — AGGREGATOR COMPARISON (macro-F1 on gold)")
            for name, score in sorted(outcome.aggregator_scores.items(),
                                      key=lambda item: item[1]["macro_f1"], reverse=True):
                marker = "  <-- ensemble" if name == "log_odds" else ""
                print(f"   {name:15} acc={_pct(score['accuracy'])}  macroF1={score['macro_f1']:.4f}{marker}")
            print("   single models:")
            for name, score in sorted(outcome.single_model_scores.items(),
                                      key=lambda item: item[1]["macro_f1"], reverse=True):
                print(f"   {name:15} acc={_pct(score['accuracy'])}  macroF1={score['macro_f1']:.4f}")
            verdict = "PASS" if outcome.lift_over_best_single > 0 else "FAIL (ensemble does not beat best single)"
            print(f"   lift vs best single ({outcome.best_single_model}): "
                  f"{outcome.lift_over_best_single:+.4f} macroF1 -> E1 {verdict}")

            if alpha_sweep:
                print("\nE1b — WEIGHT-SHARPNESS SWEEP (equal coverage, stored votes re-used)")
                for name, metrics in alpha_sweep.items():
                    if name.startswith("_"):
                        continue
                    print(f"   {name:20} precision={_pct(metrics['precision'])} "
                          f"[{_pct(metrics['wilson_low'])}, {_pct(metrics['wilson_high'])}] "
                          f"n={metrics['n']}")
                best = alpha_sweep.get("_best_by_wilson_low", {}).get("label")
                if best:
                    print(f"   best by Wilson lower bound: {best}")

            print("\nE2 — CALIBRATION")
            for c in report["E2_calibration"]:
                print(f"   {c['model']:28} T={c['temperature']:.3f}  "
                      f"ECE {c['ece_raw']:.3f} -> {c['ece_calibrated']:.3f} "
                      f"({c['ece_improvement'] * 100:+.1f}%)  Brier {c['brier_raw']:.3f} -> {c['brier_calibrated']:.3f}")
            weights = report["model_weights"]
            if weights:
                total = sum(weights.values()) or 1.0
                print("   reliability weights: " + ", ".join(
                    f"{name}={value / total:.2f}" for name, value in sorted(weights.items())))

            print(f"\nE3 — PRECISION BAND (target {args.target_precision:.0%})")
            overall = outcome.thresholds.get("__all__", {})
            print(f"   tau_hi={overall.get('tau_hi')} accepted={overall.get('accepted')}/"
                  f"{overall.get('support')} precision={overall.get('precision')} "
                  f"wilson_low={overall.get('wilson_low')} met_target={overall.get('met_target')}")
            if head_to_head.get("ensemble"):
                e = head_to_head["ensemble"]
                print(f"   EQUAL-COVERAGE head-to-head ({e['n']} labelled records each):")
                print(f"     ensemble     precision={_pct(e['precision'])} "
                      f"[{_pct(e['wilson_low'])}, {_pct(e['wilson_high'])}]")
                for model_name, s in sorted(
                    (head_to_head.get("single_models_at_equal_coverage") or {}).items(),
                    key=lambda item: item[1]["precision"], reverse=True,
                ):
                    print(f"     {model_name:28} precision={_pct(s['precision'])} "
                          f"[{_pct(s['wilson_low'])}, {_pct(s['wilson_high'])}]")
                if head_to_head.get("best_single"):
                    print(f"     delta vs best single ({head_to_head['best_single_model']}): "
                          f"point {head_to_head['precision_delta_vs_best_single']:+.3f}, "
                          f"wilson-low {head_to_head['wilson_low_delta_vs_best_single']:+.3f}")
                if head_to_head.get("ensemble_band"):
                    band = head_to_head["ensemble_band"]
                    print(f"   on the ensemble-selected band: precision={_pct(band['precision'])} "
                          f"[{_pct(band['wilson_low'])}, {_pct(band['wilson_high'])}] n={band['n']}")
            print(f"   bands: {outcome.band_counts}")

            print("\nE4 — CORRELATED-ERROR AUDIT")
            for pair, value in sorted(outcome.correlated_error.items()):
                print(f"   error correlation {pair:32} {value:+.3f}")
            print(f"   Fleiss kappa across models: {gold_kappa:.3f}")
            print(f"   safety valve fired: {report['E4_correlated_flagged']}")
            print(f"\nreport saved: {out_dir / 'report.json'}")
            return 0
    finally:
        _cleanup(providers)


if __name__ == "__main__":
    sys.exit(main())
