# W5 — Weak Supervision and Label Models: what can actually be estimated, and what cannot

**Date:** 2026-11-04
**Scope:** weak-supervision foundations, dependent annotators, LLM-generated labeling functions, hybrid label models, identifiability limits, calibration, 2025–26 work, and a measured design for Curlset.
**Method:** primary sources fetched 2026-11-04 (arXiv, PMLR, OpenAlex, GitHub API, Zenodo) plus new experiments on `repo/data/hard.db`. Scripts: `research/wave2/_src/exp_ds2.py`, `exp_ds3.py`, `exp_grouped.py` (numpy/sklearn, CPU, seeded).

**Marking convention**
**[P]** primary source read (paper PDF/abstract or repository metadata); the claim is the authors'. **[R]** reproduced/measured by me on `hard.db`. **[I]** my inference or derivation. **[U]** unverified, secondary, or credibility caveat.

This report does not repeat R1's correlated-error arithmetic; it asks the next question: **which label model should replace the current weighted log-odds pool, and what is the evidence that any label model can help at all?**

---

## 1. Executive summary

1. **The field does have a real answer to correlated LLM judges, and it is from 2026.** Balasubramanian, Podkopaev and Kasiviswanathan formalise aggregation as an Ising model over votes: the Bayes log-odds is *quadratic* when couplings are class-dependent, and collapses to a correlation-adjusted linear vote when they are shared. On three LLM-judge tasks with six judges they report **+7 to +8 points over conditional-independence weighted majority** (0.90 vs 0.82 relevance, 0.79 vs 0.72 toxicity, 0.68 vs 0.61 summarization) **[P]**. It is the strongest 2019–2026 result for exactly Curlset's problem and is implementable in ~150 lines.

2. **On Curlset's data it cannot work, for a reason that is structural and measurable.** Three voters over four classes admit 64 vote patterns; the 300 rows occupy **19** of them **[R]**. A full Dawid–Skene (DS) model has **37 free parameters**; the observed vote distribution supplies **18 degrees of freedom**. It is not hard to fit — it is unidentified. Unsupervised DS-EM converges reliably to a solution with log-likelihood **−556.9**, while the maximum attainable *given the true labels* is **−650.2** **[R]**: the fitted model is 93 nats better at explaining the votes than the truth is. Unlabeled data cannot repair this — it adds counts to existing cells, not new cells.

3. **The model that works is boring, and it is worth ~2.6 points.** A per-source, per-class log-linear stack — DS *re-estimated discriminatively on gold* — reaches **89.23%** under template-grouped cross-validation, against **86.67%** for the current ensemble and **86.20%** for the best single model chosen per fold **[R]**. Paired cluster bootstrap (sentences, not rows): **+2.3 points [0.0, +4.8] versus the current ensemble** at fold 0, +2.6 across repeats. ECE falls **0.111 → 0.056** **[R]**. No extra model calls. (Naive row-level CV gives 89.47 and ECE 0.022 — inflated by template leakage; do not quote it.)

4. **That ~2.6 is the whole remaining headroom, and the headroom is smaller than it looks.** The ceiling is 269/300 = **89.67%**; the model reaches 89.23%, i.e. **~1.3 errors among the 269 rows any voter got right**. More importantly, **the 31 all-wrong rows are only 8 base sentences** **[R]** — and the Lead's audit finds they are label-ontology disputes (billing vs general inquiry; billing vs technical support; feature request vs bug) **[P, `LEAD-FINDING-templated-fixture.md`]**. Dependence terms buy nothing: quadratic/interaction features match the additive model (89.20 vs 89.23, identical fold-0 predictions) **[R]**. The cheapest remaining accuracy is an eight-decision guideline, not a model.

5. **So the label model's job changes**: (a) the **calibrator** that turns heterogeneous evidence into honest posteriors, (b) the **weighting mechanism** that discounts correlated sources once rules, a probe and retrieval arrive, and (c) the **identifiability gate** — refuse to run unsupervised when the design is rank-deficient, and say why.

**Recommendation.** Replace `weights.reliability_weights` + `aggregation.weighted_log_odds` with a cross-fitted, L2 multinomial log-linear label model over vote indicators (one-hot per source, abstain as its own symbol), with pairwise interactions behind a flag that is off by default. Group folds by base sentence. Keep the Ising/EBCC machinery as the documented path for when independent sources arrive, switched on by a likelihood-ratio test. Do not run unsupervised DS on this data; return the degrees-of-freedom diagnostic instead.

---

## 2. Breakthrough candidates, ranked by expected value

### B1. Dependence-aware Ising label model — strongest published method, will not transfer [P]

Its hierarchy: **class-dependent couplings** give log-odds `b0 + Σ a_j J_j + Σ_{j<k} b_jk J_j J_k`; **class-independent couplings** cancel the quadratic terms, leaving a linear weighted vote with correlation-adjusted weights. Two consequences matter more than the headline. First, when dependence is class-independent, "correlation-aware aggregation" **is just a reweighting** — what a fitted linear stack already does. Second, the paper proves CI methods have **non-vanishing excess risk as K → ∞** under a latent-factor dependence model **[P]** — the right citation for "φ = 0.74 is a modelling problem, not a nuisance parameter".

Experiments: six LLM judges (Claude Sonnet/Haiku 4.5, gpt-oss-120b, Llama 4 Maverick/Scout, DeepSeek-R1), temperature 0, binary tasks, 1,000–3,000 unlabeled items, EM posterior. What makes it work is **binary labels and six judges — 64 vote patterns** — with 15–50 observations per pattern. Both conditions fail for Curlset (4 classes, 3 voters, 19 observed patterns) **[R]**. That is the boundary of applicability, and exactly the boundary the project needs.

### B2. Discriminative label model — the one that wins here [R]

DS is log-linear: posterior log-odds is `log π_c + Σ_j log θ_{j,c,v_j}`, linear in counts of (source, vote) pairs. A multinomial logistic regression on the same one-hot features is **the same model family, estimated by conditional rather than joint likelihood**. Felt et al. (NAACL 2015), judging by their title and framing, argue generative models win with very little data **[U — abstract not retrieved]**; the claim is measurable. Row-split learning curve (indicative: it does not group templates):

| n gold | majority | DS (generative) | discriminative | quadratic |
|---|---|---|---|---|
| 40 | 0.866 | 0.875 | 0.875 | 0.867 |
| 60 | 0.865 | 0.875 | 0.881 | 0.866 |
| 150 | 0.865 | 0.883 | 0.889 | 0.872 |
| 225 | 0.871 | 0.888 | 0.892 | 0.883 |

The crossover is at **40–60 gold labels** — "early gains" reproduced. At the full fixture, grouped cross-fitted: **DS-generative 88.27, discriminative 89.23, ECE 0.102 vs 0.056** **[R]**. The accuracy gap between the two is within noise; the calibration gap survives clustering.

This is the recommended replacement. The repository currently fits `w ∝ accuracy^α · trust^β`, a *scalar per model*, discarding the per-class confusion structure that DS and its discriminative form keep. Every weighting scheme in the repo (α = 1, 2, 4, weighted vote or log-odds) returns **exactly 86.67%** on `hard.db` — the current ensemble is a no-op **[R]**.

### B3. Calibration of aggregators — newest, most directly usable [P]

Singer et al. (arXiv 2610.16815, Oct 2026) give what they describe as the first systematic calibration study of label aggregation, across **39 human crowdsourcing datasets and LLM crowds**: **majority vote is underconfident; model-based aggregators (DS, GLAD, CrowdFM) are overconfident**; exact calibration of weighted majority needs restrictive conditions. Their fix — "aggregate the aggregators": combine the aggregator's distribution with those of *complementary* aggregators, then temperature-scale — helps most in high-redundancy regimes **[P]**. This explains the repo's non-monotone confidence ranking (10% yield → 86.7% precision; 50% → 96.0%). Practical rule: **average two structurally different aggregators (e.g. additive log-linear and one-coin/IRT) before temperature scaling.**

### B4. Partial identification and confidence intervals without labels [P]

- **Fréchet bounds** on accuracy/precision/recall/F1 from source-agreement structure, by scalable convex optimisation, no gold (Maia Polo et al., NeurIPS 2024) **[P]**.
- **Confidence intervals for label probabilities** from uncertainty sets covering LFs with "unrestricted behavior and typology" — i.e. dependence-robust (Álvarez et al., arXiv 2508.03896) **[P]**.

These belong in the *certificate*, not the aggregator: Fréchet bounds for the pre-audit statement, conformal risk control for the post-audit guarantee.

### B5. Feature-conditioned label models and source valuation [P]

FABLE (Zhang, Song, Ratner, arXiv 2210.02724) makes the label model a *mixture* of Bayesian label models whose weights are predicted from **instance features** — the published mechanism closest to "fold a probe into the label model", since the embedding says which correlation regime a record is in. Highest average over nine baselines on eleven benchmarks **[P]**. WeShap (Guan & Koudas, VLDB 2025) attributes pipeline accuracy to individual sources via Shapley values in O(J²) — the right diagnostic for "which evidence source earns its place" **[P]**. Both are second-tier here: neither is identifiable at 19 patterns.

### B6. LLM-generated labeling functions — real, modest, correlated with the voters [P]

- **Language Models in the Loop** (Smith et al., ACM/IMS JDS 2024): prompts as LFs, denoised with FlyingSquid, RoBERTa end model. On WRENCH, **19.5% average error reduction over zero-shot**; T0++ reaches 92.0 vs 94.9 (YouTube), 91.8 vs 92.4 (SMS), **62.9 vs 37.9 (Spouse)** against hand-written LFs — but InstructGPT often degrades (SMS 65.7, Spouse 41.0) **[P]**.
- **DataSculpt** (arXiv 2311.00739): LF accuracy >70% on general-knowledge tasks, <70% biomedical; beats expert LFs on some WRENCH sets **[P]**. **ScriptoriumWS** (arXiv 2502.12366): code models as LF assistants "maintain accuracy and greatly improve coverage" **[P]**. **EXPONA** (KBS 2026): up to 98.9% coverage, 3–46% relative weighted-F1 gains **[P]**.

The decisive problem is **independence**, not effect size. An LF written by the same model family that votes shares its priors and blind spots — the mechanism Kim et al. (ICML 2025) document at 60% co-error across 350+ models **[P, synthesis]**. Prompted LFs raise coverage; they do not raise the effective number of independent sources. Only *deterministic* artefacts — regexes, lexicons, schema checks, a trained probe, retrieved adjudicated cases — have errors structurally unlike an LLM's.

---

## 3. Math and methods

### 3.1 What is estimable without gold

DS posits latent `Y ∈ {1..K}`, prior `π`, and confusion matrices `θ_j[c,s] = P(vote_j=s | Y=c)`, with votes conditionally independent given `Y`:

`P(v_i) = Σ_c π_c Π_j θ_j[c, v_ij]`.

EM alternates posteriors with count re-estimation. MeTaL adds a hierarchy over sub-tasks and models LF dependencies (**+20.2 over supervised, +6.8 over majority, +4.1 over data programming**, AAAI 2019) **[P]**; FlyingSquid replaces EM with a triplet method-of-moments ("170× faster on average, up to 4,000×", ICML 2020) **[P]**; Bach et al. (ICML 2017) learn the *dependency structure* by ℓ1-regularised pseudolikelihood **[P]**.

**Identifiability.** Allman, Matias and Rhodes (Annals of Statistics 2009), via Kruskal's three-way array theorem, show a latent class model is identifiable from **three conditionally independent observed variables** (generically) **[P]**. The counting version is the operative one **[I]**:

- free parameters `1 + J·K·(K−1)`;
- observed degrees of freedom at most `K^J − 1`.

For binary labels: `2^J − 1 ≥ 1 + 2J` → **J ≥ 3**, Allman's threshold, and why two annotators without gold is hopeless. For Curlset (K = 4, J = 3): 63 ≥ 37 — identifiable *in principle*.

**But the operative number is populated cells, not `K^J`.** The 300 rows occupy **19 of 64** patterns → **18** degrees of freedom against **37** parameters **[R]**. The model is rank-deficient by a factor of two whatever the estimator, and unlabeled data cannot fix it: new records land in the same 19 cells.

Hence the unsupervised failure is specific and silent. Twelve restarts of DS-EM converge to the same optimum (−556.9), whose labels agree with gold **86.3%** of the time — plausible-looking. The maximum likelihood *given the true labels* is **−650.2** **[R]**. The fitted model assigns 93 nats more probability to the votes than the truth does, so held-out vote likelihood and every unsupervised diagnostic prefer the wrong solution. **You cannot detect this without gold.** A 2026 "masked-cause" preprint states the general result (a "glass-ceiling theorem": without gold and without a structural assumption on LF dependence, accuracies and the prior are non-identifiable) with gold sample complexity of order `log(r)/gap²` in the rank deficit `r` **[U — unreviewed Zenodo preprint]**. My measurement is the concrete instance; cite the measurement.

### 3.2 What dependence does

At φ ≈ 0.74–0.78 the votes carry `n_eff ≈ 1.2` independent observations. Two distinct harms need different fixes:

1. **Weighting harm.** Correlated votes are counted as independent → overconfident, over-weighted consensus. Fix: correlation-adjusted weights, or simply *fit the linear stack on gold* — the fit absorbs correlation into the weights.
2. **Bias/identifiability harm.** The model class is wrong: a shared error factor means no CI parameter setting reproduces the vote distribution. Fix: interaction terms, or independent sources so the shared factor explains less variance.

The Ising derivation says exactly what to add **[P]**: a logistic model with **all pairwise products of vote indicators**. At K = 4, J = 3 that is 12 main effects + 48 interactions = **183 free parameters for 300 rows**. It overfits and scores the same as additive while less well calibrated (ECE 0.063 vs 0.056) **[R]**.

**EBCC** (Li, Rubinstein, Cohn, ICML 2019) instead mixes *intra-class reliabilities* per worker, inducing inter-worker correlation without pairwise couplings; mean-field variational inference; **84.5%** mean accuracy on 17 datasets vs 82.9–83.4% best baseline **[P]**. It is the best "correlation-aware, no gold" model I could verify, with MIT code — but last touched in **2019**, and still assuming the reliability mixture is estimable, which our 19-cell design says it is not.

**IRT aggregators** (GLAD, Whitehill et al. 2009; hierarchical item-difficulty models, 2024) parameterise ability and item difficulty — `2J + n` parameters instead of `J·K·(K−1)` **[P for GLAD; I for the count]**. More sample-efficient, but they do **not** model correlation; conditional independence given ability and difficulty remains. Their value here is item difficulty (some intents are genuinely ambiguous), not dependence. **Group-bias models** (`GroupAnno`, Liu et al., ACL 2022) model shared bias within annotator groups **[P]** — the right LLM analogue is "same provider family / pretraining corpus / prompt scaffold", but with J = 3 there is one group of three and nothing to contrast.

### 3.3 LLM-generated labeling functions

Covered in B6. Design principle: an LF is useful in proportion to its **conditional independence from the other voters given the label**, not its standalone accuracy. A prompt-derived LF is cheap coverage; a regex or a retrieved adjudicated case is cheap *independence*. The 2025 literature (ScriptoriumWS, EXPONA, DataSculpt) optimises coverage and LF accuracy and never measures the correlation of generated LFs with the model that generated them — a gap worth naming.

### 3.4 Calibration

1. **Label-model posteriors are not calibrated by construction.** DS's posterior is calibrated only if its generative model is true; at φ = 0.74 it is not. Singer et al. find model-based aggregators overconfident and majority underconfident across 39 datasets **[P]**; my measurement agrees: DS-generative ECE **0.102**, majority **0.111**, discriminative **0.056** **[R]**.
2. **Post-hoc fixes are cheap**: temperature scaling on a held-out split, and "aggregate the aggregators" before scaling. Temperature must be fit **out-of-fold**; fitting it on the same rows used to fit the label model repeats the repo's winner's-curse defect.
3. **Validation without a large gold set** has three legitimate forms: (a) **cross-fitted calibration** — fit on 4/5, calibrate and evaluate on 1/5; (b) **reliability bounds** — Fréchet/partial-identification intervals when gold is absent **[P]**; (c) **audit sampling with a proper interval** (Clopper–Pearson/Wilson or a confidence sequence), which the certificate needs anyway. ECE at n_eff ≈ 117 is itself noisy (±0.02–0.04 **[I]**), so 0.056 vs 0.102 is suggestive and needs a cluster bootstrap.

**Small-gold semi-supervised label models.** Snuba (Varma & Ré, PVLDB 2018) uses a small labelled set to learn LFs and their accuracies **[P]**; "Learning to Robustly Aggregate Labeling Functions for Semi-supervised Data Programming" (ACL Findings 2022) and "Refining Labeling Functions with Limited Labeled Data" (2025) repair LFs so each labelled point has sufficient evidence **[P]**. My learning curve says something simpler: **40–60 gold rows fit a 39-parameter linear label model to within ~1 point of its 300-row performance** **[R]**. Gold beyond ~150 is worth little *for the label model*; it is worth a lot for *certifying* it.

### 3.5 Measured comparison on `hard.db`

**The fixture is templated, so the exchangeable unit is the sentence.** The 300 rows reduce to **99 base sentences** under my suffix-stripping (the Lead's normalisation gives 107; largest cluster 9) **[R]**. The per-record error rate has **ICC(1) = 0.77**, design effect **2.57**, **n_eff ≈ 117**; on the binary error indicator the Lead's analysis gives n_eff ≈ **75** **[P, `LEAD-FINDING-templated-fixture.md`]**. Row-level folds leak near-duplicates. Everything below uses **`StratifiedGroupKFold` on the base sentence** and **cluster bootstrap**.

Protocol: 10 repeats × 5 grouped folds; models refit per fold; L2 by inner 3-fold CV; out-of-fold accuracy; paired cluster bootstrap (4,000 resamples over 99 sentences).

| Aggregator | Accuracy | Log loss | ECE | Cluster SE |
|---|---|---|---|---|
| Majority vote | 0.8667 | 2.909 | 0.111 | 0.0233 |
| Best single (chosen per fold) | 0.8620 | 3.813 | 0.138 | 0.0249 |
| DS, generative (supervised confusion) | 0.8827 | 0.645 | 0.102 | 0.0212 |
| **Discriminative linear label model** | **0.8923** | **0.377** | **0.056** | 0.0226 |
| Quadratic / Ising-style interactions | 0.8920 | 0.391 | 0.063 | 0.0226 |
| **Ceiling (any function of the votes)** | **0.8967** | — | — | — |

Paired cluster bootstrap (fold 0): discriminative − best-single **+0.023 [0.000, +0.051]**; discriminative − majority **+0.023 [0.000, +0.048]**; discriminative − DS-generative **+0.007 [−0.007, +0.020]**; quadratic − discriminative **0.000 [0.000, 0.000]** **[R]**.

Three readings:

1. **The gain is real but not yet significant at 99 clusters.** +2.3 to +2.6 points with a lower bound at zero. The point estimate is stable across protocols (row-level, grouped, learning curves), but this fixture cannot resolve it. Repeating on 300 *unique* sentences is what would settle it.
2. **Calibration is the unambiguous win** (ECE 0.056 vs 0.111/0.138; log loss 0.377 vs 2.909 for hard-vote majority), and calibration is what the certificate consumes.
3. **Dependence modelling adds nothing.** Quadratic terms are within 0.03 points of additive with identical fold-0 predictions. The residual is 31 rows / **8 base sentences** **[R]**.

---

## 4. Evidence table

| Method | Venue / year | Claimed effect (as stated) | Dataset / scale | Replication |
|---|---|---|---|---|
| Snorkel MeTaL | AAAI 2019 | **+20.2 pts** vs supervised, +6.8 vs MV, +4.1 vs data programming | 3 fine-grained tasks | **[P]** not independently replicated |
| FlyingSquid | ICML 2020 | 170× faster on average, up to 4,000×; comparable accuracy | WS benchmarks | **[P]** Apache-2.0, last push 2020 |
| Dawid–Skene | JRSS-C 1979 | Latent-class aggregation, per-annotator confusion | Crowdsourcing | **[P]** assumes conditional independence |
| EBCC | ICML 2019 | **84.5%** vs 82.9–83.4% best baseline, 17 datasets | Crowdsourcing | **[P]** MIT code, unmaintained since 2019 |
| Ising dependence-aware aggregation | arXiv 2601.22336 (2026) | **+7 to +8 pts** over CI weighted MV; separation as K→∞ | 3 LLM-judge tasks, 6 judges, binary, 1–3k items | **[P]** preprint, no replication |
| Calibration of aggregators | arXiv 2610.16815 (2026) | MV underconfident, DS/GLAD/CrowdFM overconfident; "aggregate the aggregators" | 39 human + LLM crowds | **[P]** direction matches my **[R]** |
| CIs for label probabilities | arXiv 2508.03896 (2025) | CIs under unrestricted LF dependence | Several WS benchmarks | **[P]** preprint |
| Partial identification | NeurIPS 2024 | Valid bounds on accuracy/precision/recall/F1 without labels | WS benchmarks | **[P]** peer-reviewed |
| Hyper label model | ICLR 2023 | **+1.4 pts**, **6×** faster than best existing | 14 datasets | **[P]** amortised, no per-dataset fit |
| AHEAD | arXiv 2607.18465 (2026) | 68.75% → **73.23%** average accuracy | 10 crowd datasets | **[P]** needs many annotators/item |
| Prompts as LFs + FlyingSquid | ACM/IMS JDS 2024 | **19.5% error reduction** vs zero-shot; Spouse 62.9 vs 37.9 F1; InstructGPT often worse | 3 WRENCH tasks | **[P]** |
| DataSculpt | arXiv 2311.00739 (2023) | LF accuracy >70% general, <70% biomedical; beats expert LFs sometimes | 12 datasets | **[P]** preprint |
| EXPONA | KBS 2026 | Up to 98.9% coverage; **3–46% relative F1** gains | 11 datasets | **[P]** |
| BOXWRENCH | NeurIPS 2024 D&B | Supervised learning needs **1000+ labels** to match WS | Realistic, high-cardinality tasks | **[P]** |
| Snorkel DryBell | SIGMOD 2019 | Order-of-magnitude labelling cost reduction at Google | 3 industrial tasks | **[P]** abstract-level |
| Masked-cause identifiability | Zenodo 2026 | "Glass-ceiling" non-identifiability without gold | Simulation | **[U]** unreviewed |
| **Discriminative linear label model** | **this report** | **89.23% vs 86.67% (+2.6; cluster CI [0.0,+4.8]); ECE 0.056 vs 0.111** | **`hard.db`, 300×3, 4 classes, 99 templates** | **[R]** `wave2/_src` |
| **Unsupervised DS-EM** | **this report** | **86.3%; optimum −556.9 vs −650.2 given truth** | **`hard.db`** | **[R]** 12 restarts, same optimum |
| **Dependence (quadratic) terms** | **this report** | **No gain (89.20% vs 89.23%, identical fold-0 predictions)** | **`hard.db`** | **[R]** |

---

## 5. Negative results and hype to retire

**A caveat that invalidates most published numbers, including some of mine: row-level cross-validation on this fixture is invalid.** 300 rows are 99 base sentences; ICC(1) = 0.77, design effect 2.57, **n_eff ≈ 117** (≈75 on the binary error indicator) **[R; P, Lead finding]**. Row-level CV inflated my label-model estimate by only ~0.2 points (89.47 → 89.23) but inflated calibration optimism three-fold (ECE 0.022 → 0.056) and narrows every interval. Every future experiment on `hard.db` must group by sentence.

1. **"Unsupervised label models will figure out the accuracies."** They cannot here, and the failure is silent: a stable, plausible 86.3% solution whose likelihood *beats the truth's* by 93 nats **[R]**. Any pipeline that reports a label model's own posterior as its quality estimate is reporting a number maximised by the wrong answer. This is the strongest argument for keeping gold and for the degrees-of-freedom gate.

2. **"More judges / better aggregation will close the gap."** Retired in R1 via `n_eff ≈ 1.17`; the Ising paper sharpens it — under latent-factor dependence, CI aggregators have non-vanishing excess risk, so better aggregation of the same evidence has a hard limit. Corollary: the Ising model creates no information either. If all judges share a blind spot, the Bayes rule is confidently wrong.

3. **"Ising gives +7 points, so it will give +7 here."** No. Those gains are binary, six judges, 1,000–3,000 items **[P]**. Curlset is 4-class, three voters, 19 populated patterns **[R]**, and my quadratic replication gives **zero** gain. Quoting the +7 without this boundary would be the most misleading thing this report could do.

4. **"LLM-written labeling functions give you independence."** They give coverage. Prompted LFs are generated by the same model family that votes, so the correlation behind φ = 0.74 applies to them too. Accuracy evidence is real but modest and model-dependent (InstructGPT degraded on two of three tasks) **[P]**.

5. **"ML has outgrown weak supervision."** BOXWRENCH finds supervised learning needs **1000+ labels** to match WS on realistic tasks **[P]**. WS is mis-sold when its label model is treated as an oracle, not obsolete.

6. **Tooling is thinner than it looks.** `snorkel` is alive (6,026 stars, Apache-2.0, pushed 2026-10-13) and `cleanlab` very active (11,730 stars, 2026-01) — but cleanlab is *confident learning on classifier outputs*, not a label model. `skweak` last moved 2024-09, `wrench` 2024-02, `flyingsquid` 2020-09, EBCC's code 2019-06, `knodle` 2024-09, `crowd-kit` 2025-12 **[P, GitHub API]**. No maintained, correlation-aware, multi-class label model library exists. That is a risk (you will write it) and the product gap the synthesis identified.

7. **"Aggregate the aggregators" is not a guarantee.** It improves empirical calibration; it does not bound error. Calibration and certification are different objects, and only the second belongs in a certificate.

---

## 6. Concrete design for this codebase

### 6.1 What to build

New module `packages/dataset_ensemble/label_model.py` (pure functions, no I/O), replacing the weight/aggregate path.

**Inputs.** Vote matrix `V ∈ {0..K-1, ABSTAIN}^{n×J}` from `ensemble_votes`, plus optional gold `y` from `annotations`.

**Features.** `x_i = [onehot(v_ij) for j in 1..J]`, K−1 columns per source (abstain = all zeros). A bijection with the vote pattern; the *model* over it is what differs.

**Model.** Multinomial logistic regression `P(y=c|x) ∝ exp(w_c·x + b_c)`, L2-regularised: **39 free parameters** at J=3, K=4. numpy or `sklearn.linear_model.LogisticRegression` (sklearn 1.9.1 present, CPU-only).

**Optional dependence block.** Pairwise products of vote indicators behind `include_interactions=False`, with **group lasso per source-pair block** so the whole block can be zeroed. Gate the flag on the identifiability diagnostic.

**Calibration.** Out-of-fold temperature scaling on the log-posterior (reuse `calibration.apply_temperature`), fit inside the cross-fitting loop.

**Outputs.** Per record: label, **calibrated** `probs`, entropy, `evidence_disagreement` (keep `disagreement`). Per run: accuracy, macro-F1, log loss, ECE with cluster bootstrap CI, and `ceiling = 1 − (#rows with no correct vote)/n` when gold is present.

### 6.2 The identifiability gate (the part nobody ships)

Before any fit compute `n_patterns` (19), `df_obs = n_patterns − 1` (18), `df_model = 1 + J·K·(K−1)` (37). If `df_obs < df_model` and no gold: **refuse to fit an unsupervised label model**, return a structured error naming the deficit, and suggest the two legal moves — add independent sources, or add gold. This turns a silent 93-nat error into a product feature ("your evidence is not identifiable; here is what would make it so") and is a natural UI element: a coverage/identifiability gauge over the evidence matrix.

With gold the constraint is weaker but real: `n_gold ≥ ~10 × params` is the usual rule (39 params → 390 rows); 300 worked here, 183 did not.

### 6.3 How heterogeneous evidence enters

Treat every evidence type as a **source with abstention**:

| Source | Votes | Independence argument | Expected accuracy |
|---|---|---|---|
| 3 LLM voters | existing | shared pretraining → φ ≈ 0.74 **[R]** | 87% |
| Deterministic rules | fire → label; else abstain | hand-written, no learned parameters | 60–90% on covered rows **[I]** |
| Small probe (logreg/SetFit on frozen embeddings, trained on adjudicated gold) | argmax + calibrated prob | different inductive bias; has seen gold | ~85% **[I, unmeasured]** |
| Retrieval (nearest adjudicated cases / policy clauses) | top-1 label above a similarity floor | different information source (the policy itself) | unknown **[U]** |

Fit the same label model over all sources; the weights learn how much to trust each. Do not hand-tune weights — that is what the model is for.

**The test for a new source is not its accuracy but the change in `c`.** For each candidate, count rows where *all* existing sources are wrong and the new source is right. If that count is ~0, the source is correlated and should be dropped regardless of standalone accuracy. It is a 20-line computation on stored predictions and should be the first thing run on any new evidence type.

### 6.4 Protocol for the decisive experiment (E-W5)

1. **Split.** **Stratified grouped 5-fold on the base sentence** — the fixture is templated (99 bases, ICC 0.77) and row-level folds leak. All fitting, calibration and threshold selection inside training folds; pooled out-of-fold predictions; 10 repeats.
2. **Baselines.** (a) current `weighted_log_odds` — reproduces **86.67%** exactly **[R]**; (b) best single per fold — **86.20%**; (c) majority — **86.67%**.
3. **Treatment.** Discriminative linear label model, L2 by inner CV, temperature-scaled out-of-fold.
4. **Primary metric.** Accuracy with a **paired cluster bootstrap** (resample sentences) and McNemar on cluster-majority outcomes. Secondary: ECE with cluster CI, log loss, accuracy on the 269 resolvable rows.
5. **Guardrail.** `c` unchanged (no new source). Any claimed accuracy gain without a fall in `c` is arithmetic error.
6. **Pre-registered criterion.** +≥1.5 points with a cluster CI excluding zero **and** ECE ≤ 0.07. Predicted: point estimate passes (+2.3 to +2.6) but the CI may touch zero at 99 clusters; treat calibration as the primary pass/fail because it is unambiguous.
7. **Power.** At 99 clusters there is ~75% power for a 5-point paired difference and less for 2.5; the fixture cannot certify a 2-point gain. If the decision matters, extend to 300 unique sentences first.
8. **Falsifier.** If, on a unique-sentence fixture, the treatment does not beat both majority and the best single model with a cluster CI excluding zero, ship majority vote plus calibration instead.

Then **E-W5b**: add the three independent sources, refit, and test whether `c` falls from 10.33% to ≤7% (the synthesis's gate for 95%). The label model will not do that work; it only ensures the new evidence is weighted correctly when it arrives.

### 6.5 What to change in the existing code

- `weights.py`: keep `reliability_weights` for compatibility, stop using it as the primary path — a scalar `accuracy^α` cannot represent per-class confusion, where the gain lives.
- `aggregation.py`: add `"label_model"` as a strategy; keep `majority` as the audit-friendly baseline.
- `service.py::_phi`: fix the constant-error-vector case (R1 flags it) — with 10 abstentions it reports independence exactly when saturated.
- `calibration.py`: reuse; add out-of-fold temperature and per-band reliability (unanimous vs split have different curves).
- `selection.py`: solve thresholds on the **calibrated** posterior and certify on disjoint data (R4's winner's-curse fix). A calibrated score makes the Wilson machinery meaningful; an uncalibrated one makes it decorative.

---

## 7. References

1. Dawid, A. P., & Skene, A. M. (1979). Maximum likelihood estimation of observer error-rates using the EM algorithm. *JRSS C* 28(2), 159–177.
2. Ratner, A., et al. (2016). Data programming: creating large training sets, quickly. *NeurIPS*. arXiv:1605.07723.
3. Ratner, A., et al. (2020). Snorkel: rapid training data creation with weak supervision. *VLDB J*. arXiv:1711.10160.
4. Ratner, A., Hancock, B., Dunnmon, J., Sala, F., Pandey, S., & Ré, C. (2019). Training complex models with multi-task weak supervision. *AAAI*. arXiv:1810.02840.
5. Fu, D., et al. (2020). Fast and three-rious: speeding up weak supervision with triplet methods. *ICML*. arXiv:2002.11955.
6. Bach, S., He, B., Ratner, A., & Ré, C. (2017). Learning the structure of generative models without labeled data. *ICML*.
7. Varma, P., & Ré, C. (2018). Snuba: automating weak supervision to label training data. *PVLDB*.
8. Allman, E., Matias, C., & Rhodes, J. (2009). Identifiability of parameters in latent structure models with many observed variables. *Annals of Statistics* 37(6B), 3099–3132.
9. Whitehill, J., Ruvolo, P., Wu, T., Bergsma, J., & Movellan, J. (2009). Whose vote should count more. *NeurIPS*.
10. Li, Y., Rubinstein, B., & Cohn, T. (2019). Exploiting worker correlation for label aggregation in crowdsourcing. *ICML*, PMLR 97:3886–3895. Code: github.com/yuan-li/truth-inference-at-scale (MIT).
11. Liu, H., et al. (2022). Toward annotator group bias in crowdsourcing. *ACL*.
12. Balasubramanian, K., Podkopaev, A., & Kasiviswanathan, S. P. (2026). Dependence-aware label aggregation for LLM-as-a-judge via Ising models. arXiv:2601.22336.
13. Singer, G., Arab, R., Frikha, M., & Gruffaz, S. (2026). On the calibration of crowdsourcing aggregators. arXiv:2610.16815.
14. Álvarez, V., Mazuelas, S., An, S., & Dasgupta, S. (2025). Reliable programmatic weak supervision with confidence intervals for label probabilities. arXiv:2508.03896.
15. Maia Polo, F., Maity, S., Yurochkin, M., & Banerjee, M. (2024). Weak supervision performance evaluation via partial identification. *NeurIPS*. arXiv:2312.04601.
16. Wu, R., Chen, S.-E., Zhang, J., & Chu, X. (2023). Learning a hyper label model for programmatic weak supervision. *ICLR*. arXiv:2207.13545.
17. Zhang, J., Song, L., & Ratner, A. (2022). Leveraging instance features for label aggregation in programmatic weak supervision. arXiv:2210.02724.
18. Guan, N., & Koudas, N. (2025). WeShap: weak supervision source evaluation with Shapley values. *VLDB*. arXiv:2406.11010.
19. Chen, J., Xu, S., Feng, J., & Gao, Z. (2026). AHEAD: advancing multi-class label aggregation with interpretable cross-annotator modeling. arXiv:2607.18465.
20. Smith, R., Fries, J., Hancock, B., & Bach, S. (2024). Language models in the loop: incorporating prompting into weak supervision. *ACM/IMS J. Data Science*. arXiv:2205.02318.
21. Guan, N., Chen, K., & Koudas, N. (2023). Can large language models design accurate label functions? arXiv:2311.00739.
22. Lam, P., Nguyen, H.-L., Nguyen, T.-T., & Nguyen, S. (2026). Structured exploration and exploitation of label functions for automated data annotation. *KBS*. arXiv:2604.08578.
23. Yu, P., & Bach, S. (2023). Alfred: a system for prompted weak supervision. *ACL Demo*. arXiv:2305.18623.
24. ScriptoriumWS: a code generation assistant for weak supervision (2025). arXiv:2502.12366.
25. Li, C., Gilad, A., Glavic, B., & Miao, Z. (2025). Refining labeling functions with limited labeled data. arXiv:2505.23470.
26. Zhang, T., et al. (2024). Stronger than you think: benchmarking weak supervision on realistic tasks (BOXWRENCH). *NeurIPS D&B*. arXiv:2501.07727.
27. Bach, S., et al. (2019). Snorkel DryBell: a case study in deploying weak supervision at industrial scale. *SIGMOD*.
28. Felt, P., Black, K., Ringger, E., Seppi, K., & Haertel, R. (2015). Early gains matter: a case for preferring generative over discriminative crowdsourcing models. *NAACL*.
29. Programmatic weak supervision as masked-cause inference: identifiability of label models without gold data (2026). Zenodo, DOI 10.5281/zenodo.20422889. **[U — unreviewed]**
30. Crowd-Kit (2024). *JOSS*, doi:10.21105/joss.06227; github.com/Toloka/crowd-kit.
31. Kim, Y., et al. (2025). Correlated errors in large language models. *ICML*. arXiv:2506.07962. (Via 00-SYNTHESIS; not re-read.)
32. Kohli, P. (2026). Nine judges, two effective votes. arXiv:2605.29800. (Via 00-SYNTHESIS; not re-read.)

---

### Appendix — reproduction

- `research/wave2/_src/exp_ds2.py` — load, DS-EM, supervised generative DS, additive/quadratic stacks, learning curve, ECE/log loss.
- `research/wave2/_src/exp_ds3.py` — oracle bound, 12-restart DS-EM with likelihood comparison, pattern/df diagnostic, pattern memoriser.
- `research/wave2/_src/exp_grouped.py` — **the numbers quoted here**: base-sentence extraction, ICC(1)/design effect, template-grouped `StratifiedGroupKFold`, cluster bootstrap, all-wrong-by-template breakdown.

All read `repo/data/hard.db` read-only. Seeded, CPU-only, < 5 minutes.
