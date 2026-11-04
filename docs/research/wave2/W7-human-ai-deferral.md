# W7 — Human–AI Collaboration, Deferral, and Complementarity

**Date:** 2026-11-04
**Scope:** learning to defer; human–AI complementarity; automation bias/anchoring in annotation; human accuracy baselines; measured AI-assisted productivity; adjudication design; documented "beyond human" cases; a deferral policy for this codebase.
**Method:** primary sources fetched and read; repo numbers recomputed from `repo/data/hard.db` (300 records, 4 classes, 900 votes, 3 models); code read in `dataset_ensemble/`, `dataset_core/db/models.py`, `routes/review.py`.
**Tags:** `[P]` peer-reviewed/published · `[R]` re-derived from repo data · `[I]` inference/derivation · `[U]` unverified.
**Non-duplication:** R1 owns the correlated-error ceiling, R4 the statistics, R2 label quality. This report asks: *given that aggregation is capped, what does the human contribute, and how do we buy it correctly?*

---

## 1. Executive summary

The governing fact is arithmetic, not psychological. Let `m(x)` be the model's probability of being correct on item `x`, `h(x)` the human's. If we auto-accept set `A` and defer set `D` to a human whose label is final:

> **Team accuracy = E[1_{x∈A}·m(x)] + E[1_{x∈D}·h(x)]**

Deferral beats the model alone **iff** `E[1_D·(h(x) − m(x))] > 0`. Every claim about "human–AI teams" reduces to whether the human is more accurate than the model *on exactly the items you chose to defer* `[I]`. This is the Bayes-optimal rule of the learning-to-defer literature in one line `[P]` (Chow 1970; Mozannar & Sontag 2020).

That reframing matters because the naive version usually fails. Across 106 experiments and 370 effect sizes, human–AI combinations performed **worse** than the better of human-alone or AI-alone: Hedges' **g = −0.23 [−0.39, −0.07]**; on decision tasks (where annotation sits) **g = −0.27 [−0.44, −0.10]**; and when the AI alone beat the human alone, the combination lost **g = −0.54 [−0.71, −0.37]** `[P]` (Vaccaro et al., *Nature Human Behaviour* 2024). Teams won only where the human was already stronger (**+0.46 [0.28, 0.66]**).

The escape hatch is narrow and testable. When researchers *matched* AI accuracy to human accuracy, every team condition achieved complementary performance — Beer: human 0.82 ± 0.09, AI 0.84, team with a confidence score 0.89 ± 0.05; explanations added nothing over confidence `[P]` (Bansal et al., CHI 2021). We sit in that band: best single model 87.33%, plurality 86.67% `[R]`.

Hence the core recommendation, which is counter-intuitive: **do not put a human "in the loop" over the model's output.** The measured effect of that pattern is homogenisation, not quality. In a pre-registered experiment with 410 annotators and 7,000+ annotations, showing crowd workers LLM suggestions **did not make them faster** (54.3 s → 78.0 s per item, a 44% *slowdown*), collapsed label diversity (5-of-5 consensus **8% → 38%**), and pushed crowd–LLM overlap to **81–87%** at the 3-of-5 threshold — which then inflated the LLM's measured accuracy `[P]` (Schroeder et al., arXiv 2507.15821, 2025).

What beats one annotator at the same cost is a **blind three-band deferral policy**, sized by an explicit cost model and certified on data disjoint from threshold selection:

| Policy | Labels/item | Accuracy | vs best single model (0.8733) |
|---|---|---|---|
| Best single model | 0.00 | 0.8733 `[R]` | — |
| Plurality of 3 | 0.00 | 0.8667 `[R]` | −0.7 pts |
| **Defer lowest 20%; 2 blind annotators + adjudication on disagreement; 10% audit** | **0.55** | **0.936** `[I]` | **+6.3 pts** |
| Defer lowest 30%; 3 annotators + 10% audit | 1.00 | 0.943 `[I]` | +7.0 pts |

The bar the panel must clear is low and measurable: **>65%** on the deferred 20% band, where the model is at **61.7%** `[R]`; **>78.3%** to beat a single annotator at 90% `[I]`. The main risk (§6.5) is that the deferred band selects for *item ambiguity* rather than *model weakness*, in which case human accuracy collapses exactly where it is needed.

---

## 2. Breakthrough candidates

**B1 — Blind-first, defer-second, adjudicate-on-disagreement.** Removes anchoring by construction; converts human time from "review everything" to "label the 20% that matters"; produces *independent* human evidence. Support: the homogenisation result `[P]`, the complementarity condition `[I]`, and the 2-blind-plus-adjudication arithmetic (§6.3).

**B2 — Make deferral falsifiable per batch.** Humans label every deferred item, so we observe both `m(x)` and `h(x)` on `D` for free and can test `h > m on D` every batch — the exact condition for deferral to help. If it fails, collapse to model + audit and lose only the audit. `[I]`

**B3 — The certification audit doubles as the complementarity estimator.** Blind-labelling a random audit of `A` yields the counterfactual there: items right for the wrong reason, and missed deferrals the confidence gate never routed. One sample, two jobs. `[I]`

**B4 — Calibrate before routing.** Mean self-reported confidence is 0.9155 against accuracy 0.8667, **ECE = 0.0616**, with a non-monotone reliability curve (0.7-conf bin 50.0% accurate; 0.6 bin 87.5%) `[R]`. `calibration.fit_temperature` exists but `selection.route_votes` consumes raw confidence `[R]`. A deferral rule on an uncalibrated score is not a deferral rule.

**B5 — Latent truth with a correlation correction, later.** Dawid–Skene `[P]` fits heterogeneous raters, but its independence assumption fails here (`n_eff = 1.17`, R1) and failure makes it *more* confident, not less. Build it only with a shared-error component for models, and only once B1–B3 produce multi-human data. `[I]`

---

## 3. Findings with numbers

### 3.1 Learning to defer: what is proven

**Theory.** Chow (1970) characterised the optimal error–reject tradeoff: reject when the maximum posterior falls below a threshold set by the cost ratio `[P]`. Madras et al. (NeurIPS 2018) generalised rejection to *deferral* and showed the system can be both more accurate and less biased even with inconsistent or biased downstream humans `[P]`. Mozannar & Sontag (ICML 2020) proved the important negative: train-a-classifier-then-threshold-its-confidence is **statistically inconsistent** under the L2D objective; they give a consistent cost-sensitive surrogate `[P]`.

**Hardness.** Mao et al. (AISTATS 2023) proved that finding a linear classifier-and-rejector pair with low error is **NP-hard even in the realizable setting**, and that prior approaches can fail to find a zero-error system when one exists. They give an exact MILP that scales only to moderate problems, plus a realizable-consistent surrogate `[P]`. Practical reading: *learning* a policy is unsolved; *evaluating* one is trivial. With 4 classes and two thresholds, solve the decision problem exactly on a calibration split. `[I]`

**Multiple experts.** Keswani, Lease & Kenthapadi (AIES 2021) extend deferral to experts with different domains and biases, with real crowdsourced content-moderation labels `[P]`. Verma/Narasimhan et al. (AISTATS 2023) give two consistent multi-expert surrogates, show the softmax form propagates miscalibration between experts while one-vs-all does not, and add a **conformal** method for choosing which experts to query `[P]` — directly usable for "does this item need a second human?".

**What is not proven.** No paper in this literature demonstrates complementarity on a real annotation workflow with a strong model. Consistency results concern the *estimator*; none guarantees a human is better than the model anywhere. `[I]`

### 3.2 Complementarity: when teams beat their best member

**Vaccaro, Almaatouq & Malone (2024).** 106 experiments, 370 effect sizes. Combinations vs the better member: **g = −0.23 [−0.39, −0.07]**, t(92) = −2.89, p = 0.005. Moderators `[P]`:

| Moderator | g | 95% CI |
|---|---|---|
| Decision tasks (finite options) — ~85% of effect sizes | **−0.27** | [−0.44, −0.10] |
| Creation tasks (open response) — ~10% | +0.19 (n.s., p = 0.18) | [−0.09, 0.48] |
| Human alone > AI alone | **+0.46** | [0.28, 0.66] |
| AI alone > human alone | **−0.54** | [−0.71, −0.37] |

Fixed-label annotation is a decision task, and this is the most hostile result in the literature for "human-in-the-loop improves quality".

**Bansal et al. (CHI 2021)** is more useful than its reputation. Their review of prior explanation studies found **"complementary performance was not observed in any of these studies — in each case, adding the human to the loop decreased performance compared to if AI had acted alone."** They then *deliberately matched* AI to human accuracy (Beer: human 0.82 ± 0.09, AI 0.84) and ran 1,626 users across three datasets. Result: **all** team conditions were complementary — Team(Confidence) reached **0.89 ± 0.05**, beating both AI (0.84) and human (0.82); relative gains of **2.2%** (Amzbook) and **20.1%** (LSAT). Explanations gave no significant improvement over confidence (Beer 0.89 vs 0.88, z = −1.18, p = .24) `[P]`.

Three consequences: complementarity is real but confined to a band where neither member dominates; the mechanism is *confidence display*, not explanation; and when the model is stronger than the human — our situation — the expected team outcome is a loss unless the human is positioned where they are stronger.

### 3.3 Automation bias and anchoring — why "review the AI's label" is the wrong workflow

**Goddard, Roudsari & Wyatt (*JAMIA* 2012)**, systematic review: 13,821 screened, **74 included** `[P]`. Most decision-support systems are **80–90% accurate**, and occasional wrong advice "may tempt users to reverse a correct decision they have already made"; in one included study, **when the CDSS was in error it increased the risk of an incorrect decision by 26%**. Signatures are errors of **commission** (following wrong advice) and **omission** (failing to act without a prompt). **Mitigators**: training, emphasising accountability, the *position* of advice, **updated confidence levels attached to output**, and **provision of information rather than a recommendation**. The last two cost nothing: show evidence and a calibrated number, not a verdict.

**Annotation-specific evidence is worse, because the task is subjective.** Schroeder, Roy & Kabbara (2025), pre-registered, **410 annotators, 7,000+ annotations**, 3 assistance conditions × 2 models × 2 datasets `[P]`:

| Outcome | Result |
|---|---|
| Time per annotation, baseline | 54.3 s |
| Time, text-based LLM suggestion | **78.0 s (+44%)** |
| Time, pre-filled LLM label | 66.2 s (+22%) |
| Self-reported confidence | significantly **up** in all assistance conditions |
| Crowd–LLM label overlap at 3/5 | **81–87%** |
| 5-of-5 unanimous consensus | **8% → 38%** |
| Evaluated LLM performance | significantly **inflated** on assisted labels |

They also note Overney et al. (2024) found qualitative coders with AI suggestions **spent longer**, replicating the direction.

This is the single most important study here for our product. "Human reviews the model's suggestion" produces no speedup, more confidence, less diversity, and a self-fulfilling evaluation. A platform that sells "AI-assisted annotation with human verification" and measures accuracy against those verified labels is measuring its own reflection.

**Countermeasure evidence.** Buçinca, Malaya & Gajos (CSCW 2021, N = 199): cognitive forcing functions — committing to a judgement before seeing the AI — **significantly reduced overreliance** relative to explainable-AI interfaces. Trade-off: participants gave the *least favourable subjective ratings* to the designs that reduced overreliance most, and the benefit concentrated in people high in Need for Cognition `[P]`. The intervention that works makes the product feel worse, unevenly. Explanations do not fix it: Buçinca notes they "do not appear to reduce the overreliance and some studies suggest that it might even increase it", and Bansal found explanations ≈ confidence `[P]`. Do not build explanations expecting a quality gain.

### 3.4 Human accuracy baselines

**Crowd ≠ expert, quantified.** Snow et al. (EMNLP 2008) `[P]`: on word-affect annotation the average expert inter-annotator correlation was **0.603** while averaging **10** non-experts reached **0.694**; the minimum non-experts needed to match **one** expert was **2** (anger, disgust, joy), **7** (valence), **9** (sadness); for **fear**, 10 never reached the expert (0.711 vs 0.689). Averaged: **k = 4** non-experts ≈ 1 expert (0.613 vs 0.603). Adding non-expert labels **improved** the gold standard in at least one case where the expert label was wrong. So "4 crowd ≈ 1 expert" is the right order of magnitude — and for some categories substitution never works. Our deferred band is selected for difficulty, i.e. the fear-analogue.

**Agreement is task-dependent and often mediocre.** Gilardi et al. (PNAS 2023): average pairwise agreement **56% MTurk**, **79% trained annotators**, **91% ChatGPT (T=1)**, **97% (T=0.2)** `[P]`. High model self-agreement is *consistency*, not correctness — and consistency is what makes a model dangerous as a pseudo-label source: it has consistent errors. Gold also contains errors: Northcutt et al. (NeurIPS 2021) find mean **3.3%** label errors across ten test sets and **≥6%** in ImageNet val `[P]` (verified in the synthesis). On 300 records, ~10 mislabeled golds is plausible — which is why the 31 all-wrong records must be adjudicated before any human baseline is computed.

**Disagreement is signal.** Plank (EMNLP 2022); Uma et al. (JAIR 2021, 72:1385–1470) `[P]`. On subjective categories a single "gold" label is a *sample* from a distribution; a large fraction of the 31 all-wrong items may be defensible model answers. Adjudication must record `{true label, ambiguity verdict, gold_was_wrong}`, not just a correction.

### 3.5 Productivity: measured, not claimed

Two studies, opposite directions, and the difference is the task.

**Where pre-annotation works.** Lingren et al. (*JAMIA* 2014), clinical NER, 1,400 trial announcements, double-annotated `[P]`: dictionary pre-annotation gave **time savings of 13.85%–21.5% per entity**, significant on every experiment pair, with IAA **93.4–95.5%** and **no** significant bias.

**Where it does not.** Schroeder et al. 2025, subjective thematic coding: **+44% time**, no quality benefit, homogenisation `[P]`.

**The discriminator** is whether the annotation is a *localisable, checkable* decision (a span is there or not; 93–96% IAA) or a *categorical judgement under ambiguity* (low IAA, no objective check). NER pre-annotation is verification; thematic coding is judgement. Four-way support-ticket intent sits in the second category — "feature_request" vs "general_inquiry" is a policy question, not a fact. **The widely-quoted "2–10× speedup from AI pre-labelling" is therefore a span-detection number that does not transfer.** The honest expectation for text-category labelling with suggestions is **0% to −40%**. `[P]` for the two studies; `[I]` for the transfer judgement.

### 3.6 Adjudication design

No high-quality head-to-head trial answers "majority of 3 vs expert adjudication vs discussion" for text classification. The arithmetic is decisive enough to design against.

**Condorcet (`[I]`).** With `k` conditionally independent annotators at accuracy `p`, majority accuracy is the binomial tail. At `p = 0.85`: 1 annotator 0.850; 3 → **0.939**; 5 → **0.973**. The 1→3 step buys **+8.9 pts**; 3→5 buys **+3.4**; 5→7 buys **+1.1**. Marginal return collapses geometrically. Fragility: at `p = 0.70`, three annotators give only **0.784**.

**Adjudication beats majority at lower cost (`[I]`).** Two blind annotators, senior adjudicator only on disagreement:

| Per-annotator acc. | P(disagree) | P(correct \| agree) | 2 + adjudication | cost | 3-way majority | cost |
|---|---|---|---|---|---|---|
| 0.80 | 0.320 | 0.941 | **0.944** | 2.32 | 0.896 | 3.00 |
| 0.85 | 0.255 | 0.970 | **0.965** | 2.25 | 0.939 | 3.00 |
| 0.90 | 0.180 | 0.988 | **0.981** | 2.18 | 0.972 | 3.00 |

Two-plus-adjudication dominates on **both** axes, because the adjudicator is spent only where information is missing. It degrades gracefully (the p = 0.80 row) rather than catastrophically.

**"How many annotators?"** is a cost ratio, not a constant. With per-label cost `c` and error cost `L`, minimise `L·P_err(k) + k·c`; the optimum is the smallest `k` where marginal error reduction falls below `c/L`. For realistic budgets that is `k = 2` plus adjudication, or `k = 3` without. `[I]`

**Latent truth with humans and models.** Dawid & Skene (1979) gives each annotator a confusion matrix and treats the true label as latent `[P]`. Two constraints: (i) it assumes conditional independence given the truth, which our data violate (`n_eff = 1.17`, `φ ≈ 0.78`, R1) `[R]`; (ii) three models sharing training data and prompts have near-identical confusion matrices, so DS rates them highly and the human lowly *exactly when they agree and are both wrong*. Fit naively, DS certifies the all-wrong mass. `[I]`

### 3.7 "Beyond human": the documented cases

Deflationary by design.

**Case 1 — Gilardi et al. (PNAS 2023).** ChatGPT exceeded MTurk by **~25 pp** on 2,382 tweets, measured **against trained annotators** — but ChatGPT's own accuracy ranged **59%–83%** `[P]`. A crowd-replacement result, not a beyond-human result.

**Case 2 — McKinney et al. (*Nature* 2020), mammography.** Superhuman on a defined metric: AUC **+11.5 pts** over the average of six radiologists, FP **−5.7%/−1.2%** and FN **−9.4%/−2.7%** (US/UK) against biopsy-verified outcomes; in the double-reading simulation it was non-inferior while cutting second-reader workload **88%** `[P]`. Conditions: verifiable endpoint, perceptual task, curated training set, deployed as the **second** reader.

**Case 3 — AlphaFold2 (Jumper et al., *Nature* 2021).** Accuracy "competitive with experimental structures in a majority of cases and greatly outperforming other methods" at CASP14 `[P]`: physically verifiable target, objective score, blind benchmark.

**Case 4 — label-error discovery (Northcutt et al. 2021).** Confident learning found errors human curators missed `[P]`. Note the direction: the AI out-*audited* humans, using agreement structure humans cannot see — it did not out-annotate them.

**The rule (`[I]`):** documented, replicated cases of AI exceeding human annotation accuracy occur when (a) ground truth is mechanically verifiable independent of both parties, (b) the task is perceptual or retrieval-like rather than judgemental, and (c) the AI is deployed as a second opinion or auditor, not as a replacement for primary judgement. **No replicated case exists of an AI exceeding trained human annotators on a subjective categorical task with contested boundaries.** For four-way intent classification the supportable claim is "certified precision at a floor, at lower cost".

### 3.8 What our own data says

Recomputed from `data/hard.db` `[R]`:

| Quantity | Value |
|---|---|
| Best single model (gpt-6-luna) | 262/300 = **0.8733** |
| Plurality of 3 | 260/300 = **0.8667** |
| Unanimous band (3/3) | n = 267, precision **0.8914** |
| 2-of-3 band | n = 32, precision **0.6562** |
| Oracle (≥1 correct vote) | 269/300 = **0.8967** |
| All-wrong | 31/300 = **0.1033** |
| Mean self-reported confidence | **0.9155** (accuracy 0.8667) |
| ECE, 10 equal-width bins | **0.0616** |
| Reliability, 0.7-conf bin | conf 0.766, accuracy **0.500** (n = 6) |
| Reliability, 0.8-conf bin | conf 0.869, accuracy **0.712** (n = 73) |
| Reliability, 0.9-conf bin | conf 0.950, accuracy **0.934** (n = 211) |

The confidence score is unusable as a routing signal without recalibration: two of three populated bins are inverted relative to neighbours, and the ensemble is overconfident by 4.9 points overall. Concrete defect: `calibration.fit_temperature` exists but `selection.route_votes` consumes `aggregated.confidence` raw.

Deferral arithmetic on the same records: the model is **70.0%** accurate on the lowest-confidence 10%, **61.7%** on the lowest 20%, **71.1%** on the lowest 30%, and **76.7%** on the lowest 50% `[R]`. It catches **18 of 31** all-wrong records at 30% deferral and **26 of 31** at 50%. This is why deferral, unlike aggregation, can break the 89.67% oracle ceiling — the human is new information. The synthesis's ceiling is an *aggregation* ceiling and does not bound a system that buys evidence.

The load-bearing number is the 61.7%: break-even for the panel is ~**65%** `[I]` — a low bar, and simultaneously a warning: a band where the model is at 61.7% is a band of genuinely ambiguous items, where humans are also worse than average.

---

## 4. Evidence table

| Study | Venue / year | Effect (with n) | Setting | Replication |
|---|---|---|---|---|
| Vaccaro, Almaatouq & Malone | *Nature Human Behaviour* 2024 | Teams vs best member **g = −0.23** [−0.39, −0.07]; decision **−0.27** [−0.44, −0.10]; AI>human **−0.54**; human>AI **+0.46**. 106 studies / 370 effects | Meta-analysis | Single meta-analysis; high heterogeneity |
| Bansal et al. | CHI 2021 | 1,626 users; matched-accuracy → **all** teams complementary: Beer human 0.82±0.09, AI 0.84, team 0.89±0.05; LSAT +20.1% rel.; explanations ≈ confidence (p=.24) | Crowd decision tasks | Prior 5 studies (their Table 1): **no** complementarity |
| Schroeder, Roy & Kabbara | arXiv 2507.15821, 2025 | 410 annotators, 7k+ labels; 54.3 s → **78.0 s** (+44%); 5/5 consensus **8%→38%**; crowd–LLM overlap **81–87%**; inflated model eval | Subjective coding, pre-registered | Replicates Overney 2024 (slower) |
| Goddard, Roudsari & Wyatt | *JAMIA* 2012 | 74/13,821 studies; CDSS error → **+26%** risk of wrong decision; mitigators incl. confidence display, information-not-recommendation | Clinical DSS review | Broad, multi-field; no single RCT |
| Gilardi, Alizadeh & Kubli | *PNAS* 2023 | ChatGPT **+25 pp** over MTurk; IAA 56%/79%/91–97%; ChatGPT accuracy 59–83% vs trained gold | 2,382 tweets | Consistent with later crowd-vs-LLM work; **not** vs experts |
| Snow et al. | EMNLP 2008 | **k=4** non-experts ≈ 1 expert (0.613 vs 0.603); fear never matches (0.711 vs 0.689 at k=10) | Affect, RTE, WSD | Foundational, widely reused |
| Lingren et al. | *JAMIA* 2014 | Pre-annotation **13.85–21.5%** time saved per entity; IAA 93.4–95.5%; no bias. 1,400 docs | Clinical NER (verifiable spans) | Direction replicated in NER |
| Mozannar & Sontag | ICML 2020 | Naive confidence-thresholding **inconsistent**; consistent cost-sensitive surrogate | Theory + experiments | Theorems; empirics task-specific |
| Mao et al. | AISTATS 2023 | Linear classifier+rejector low-error is **NP-hard even realizable**; MILP exact but limited | Theory | Proofs; uncontradicted |
| Verma/Narasimhan et al. | AISTATS 2023 | Consistent multi-expert surrogates; softmax propagates miscalibration, OvA does not; conformal expert-subset selection | Galaxy, skin lesion, hate speech | Single group; 3 tasks |
| Keswani, Lease & Kenthapadi | AIES 2021 | Multi-expert deferral improves accuracy & fairness with biased experts | Content moderation | Synthetic + one real set |
| Buçinca, Malaya & Gajos | CSCW 2021 | N=199; cognitive forcing **reduces overreliance** vs XAI, but worst subjective ratings; benefit in high Need-for-Cognition | Crowd decisions | Direction replicated |
| McKinney et al. | *Nature* 2020 | FP −5.7%/−1.2%, FN −9.4%/−2.7%; AUC **+11.5 pts**; **second-reader workload −88%** | Mammography, biopsy-verified | Independent UK and US sets; not a prospective RCT |
| Jumper et al. | *Nature* 2021 | "competitive with experimental structures in a majority of cases", CASP14 | Protein structure | Blind held-out benchmark |
| Northcutt et al. | NeurIPS 2021 D&B | **3.3%** mean label errors / 10 sets; **≥6%** ImageNet val | Benchmark audit | Re-analysed widely |
| Plank; Uma et al. | EMNLP 2022; JAIR 2021 | Human label variation is often signal, not noise | Position + survey | Field consensus |
| **This repo** (`hard.db`) `[R]` | 2026-11-04 | Best single 0.8733; plurality 0.8667; all-wrong 10.33%; ECE 0.0616; model 61.7% on lowest-20% band | 300 records, 4 classes, 3 models | n=300, CIs ±~4 pts |

---

## 5. Hype and dead ends

**H1 — "Human-in-the-loop review improves label quality."** Falsified as a general claim: meta-analytically negative on decision tasks `[P]`; in annotation it produces adoption and homogenisation without speedup `[P]`. Review is a *governance* mechanism — accountability and an audit trail — not a quality mechanism.

**H2 — "AI-assisted annotation gives 2–10× speedup."** Vendor numbers trace to span/localisation tasks. The one controlled subjective-task comparison shows **−44%** `[P]`; the best honest NER number is **14–22%** `[P]`.

**H3 — "Explanations fix overreliance."** Two independent lines find explanations no better than confidence `[P]`, with some evidence they *increase* overreliance. Not a quality feature.

**H4 — "Learning to defer finds the optimal policy."** NP-hard in the general linear case `[P]`; surrogates only realizable-consistent; consistency is about estimation, not about whether deferral helps. For two thresholds and four classes, grid-search a calibration split. `[I]`

**H5 — "Fleiss' κ / agreement is a quality metric."** Agreement is *consistency*; a model at 97% self-agreement is not 97% correct. `fleiss_kappa` over model votes `[R]` measures convergence, and convergence among correlated models is the failure mode.

**H6 — "Majority of 3 is optimal."** Optimal only for a given cost ratio under an independence assumption annotators violate. Adjudication-on-disagreement dominates on both axes (§3.6). `[I]`

**H7 — "Dawid–Skene recovers truth from mixed human/model votes."** Not with `φ ≈ 0.78` `[R]`: violating independence makes DS *more* confident. Validate against held-out human adjudication before its posteriors route anything.

**H8 — "Beyond human" as a product claim.** No replicated case on subjective categorical annotation (§3.7). Retire the phrase; keep the certificate.

**Dead end worth naming:** a "model disagreement" review queue sold as quality assurance — 75.6% of errors sit in the unanimous band `[R]`, and disagreement routing reaches ~24% of mistakes.

---

## 6. Deferral design for this codebase

### 6.1 Decision rule

Let `p̂(y|x)` be the **calibrated** posterior (temperature-scaled per model, then pooled — not the raw confidence `route_votes` consumes today), `p̂*(x) = max_y p̂(y|x)`, and `q(x) = P(panel correct | x)`, estimated by a **monotone (isotonic) fit** on `p̂*` plus class identity from a small human-labelled calibration sample — not a flexible model on 300 points.

The Bayes-optimal rule `[I]`, following Chow 1970 `[P]`:

```
defer(x)  ⟺  q(x) − p̂*(x) > λ · c_h
```

where `c_h` is human label cost and `λ` the marginal rate at which the product trades accuracy for labels. `λ` is a product decision; publish it.

Since `q` is monotone in `p̂*`, the rule is realised as a **three-band policy** calibrated once per class:

| Band | Condition | Action | Cost |
|---|---|---|---|
| **AUTO_ACCEPT** | `p̂* ≥ τ_hi`, and the accepted mass is certified on a disjoint audit | Ship model label + certificate | 0 |
| **HUMAN_PANEL** | `τ_lo ≤ p̂* < τ_hi` | **Two blind annotators**; adjudicate only on disagreement | ~2.3 |
| **AMBIGUOUS** | `p̂* < τ_lo` | Two blind annotators + mandatory adjudication; record `{label, ambiguity, gold_was_wrong}` | ~3 |

`τ_hi` is solved for the precision floor exactly as `selection.solve_threshold_for_precision` does — **but fitted on split A and certified on split B** (the winner's-curse defect, synthesis L5). `τ_lo` is the `p̂*` below which `q` becomes unreliable: estimate it as the point where the calibration sample's observed pairwise *human* disagreement exceeds 0.30.

Two hard constraints, both from the evidence: (1) **human labels must be blind** — the task shows the text and the label set, never the model's guess, the only intervention with direct measured support for preserving independence (§3.3) `[P]`; (2) **no pre-filled label, no pre-selected default** — pre-filling produced the largest homogenisation effect (8% → 38% unanimity) `[P]`.

### 6.2 Cost model

Baseline today: one human label per record = **1.00 label-units/item**.

```
C = D · k_eff + a ,     k_eff = 2 + P(disagree) ,     P(disagree) = 2p(1−p)
```

with deferred fraction `D`, audit fraction `a`, per-annotator accuracy `p` (so `k_eff = 2.255` at `p = 0.85`). Reference points on our data `[R]`/`[I]`:

| D | Precision on kept | Panel acc. (2+adj, p=0.85) | Team accuracy | Cost (a=0.10) |
|---|---|---|---|---|
| 0.10 | 0.885 | 0.965 | 0.893 | 0.33 |
| **0.20** | **0.929** | **0.965** | **0.936** | **0.55** |
| 0.30 | 0.933 | 0.965 | 0.943 | 0.78 |
| 0.50 | 0.967 | 0.965 | 0.966 | 1.23 |

Recommended: **D = 0.20** — 0.55 label-units/item (45% cheaper) at ~0.936 accuracy.

Break-even conditions, stated so they can be tested `[I]`: beats the **best single model** iff panel accuracy on `D` > **0.650**; beats a **single annotator at 0.90** iff > **0.783**; beats a **single annotator at 0.95** — impossible at this depth (would need > 1.03). Beyond roughly **0.94** single-annotator accuracy, deferral cannot win; audit the model instead.

That last line is the most important honest statement here: **deferral is not universally better.** It wins when the single annotator is mediocre-to-good (0.80–0.92) and the panel is materially better than the model on the deferred band. Curlset's gold is single-annotator and imported, so its accuracy is unknown and probably in that band — which is why measuring it is the first task, not the last.

### 6.3 Why 2 + adjudication rather than 3 annotators

At per-annotator accuracy 0.85, 2-blind-plus-adjudication yields **0.965** at **2.25** units versus 3-way majority **0.939** at **3.00**, because the adjudicator is spent only where the two blind labels disagree. It also yields a clean artefact: every adjudication is a recorded disagreement with a reason — training data for guideline improvement.

Caveat to log with the implementation: the table assumes conditional independence, which real annotators violate (shared guidelines and training). Realised accuracy will be lower; the `p = 0.80` row is the realistic first-deployment case. `[I]`

### 6.4 The audit does double duty

The random audit of the auto-accepted band exists to certify precision at the floor (`selection.audit_sample_size`, synthesis L4). If it is **blind-labelled** it also yields human labels on items the model got right — the counterfactual we otherwise never see. That enables three things a confidence gate cannot: estimate `q(x)` on the accepted band (detecting items right for the wrong reason); estimate the **missed-deferral rate** (items inside `A` where the human was right — if it exceeds the audit's noise floor, `τ_hi` is too low); and test the complementarity assumption per batch (§6.5).

Rule: the audit is drawn uniformly at random from `A`, sized by one-sided Clopper–Pearson for the target floor, and labelled under the same blind protocol. Never reuse threshold-selection data for certification.

### 6.5 Failure conditions and kill switch

| Failure | Detector | Response |
|---|---|---|
| **Complementarity fails** — humans not better than the model on `D` | On `D` we observe both `m(x)` and `h(x)`; test `H0: h_D ≤ m_D` with a paired test on final panel labels | Collapse to AUTO_ACCEPT + audit; stop paying for the panel. A success of the design, not a failure |
| **Anchoring leaks** despite the blind protocol | Compare human–model agreement on `D` (blind) vs a historical assisted batch; a jump toward the model's label is the Schroeder signature (8% → 38% unanimity) | Audit the UI for pre-fill, default selection, ordering |
| **τ_hi drift** under distribution shift | Rolling audit's Wilson lower bound below the floor for two consecutive batches | Halt auto-accept, re-solve on fresh gold, re-certify |

The asymmetry that keeps this honest: on `D` both labels are observed, so the gain is *measured*; on `A` only the model is observed, so missed deferrals are *estimated* from the audit. Report both — reporting only the first is how deferral systems flatter themselves. `[I]`

### 6.6 Implementation surface

| Component | File | Change |
|---|---|---|
| Calibrated posterior | `packages/dataset_ensemble/calibration.py` | Apply `fit_temperature` per model before pooling; surface the calibrated distribution on `AggregatedLabel` |
| Deferral policy | new `packages/dataset_ensemble/deferral.py` | `estimate_panel_accuracy(rows)`; `route_three_band(aggregated, fit, tau_hi, tau_lo, lambda_, c_h)`; `break_even_human_accuracy(...)` |
| Routing | `packages/dataset_ensemble/selection.py`, `types.py` | `route_votes` gains the `AMBIGUOUS` band; `Band` gains `ADJUDICATE` |
| Blind protocol | `services/api/routes/review.py`, annotation view | Panel task payload must not carry the ensemble label; assert in a test |
| Persistence | `packages/dataset_core/db/models.py` | No schema change: `AnnotationModel` already allows many annotations per record with `origin`, `consensus_score` and per-actor revisions. Populate `consensus_score` from panel agreement |
| Cost accounting | `packages/dataset_ensemble/service.py` | Track `labels_consumed`; emit `cost_per_item` next to `yield_fraction` |

`route_votes` already forces `HUMAN_REVIEW` when `correlated_error_flagged` `[R]` — the right instinct, and the seed of the `AMBIGUOUS` band: records where models fail together are exactly records where model confidence carries no information.

### 6.7 Acceptance gates

1. **G1 — human baseline.** Blind-label 150 records with two annotators + adjudication. Report single-annotator accuracy, panel accuracy, and `q(x)` by confidence bin, with CIs (±~7 pts on 0.85 at n=150 — a baseline measurement, not a certificate). **Fail if** panel accuracy on the lowest-confidence 20% is ≤ 0.65: the complementarity condition does not hold and the design collapses to model + audit.
2. **G2 — cost win.** `C ≤ 0.60` label-units/item at `D = 0.20` with accuracy ≥ 0.90. **Fail if** the deferred band's realised panel accuracy is within 2 points of the model's accuracy on the same band.
3. **G3 — independence.** A/B the blind vs assisted protocol on 100 items. **Fail if** human–model agreement is within 5 points — the blind protocol is not blind.

---

## 7. References

Verified by reading the source for this report:

1. Chow, C. K. (1970). On optimum recognition error and reject tradeoff. *IEEE Trans. Information Theory*, 16(1), 41–46. `[P]`
2. Madras, D., Pitassi, T., & Zemel, R. (2018). Predict Responsibly: Improving Fairness and Accuracy by Learning to Defer. *NeurIPS 2018*. arXiv:1711.06664. `[P]`
3. Mozannar, H., & Sontag, D. (2020). Consistent Estimators for Learning to Defer to an Expert. *ICML 2020*, PMLR 119. arXiv:2006.01862. `[P]`
4. Keswani, V., Lease, M., & Kenthapadi, K. (2021). Towards Unbiased and Accurate Deferral to Multiple Experts. *AIES 2021*. arXiv:2102.13004. `[P]`
5. Mao, A., Mohri, M., & Suresh, A. T. (2023). Who Should Predict? Exact Algorithms For Learning to Defer to Humans. *AISTATS 2023*. arXiv:2301.06197. `[P]`
6. Verma, R., Barrejón, D., & Nalisnick, E. (2023). Learning to Defer to Multiple Experts: Consistent Surrogate Losses, Confidence Calibration, and Conformal Ensembles. *AISTATS 2023*, PMLR 206. arXiv:2210.16955. `[P]`
7. Vaccaro, M., Almaatouq, A., & Malone, T. (2024). When combinations of humans and AI are useful: A systematic review and meta-analysis. *Nature Human Behaviour*. arXiv:2405.06087. `[P]`
8. Bansal, G., Wu, T., Zhou, J., Fok, R., Nushi, B., Kamar, E., Ribeiro, M. T., & Weld, D. (2021). Does the Whole Exceed its Parts? The Effect of AI Explanations on Complementary Team Performance. *CHI 2021*. `[P]`
9. Buçinca, Z., Malaya, M. B., & Gajos, K. Z. (2021). To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-assisted Decision-making. *CSCW 2021*. arXiv:2102.09692. `[P]`
10. Goddard, K., Roudsari, A., & Wyatt, J. C. (2012). Automation bias: a systematic review of frequency, effect mediators, and mitigators. *JAMIA*, 19(1), 121–127. `[P]`
11. Schroeder, H., Roy, D., & Kabbara, J. (2025). Just Put a Human in the Loop? Investigating LLM-Assisted Annotation for Subjective Tasks. arXiv:2507.15821. `[P]` (preprint, pre-registered)
12. Gilardi, F., Alizadeh, M., & Kubli, M. (2023). ChatGPT outperforms crowd workers for text-annotation tasks. *PNAS*, 120(30). `[P]`
13. Snow, R., O'Connor, B., Jurafsky, D., & Ng, A. Y. (2008). Cheap and Fast — But is it Good? Evaluating Non-Expert Annotations for Natural Language Tasks. *EMNLP 2008*. `[P]`
14. Lingren, T., et al. (2014). Evaluating the impact of pre-annotation on annotation speed and potential bias. *JAMIA*, 21(3), 406–413. `[P]`
15. Dawid, A. P., & Skene, A. M. (1979). Maximum likelihood estimation of observer error-rates using the EM algorithm. *JRSS Series C*, 28(1), 20–28. `[P]`
16. Plank, B. (2022). The "Problem" of Human Label Variation. *EMNLP 2022*. `[P]`
17. Uma, A., Fornaciari, T., Hovy, D., Paun, S., Plank, B., & Poesio, M. (2021). Learning from Disagreement: A Survey. *JAIR*, 72, 1385–1470. `[P]`
18. Northcutt, C. G., Athalye, A., & Mueller, J. (2021). Pervasive Label Errors in Test Sets Destabilize Machine Learning Benchmarks. *NeurIPS 2021 D&B*. arXiv:2103.14749. `[P]`
19. McKinney, S. M., et al. (2020). International evaluation of an AI system for breast cancer screening. *Nature*, 577, 89–94. `[P]`
20. Jumper, J., et al. (2021). Highly accurate protein structure prediction with AlphaFold. *Nature*, 596, 583–589. `[P]`

Inherited from the synthesis, not re-verified here:

21. Angelopoulos, A. N., Bates, S., Fisch, A., Lei, L., & Schuster, T. (2022). Conformal Risk Control. arXiv:2208.02814. `[U]` (venue only)
22. Kim et al. (2025). Correlated Errors in Large Language Models. ICML 2025. arXiv:2506.07962. `[P]` via synthesis
23. *Nine Judges, Two Effective Votes*. arXiv:2605.29800 (2026). `[U]` via synthesis
24. Krippendorff, K. (2004). *Content Analysis*. Sage. (α ≥ .800 "reliable", .667–.800 "tentative" — convention, not a finding.) `[P]`
