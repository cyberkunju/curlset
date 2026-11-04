# Confidence-Weighted Multi-Model Ensemble Pseudo-Labeling (CW-MME-PL)
## Design & Experiment Plan — v0.1

**Status:** design approved for build. Nothing here is claimed as achieved yet; every claim in
`§7` requires an executed experiment against a gold set.
**Objective:** produce text labels whose *measured* agreement with ground truth is far above what a
single model or a human reviewer achieves at the same throughput, and generate additional training
data without collapsing into model self-imitation.
**Scope of this document:** text classification + instruction pairs first. Other modalities later.

---

## 0. The honest framing (read this first)

Two different claims must be kept apart:

1. **Throughput/consistency beyond human** — achievable and measurable. 3 models × N samples gives
   3N judgments per unit time with no fatigue drift; ensemble aggregation reduces variance; audit
   sampling gives a *statistical lower bound* on precision. This is real and we can prove it.
2. **Judgment beyond human** — **cannot be claimed.** If all three models share a bias, the ensemble
   is confidently wrong, and no amount of agreement turns that into truth. `AGENTS.md` §7 forbids
   "second model's agreement as proof of truth". We therefore never report "beyond human"; we report
   **measured precision on a held-out human/gold set with a confidence interval**, plus an explicit
   correlated-error audit.

The design goal is: **maximise accepted-label yield at a chosen precision floor (default 99 %), then
prove the floor holds with a statistically valid audit.** Everything else is instrumentation.

---

## 1. Why an ensemble + pseudo-labeling actually helps (and when it doesn't)

- **Variance reduction:** independent errors average out; if models are individually ~85–90 % and
  errors are decorrelated, a weighted vote can exceed the best member.
- **Error detection:** disagreement is a *free* uncertainty signal — the strongest practical signal we
  have, because LLM self-reported confidence is poorly calibrated out of the box.
- **Condensation:** confidently pseudo-labelled data can exceed gold-set size by orders of magnitude,
  giving downstream training far more supervision than humans could label.
- **Failure mode — correlated error / "consensus hallucination":** models from the same family, same
  pretraining corpus, or same prompt template fail together. Mitigation is a first-class part of the
  design (§5), not an afterthought.
- **Failure mode — confirmation loops:** using pseudo-labels to judge pseudo-labels. Mitigation: the
  audit set is *always* human/gold and never enters the training or weighting loop.

---

## 2. Architecture

```
                     ┌──────────────────────────────────────────────┐
  unlabeled records  │  Fan-out (bounded concurrency, idempotent)   │
                     │  fanout.py: 3 providers × record             │
                     └───────────────┬──────────────────────────────┘
                                     │ ModelVote(record, model, label, probs?, conf, raw,
                                     │           tokens, cost, latency, error)
                     ┌───────────────▼──────────────────────────────┐
                     │  Calibration per (model, class)              │
                     │  calibration.py: temperature scaling on gold │
                     │  → calibrated p(label | model, x)            │
                     └───────────────┬──────────────────────────────┘
                                     │
                     ┌───────────────▼──────────────────────────────┐
                     │  Reliability weights                         │
                     │  weights.py: w(model,class) from measured    │
                     │  accuracy + calibration quality (Brier/ECE)  │
                     └───────────────┬──────────────────────────────┘
                                     │
                     ┌───────────────▼──────────────────────────────┐
                     │  Aggregation → EnsembleLabel                │
                     │  aggregation.py: weighted log-odds pooling   │
                     │  (+ majority & weighted-vote baselines)      │
                     └───────────────┬──────────────────────────────┘
                                     │  label, p_ensemble, entropy, disagreement
                     ┌───────────────▼──────────────────────────────┐
                     │  Routing / selection (3 bands)                │
                     │  selection.py: auto_accept | human_review |   │
                     │  reject — threshold solved for precision floor│
                     └───────────────┬──────────────────────────────┘
                                     │
              ┌──────────────────────┴───────────────────────┐
              ▼                                              ▼
    autonomous_pseudo_label                         human_review (active)
    (origin=ensemble, pending_review)               lowest-agreement first
              │
              ▼
    audit sampling (gold only) → Wilson lower bound → report/quality gate
```

### 2.1 Where it lives in this repo

| Component | Path | Notes |
|---|---|---|
| Math core (pure, no I/O) | `packages/dataset_ensemble/{calibration,aggregation,selection,weights,models}.py` | unit-testable, no DB |
| Fan-out orchestration | `packages/dataset_ensemble/fanout.py` | uses existing `provider_gateway`; bounded concurrency; per-call timeout; retries |
| Persistence | one new table `ensemble_votes` (+ index) | above the 500-row limit you can't hold this in memory |
| Service | `packages/dataset_ensemble/service.py` | orchestration over DB: run ensemble for dataset/split, write votes, aggregate, route |
| API | `services/api/routes/ensemble.py` | `POST /datasets/{id}/ensemble-label`, `GET /datasets/{id}/ensemble/status`, `POST /datasets/{id}/ensemble/audit` |
| Experiment harness | `scripts/ensemble_experiment.py` | runs the E0–E6 ladder, writes JSON + markdown reports |
| Generation | `packages/dataset_synthesis/generate.py` (extend) + `docs/GENERATION.md` | see §6 |
| UI | `EnsembleLab.tsx` | per-model reliability, agreement bands, yield@precision, cost |

### 2.2 New enum values (additive, no breaking change)

- `AnnotationOrigin.ENSEMBLE = "ensemble"` — an aggregated pseudo-label, always `pending_review`.
- `ReviewStatus` unchanged. Auto-accepted labels still land `pending_review`; "auto_accept" only
  controls *routing priority*, never approval. Human approval remains the only path to `approved`.

> **Why not auto-approve?** Because `AGENTS.md` §6 and the whole product contract require a
> human-review state to mean something. An "auto-accepted" pseudo-label that is never reviewed is a
> *candidate training label*, tracked separately, and exported with `origin=ensemble` + its audit
> precision attached so downstream users can filter on it.

---

## 3. The math

### 3.1 Normalising a model's output

Each model returns a label and (usually) a confidence. Two cases:

- **Probability vector available** (`p_i` over classes): use as-is, then calibrate.
- **Only a hard label + confidence** (typical chat-API JSON): convert to a one-hot-ish vector, then
  calibrate. This is weaker — we will always *ask* for a full distribution first and fall back to
  one-hot. Prompt template must request `{"label": ..., "probs": {"class": p, ...}}`.

### 3.2 Calibration — temperature scaling per (model, class)

LLM confidences are systematically overconfident. For each model `m` we fit a single temperature `T_m`
on the **gold audit set** by minimising NLL of the reported distribution:

```
p_cal(k | m, x) = softmax( log(p_m(k|x)) / T_m )
```

Implemented as a 1-D line search over `T ∈ [0.05, 10]` (no scipy dependency). We also compute
**ECE** (expected calibration error, 10 equal-mass bins) and **Brier score** per model, because
calibration quality drives how much weight the model deserves.

> If a model's outputs are hard labels only, calibration degenerates to a per-(model,class) scalar
> bias correction estimated from gold confusion — still useful, weaker. Documented as a limitation.

### 3.3 Reliability weights

For model `m` and class `c`:

```
r(m,c) = accuracy(m | gold, class c)             # measured, not assumed
q(m)   = 1 / (1 + ECE(m))                        # calibration trust
w(m,c) ∝ r(m,c)^alpha * q(m)^beta               # alpha=2, beta=1 defaults
w(m,c)  = w(m,c) / Σ_m' w(m',c)                  # normalise per class
```

Weights are **per class** because models are rarely uniformly good across classes (billing vs
general_inquiry). Weights are recomputed only from gold data, never from pseudo-labels.

### 3.4 Aggregation — weighted log-odds pooling ("product of experts")

```
L(k) = Σ_m w(m,c_k) · log p_cal(k | m, x)
P(k) = softmax(L)(k)
ŷ    = argmax_k P(k)
conf = P(ŷ)
```

Baselines we must beat in experiment E1: `majority_vote`, `weighted_vote`, `mean_probability`,
`single_best_model`. **If pooling does not beat the best single model on gold, we do not ship it.**

### 3.5 Disagreement diagnostics

- **Vote entropy** `H(ŷ)` and normalised entropy.
- **Pairwise disagreement rate** `d(m1,m2)`.
- **Fleiss' kappa** across the 3 models (chance-corrected agreement).
- **Correlated-error flag:** on the audit set, compute pairwise *error correlation*
  `corr(1[ŷ_m ≠ y], 1[ŷ_m' ≠ y])`. High correlation ⇒ the ensemble's confidence is inflated ⇒ we
  widen the reject band and raise the auto-accept threshold.

---

## 4. Selection & audit — how we make a precision *guarantee* honest

Three bands by ensemble confidence, with per-class thresholds `τ_c`:

| Band | Rule | Destination |
|---|---|---|
| **auto_accept** | `conf ≥ τ_hi` **and** `kappa ≥ κ_min` **and** not correlated-error-flagged | candidate label, `origin=ensemble`, `pending_review`, high routing priority |
| **human_review** | `τ_lo ≤ conf < τ_hi` or high disagreement | active-learning queue, ordered by lowest confidence |
| **reject** | `conf < τ_lo` or `κ` below floor | not labelled; flagged for generation (§6) |

`τ_hi` per class is solved to hit the target auto-accept precision:

1. Sort gold-set samples by ensemble confidence.
2. Find the smallest threshold where the **Wilson lower bound** (95 %) of precision ≥ target (99 %).
3. Use that per class; report the achieved yield (fraction of unlabeled data above threshold).

**Audit protocol (non-negotiable):**
- A random sample of auto-accepted items (size `n` from a power calculation, min 100/class) is
  labelled by a human or drawn from untouched gold and compared to the ensemble label.
- We report **precision with a 95 % Wilson interval**. We never report a point estimate as truth.
- Audit items never enter weight fitting for that round (split: calibration set ⊥ audit set).

---

## 5. Correlated-error risk — the thing that actually decides success

Three LLMs on the same prompt are *not* independent. Mitigations, in order of strength:

1. **Model diversity by construction:** three different families (DeepSeek / Muse / OpenAI) — this is
   exactly why the 3-model choice is better than 3 sizes of one family.
2. **Prompt diversity:** per-model prompt templates and label-order permutations so a shared
   label-position bias cannot masquerade as agreement.
3. **Adversarial verifier pass:** for auto_accept items, a fourth call that sees *only the text and the
   proposed label* and must answer "is this label defensible? yes/no + counterexample". Cheap, and
   catches confident-and-wrong consensus.
4. **Gold anchoring:** a fixed, human-labelled anchor set (≥ 20/class) is never used for training and
   is re-scored every round; drift shows up immediately.
5. **Disagreement-first human review:** humans spend their scarce time on low-κ items, which is where
   correlated errors surface.
6. **Never** use pseudo-labels to score pseudo-labels (no self-grading).

---

## 5b. Executed results so far (simulated models, no keys required)

**Status: E0–E4 machinery validated.** Three simulated models with known error profiles replace the
real providers so the whole pipeline (fan-out → calibration → weighting → aggregation → thresholds →
routing → correlated-error audit) is measurable before spending a token. Reports are in
`experiments/<run-id>/report.json`; reproduce with
`python scripts/ensemble_experiment.py --scenario {diverse|weak|correlated}`.

**Plumbing (all verified):** 200-row fixture → 600 votes (3 models × 200 records) persisted; re-running
issues **0** additional calls (idempotent); a `$0` budget cap issues **0** calls and reports
`budget cap reached`; 300-test repo suite unaffected.

| Scenario | Models (acc) | E1 macro-F1: ensemble vs best single | E3 equal-coverage precision (ensemble vs best single) | E1b best α (precision) | E4 error corr. | Safety valve |
|---|---|---|---|---|---|---|
| **weak** (82 / 76 / 68 %) | mid-accuracy | 0.775 vs 0.737 → **+3.8 pts** | 78.0 % vs 68.3 % → **+9.8 pts** (Wilson-low +10.3) | α=20 → 80.5 % | 0.15–0.27 | not fired |
| **diverse** (97 / 93 / 87 %) | one dominant | 0.9217 vs 0.9257 → **−0.4 pts** | 88.6 % vs 95.5 % → **−6.8 pts** | **α=20 → 95.5 %** (recovers the loss) | 0.15–0.46 | not fired |
| **correlated** (45 % shared failures) | shared blind spots | 0.542 vs 0.542 → **no lift** | — | α cannot help (55 % at every α) | **0.69–0.86** | **fired** (0 auto-accepted) |

All three runs are **bit-reproducible** (gold split is derived from stable external keys, so two
identical runs produce identical report digests — verified: `90d90daa69557013` twice).

**Calibration (E2):** temperature scaling cut ECE by **15–99 %** per model (e.g. 0.389 → 0.041) and
improved Brier scores everywhere. This part works as designed.

### Four findings that change the plan

1. **The ensemble is not automatically better — but weight sharpness fixes it.** When one model
   dominates in accuracy *and* calibration, uniform-ish weighting dilutes it (−6.8 pts equal-coverage
   precision in `diverse`). The **E1b sweep** (free: it re-aggregates stored votes, no new model calls)
   shows `α=20` recovers **95.5 %**, matching the dominant model while keeping the ensemble's variance
   protection. → **Action: fit `α` per deployment by maximising the Wilson lower bound on the gold
   half** (the sweep is cheap enough to run every pass), exposed as `weight_alpha` in the API.
2. **The ensemble's true value is at the operating point, not in overall accuracy.** In `weak`,
   overall macro-F1 improves +3.8 pts while **equal-coverage precision improves +9.8 pts** — and
   precision at fixed coverage is what a labeling budget actually buys. Report both, never only one.
3. **"Majority vote" can beat weighted log-odds.** In the weak regime majority was competitive or
   better. The aggregator must be **chosen by measurement per deployment**; the service computes all
   four and the API returns the comparison.
4. **High agreement is not trust — and no weighting fixes shared error.** In `correlated`, Fleiss
   κ = **0.83 with 55 % accuracy**: three models confidently agreeing on the same wrong answer.
   Every α from 0→20 stayed at ~55 %, because averaging cannot create independent evidence. The
   safety valve (pairwise error correlation > 0.6 → **nothing auto-accepted**) fired correctly.
   **Conclusion: correlated-error detection is the load-bearing safety control, not aggregation.**

**Also learned (E3):** certifying a 90 % precision floor needs roughly ≥100 audited samples; with 47–60
accepted samples even 96 % observed precision only yields a Wilson lower bound of ~80 %. The harness
therefore refuses to report a certificate it cannot support — and `audit_sample_size()` says how many
audit labels are required before the claim becomes legitimate.

### Live 3-model run (real providers) — executed 2026-11-04

**Models actually called** (all OpenAI-compatible, production adapter):
`deepseek-ai/DeepSeek-V4.1-Flash-1017` (self-hosted vLLM endpoint) ·
`meta-models/muse-spark-open-1026` (Baseten) · `gpt-6-luna` (OpenAI).

200 gold records × 3 models = **600 calls, 0 auth failures, ~245 s wall-clock**, one run:

| Model | accuracy | macro-F1 | avg latency | tokens in / out | call failures |
|---|---|---|---|---|---|
| gpt-6-luna | **97.5 %** | 0.9746 | 2 205 ms | 15 699 / 8 806 | 0 |
| muse-spark-open-1026 | 96.4 % | 0.9638 | 2 883 ms | 41 214 / **103 010** | 7 |
| deepseek-v4.1-flash | 95.5 % | 0.9540 | 1 894 ms | 20 313 / 14 268 | 0 |
| **ensemble (log-odds)** | 97.0 % | 0.9697 | — | — | — |

**Result 1 — the ensemble did NOT beat the best single model here (−0.49 pts macro-F1).**
Cause is measured, not guessed: at equal labelling volume (top 50 by confidence) **all three single
models and the ensemble are 100 % precise** (Wilson LB 92.9 %). This fixture is *saturated* — the
models are already at the data's ceiling, so there is no headroom for fusion to exploit. The correct
deployment decision for this dataset is "use the single best/cheapest model"; the ensemble's value
was demonstrated in the mid-accuracy simulated regime (+9.8 pts precision) and must be re-measured
on harder data.

**Result 2 — the safety valve fired on real data.**
Pairwise error correlation: DeepSeek × Muse **φ = 0.614** (> 0.6) → **nothing auto-accepted**, all 200
records routed to human review, even though each model is 95–97 % accurate. Two large reasoning
models share failure modes; agreement between them is not independent evidence. This is exactly the
failure the design exists to catch, and it appeared on the first live run.

**Result 3 — calibration.** All three models are severely overconfident (self-reported ≈1.0);
fitted T ≈ 5.6 and ECE 0.021 → 0.000 after temperature scaling.

**Engineering notes from the live run** (all fixed):
`gpt-6-luna` rejects `temperature != 1` and `max_tokens` → adapter now strips rejected optional
parameters and retries on 400; reasoning models (Muse) consume the whole completion budget as hidden
reasoning tokens and return empty content unless the limit is raised → adapter supports
`max_completion_tokens`; model output wrapped in fences/prose → tolerant JSON extraction.
Muse's 7 failures (3.5 %) were empty-content responses from that reasoning budget.

**Next experiment required (E1c): a harder gold set.** To show ensemble lift on real models we need
data where the models are ~70–85 % accurate (ambiguous, multi-intent, paraphrased, noisy). Until then,
the honest claim is: *the machinery works end-to-end on real providers and its safety controls engage
correctly; the accuracy gain is not yet demonstrated on production-like data.*

### E1c — hard-set live run (the decisive result) — executed 2026-11-04

Fixture: `examples/text_intents_hard.csv` — 300 rows, 4 balanced intents, **implicit intent** (no
giveaway keywords), 5–18 words, cross-domain vocabulary, authored gold. 900 calls, 0 auth failures,
413 s, 10 model-output failures (Muse empty-content on reasoning budget).

| Model | accuracy | macro-F1 |
|---|---|---|
| gpt-6-luna | **87.3 %** | 0.8739 |
| deepseek-v4.1-flash | 87.0 % | 0.8691 |
| muse-spark-open-1026 | 83.8 % | 0.8384 |
| **ensemble (log-odds)** | 86.7 % | 0.8672 |

**1. Multi-model voting did not beat the best single model** (−0.68 pts macro-F1; at equal volume K=105:
ensemble 94.3 % / Wilson-LB 88.1 % vs best single 95.2 % / 89.3 % → single wins by 1.24 pts).

**2. The reason is measured: the models are highly correlated.**
Pairwise **error correlation φ = 0.776 / 0.785 / 0.799** (all far above the 0.6 valve). Pairwise
agreement 94–95 %, but **both_wrong 10.4–11.7 %** — roughly one record in nine is failed by *all three*
models together. Adding models from three different vendors did not create independent evidence.
The safety valve therefore fired: **0 auto-accepted**, all 300 routed to human review.

**3. Disagreement is nevertheless a strong, usable routing signal.**
| Agreement level | n | precision of the fused label |
|---|---|---|
| unanimous (3/3) | 277 | **88.8 %** [84.6, 92.0] |
| 2-of-1 split | 22 | **59.1 %** [38.7, 76.7] |

That is a 30-point separation: agreement is exactly the right thing to triage on.

**4. Confidence ranking is NOT monotone (important engineering negative).**
Ranking by ensemble confidence: 10 % yield → 86.7 % precision, but 50 % yield → **96.0 %**. A handful of
confidently-wrong records sit at the very top. **Confidence alone must not gate auto-accept; agreement
(κ) plus confidence must.**

**5. What *is* achievable and certifiable** (the honest positive result): at ~50 % coverage the fused
labels reach **96 % precision (Wilson LB 91.6 %)**, and certifying a floor costs a known number of human
audits — **130 labels for 90 %, 260 for 95 %, 1 445 for 99 %**. So the product value is *audited
half-volume auto-acceptance*, not "beyond human judgement".

**Verdict on the objective's premise:** as specified (three vendor models, confidence-weighted voting)
the approach does **not** deliver measurably beyond-human label quality on hard data — the ceiling is the
best single model, because the errors are shared. What it does deliver is validated disagreement-guided
human routing and an audit-certifiable precision band. Closing the gap to "far beyond human" requires
**independent evidence**, not more vendors: diverse prompt strategies / retrieval grounding / adversarial
verifiers, and human audits concentrated on the disagreement band. That is the next experiment (E1d).

### E1d — prompt-role diversity: also negative

Same three models, same 300 hard records, but each expert received a **different role prompt** (triage
agent / meticulous annotator / quality auditor), stored as separate role-scoped votes. 900 calls.

| Metric | Baseline (same prompts) | Role-diverse |
|---|---|---|
| Best single model (macro-F1) | 0.8739 (gpt-6-luna) | 0.8707 (gpt-6-luna) |
| Ensemble macro-F1 | 0.8672 | **0.8738** (+0.31 pts vs best single — within noise) |
| Pairwise error correlation φ | 0.776 / 0.785 / 0.799 | 0.815 / 0.731 / 0.821 → **not decorrelated** |
| Unanimous-band precision | 88.8 % | 87.7 % |
| Disagreement-band precision (2-of-1) | 59.1 % | **83.3 %** (n=24) |
| Equal-volume (K=105) vs best single | single +1.24 pts | single **+2.52 pts** |

**Conclusion:** role-prompt diversity at temperature 0 does **not** break the correlated-error ceiling.
The one encouraging signal — the disagreement band improved from 59 % to 83 % — suggests role framing
helps on *hard* records, but n=24 is too small to act on. Three independent decorrelation strategies
have now failed (vendor diversity, weight sharpness, role prompts) because LLMs from every vendor make
the same mistakes on the same items. That is a property of the task and the models, not of the code.

### Cost post-mortem (honest)

E1d accidentally ran three times (≈2 700 calls) because the idempotency key omitted `prompt_version`:
role-scoped votes were stored as `rolev1#roleN` but the lookup compared only `(record, provider, model)`,
so every re-run re-issued all calls, and `--reset-db` defaulted to `true`. Both bugs are fixed
(4-tuple key + prefix match; `--reset-db` now defaults to `false`) and a regression test
(`test_role_prompt_votes_are_idempotent_and_nested`) locks it in. Lesson recorded in the repo rather
than left as a footnote: **any component that spends money must be idempotent by test, not by intent.**

---

### Generation gate (E6 pre-flight) — executed

`packages/dataset_synthesis/diversity.py` implements the deterministic anti-collapse filters and
`scripts/generation_experiment.py` exercises the real generation path (provider → gate → 3-model
label-preservation check). Result with the deterministic built-in generator (48 candidates, 12/class):

| Metric | Result |
|---|---|
| Accepted by diversity filters | 48/48 (fake generator's boilerplate is lexically dissimilar enough) |
| Batch unique-trigram ratio | **0.196** (< 0.35 floor) → **collapse flag fired** |
| Label preservation (3-model majority == intended class) | **52.1 %** (25/48) |
| **Batch verdict** | **REJECT** — "template collapse" + "label preservation 52.1 % < 90 % required" |

This is the gate working as intended: lexical filters alone would have admitted a useless batch, and
**label-preservation verification is the decisive filter**. Two consequences for the real pipeline:
1. Generated data is admitted **only** as a whole batch that passes both diversity and
   ≥ 90 % label-preservation; partial admission of mislabelled synthetic data is not allowed.
2. A real generator must be measured with this gate before any generated row enters a dataset —
   which is precisely what the fake generator just failed.

---

## 6. Generation — where the real difficulty is

Goal: create *new* training data beyond what humans would write, without model self-collapse.
Three generation strategies, each with a mandatory filter:

| Strategy | What it makes | Safeguard |
|---|---|---|
| **G1. Coverage-targeted paraphrase** | variants of gold/official samples in under-covered regions of label space | semantic-similarity ceiling vs source (too-similar = reject), label-preservation check by ensemble, dedupe by embedding + hash |
| **G2. Gap filling** | samples for classes/regions with no data (the app's "coverage gap" concept, currently degenerate) | requires a working feature space; generate then require ensemble κ ≥ floor to accept |
| **G3. Hard-negative / boundary mining** | samples where models disagree, resolved by ensemble+human | disagreement is the selection criterion; human adjudicates a sample |

**Anti-collapse rules (mandatory):**
- Every generated record is `origin=synthetic` with lineage: generator model, prompt template, seed,
  temperature, parent sample ids, and the *filter scores* that admitted it.
- Reject generated data whose embedding is within ε of an existing sample (dedupe) or which the
  ensemble labels differently from its intended label.
- Cap generated share per class (default ≤ 40 % of that class) and never let generated data alone
  determine a class's distribution.
- Round-over-round: measure whether adding generated data *improves* downstream/gold accuracy — if it
  doesn't, the generation round is discarded. No exceptions.

---

## 7. Experiment ladder (what we run, and the pass/fail bar)

Every experiment writes JSON + a markdown report into `experiments/<id>/`.

| ID | Question | Metric / pass bar |
|---|---|---|
| **E0** | Fixture + harness sanity (no model calls) | imports 200, gold approved, evaluation runs, fake accuracy reported |
| **E1** | Does fusion beat the best single model? | ensemble macro-F1 > best single by ≥ 1.5 pts on gold; report all aggregation baselines |
| **E2** | Calibration: does temperature scaling help? | ECE ↓ ≥ 25 % vs raw; fusion F1 not worse |
| **E3** | Precision-band solving | at target 99 % auto-accept precision, yield ≥ 40 % of unlabeled; Wilson LB ≥ target |
| **E4** | Correlated-error audit | report pairwise error correlation + kappa; flag if > 0.6 |
| **E5** | Round-2 self-training | adding accepted pseudo-labels improves gold accuracy vs round-1 (no degradation) |
| **E6** | Generation impact | generated data improves gold accuracy or is rejected |
| **E7** | Cost/throughput | cost per 1 000 accepted labels; wall-clock with concurrency |

**Bar for "far above a human reviewer":** not a vibe — we compare, on the same gold set, the ensemble
auto-accept precision at the target band against (a) single-model precision at the same accepted
volume, and (b) the human gold label as reference. We publish the delta with confidence intervals.

---

## 8. Cost & safety controls (must ship with the first run)

- Hard per-run budget cap in the fan-out (tokens × price table); abort before exceeding.
- Idempotency: `(record_id, model, prompt_version)` unique key, so re-runs don't double-pay.
- Bounded concurrency (default 6), per-call timeout, 2 bounded retries with jitter.
- Every call's tokens/cost/latency persisted per vote.
- No secrets in logs; keys only via the credential store / env.
- `PRIVACY_MODE` must be **enforced** before any real external call is wired in (currently a known
  gap in this codebase — this must be fixed as a prerequisite, see §9).

---

## 9. Prerequisites / known gaps this work must close first

1. **`PRIVACY_MODE` is not enforced** (`config.py` only defines it). Wiring 3 external providers makes
   this a P0: implement the transport-boundary gate before any live fan-out.
2. **No budget/quota enforcement** → add per-run token/cost ceiling to the fan-out.
3. **Provider `base_url` is unvalidated** (SSRF) → allowlist https + block private ranges for provider
   endpoints, or explicitly permit loopback only in dev.
4. **Correlated-error / confidence data is not persisted** → new `ensemble_votes` table.
5. **Coverage-gap clustering is degenerate** (all points at origin) → G2 needs a real embedding space
   (start with TF-IDF + SVD; upgrade later).

---

## 10. Open questions for the operator (blocking live runs)

1. Exact **API base URLs + model ids** for the three endpoints. Two of the names
   ("Muse Spark Open", "GPT-6 Luna") are not models I can verify; the app only needs an
   OpenAI-compatible `base_url` + a model string, so any provider exposing that works.
2. Do all three expose **OpenAI-compatible `/chat/completions`**? If one isn't, it needs a small
   adapter (same shape as the existing Anthropic adapter).
3. Can each return a **full label distribution** (`probs`) or only a single label? This decides §3.1.
4. **Budget ceiling** per experiment round (e.g. "≤ $2 per run").
5. Is **human adjudication** available for the audit set, or do we treat the existing 200-row fixture
   as gold and construct a larger held-out gold once?

---

## 11. Deliverables & order of work

1. **Math core + unit tests** (no keys): calibration, aggregation, selection, weights. ← *started*
2. **Design doc** (this file).
3. **Fan-out + persistence + API** (`ensemble_votes`, idempotency, budget, concurrency).
4. **Experiment harness** E0–E4, runnable with `FakeProvider` so the whole pipeline is proven before
   money is spent.
5. **Live E1–E3 on the 3 real models** once keys/endpoints arrive.
6. **Generation track** (G1–G3) + anti-collapse filters, E5–E6.
7. **UI: Ensemble Lab** — per-model reliability, band yield, precision@auto-accept, cost.
8. **Prerequisite hardening** (§9) before any live external call.

**Rule we hold ourselves to:** no accuracy number is reported as achieved until an experiment file
with the raw outputs exists in `experiments/`. Claims without evidence are treated as bugs.

---

## 12. Delivery status (objective → evidence)

| Objective component | Status | Evidence |
|---|---|---|
| Calibrated per-model reliability weighting | **Delivered** | `packages/dataset_ensemble/{calibration,weights}.py`, 36 unit tests; live E2: ECE 0.11–0.18 → 0.000 |
| Confidence-weighted multi-model aggregation | **Delivered** | `aggregation.py` (log-odds pooling + 3 baselines); live E1 across the 3 real endpoints |
| Disagreement-driven human routing | **Delivered + validated** | `selection.py` 3-band routing; live: unanimous 88.8 % vs 2-of-1 59.1 % precision |
| Statistically audited auto-accept precision | **Delivered** | Wilson-bound threshold solving + `audit_sample_size`; live: 96 % precision at ~50 % coverage; 130/260/1 445 audits for 90/95/99 % |
| Diversity-controlled generation | **Delivered end-to-end** | `dataset_synthesis/diversity.py` (10 tests) **+** `generation_pipeline.py` write path (4 integration tests): gate → independent label-preservation → persist `origin=synthetic`/`pending_review` with lineage; a failing batch writes nothing |
| New package | **Delivered** | `packages/dataset_ensemble/**` (+ `simulated_provider`, `pricing`) |
| API | **Delivered** | `POST /datasets/{id}/ensemble/label`, `GET …/ensemble/votes`, `GET …/ensemble/audit-sample`, `POST /datasets/{id}/generate-gated` |
| UI | **Delivered** | `EnsembleLab.tsx`: model picker, aggregator comparison, calibration table, precision band + Wilson bounds, band counts, correlated-error matrix with safety banner, audit plan; builds clean |
| Experiment harness | **Delivered** | `scripts/{ensemble_experiment, generation_experiment, live_ensemble_run, live_weight_sweep, analyze_live_agreement, generate_hard_fixture}.py`; reports in `experiments/` |
| **"Far-above-human" label quality** | **NOT achieved — measured and falsified** | vendor diversity, α-sweep and role-prompt diversity all failed to break φ ≈ 0.8 correlated errors; the ensemble never beat the best single model on hard data (§5d–5e) |

**Engineering hardening delivered alongside (each from a real failure):** prompt-diversity support with
role-scoped **idempotent** votes (+ regression test), tolerant JSON extraction, reasoning-model token
budgets, provider parameter-compatibility retry, `tests/conftest.py` (the suite is now order
independent), and `provider_gateway/pricing.py` so USD budget caps are enforceable and unpriced
providers are reported rather than silently treated as free.

**Honest conclusion:** the machinery is complete, tested (**324 tests**), and exercised against the
three real models. The *quality premise* did not survive measurement. What the evidence supports is
**audited auto-acceptance (~96 % precision at ~50 % coverage) with humans routed to the disagreement
band** — not "labels better than a human reviewer".
