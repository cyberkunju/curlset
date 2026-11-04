"""
Weight-sharpness sweep on STORED live votes (costs nothing — no model calls).

Question it answers: with three real models where one dominates, does sharper reliability
weighting make the ensemble beat that dominant model at equal labelling volume?

Reads an existing live database, re-aggregates the stored votes for several `weight_alpha` values,
and compares equal-coverage precision with every single model.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
os.chdir(REPO)
sys.path.insert(0, str(REPO))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="./data/live200.db")
    parser.add_argument("--dataset-id", default=None)
    parser.add_argument("--target-precision", type=float, default=0.9)
    parser.add_argument("--alphas", default="0,1,2,4,8,20")
    parser.add_argument("--coverage-fraction", type=float, default=0.25,
                        help="fraction of gold records to compare at (equal labelling volume)")
    args = parser.parse_args()

    os.environ["DATABASE_URL"] = f"sqlite:///{args.db}"
    os.environ.setdefault("LOCAL_STORAGE_DIR", "./data/live_storage")

    from sqlalchemy import select

    from packages.dataset_core.annotation_selector import select_active_annotation
    from packages.dataset_core.db.models import (
        AnnotationModel,
        DatasetModel,
        EnsembleVoteModel,
    )
    from packages.dataset_core.db.session import get_db_session
    from packages.dataset_ensemble.fanout import FanoutConfig
    from packages.dataset_ensemble.selection import precision_with_interval
    from packages.dataset_ensemble.service import run_ensemble

    with get_db_session() as session:
        dataset_id = args.dataset_id
        if not dataset_id:
            dataset_id = session.scalars(select(DatasetModel.id).order_by(DatasetModel.created_at)).first()
        dataset = session.get(DatasetModel, dataset_id)
        if not dataset:
            print(f"ABORT: dataset {dataset_id} not found in {args.db}")
            return 2
        project = dataset.task_type
        print(f"dataset: {dataset_id} ({dataset.name}) task={project}")

        # gold labels
        annotations = session.scalars(
            select(AnnotationModel).where(
                AnnotationModel.dataset_id == dataset_id,
                AnnotationModel.status == "approved",
            )
        ).all()
        grouped: dict[str, list] = {}
        for annotation in annotations:
            if annotation.origin in {"human", "imported"} and (annotation.payload or {}).get("label"):
                grouped.setdefault(annotation.record_id, []).append(annotation)
        gold: dict[str, str] = {}
        for record_id, group in grouped.items():
            active = select_active_annotation(group)
            if active is not None:
                gold[record_id] = str(active.payload["label"])

        # stored votes per model (label + confidence)
        vote_rows = session.execute(
            select(
                EnsembleVoteModel.model_name,
                EnsembleVoteModel.record_id,
                EnsembleVoteModel.label,
                EnsembleVoteModel.confidence,
            ).where(EnsembleVoteModel.dataset_id == dataset_id)
        ).all()
        per_model: dict[str, dict[str, tuple[str, float]]] = {}
        models = set()
        for model, record_id, label, confidence in vote_rows:
            models.add(model)
            if label:
                per_model.setdefault(model, {})[record_id] = (label, float(confidence or 0.0))
        specs = [
            type("S", (), {"provider": "live", "model": model, "key": f"live::{model}"})()
            for model in sorted(models)
        ]
        print(f"models: {sorted(models)} | gold: {len(gold)}")

        # baseline outcome at alpha=2 to fix the coverage K
        baseline = run_ensemble(
            session, dataset_id,
            FanoutConfig(models=specs, limit=1000, only_missing=True),
            target_precision=args.target_precision, min_support=25, weight_alpha=2.0,
        )
        auto_accept = len([1 for value in baseline.routing.values() if value == "auto_accept"])
        # The safety valve can set auto-accept coverage to zero (correlated errors), which is the
        # correct production behaviour but useless for an equal-volume comparison. Compare at a
        # fixed share of the gold set instead: "label the top K most confident records".
        coverage = max(10, int(len(gold) * args.coverage_fraction))
        print(f"baseline auto-accept band: {auto_accept} records | "
              f"equal-volume comparison at K={coverage} ({args.coverage_fraction:.0%} of gold)")


        # --- single models at equal coverage -------------------------------------
        single: dict[str, dict] = {}
        for model, votes in per_model.items():
            ranked = sorted(
                ((votes[rid][1], rid, votes[rid][0]) for rid in gold if rid in votes),
                reverse=True,
            )[:coverage]
            if not ranked:
                continue
            hits = [gold[rid] == label for _conf, rid, label in ranked]
            precision, low, high = precision_with_interval(hits)
            single[model] = {"precision": precision, "wilson_low": low, "wilson_high": high, "n": len(hits)}

        # --- ensemble sweep over alpha -------------------------------------------
        sweep: dict[str, dict] = {}
        for alpha in [float(x) for x in args.alphas.split(",") if x.strip()]:
            outcome = run_ensemble(
                session, dataset_id,
                FanoutConfig(models=specs, limit=1000, only_missing=True),
                target_precision=args.target_precision, min_support=25, weight_alpha=alpha,
            )
            ranked = sorted(
                ((result.confidence, result.record_id, result.label) for result in outcome.aggregates
                 if result.record_id in gold),
                reverse=True,
            )[:coverage]
            if not ranked:
                continue
            hits = [gold[record_id] == label for _conf, record_id, label in ranked]
            precision, low, high = precision_with_interval(hits)
            sweep[f"alpha={alpha:g}"] = {
                "precision": precision, "wilson_low": low, "wilson_high": high, "n": len(hits),
                "macro_f1_all": outcome.aggregator_scores["log_odds"]["macro_f1"],
                "lift_vs_best_single": outcome.lift_over_best_single,
                "best_single_model": outcome.best_single_model,
                "correlated_error": outcome.correlated_error,
                "safety_valve_fired": any(v > 0.6 for v in outcome.correlated_error.values()),
                "bands": outcome.band_counts,
            }

    best_single = max(single, key=lambda m: single[m]["wilson_low"]) if single else None
    print("\n" + "=" * 78)
    print(f"EQUAL-COVERAGE COMPARISON at {coverage} labelled records")
    print("=" * 78)
    for model, row in sorted(single.items(), key=lambda kv: kv[1]["wilson_low"], reverse=True):
        print(f"  single {model:34} precision={row['precision']*100:5.1f}% "
              f"[{row['wilson_low']*100:.1f}, {row['wilson_high']*100:.1f}] n={row['n']}")
    print("  " + "-" * 72)
    for name, row in sweep.items():
        marker = " <-- best by Wilson" if False else ""
        print(f"  ensemble {name:12} precision={row['precision']*100:5.1f}% "
              f"[{row['wilson_low']*100:.1f}, {row['wilson_high']*100:.1f}] n={row['n']} "
              f"macroF1={row['macro_f1_all']:.4f} lift={row['lift_vs_best_single']:+.4f}{marker}")

    if sweep and best_single:
        best_alpha = max(sweep, key=lambda name: sweep[name]["wilson_low"])
        row = sweep[best_alpha]
        base = single[best_single]
        print("\nverdict:")
        print(f"  best single model: {best_single} (wilson_low {base['wilson_low']*100:.1f}%)")
        print(f"  best ensemble:     {best_alpha} (wilson_low {row['wilson_low']*100:.1f}%)")
        delta = (row["wilson_low"] - base["wilson_low"]) * 100
        print(f"  delta on Wilson lower bound: {delta:+.2f} pts -> "
              f"{'ENSEMBLE WINS' if delta > 0 else 'SINGLE MODEL WINS'}")
        print(f"  safety valve fired: {row['safety_valve_fired']} | bands: {row['bands']}")

    out = REPO / "experiments" / "live_weight_sweep.json"
    out.write_text(json.dumps({"coverage": coverage, "single": single, "sweep": sweep,
                               "best_single": best_single}, indent=2), encoding="utf-8")
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
