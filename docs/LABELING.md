# Labeling — Manual, Autonomous, Ensemble and Specialist

Status: current. Design + measured research limits. Full research records are in
[`docs/research/`](research/README.md); product status in [STATUS](STATUS.md).

## 1. What "labeled" means here

A label is not a string in a row: it is an **annotation** with:

- a task-specific payload (text class, image class, boxes, caption, transcript);
- an `origin` (`human`, `model`, `ensemble`, `imported`, `synthetic`, `augmented`);
- a review `status` (`pending_review`, `approved`, `rejected`, `needs_correction`);
- an append-only revision history with actor and reason;
- for machine output, the provider/model/prompt/seed that produced it.

Consequences: machine output can never be relabelled as human; auto-approval must be a recorded review
transition; exports carry all of it.

## 2. Manual review

- The Annotation Workbench shows the record, its current annotation, and history.
- Classification review is keyboard-first (1–9 select class, Enter save).
- Object detection uses a canvas; boxes are pixel-intrinsic, validated against image dimensions, and
  empty saves are blocked.
- Bulk review supports approve/reject/request-correction with a reason.
- Every decision is a transition in the state machine ([ARCHITECTURE](ARCHITECTURE.md) §4).

## 3. Autonomous labeling (classification)

`POST /datasets/{id}/auto-label` runs a bounded job over the dataset:

1. Model panel is preflighted once with a real record/image; unusable models are dropped, an empty
   panel fails the job.
2. Per record, models are called outside any DB transaction; outputs are sanitised to the dataset's
   label space (out-of-schema labels get no vote).
3. Decision:
   - models agree **and** mean confidence ≥ threshold (default 0.90) → annotation at `approved`,
     `origin=ensemble` (multi-model) or `origin=model` (single), through a recorded transition by
     actor `auto-labeler`;
   - otherwise → annotation at `pending_review` and it enters the human queue.
4. Progress, measured ETA, cancel and restart recovery reuse the shared job contract.

Honest limitation: this is classification-only. Boxes/captions/transcripts have geometry/format
validation needs and are not auto-approved by this engine.

## 4. Ensemble pseudo-labeling (CW-MME-PL)

The ensemble engine (`packages/dataset_ensemble`) provides:

- per-model confidence calibration before aggregation;
- confidence-weighted aggregation with configurable model weights;
- per-record votes exposed through `GET /datasets/{id}/ensemble/{votes,audit-sample}`;
- routing bands: high-confidence agreement (auto-approve path), mid-band (needs review), low-agreement
  (human required).

The purpose of the ensemble is **routing and evidence**, not a promise of accuracy. The research is
explicit about the ceiling:

- On the hard fixture, 31 of 300 records (10.33%) are wrong in **all three** model votes; no
  aggregation can exceed **89.67%** when the panel shares those errors
  (`docs/research/R1-correlated-error-ceiling.md`).
- Plurality (86.33%) was **below** the best single model (87.33%) on that fixture; aggregation is not a
  free accuracy win (`docs/research/R1-correlated-error-ceiling.md`, `00-SYNTHESIS.md`).
- Aggregate agreement alone is therefore never certification; disagreement is a routing signal
  (`docs/research/W7-human-ai-deferral.md`).

## 5. Dataset-local specialist probe (optional extra)

`packages/dataset_ensemble/specialist.py` fits a logistic probe on frozen embeddings of **this
dataset's own labels** and reports honest out-of-fold estimates:

- `grouped_folds` keeps near-duplicate/template groups inside one fold;
- `cross_fit` never scores a row on data it trained on;
- `risk_coverage_curve` exposes coverage/precision trade-offs (the curve is the deliverable, not a
  cherry-picked threshold);
- `cluster_bootstrap_ci` resamples **groups**, not IID rows;
- `route_with_specialist` (in `rescue.py`) lets a confident specialist override the panel only when it
  genuinely disagrees.

Research basis (`docs/research/00-BREAKTHROUGH-specialist-rescue.md`, `00-ALGORITHMS.md`,
research `_src/setfit_results.json`): on the fixture the panel is blind where the specialist is right,
so complementarity — not raw accuracy — is the value. The research numbers are fixture-specific and
are **not** product accuracy claims.

Status: library + tests only, requires `pip install -e ".[specialist]"`; productisation is
[ROADMAP](ROADMAP.md) L3.

## 6. Box proposals (SAM 3.1)

For object-detection datasets, **Propose boxes (AI)** runs `POST /datasets/{id}/proposals/detect`:

- bounded: ≤50 records, ≤3 concepts; one concept noun phrase per provider call (SAM contract);
- concepts must be dataset classes; boxes are stored as `origin=model`, `pending_review` with
  `proposed_by`, model, image dimensions and confidence;
- re-running updates the existing pending model annotation (revision) instead of duplicating it;
- masks are parsed but not stored (boxes only, for now).

SAM 3.1 snippets are boxes over special-token text on the Meta Responses API; see ADR-024 for the
contract. The research notes SAM 3/3.1 is a gated, CUDA-oriented concept segmenter and that a box
**detector** (e.g. Grounding DINO) is a different tool — we use SAM for proposals, not as a detector
claim (`docs/research/R3-autolabeling-modalities.md`).

## 7. Review-money rules

1. Never show "the model's answer" as truth to a human reviewer; expose it as a proposal with
   provenance (research: showing the model answer reduced consensus quality and speed,
   `W7-human-ai-deferral.md`).
2. Blind-two-plus-adjudication is the researched high-quality path; it is on the roadmap (L7).
3. An approved label is a human or explicitly-recorded auto-labeler decision — never an implicit
   threshold crossing.
4. When evidence is insufficient, say so (`pending_review`) rather than guessing.

## 8. Research numbers that constrain this area

| Finding | Number | Source |
|---|---|---|
| Best VLM precision at full coverage | 87.5% best board; Claude 73.13% (2026-11) | `W4-vlm-annotators.md` |
| Human accuracy ladder | single 88–92%; majority-of-3 95–98%; κ=0.8 ≈ 92% single | `W10-human-baselines.md` |
| Correlated blind spot | 10.33% all-three-wrong; ceiling 89.67% | `R1-correlated-error-ceiling.md` |
| Human-vs-AI deferral gain | deferral is the only quantified way to beat a single annotator | `W7-human-ai-deferral.md` |
| Specialist rescue (fixture) | base 94.67%, rescue 96.77%, oracle 99.33% | research `_src/setfit_results.json`, `00-BREAKTHROUGH-specialist-rescue.md` |

These are research-fixture measurements with a stated denominator; they are not claims about any user
dataset.
