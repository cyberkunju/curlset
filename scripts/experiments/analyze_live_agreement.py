"""
Analyze stored live votes: does disagreement actually route work usefully?

Answers the "disagreement-driven human routing" question with measured numbers, from votes already
paid for (no model calls):

  * accuracy/precision split by agreement level (unanimous / 2-1 / all-different);
  * ensemble precision as a function of confidence decile;
  * the precision/yield curve -- how many records you can auto-accept at 90%, 95%, 99% precision;
  * head-to-head: ensemble vs the best single model at the same labelling volume;
  * pairwise agreement and the conditional probability that the odd-one-out is right.

Usage:
    python scripts/experiments/analyze_live_agreement.py --db ./data/hard.db
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
os.chdir(REPO)
sys.path.insert(0, str(REPO))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="./data/hard.db")
    args = parser.parse_args()

    os.environ["DATABASE_URL"] = f"sqlite:///{args.db}"
    os.environ.setdefault("LOCAL_STORAGE_DIR", "./data/hard_storage")

    from sqlalchemy import select

    from packages.dataset_core.annotation_selector import select_active_annotation
    from packages.dataset_core.db.models import (
        AnnotationModel,
        DatasetModel,
        EnsembleVoteModel,
    )
    from packages.dataset_core.db.session import get_db_session
    from packages.dataset_ensemble.aggregation import aggregate
    from packages.dataset_ensemble.selection import (
        precision_with_interval,
        wilson_lower_bound,
    )
    from packages.dataset_ensemble.types import ModelVote

    with get_db_session() as session:
        dataset_id = session.scalars(select(DatasetModel.id).order_by(DatasetModel.created_at.desc())).first()
        dataset = session.get(DatasetModel, dataset_id)
        labels = (dataset.label_schema or {}).get("labels") or []
        print(f"dataset: {dataset.name} | classes={labels}")

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
        gold = {}
        for record_id, group in grouped.items():
            active = select_active_annotation(group)
            if active is not None:
                gold[record_id] = str(active.payload["label"])

        vote_rows = session.execute(
            select(
                EnsembleVoteModel.model_name,
                EnsembleVoteModel.record_id,
                EnsembleVoteModel.label,
                EnsembleVoteModel.confidence,
                EnsembleVoteModel.probs_json,
                EnsembleVoteModel.error_message,
            ).where(EnsembleVoteModel.dataset_id == dataset_id)
        ).all()

    by_record: dict[str, list[ModelVote]] = {}
    per_model: dict[str, dict[str, str]] = {}
    models: list[str] = []
    for model, record_id, label, confidence, probs, error in vote_rows:
        if model not in models:
            models.append(model)
        if label:
            per_model.setdefault(model, {})[record_id] = label
        by_record.setdefault(record_id, []).append(ModelVote(
            model=model,
            label=label or "",
            probs={str(k): float(v) for k, v in (probs or {}).items()} or None,
            confidence=float(confidence or 0.0),
            error=error,
        ))

    # ---------------- aggregate (uniform weights: keep it model-agnostic) ----------
    aggregates = {}
    for record_id, votes in by_record.items():
        if record_id not in gold:
            continue
        result = aggregate(record_id, votes, labels)
        if result.label and result.n_models >= 2:
            aggregates[record_id] = result
    scoreable = [rid for rid in aggregates if rid in gold]
    print(f"\nscoreable records: {len(scoreable)} | models: {models}")

    # ---------------- agreement analysis -------------------------------------------
    print("\n=== ACCURACY BY AGREEMENT LEVEL ===")
    buckets: dict[str, list[int]] = {"unanimous": [], "2-of-1": [], "all-different": []}
    for rid in scoreable:
        votes = [v.label for v in by_record[rid] if v.ok]
        counts = Counter(votes)
        top = counts.most_common(1)[0][1]
        key = "unanimous" if top == len(votes) else ("all-different" if top == 1 else "2-of-1")
        buckets[key].append(1 if aggregates[rid].label == gold[rid] else 0)
    for key, hits in buckets.items():
        if not hits:
            continue
        precision, low, high = precision_with_interval([bool(h) for h in hits])
        print(f"  {key:14} n={len(hits):4}  precision={precision*100:5.1f}% "
              f"[{low*100:4.1f}, {high*100:5.1f}]")

    # ---------------- precision at fixed yield ------------------------------------
    print("\n=== AUTO-ACCEPT TRADE-OFF (ranked by ensemble confidence) ===")
    ranked = sorted(scoreable, key=lambda rid: aggregates[rid].confidence, reverse=True)
    print(f"  {'yield':>6} {'n':>5} {'precision':>10} {'wilson_lb':>10}")
    for fraction in (0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1.0):
        take = max(1, int(len(ranked) * fraction))
        chosen = ranked[:take]
        hits = [aggregates[rid].label == gold[rid] for rid in chosen]
        precision, low, _high = precision_with_interval(hits)
        print(f"  {fraction*100:5.0f}% {take:5} {precision*100:9.2f}% {low*100:9.2f}%")

    # ---------------- head-to-head at coverage ------------------------------------
    coverage = max(10, int(len(scoreable) * 0.35))
    print(f"\n=== EQUAL-VOLUME HEAD-TO-HEAD at K={coverage} ===")
    chosen = ranked[:coverage]
    hits = [aggregates[rid].label == gold[rid] for rid in chosen]
    e_prec, e_low, _ = precision_with_interval(hits)
    print(f"  ensemble        precision={e_prec*100:5.1f}% [wilson_lb {e_low*100:4.1f}%]")
    single_rows = {}
    for model in models:
        votes = per_model.get(model, {})
        ranked_model = sorted(
            ((float(next(v.confidence for v in by_record[rid] if v.model == model)), rid, label)
             for rid, label in votes.items() if rid in gold),
            reverse=True,
        )[:coverage]
        if not ranked_model:
            continue
        model_hits = [gold[rid] == label for _c, rid, label in ranked_model]
        precision, low, _h = precision_with_interval(model_hits)
        single_rows[model] = {"precision": precision, "wilson_low": low, "n": len(model_hits)}
        print(f"  single {model:30} precision={precision*100:5.1f}% [wilson_lb {low*100:4.1f}%]")
    if single_rows:
        best = max(single_rows, key=lambda name: single_rows[name]["wilson_low"])
        delta = (e_low - single_rows[best]["wilson_low"]) * 100
        print(f"  -> best single: {best} | delta on Wilson LB: {delta:+.2f} pts "
              f"({'ENSEMBLE WINS' if delta > 0 else 'SINGLE WINS'})")

    # ---------------- is the odd-one-out ever right? ------------------------------
    print("\n=== MODEL-WEIGHT ANALYSIS: pairwise agreement and error structure ===")
    for model in models:
        votes = per_model.get(model, {})
        shared = [rid for rid in votes if rid in gold]
        accuracy = sum(1 for rid in shared if votes[rid] == gold[rid]) / len(shared) if shared else 0.0
        print(f"  {model:30} accuracy={accuracy*100:5.1f}% n={len(shared)}")
    for index, a in enumerate(models):
        for b in models[index + 1:]:
            shared = [rid for rid in per_model.get(a, {}) if rid in per_model.get(b, {}) and rid in gold]
            if not shared:
                continue
            agree = sum(1 for rid in shared if per_model[a][rid] == per_model[b][rid]) / len(shared)
            both_right = sum(1 for rid in shared
                             if per_model[a][rid] == gold[rid] and per_model[b][rid] == gold[rid]) / len(shared)
            both_wrong = sum(1 for rid in shared
                             if per_model[a][rid] != gold[rid] and per_model[b][rid] != gold[rid]) / len(shared)
            print(f"  {a[:18]:18} x {b[:18]:18} agree={agree*100:5.1f}% "
                  f"both_right={both_right*100:5.1f}% both_wrong={both_wrong*100:5.1f}%")

    # ---------------- audit requirement ------------------------------------------
    print("\n=== AUDIT REQUIREMENT (to certify a precision floor) ===")
    # A Wilson lower bound can only reach the target if the OBSERVED precision is above it.
    # Assume the operating point yields target + half the remaining distance.
    for target in (0.90, 0.95, 0.99):
        observed = min(0.999, target + (1.0 - target) / 2)
        needed = None
        for n in range(30, 20000, 5):
            if wilson_lower_bound(round(observed * n), n) >= target:
                needed = n
                break
        print(f"  certify {target*100:.0f}% (observed {observed*100:.1f}%): "
              f"needs about {needed} audited labels")

    payload = {
        "dataset_id": dataset_id,
        "n": len(scoreable),
        "models": models,
        "agreement_buckets": {
            key: {"n": len(hits), "precision": (sum(hits) / len(hits)) if hits else 0.0}
            for key, hits in buckets.items()
        },
        "head_to_head": {"coverage": coverage, "ensemble_precision": e_prec,
                         "ensemble_wilson_low": e_low, "singles": single_rows},
    }
    out = REPO / "experiments" / f"agreement_{Path(args.db).stem}.json"
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
