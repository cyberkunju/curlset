# 00 — SYNTHESIS: What "exceptional" can actually mean for Curlset

**Date:** 2026-11-04
**Inputs:** 10 parallel research reports (`R1`–`R10`), plus independent re-derivation of the repository's own experiment data by the Lead.
**Status of this document:** research conclusions and a ranked plan. No code was changed.

---

## 1. The answer in one paragraph

You cannot get "insane accuracy" by adding models, prompts, or aggregation cleverness. Your own 900 raw votes prove it arithmetically: 31 of 300 records (10.33%) are wrong in **all three** votes, so no aggregator can exceed **89.7%**, and reaching 95% requires externally correcting **16 of those 31**. What you *can* build — and nobody sells it — is a platform that (a) manufactures **independent evidence** to attack the all-wrong mass, (b) **certifies** its auto-label precision with a valid statistical guarantee, and (c) makes every dataset version **byte-reproducible and tamper-evident**. That combination is defensible, measurable, and genuinely rare. "Better than human judgement" is not achievable; "certified at a precision floor with the fewest human labels" is.

---

## 2. Verified: the ceiling is arithmetic, not opinion

The Lead recomputed everything from `repo/data/hard.db` (900 votes, 300 records, 3 models) rather than trusting the design doc.

| Quantity | Value | How obtained |
|---|---|---|
| Wrong-vote histogram | 238 / 21 / 10 / 31 (0/1/2/3 wrong) | direct count |
| All-three-wrong mass `c` | **31/300 = 10.33%** | direct count |
| Pairwise co-error `p̄` | **0.1144** | mean of 0.1033 / 0.1200 / 0.1200 |
| Identity `1 − 3p̄ + 2c` | **0.8633** | closed form |
| Measured plurality accuracy | **0.8633** | direct count |
| Oracle bound (perfect split resolver) | **269/300 = 89.67%** | records with ≥1 correct vote |
| Effective independent votes `n_eff` | **1.17** at φ = 0.78 | `k/(1+(k−1)φ̄)` |
| Asymptotic `n_eff` as k→∞ | **1.28** | `1/φ̄` |

The identity `plurality accuracy = 1 − 3p + 2c` holds to four decimals on real data. That is the whole argument in one line: **accuracy is set by the all-wrong mass and the co-error rate, not by the number of vendors.**

External corroboration is now strong:

- Kim et al., *Correlated Errors in Large Language Models* (ICML 2025, arXiv 2506.07962): across 350+ models, "models agree 60% of the time when both models err"; **larger, more accurate models have highly correlated errors even with distinct architectures and providers.**
- *Nine Judges, Two Effective Votes* (arXiv 2605.29800, 2026): a 9-judge panel from 7 families provides ~**2 effective votes**; the best single judge matches or beats the panel; "neither adding more judges nor using smarter aggregation algorithms helps" — established methods close at most 11% of the gap.

### What this permanently retires

1. **Vendor diversity as a strategy.** With k → ∞ you get 1.28 effective votes. No fourth vendor helps.
2. **Weight sharpening (α → ∞) as "fusion gain."** As α grows, the pooled label converges to the best member's label. It is a model selector in disguise, not an ensemble.
3. **Disagreement-first review as certification.** 75.6% of your errors (31/41) sit in the unanimous band. Disagreement routing reaches only ~24% of mistakes — it is a model-improvement tool, not a certifier.
4. **Confidence-only gating.** Your ranking is non-monotone (10% yield → 86.7% precision; 50% → 96.0%). A handful of confidently-wrong records sit at the top. Gate on agreement × confidence, and **test monotonicity before solving any threshold**.

---

## 2b. The fixture itself is the bottleneck (Lead finding — read `LEAD-FINDING-templated-fixture.md`)

The 300-row hard set is **107 unique sentences** (49 singletons, clusters up to 9 rows) with irrelevant
suffixes like `(on Safari)`. The error indicator has **ICC = 0.715** over sentence clusters, a design
effect of **3.37**, and an **effective n of 74.5**.

Three consequences that override everything below:

1. **All reported intervals are too narrow.** Plurality accuracy is 86.33% with a cluster-robust CI of
   **[77.7, 94.0]**, not [82.0, 89.8]. Unanimous-band precision is 89.14% **[81.0, 96.0]**, roughly 4×
   wider than the naive Wilson interval. *No precision certificate can be issued from this fixture.*
2. **The 31 all-wrong rows are 8 sentences, and all 8 are label-ontology disputes** — billing vs general
   inquiry, billing vs technical support, feature request vs bug. They are not 31 independent model
   failures; they are 8 decisions repeated by templating.
3. **Therefore the cheapest accuracy in the project is a guideline, not a model.** Adjudicating 8 policy
   questions flips up to 31 rows. The 89.7% ceiling is conditional on gold being right; where the policy
   sides with the models, the ceiling moves for free.

This also sharpens the E1f design: the highest-value independent evidence is **the written label policy
plus adjudicated boundary cases** — not a fourth vendor.

---

## 3. The five levers that actually create headroom

### L1. Audit the 31, because some of them may not be errors (highest information per label in the project)

Every accuracy number here is measured *against gold label*, and gold has errors: Northcutt et al. (2021) estimate a mean of **3.3%** label errors across 10 benchmark test sets, **≥6%** in ImageNet val. On 300 records, ~10 mislabeled golds is entirely plausible.

If *k* of the 31 all-wrong records are actually gold errors, the achievable ceiling is `(269 + k)/300`. At k = 10 that is **93.0%** — still short of 95%, but it moves the baseline, changes which model looks best, and may reveal that the ceiling was never where you thought.

**This costs 31 human adjudications and settles more than any model purchase.** Do it before anything else. It is also the only way to know whether the remaining failures are ambiguity, multi-intent, or genuine model blindness.

### L2. Manufacture independent evidence (the only real path past 89.7%)

Aggregation cannot create information. Every member must see something the others do not. In descending order of expected value for this codebase:

1. **Retrieval grounding.** Retrieve the label policy / annotation guidelines and the nearest already-adjudicated cases; put them in *every* prompt. This is standard RAG but applied to the decision rule rather than the document, and it directly attacks shared ignorance. REIC (arXiv 2506.00210) is a usable template for retrieval-enhanced intent classification.
2. **Rules and heuristics as voters.** Lexicons, regexes, allowed-label sets, negation handling, required-field checks. Imperfect individually; independent by construction. This is classical weak supervision (Snorkel-style label model) applied to a small label space — exactly where it is strongest.
3. **A small local classifier trained on adjudicated gold.** A logistic probe on embeddings, or SetFit, is weak (~85%) but its errors are structurally *unlike* an LLM's. Its only job is to disagree usefully.
4. **Verifier pass with restricted information.** A fourth call that sees only the text and the proposed label and must produce a counterexample. Distinctly more useful than a re-ask, because it changes the question.
5. **Human adjudication concentrated on the all-wrong band**, not on low confidence.

Then measure only one thing: **does `c` drop?** Not macro-F1, not agreement, not judge win rates. If c does not fall, the added evidence is correlated and should be removed.

### L3. Disagreement is for routing, not for certification

Your measured separation is real and large: unanimous 88.8% precision vs 2-of-1 59.1%. Use it to decide **where humans spend time** — that is a genuine product win with a measured 30-point spread. Do not use it to claim quality.

### L4. The right certificate is finite-population, not conformal (corrected by W6)

**Conformal risk control is the wrong object for a precision floor.** CRC bounds `E[L] ≤ α`, an expectation, not `1−δ` high-probability error; and the natural selective loss bounds corpus error mass, so at acceptance rate r it licenses only `α/r` error among accepted — 10% at α=5%, r=0.5. It cannot certify "5% error among accepted at 95% confidence."

The correct instrument for a frozen version is an **exact finite-population (hypergeometric) bound on a design-randomised sample of the accepted set**, computed at the **template** level (conformal also fails exchangeability here: ICC = 0.762). Audit sizes, verified: **59 zero-error audits for 95%**, **51** if the population is exactly 300 sampled without replacement, **40 of 101 templates** under cluster sampling. Allowed errors 1–6 need 93 / 124 / 153 / 181 / 208 / 234 audits. With power planning: 124 audits if true precision is 99%, 234 if 98%, 601 if 97%, 2,698 if 96%.

**Blocking result: 95% is not certifiable on the current fixture at any coverage.** Sweeping every confidence-ordered prefix, the maximum one-sided Clopper–Pearson bound is **0.9402** (173 accepted, 5 errors, observed 0.9711). The design doc's "96% at 50% coverage" is a point estimate whose 95% lower bound is 0.9312. Certify **90%** today; fix the fixture before claiming 95%.

### L5. Fix the statistical protocol before adding any accuracy

Three concrete defects:

1. **Winner's curse.** `solve_threshold_for_precision` (`packages/dataset_ensemble/selection.py:83`) selects the largest accepted set whose Wilson lower bound clears the target, then returns *that same bound* as the certificate. Threshold selection and certification must use disjoint data: fit on gold half A, certify on a pre-registered random audit from half B.
2. **Nothing is bound to a version.** Evaluation runs store aggregates only, with no `dataset_version_id` or manifest hash, so paired tests (McNemar, DeLong, paired bootstrap) are impossible. Persist per-item outcomes and a prediction snapshot bound to the frozen manifest.
3. **Every number must carry uncertainty.** `packages/dataset_evaluation/metrics.py` returns bare floats rounded to 4 dp. At n = 50, "84%" is [71.5, 91.7]; at n = 500 it is [80.5, 87.0]. Return `{value, n, ci:{method, level, low, high}}` everywhere.

**Audit arithmetic (verified):** with zero errors, reliability floors certify at `0.05^(1/n)` — **59 clean audits for 95%, 299 for 99%**. A genuinely 96%-precise labeller needs ~1,215 audits by the plug-in (2,698 if planned for 80% power). The cost of certification is a direct function of how good you actually are — which is why L2 matters commercially, not just scientifically. Note also that `wilson_lower_bound` currently uses the two-sided multiplier, so the "95%" certificate is really a one-sided 97.5% bound: conservative, but mislabelled and it inflates audit sizes.

Note: the design doc's 130/260/1,445 audit sizes **are correct** under an unstated assumption (observed precision halfway between the floor and 1.0, one-sided 95% Wilson). R4's claim that they do not reproduce is wrong; its criticism that the assumption is unstated is right.

---

## 4. What "exceptional" means, subsystem by subsystem

| Subsystem | Current (audited) | Target state | Evidence base |
|---|---|---|---|
| Quality engine | 12 shallow rules; dHash mislabelled pHash; k-NN over character hashes | Confident learning over out-of-sample probe probabilities, gated on probe accuracy; exact hash for blocking; DINOv2/SemDeDup + MinHash for near-dup; leakage at cluster/group level | R2 |
| Evaluation | Bare floats; self-comparison; nothing persists | CI on every metric; paired, version-bound runs; evaluator named (COCO vs Ultralytics) | R4 |
| Active learning / coverage | Cluster map collapses to (0,0); density hard-coded 1.0 | Frozen embeddings (DINOv2 ViT-S/14 image, BGE-small text, both ONNX); TypiClust cold start → BADGE; real coverage metrics | R5 |
| Auto-labelling | Generic provider prompts | Grounding DINO Swin-T **46.7** zero-shot AP (not 52.5 — Swin-L is 52.5), OWLv2 fallback, SAM 2.1 box-prompted, SigLIP 2 classification; all `pending_review` | R3 |
| Synthetic data | Fake generator; gate correctly rejects | Grounded paraphrase at ≤30% per class, NLI + independent verifier, downstream delta on frozen gold | R6 |
| Versioning/export | Manifest hashes random id + wall clock; ZIP determinism fix uncommitted | JCS statement bytes in CAS; Ed25519 + Merkle; `ver_` derived from content; fail-closed preflight | R8 |
| Rights/provenance | Unknown defaults; auto-approved synthesis; "Platform Verified" in COCO | Append-only rights ledger; `NOASSERTION` not `NONE`; three-valued gate; intended-use declaration | R9 |
| Competitive position | Feature parity in annotation; nothing certified | Own the **certificate**, the **correlated-error audit**, and **provenance-as-data** | R7 |

### The market gap (R7, verified against vendor pages on 2026-11-04)

Annotation is commoditised. Label Studio and CVAT are healthy and permissively licensed; in both, consensus, quality analytics, audit logs and immutable versions are **Enterprise-only** — that is the incumbents' monetisation line. No open tool, and no commercial one at self-serve pricing, sells a defensible **certificate of auto-label precision**: CVAT samples 5–15% for QA but reports no confidence intervals; Cleanlab flags suspected errors but is a library, not a gate; Kili sells human QA, not statistical certification. **Correlated-error auditing does not exist as a product anywhere.**

That is your whitespace. Not "we have an ensemble" — everyone has an ensemble. **"We tell you, with a confidence interval, exactly how good your labels are, and we refuse to publish when we cannot prove it."**

---

## 5. Ranked plan with pass/fail gates

**Phase 0 — free, ~1 day, no model calls**
- Adjudicate the 31 all-wrong records. Record true label, ambiguity verdict, and whether gold was wrong.
- Fix `_phi` returning 0.0 on a constant error vector (reports "independent" exactly when saturated).
- Add a monotonicity test for confidence ranking; refuse threshold solving when it fails.
- Gate: publish `c`, `k`, corrected ceiling, and the adjudication log.

**Phase 1 — free, stored votes**
- E1e: cross-fitted stacker over the 900 stored votes. Expected to fail. Run it to close the branch with evidence, not opinion.
- Gate: no shipping unless it beats the best single by ≥1.5 pts with a paired test.

**Phase 2 — the real experiment**
- E1f: add three independent sources (retrieval of policy + adjudicated cases; a rule set; a small local probe). Same 300 records.
- Gate: `c` drops from 10.3% to **≤7%** (which is what 95% requires, given the 16/31 arithmetic). Report φ before/after.

**Phase 3 — certification**
- Disjoint select/certify splits; one-sided Clopper-Pearson; pre-registered audit; bind results to `dataset_version_id`.
- Gate: a certificate the team would defend in review — target, n, method, interval, and the exact audits that produced it.

**Phase 4 — quality engine replacement** (R2): confident learning gated on probe accuracy; blocking only on deterministic invariants; near-dup on embeddings; MinHash for text.
**Phase 5 — embeddings and coverage** (R5): real feature space, TypiClust/BADGE queues, honest coverage.
**Phase 6 — reproducibility** (R8): JCS + CAS + Ed25519 + fail-closed verify; the two-subprocess byte-identity test.
**Phase 7 — rights** (R9): ledger, three-valued gate, no "cleared" language.
**Phase 8 — synthetic** (R6), last and smallest: grounded paraphrase only, ≤30% per class, downstream delta or discard.

---

## 6. Claims to retire now

| Claim in tree | Why it must go |
|---|---|
| "Up to 10% of labels are wrong" (`NEW_COMPETITOR_KILLER_FEATURES.md` §1) | Verified mean is **3.3%**; CIFAR-10 is 0.54%. And a K=7 neighbour heuristic is not confident learning. |
| "Sobel edge-snap (<150 ms)" | Not Sobel; no benchmark exists. |
| "Zero external telemetry" | Google Fonts load in `index.html`. |
| "Keys are stored securely" | XOR with a committed salt; 9–11 chars reconstructable. |
| "300 requests / 60 seconds" | No such limiter exists. |
| Any "beyond human" accuracy claim | Falsified by your own experiments. The supportable claim is *certified precision at a floor*. |
| "Legally cleared" / "training-safe" | Detection proves text identity, not ownership or authority. |

The honest headline is not weaker — it is **rarer**: *"We measured our error rate, we know which errors are shared, and we refuse to publish what we cannot certify."*

---

## 7. Corrections made to the research reports

| Report | Claim | Verdict |
|---|---|---|
| R3 | "Grounding DINO Swin-T, **52.5** COCO AP zero-shot" | **Wrong.** Paper Table 2: Swin-T = **46.7**, Swin-L = **52.5**. The abstract quotes 52.5 without naming the backbone. |
| R4 | "130/260/1,445 audit sizes do not reproduce" | **Wrong.** They reproduce exactly under one-sided 95% Wilson with observed precision at (1+floor)/2: 0.9084 / 0.9535 / 0.9909. |
| R10 | "Noisy Student 85.0 → 88.4" | **Imprecise.** Abstract states 88.4% = +2.0 over prior SOTA; 85.0% is the supervised EfficientNet-B7 teacher. Direction correct. |
| R7 | Turn-limit failure | Report is nevertheless complete (4,004 words) and independently re-derived the hard.db numbers. |
| Master dossier | C6 "ZIP stamps wall-clock" | Correct for commit `37d5d05`; **already fixed in the uncommitted working tree**. The dossier is a HEAD snapshot, not a desk snapshot. |

---

## 8. Reading order

| File | Why read it |
|---|---|
| `R1-correlated-error-ceiling.md` | The core theory and the only path past the ceiling |
| `R10-quantified-gains.md` | What interventions provably work, with effect sizes |
| `R2-label-quality-dedup-leakage.md` | Measured dHash degeneracy + CL probe-accuracy gate |
| `R4-evaluation-statistics.md` | The statistics cookbook and the winner's-curse defect |
| `R5-active-learning-coverage.md` | Embeddings, AL, honest coverage |
| `R3-autolabeling-modalities.md` | Model stack and licence traps (correct 46.7 AP) |
| `R6-synthetic-data.md` | When synthesis helps, and the real collapse conditions |
| `R8-data-infrastructure.md` | Byte-reproducible exports, tamper evidence |
| `R9-rights-provenance.md` | Rights ledger and the language the product may not use |
| `R7-competitive-landscape.md` | What exists, what is Enterprise-gated, where the gap is |

**Canonical short reading list (primary sources):** Kim et al. 2025 (arXiv 2506.07962); *Nine Judges, Two Effective Votes* (arXiv 2605.29800); Northcutt et al. 2021 (arXiv 2103.14749); Angelopoulos et al. conformal risk control (arXiv 2208.02814); Lee et al. 2021 dedup (arXiv 2107.06499); Sener & Savarese 2018 core-set; Ash et al. 2020 BADGE; Shumailov et al. 2024 model collapse.
