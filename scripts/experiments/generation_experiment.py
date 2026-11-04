"""
Generation gate experiment (E6 pre-flight): does the anti-collapse filter actually reject junk?

Runs the real generation path (provider.generate) with a deterministic generator, then applies the
diversity/anti-collapse gate and a label-preservation check via a 3-model majority. No API keys:
uses the built-in deterministic FakeProvider + simulated models.

Report: acceptance rate, rejection reasons, label preservation, batch diversity, collapse flag.
Writes experiments/generation-<timestamp>/report.json
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

from packages.dataset_synthesis.diversity import (
    DiversityPolicy,
    GenerationCandidate,
    filter_candidates,
)
from packages.provider_gateway.fake_provider import FakeProvider
from packages.provider_gateway.simulated_provider import SimulatedEnsembleProvider
from packages.provider_gateway.types import ProviderRequest

FIXTURE = ROOT / "examples" / "text_intents_200.csv"
LABELS = ["billing", "technical_support", "feature_request", "general_inquiry"]


def _load_existing() -> tuple[list[str], dict[str, int]]:
    class_counts: dict[str, int] = {label: 0 for label in LABELS}
    texts: list[str] = []
    for line in FIXTURE.read_text(encoding="utf-8").splitlines()[1:]:
        if not line.strip():
            continue
        text, label, _split = line.rsplit(",", 2)
        texts.append(text.strip().strip('"'))
        label = label.strip().strip('"')
        class_counts[label] = class_counts.get(label, 0) + 1
    return texts, class_counts


def _majority(labels: list[str]) -> str:
    counts: dict[str, int] = {}
    for label in labels:
        counts[label] = counts.get(label, 0) + 1
    return max(counts, key=lambda label: counts[label])


def main() -> int:
    run_id = f"generation-{time.strftime('%Y%m%d-%H%M%S')}"
    out_dir = ROOT / "experiments" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    existing_texts, existing_counts = _load_existing()
    generator = FakeProvider()

    # --- 1. generate candidates through the real provider path -------------------
    per_class = 12
    candidates: list[GenerationCandidate] = []
    for label in LABELS:
        for index in range(per_class):
            response = generator.generate(ProviderRequest(
                model="fake-text-generator-v1",
                task_type="text_classification",
                parameters={"target_class": label, "index": index, "seed": index},
            ))
            text = str(response.payload.get("text", ""))
            candidates.append(GenerationCandidate(
                text=text,
                intended_label=label,
                generator_model=response.model,
                prompt_version="gen-v1",
            ))

    # --- 2. deterministic diversity / anti-collapse gate -------------------------
    policy = DiversityPolicy()
    report = filter_candidates(
        candidates,
        existing_texts=existing_texts,
        existing_class_counts=existing_counts,
        existing_total=len(existing_texts),
        policy=policy,
    )

    # --- 3. label-preservation check by 3-model majority -------------------------
    verifiers = [
        SimulatedEnsembleProvider("gen-ver-a", accuracy=0.97),
        SimulatedEnsembleProvider("gen-ver-b", accuracy=0.94),
        SimulatedEnsembleProvider("gen-ver-c", accuracy=0.90),
    ]
    preserved = 0
    failed: list[dict[str, str]] = []
    for candidate in report.accepted:
        labels = [
            verifier.annotate(ProviderRequest(
                model=verifier.list_available_models()[0],
                task_type="text_classification",
                input_text=candidate.text,
                label_schema={"labels": LABELS},
            )).payload["label"]
            for verifier in verifiers
        ]
        verdict = _majority(labels)
        if verdict == candidate.intended_label:
            preserved += 1
        else:
            failed.append({"text": candidate.text, "intended": candidate.intended_label,
                           "verdict": verdict})

    preservation_rate = round(preserved / len(report.accepted), 6) if report.accepted else 0.0

    # The decisive gate is batch-level: generated data is admitted only when it is diverse AND
    # carries its intended label. A partial batch of mislabelled synthetic data is worse than
    # no synthetic data, so a failing batch is rejected wholesale.
    min_preservation = 0.90
    verdict_reasons: list[str] = []
    if report.collapsed:
        verdict_reasons.append(
            "template collapse: unique trigram ratio "
            f"{report.stats.get('batch_unique_trigram_ratio')} < "
            f"{policy.min_batch_unique_trigram_ratio}"
        )
    if preservation_rate < min_preservation:
        verdict_reasons.append(
            f"label preservation {preservation_rate:.1%} < {min_preservation:.0%} required"
        )
    verdict = "reject" if verdict_reasons else "accept"

    payload = {
        "run_id": run_id,
        "generated": len(candidates),
        "accepted": len(report.accepted),
        "rejected": len(report.rejected),
        "acceptance_rate": report.acceptance_rate,
        "rejection_reasons": report.rejection_reasons(),
        "batch_unique_trigram_ratio": report.stats.get("batch_unique_trigram_ratio"),
        "collapsed_flag": report.collapsed,
        "collapse_warning": report.stats.get("warning"),
        "label_preservation_rate": preservation_rate,
        "label_preservation_failures": failed[:10],
        "class_counts_after": report.stats.get("class_counts_after"),
        "policy": policy.__dict__,
        "label_preservation_threshold": min_preservation,
        "generation_verdict": verdict,
        "verdict_reasons": verdict_reasons,
    }
    (out_dir / "report.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print("=" * 74)
    print(f"GENERATION GATE EXPERIMENT  {run_id}")
    print("=" * 74)
    print(f"generated {len(candidates)} candidates "
          f"({per_class}/class from {generator.name})")
    print(f"accepted {len(report.accepted)} / rejected {len(report.rejected)} "
          f"-> acceptance {report.acceptance_rate:.1%}")
    print(f"rejection reasons: {report.rejection_reasons()}")
    print(f"batch unique-trigram ratio: {report.stats.get('batch_unique_trigram_ratio')} "
          f"(collapse flag: {report.collapsed})")
    print(f"label preservation (3-model majority): {preservation_rate:.1%} "
          f"({preserved}/{len(report.accepted)})")
    if failed:
        print("  preservation failures (would be rejected):")
        for item in failed[:3]:
            print(f"    intended={item['intended']} verdict={item['verdict']} :: {item['text'][:70]}")
    print(f"class counts after: {report.stats.get('class_counts_after')}")
    print(f"BATCH VERDICT: {verdict.upper()}")
    for reason in verdict_reasons:
        print(f"  REJECTED BATCH: {reason}")
    print(f"report saved: {out_dir / 'report.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
