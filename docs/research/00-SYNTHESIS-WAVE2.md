# 00 — SYNTHESIS, WAVE 2: synthetic data, cross-judging, and what can actually be certified

**Date:** 2026-11-04
**Inputs:** 13 parallel reports (`wave2/W1`–`W13`), plus the Lead's own re-analysis of `repo/data/hard.db`.
**Read with:** `00-SYNTHESIS.md` (wave 1) and `LEAD-FINDING-templated-fixture.md`.
**Status:** research conclusions and a ranked plan. No code changed.

---

## 1. The verdict

After ~40,000 more words and 13 specialist streams, the answer to "is there a breakthrough that makes this the best in the world?" is:

**Not in labeling accuracy. Yes in what you can prove about it.**

Three independent lines now converge:

1. **The stacker reaches the oracle.** A supervised log-linear label model scores **89.47%** on resolvable rows at **99.78%** — i.e. it extracts essentially everything the votes contain. The oracle ceiling is 89.67%.
2. **Dependence modelling adds exactly zero.** A quadratic/interaction model scores identically to the additive one: difference **0.0000 [0.0000, 0.0000]**. φ ≈ 0.74 is real but, given gold, carries no extra information.
3. **The residual is 8 ontology disputes.** 31 all-wrong rows collapse to 8 base sentences, every one a label-boundary question (billing vs general inquiry, billing vs technical support, feature request vs bug).

So the highest-value work is not a better algorithm. It is: **(a) write the label policy, (b) certify what remains, (c) build where an oracle exists.** Everything below is ranked by that logic.

---

## 2. The five findings that change the roadmap

### F1. The benchmark, not the model, is the binding constraint
300 rows → 107 unique sentences (99 with punctuation stripped). ICC of error = **0.715**; design effect **3.37**; effective n **74.5–117** depending on the clustering rule. The 31 all-wrong rows are **8 stems**, confirmed independently three times (Lead, W12, W5). Every CI in the project is **1.8–4× too narrow**. *No 95% certificate can be issued from this fixture.*

### F2. Aggregation is finished
- Plurality, confidence-sum, log-odds and drop-lowest produce the **same label on 289–290 of 290** records; log-odds is byte-identical to confidence-summing.
- Supervised DS: 88.93%. Additive stacker: **89.47%** (row-level CV) / **89.23%** (template-grouped CV), paired cluster bootstrap **+2.3 [0.0, +4.8]**.
- Quadratic = additive exactly. Full pattern memoriser is *worse* (89.00%).
- Unsupervised Dawid–Skene converges to a solution **93 nats better than the best attainable with true labels** (−556.9 vs −650.2). Without gold, the wrong answer wins.
- A one-factor model calibrated to the co-error reproduces `c = 9.97%` and extrapolates **85.6% at k=3 → 86.0% at k=51**. Adding 48 models buys 0.4 points.

### F3. Synthetic data: structure beats surface, and the regime decides everything
- **Text:** compositional generation **56.42** vs paraphrase **43.08** vs raw documents **38.15** (EntiGraph ablation). Paraphrase plateaus at ~0.9M tokens; composition kept scaling to 600M. Targeted generation beats volume (LLM2LLM: TREC **26.2 → 78.8** from 60 seeds). Realistic gain for a subjective 4-class task: **+1 to +3**, not +6. Negative: synthetic data *lowered* AG News 4-class from **95.3 → 93.1** above ~1k real rows.
- **Images:** gains ordered by missing supervision — **+0 to +2 mAP** with ample real data; **+4 to +10 AP** for taxonomy bootstrapping; **+13 to +21 mAP** with a few hundred real images and a domain gap; **−7** synthetic-only. Copy-paste is the honest strong baseline (**+1.5 box AP**, **+3.6 mask AP on LVIS rare**), and construction-time labels beat post-hoc labelling.
- **Metrics lie:** over 275,472 synthetic images, FID-based selection beat random by +0.036 macro-F2 for one class and nothing for another.
- **Code is the exception:** synthetic tasks matched human-issued tasks, **27.8% vs 28.0%**; SWE-bench Verified 7.0% → 20.6% (491 trajectories) → 32.0% with a verifier → 51.0% from procedural generation.

### F4. Certification is finite-population, and 95% is currently impossible
- **Conformal risk control is the wrong object:** it bounds `E[L] ≤ α`, not `1−δ`, and at acceptance rate r it licenses only `α/r` error among accepted (10% at α=5%, r=0.5).
- Use an **exact hypergeometric bound on a design-randomised sample of the frozen accepted set, at template level** (conformal also violates exchangeability here: ICC 0.762).
- Audit sizes: **59** zero-error for a 95% floor (58 fails); **51** with a finite population of 300; **40 of 101 templates** under cluster sampling; allowed errors 1–6 need 93/124/153/181/208/234.
- **Blocking:** sweeping every confidence prefix, the maximum one-sided Clopper–Pearson bound is **0.9402** (173 accepted, 5 errors). The design doc's "96% at 50% coverage" is a point estimate; its 95% LB is 0.9312.
- Two code bugs: `selection.py:108` keeps scanning after a failure (returns 230 where a valid fixed-sequence procedure returns 208), and `wilson_lower_bound` uses the two-sided multiplier, so "95%" is really a one-sided 97.5% bound.

### F5. The only quantified way to beat a single annotator is deferral
Identity: **team accuracy = model accuracy on accepted mass + human accuracy on deferred mass.** Deferral wins iff the human is better than the model *on exactly the deferred items*.

- On your data: lowest-confidence 20% is **61.7–65%** accurate. Defer that band to **two blind annotators + adjudication on disagreement + 10% audit** → **~93.6% at 0.55 label-units/item**, vs 87.3% best single model.
- Break-even panel accuracy on that band: **>65%**; to beat a single 90% annotator: **>78.3%**.
- Human bar for reference: single blinded annotator **~91%**; majority of 3 **~97–98%**. You are ~5 points below one human today.
- **Do not show annotators the model's answer:** 44% slower (54.3 s → 78.0 s) and diversity collapses (8% → 38% five-way consensus), while inflating measured model accuracy.
- Two blind + adjudication beats three-way majority: **0.965 vs 0.939** at 2.25 vs 3.00 label units.

---

## 3. The breakthrough candidates, ranked by value ÷ cost

| # | Candidate | What it is | Cost | Kill criterion |
|---|---|---|---|---|
| **B1** | **Error-diversity accounting** | Score *sources*, not items, by error independence: one probe per provenance group, pairwise φ, `n_eff`, projected Δ`c`. Product claim: "source A adds 0.9 effective votes; B is redundant." | 1 day on existing 900 votes | φ flat across sources → drop |
| **B2** | **8-decision guideline audit** | Adjudicate one record per all-wrong stem; re-base c, oracle bound, CIs | ~1 day, 8 labels | — |
| **B3** | **Error-recoverability audit (ρ⁺)** | On the 31 rows, re-elicit and measure `ρ⁺ = P(correct \| all three wrong)`; `Δ = c·ρ⁺ − (1−c)·ρ⁻` bounds every debate/jury/verifier protocol at once | ~90 calls | ρ⁺ ≈ 0 → residual is definitional |
| **B4** | **Counterfactual second-order elicitation** | Ask each model its answer *and* what a model **without the retrieved policy** would answer; test AUC of the residual for detecting all-wrong | 900 calls | `corr(q̄, v) ≈ 1` → dead (plain SP ≡ plurality, proved) |
| **B5** | **Conditioned dissent auditing** | On the 267 unanimous rows only, re-elicit rationales and measure divergence at reason level | ~801 calls | AUROC < 0.70 |
| **B6** | **Discriminative audit-item selection** | Choose audit items that separate good from bad labellers (consensus among high performers, low among low), score by distance | design + build | **IP: verify Scale US12189719B1 claim 1 before shipping** |
| **B7** | **Certificate-carrying insertion (images)** | Real objects → masks → layout from target distribution → deterministic composite → seam-only inpaint → label inherited → different-family verifier → CP bound + ΔAP gate | weeks | SSIM < 0.999 outside mask |
| **B8** | **Policy-graph text synthesis** | Walk rule → exception → confusion paths from the guideline; spend budget on cross-validated error cells; independent verifier | weeks | < +1 macro-F1 on frozen gold |
| **B9** | **Risk–coverage curve for VLM labeling** | Measure coverage at 95% precision — **unmeasured in public literature** | 1 week | curve below 50% coverage |
| **B10** | **Mutation-scored code oracle** | Certify by enumeration, audit the checker with mutation testing | weeks | mutant score < 70% |

**B1 is the single most original idea in the programme.** Every method in the literature scores *content* diversity. None scores whether one source's **errors are independent** of another's — the quantity that actually governs `1 − 3p̄ + 2c`. It is also the only candidate that produces a claim no competitor can make, and it is falsifiable in a day.

**B9 is the most publishable.** W4 searched and found only accuracy numbers for VLM annotation; the risk–coverage curve at a precision floor is an open measurement.

---

## 4. What to stop believing

| Claim | Status |
|---|---|
| "Add more models / vendors" | Dead. n_eff → 1/φ ≈ 1.28; k=51 buys +0.4 pts. |
| "Better aggregation" | Dead. Four aggregators agree on 289–290/290; supervised stacker hits the oracle. |
| "Correlated label model will fix it" | Dead. Quadratic = additive to four decimals; unsupervised DS is unidentifiable at K=3. |
| "Synthetic data will get us to 93%" | Not by paraphrase. +1–3, and only with structure and a targeted budget. |
| "VLM auto-labeling at 95%" | Only classification with abstention; coverage unmeasured; boxes/masks/counting far below. |
| "Certify 95% now" | Impossible on this fixture: max bound 0.9402. |
| "Beyond human" | You are ~5 pts below one annotator and ~11 below majority-of-3. Deferral is the honest route. |

---

## 5. The 30-day plan, with gates

**Week 1 — free, no model calls**
- Adjudicate the 8 stems (B2). Re-base `c`, oracle, CIs on stems.
- Fix `selection.py:108` fixed-sequence scan; fix the two-sided Wilson multiplier.
- Build the de-templated gold set (≥300 unique sentences; 430+ if you want to detect +6 pts).
- **Gate:** publish c, corrected ceiling, and cluster-robust intervals.

**Week 2 — cheap model calls**
- B3 (ρ⁺, 90 calls) and B4 (counterfactual elicitation, 900 calls) on the existing gold.
- **Gate:** ρ⁺ > 0.3 or AUC ≥ 0.80, else close the branch and publish the negative.

**Week 3 — the certificate**
- Implement the hypergeometric template-level certificate; certify **90%** honestly today.
- Implement deferral: lowest-confidence quintile, 2 blind annotators, adjudication, 10% audit.
- **Gate:** certificate reproducible from the manifest; deferral beats best-single with a paired cluster test.

**Week 4 — the differentiator**
- B1 error-diversity accounting as a product metric.
- B6 discriminative audit selection (after IP check).
- **Gate:** "source adds X effective votes" displayed and falsifiable.

**Beyond:** B9 (VLM risk–coverage), B7/B8 (synthetic), B10 (code oracle).

---

## 6. The honest ceiling statement

For this dataset, with these votes and this gold:

- **89.67%** is the aggregation ceiling.
- **94.02%** is the highest certifiable bound at any coverage today.
- **~91%** is one human annotator; **~97–98%** is a three-human majority.
- **93.6% at 0.55 labels/item** is reachable with blind deferral, if humans beat the model on the deferred band.
- **99%** is impossible unless two humans agree on >98% of items — the `1 − d/2` theorem.

The only route above 95% is **independent evidence on the 8 dispute stems**, and the only route to a *provable* claim is an **oracle** (code), a **certificate** (hypergeometric, template-level), or a **deferral policy with a tested complementarity condition**.

---

## 7. Corrections made during wave 2

| Report | Claim | Verdict |
|---|---|---|
| W1 | "Set is not templated; between-group SD equals binomial expectation" | **Wrong.** It grouped by the parenthetical qualifier (ICC −0.020) not the stem (ICC 0.715). Its MDE is too optimistic; the gold set must grow in unique stems. |
| W6 | Conformal risk control recommended in wave-1 synthesis §L4 | **Corrected in the synthesis.** CRC bounds expected risk, not `1−δ`; wrong object for a precision floor. |
| W3 | "0.425 → 0.396, −7.4 points" | **Label error:** −2.9 absolute points, −6.8% relative. Direction stands. |
| W5 | Row-level CV 89.47% | **Valid but optimistic.** Template-grouped CV gives 89.23% and the CI may touch zero at ~99 clusters. |
| W11 | Scale patent US12189719B1 claim 1 | **Existence and assignee verified**; claim text unverified (patent sites blocked). IP check before shipping. |
| Wave 1 R3 | Grounding DINO Swin-T 52.5 AP | **Wrong:** 46.7 (Swin-L is 52.5). |

---

## 8. Index

| File | Why read it |
|---|---|
| `W1-llm-juries-debate-verifiers.md` | Why every jury/debate/verifier protocol is bounded; ρ⁺ and conditioned dissent |
| `W2-synthetic-images.md` | Certificate-carrying insertion; gains by regime |
| `W3-synthetic-text.md` | Compositional vs paraphrase; the +1–3 reality |
| `W4-vlm-annotators.md` | What VLMs can and cannot label; the unmeasured risk–coverage gap |
| `W5-weak-supervision-label-models.md` | The stacker experiment that reaches the oracle; identifiability failure |
| `W6-uncertainty-certification.md` | The correct certificate and the 0.9402 ceiling |
| `W7-human-ai-deferral.md` | The 93.6% deferral policy and its conditions |
| `W8-data-centric-frontier.md` | Error-diversity accounting; response ratio; non-transferable policies |
| `W9-label-noise-theory.md` | The three-layer limit; `1 − d/2` theorem |
| `W10-human-baselines.md` | The human bar: 91% single, 97–98% majority |
| `W11-forums-patents-industry.md` | Scale patent; the self-grading failure pattern |
| `W12-crowd-wisdom-psychometrics.md` | Why psychometrics is inverted here; counterfactual elicitation |
| `W13-other-modalities.md` | Why code is the only provable modality |
