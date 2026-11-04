# W12 — Crowd wisdom, psychometrics and social choice: can any of it break the correlated-error ceiling?

**Date:** 2026-11-04. **Scope:** IRT, cultural consensus theory, surprisingly popular, Bayesian Truth Serum / peer prediction, signal detection theory, latent class models & Crowd Truth, and Condorcet-type social choice under dependence.
**Baseline:** 3 models, 300 records, φ = 0.78, 31 all-wrong, vote-only ceiling 89.7 %; majority and log-odds fusion failed.
**Relation to wave 1:** R1 covers Condorcet-with-correlation (Ladha), Dawid–Skene as a model class, and the identity `1 − 3p + 2c`. This memo does not repeat those. It goes after what R1 did not: **identifiability** rather than estimation, the **item-side** structure of the test, and the one class of method that adds an observable instead of reweighting the existing 900 bits.

**Marks:** **[P]** primary source verified; **[R]** reproduced here from `repo/data/hard.db` (900 votes, 300 gold) or a published replication; **[I]** my derivation; **[U]** unverified or preprint-only.

---

## 1. Executive summary

**1.1 The 300 "items" are 99 templates.** Stripping the parenthetical suffix from `dataset_records.metadata.text` leaves **99 distinct stems**, 1–9 paraphrases each **[R]** (a stricter near-dup pass gives ~107; the conclusion is method-robust, the exact count is not). All 31 all-wrong records come from **8 stems**; **6 stems account for 29 of the 31** **[R]**. The blind spot is not 31 independent failures — it is about **eight boundary cases replicated by paraphrase**. The unit of error, of adjudication, and of sampling is the template.

**1.2 Clustering inflates every confidence interval by 1.84×.** ICC of the all-wrong indicator across stems is **0.716** → DEFF **3.39**, n_eff **88.5** **[R]**. The synthesis's audit arithmetic (59 clean audits for 95 %) assumes independent records and is wrong by ~3.4× under cluster sampling. Sampling **one record per stem** removes the design effect.

**1.3 Unsupervised psychometrics cannot prefer the truth, by 244 nats.** CCT-MC and Dawid–Skene fit without gold both return the plurality key *exactly*, estimating the panel at **0.97 / 0.94 / 0.98** (true: 0.867 / 0.813 / 0.873) **[R]**. The true parameterisation has log-likelihood **−761.2**, the plurality solution **−517.0** **[R]** — not a small-sample effect: the only identifying information is the **33 non-unanimous records**.

**1.4 Item-side IRT is degenerate at k = 3.** Under Rasch, difficulty is a function of item score, so at most four values; **269/300 items (89.7 %) sit at score 0 or 3 with infinite difficulty** **[R]**; only 7 of 8 possible binary response patterns occur. The correct signature of an *ambiguous* item is **low discrimination (a → 0)**, not high difficulty — and discrimination is exactly what three raters cannot estimate.

**1.5 Surprisingly popular is provably equal to plurality when forecasts are self-anchored** (§3.1) **[I]**. It cannot overturn a unanimous-but-wrong record — the 10.3 % that matters. The 2025–26 LLM results (BTS ≈ majority − 1 pt; SP no gain on truthfulness) are consequences of this, not independent findings **[P]**. The transplant only becomes interesting if the forecast is elicited under a **different information set** than the answer.

**1.6 The optimal panel size is the one you have.** A one-factor vote model calibrated to the measured co-error reproduces `c` (9.97 % vs 10.33 %) and unanimity precision (88.9 % vs 89.1 %), then extrapolates majority accuracy from **85.6 % at k = 3 to 86.0 % at k = 51** **[R]** — 0.4 points for 48 more models, a tenth of a standard error.

**1.7 55 % of correctness variance is between stems** (0.84 for `general_inquiry`, 0.00 for `technical_support`) **[R]**. The error lives in the item, not the model. Buying models is the wrong intervention; rewriting item policy is the right one.

**In one line.** No tradition here breaks the ceiling by aggregation — the ceiling is eight templated boundary cases plus a label-policy decision. What they change is how big the uncertainty really is (3.4× wider), how cheap the fix is (8 adjudications), and which experiment is worth running (counterfactual elicitation, 900 calls, decisive either way).

---

## 2. The seven traditions

### 2.1 Item response theory

`P(X_ij = 1) = c_j + (1−c_j)·σ(a_j(θ_i − b_j))` (3PL; Birnbaum 1968 in Lord & Novick 1968) **[P]**. The parameter semantics are the sharpest conceptual contribution in the literature and answer the brief's question directly:

- **difficult** item: high *b* — models fail it, for the same reason;
- **ambiguous** item: **low *a*** — the item response function is flat, responses near-random, the item does not discriminate between strong and weak examinees;
- **incompetent model**: low θ; **noise/parse failure**: high *c*.

So: *ambiguity is not difficulty*. An item everyone gets wrong is, psychometrically, an easy item with a mis-specified key or a flat discrimination — never a "hard" one. That is the formal version of the synthesis's L1.

The LLM literature imports IRT heavily since 2023 but exclusively for *benchmarks*, with thousands of examinees: Zhou et al. (AAAI 2026, arXiv 2505.15055) find benchmarks lack a single measurement dimension with "widespread item saturation" **[P]**; equating work (Schilling-Wilhelmi 2025) is **[U]**. In crowdsourcing the IRT-flavoured model is GLAD (Whitehill et al., NIPS 2009), `P(y_ij = z_i) = 1/(1+exp(−α_j(β_i − γ_j)))` — a 1PL with annotator expertise α and item difficulty β, and the standard baseline **[P]**; the 2026 human-side restatement is Chew et al. (arXiv 2604.07591) **[P]**.

**Verdict.** Adopt the vocabulary; the estimation is impossible here because item parameters need many examinees and we have three. IRT becomes usable one level up, on **stems** (§3.2).

### 2.2 Cultural consensus theory

Romney, Weller & Batchelder (1986) posit an answer key `Z_k` and competences `D_i`:

```
P(X_ik = Z_k) = D_i ,   P(X_ik = z) = (1 − D_i)/(C − 1)  for z ≠ Z_k
```

with item-bias generalisations (Batchelder & Anders 2012; Anders & Batchelder, *Psychometrika* 80:151–181, 2015) and a Bayesian treatment (Oravecz, Vandekerckhove & Batchelder, *Field Methods* 2014) **[P]**.

**The right model class at k = 3.** Dawid–Skene with C = 4 has 36 confusion parameters plus a prior; CCT-MC has **three**. At k = 3 parsimony is the difference between estimable and not: CCT is the latent-class aggregation that fits inside the data.

**And it still fails.** The likelihood is invariant to what a unanimous cell means — `D_i` under "all correct", `(1−D_i)/(C−1)` under "all wrong" — so the EM picks whichever explains the rest of the table better. With 267/300 records unanimous, 89 % of the information about the key is invariant to relabelling those cells. Measured (§5.1): CCT returns competence 0.97 and the plurality key. It does not merely miss the 31; it **certifies** them.

**Correlated informants.** CCT assumes conditional independence given the key; the literature's response is to model *subcultures*, not dependence — Gürkan & Suchow (arXiv 2309.09787, 2023) extend CCT to a deep latent-class model (iDLC-CCT) for "collective intelligence under a lack of cultural consensus" **[P]**; Dametto (2026) applies CCT to fragmentation **[U]**. I found **no** CCT variant that models pairwise correlated error between informants **[I]** — a real gap, which §3.3 proposes to fill, but there is no paper to copy.

### 2.3 Surprisingly popular

Prelec, Seung & McCoy (*Nature* 541:532–535, 2017) ask for an answer *and* for the distribution of others' answers, then select the answer whose actual popularity exceeds its predicted popularity: **−21.3 % errors vs majority** across their question sets **[P]**. The mechanism is a proxy for informedness, not popularity: a minority holding private information *knows* the majority lacks it, and inflates its forecast of the majority's error.

Machine versions: Luo & Liu, "Machine Truth Serum" (arXiv 1909.13004, 2019; *Machine Learning* 2023) **[P]**; Shi et al. (*Appl. Sci.* 15:3003, 2025) **[U]**, full text blocked. On LLMs:

- **Ai, Pan, Simchi-Levi, Tambe & Xu, ICML 2026 (arXiv 2510.01499)** introduce *Inverse Surprising Popularity*, `argmax_s [Σ_i 1{a_i=s} − Σ_i S_ISP(s,i)]` built from each model's beliefs about the others; on UltraFeedback **73.26 % vs 72.21 %** for majority, gain shrinking as K grows **[P]**. That is +1.05 pt on a *preference* task with no ground truth — the weakest possible setting to claim a win.
- **Liu, "Bayesian Truth Serum for LLMs?" (ICML 2026):** BTS variants **~1 pt *less* accurate than majority**, but **21–32 % lower ECE** **[P]**. The most useful datapoint in the literature: metacognitive elicitation buys *calibration*, not accuracy.
- **Denisov-Blanch et al. (arXiv 2603.06612, Feb 2026)**, five models × four benchmarks: "polling-style aggregation yields no consistent accuracy gains … and often amplifies shared misconceptions"; "models predict collective opinion far better than they predict correctness" **[P]**. A direct recent negative replication.
- **Goel (arXiv 2311.07692, 2025)** uses `P(r|q)/P(r|'?')` against a null prompt: up to **+24 % on TruthfulQA** with GPT-2/LLaMA-2 **[P]** — but a likelihood ratio over one model's own distribution against a weak MaxPost baseline, not a panel forecast.

**Verdict.** LLM record: no accuracy gain, better calibration, and structural blindness to unanimity (proved in §3.1).

### 2.4 Bayesian Truth Serum and peer prediction

Prelec (*Science* 306:462–466, 2004) scores the log-ratio of an answer's actual to predicted frequency plus forecast accuracy; strictly proper, maximised by truthful reporting of private information with no ground truth **[P]**. The incentive story does **not** transfer — LLMs have no payoff from misreporting, so incentive-compatibility is vacuous. What survives is the scoring rule as a **signal extractor**, which is what Liu (2026) tests and which behaves as a calibration device. Worth one line in a spec, no more. (A 2026 preprint uses BTS as an anti-sycophancy fine-tuning reward, arXiv 2608.25267 **[U]**: "BTS improves the *report*" is not "BTS improves the *answer*", and the two are routinely conflated.)

### 2.5 Signal detection theory

`d' = z(H) − z(F)`, `c = −½[z(H)+z(F)]` (Green & Swets 1966; Macmillan & Creelman 2005) **[P]**. SDT splits error into **sensitivity** (a property of the annotator) and **bias** (a property of the decision, hence movable) — in 4 classes, a per-class criterion shift: a model that over-predicts `billing` is not less sensitive, it has a shifted threshold. Three models with *different* biases err on different items even at equal sensitivity, so bias correction is one of the few transformations that can **decorrelate** without new evidence.

**Measured:** mean confidence correct vs wrong is 0.910/0.823 (deepseek), 0.941/0.769 (muse), 0.946/0.896 (openai) **[R]** — all overconfident, muse most. Minimum confidence across the three as a score for "all three wrong": **AUC 0.707** (mean 0.704, max 0.708) **[R]**. Weak but non-trivial: the baseline any new audit statistic must beat. The catch: per-class ROC with 75 items and ~15 errors per class gives thresholds whose SE swamps the effect — the same point Chew et al. (2026) make from the human side, where annotator bias is *stable* and hence estimable, but not at 75 items **[P]/[I]**.

### 2.6 Latent class models, Crowd Truth, disagreement-as-signal

Dawid & Skene (1979); Raykar et al. (2010); and the epidemiological version that matters conceptually — Hui & Walter (*Biometrics* 36:167–171, 1980): with **three** conditionally independent tests and no gold, sensitivity, specificity and prevalence are exactly identified; with two they are not **[P]**. Three puts us at the boundary, not inside it: the binary 2×2×2 table has 7 df and the independence model exactly 7 parameters. **Zero residual df — dependence is untestable at k = 3** **[I]**, and a local-dependence term spends the last one.

**Crowd Truth.** Aroyo & Welty (*AI Magazine* 36(1):15–24, 2015): disagreement is a property of the *unit*, not the annotator; an item on which annotators disagree has unsettled meaning, and the output should be a vector of interpretations with unit-quality, annotator-quality and vector-grounding metrics **[P]**. It lands precisely: `general_inquiry` behaves like a Crowd-Truth unit — **16 of the 31 all-wrong are `general_inquiry`**, lowest plurality accuracy (0.787), highest stem ICC (0.84); `technical_support` has **zero** all-wrong and plurality accuracy 1.000 **[R]**. The catch-all class is where the ceiling lives. This is an argument that the *target* is mis-specified for one class, not an estimator you bolt on.

### 2.7 Social choice: jury size and supermajority under dependence

Condorcet needs independence; Ladha (1992) shows exchangeable correlated juries still improve but converge below 1 (in R1). Kaniovski (*Theory & Decision* 69:453–468, 2010) proves the homogeneous-correlated theorems; with Zaigraev (*T&D* 71, 2011) he treats **jury design** — size and threshold jointly — noting the correlation-robust rule "does not necessarily maximize the jury's competence; this is accomplished by simple majority" **[P]**. Kaniovski (2026 preprint) reports non-monotone competence **[U]**; Pivato (2017) generalises to correlated voters **[P]**.

**Quantified on this panel.** One-factor model `Z_i = √ρ·U + √(1−ρ)·E_i`, correct iff `Z_i > τ`, ρ solved to reproduce the observed co-error (0.1144) at mean accuracy 0.8511 → **ρ = 0.930** **[R]**. The model then *predicts*: `c` at k = 3 = 9.97 % (observed 10.33 %); unanimity precision 88.9 % (observed 89.1 %). Its extrapolations (600 k draws, seed 23) **[R]**:

| k | majority acc. | P(unanimous) | precision \| unanimous | 2/3 supermajority acc. |
|---|---|---|---|---|
| 3 | 0.856 | 0.897 | 0.889 | 0.856 |
| 5 | 0.857 | 0.858 | 0.902 | 0.825 |
| 9 | 0.859 | 0.819 | 0.913 | 0.841 |
| 15 | 0.859 | 0.788 | 0.921 | 0.838 |
| 51 | 0.860 | 0.723 | 0.936 | 0.834 |

Three readings. (i) **Panel expansion is dead**: k = 3 → 51 buys 0.4 pt. (ii) **Unanimity is a precision dial that costs coverage**: 88.9 % → 93.6 % for 89.7 % → 72.3 % coverage; no k reaches 95 %, because the limit is `1 − r`. (iii) **Supermajority rules hurt under correlation**: requiring 2/3 *lowers* accuracy monotonically in k — extra voters add shared error faster than independent error.

Deliberative polling and jury selection change preferences through information exchange — in our terms L2, not aggregation; R1 already showed debate does not reliably beat self-consistency. Nothing there speaks to LLM panels **[I]**.

---

## 3. The three most promising transplants

### 3.1 Transplant 1 — counterfactual second-order elicitation (the only one that adds an observable)

**Theorem (plain SP is a relabelling of plurality).** Let `v(c)` be vote share, `q̄(c) = (1/n)Σ_i q_i(c)` the mean forecast, `s(c) = v(c) − q̄(c)`. If forecasts are *self-anchored* — each voter's forecast is its own belief mixed with any common prior π,

```
q_i = (1 − ε)·e_{a_i} + ε·π ,    ε ∈ [0,1)
```

then `q̄(c) = (1−ε)v(c) + επ(c)` and

```
s(c) = v(c) − (1−ε)v(c) − επ(c) = ε·(v(c) − π(c))
```

so `argmax_c s(c) = argmax_c v(c)` at **every** k and every ε **[I]**. Unanimous case: `s(Y) = ε(1−π(Y)) > 0` and `s(z) = −q̄(z) < 0`, so a unanimous vote is never overturned. Split case: flipping needs `q̄(c_maj) − q̄(c_min) > 1/3`, which under self-anchoring is `(1−ε)/3 < 1/3`. **Never.**

That explains Liu (2026), Denisov-Blanch (2026) and the shrinking ISP gain: all measure a monotone transform of the vote. It is also why Prelec's humans work — a human's forecast is not generated by the process that generated their answer.

**The fix: change the information set, not the statistic.** For model m and record r:

```
a_m(r) ~ p(· | text, POLICY)                                   first-order answer (already collected)
q_m(r) ~ p(· | text, POLICY, "predict what a model WITHOUT the policy guidelines would answer")
```

Now `q̄` is generated under a counterfactually impoverished information set, so `q̄ ≠ f(v)` by construction, and the residual

```
Δ(r) = Σ_c v(c)·[ v(c) − q̄(c) ]
```

is a **gold-free estimate of how far the injected evidence moved the panel against its own prior**. Large positive Δ = the panel's answer is surprising relative to what the same models would say without the evidence: the formal version of "the evidence did work here".

**Why this fits Curlset.** L2's gate is "does `c` drop?", which today requires gold; the counterfactual residual is a *label-free* proxy for the same quantity, computable on unlabelled production data.

**Identification condition.** SP differs from plurality iff `ε > 0` **and** `π^{no-policy}` is not proportional to the vote — so the experiment must *measure* `corr(q̄, v)`. If ≈ 1, the elicitation is self-anchored and the method is dead on arrival. That is a one-number pre-test.

**Cost:** 300 × 3 × 1 = 900 calls, the same as the original run.

### 3.2 Transplant 2 — testlet-aware evaluation and audit (the one that changes every number)

Psychometrics has a name for a test whose items come in paraphrase bundles: a **testlet** (Wainer, Bradlow & Wang, CUP 2007; Bradlow, Wainer & Wang, *Psychometrika* 64:153–168, 1999). The standard model adds a cluster random effect:

```
P(X_ij = 1) = σ( θ_i − b_j − γ_{d(j)} ) ,   γ_d ~ N(0, σ²_γ)
```

Ignoring testlets inflates reliability, narrows intervals, and makes an item bank look larger than it is **[P]**.

**Measured here.** 300 records → 99 stems. `σ²_stem = 0.0537`, `σ²_resid = 0.0431`, **ICC_stem = 0.555**; for the all-wrong indicator **ICC = 0.716, DEFF 3.39, n_eff 88.5** **[R]**.

Four consequences, each a concrete change:

1. **Every CI is ~1.84× too narrow.** "86.3 % ± 3.9 %" on 300 records should be ±7.2 %.
2. **The audit arithmetic multiplies by 3.4**: 59 clean audits for 95 % becomes ~200.
3. **Sample one record per stem** (stratified cluster sampling, one unit per cluster) and the design effect disappears; 99 stems cover the population exactly.
4. **One retrieved policy sentence can fix a whole stem.** The 31 all-wrong are 8 policy questions, so the relevant information unit is the policy, not the record. Predicted signature: gains arrive **lumpy** (3–6 records at a time). That lumpiness is also the falsification test — if gains arrive smoothly, the retrieval is acting as noise, not knowledge.

### 3.3 Transplant 3 — cross-classified latent class with an explicit shared-failure regime

No published CCT variant models correlated informants (§2.2), but R1's two-regime mixture parameterises exactly, and adding the stem level makes it estimable:

```
Z_k ~ Cat(π);  S_k ~ Bern(r)                       # S_k = 1: item is in the shared-failure regime
P(X_ik = Z_k | S_k=0) = D_i ,  P(X_ik = z | S_k=0) = (1−D_i)/(C−1)
P(X_ik = z | S_k=1) = 1[z = w_k]                   # all informants emit the same wrong label
logit D_i ~ N(μ_d, σ²_γ) within stem d
```

`S_k` is the formal statement of "this item is a shared blind spot". **And it is why the model cannot work unsupervised:** `(S_k = 1, w_k = unanimous label)` and `(S_k = 0, Z_k = unanimous label, D_i ≈ 1)` are observationally equivalent. Identification comes only from the *relative frequency of split items* — a modelling assumption, not data **[I]**.

**Why propose it anyway.** The parameters are the right *reporting* quantities once there is any supervision. With the 8 stem-level adjudications from Phase 0, the model estimates `r` (the shared-blind-spot rate) with a real standard error and — the useful part — **predicts which unadjudicated stems are in the `S = 1` regime** from their split rates: an active-learning acquisition function with a psychometric justification. The likelihood gap against the saturated model (244 nats here) is also a usable dashboard statistic for "how far is this panel from self-certification".

---

## 4. Evidence table

| # | Method | Source | Setting | Effect | Status |
|---|---|---|---|---|---|
| 1 | Rasch/2PL/3PL | Lord & Novick 1968 | Psychometrics | Separates b, a, c | [P]; needs ≳200 examinees [I] |
| 2 | CCT-MC | Romney et al. 1986; Batchelder & Anders 2012 | Ethnography | Gold-free key, 1 param/informant | [P] |
| 3 | Bayesian / ordinal CCT; CCT without consensus | Oravecz et al. 2014; Anders & Batchelder 2015; Gürkan & Suchow 2023 | Ethnography, survey | Full posterior; iDLC-CCT for subcultures | [P] |
| 4 | IRT applied to LLM benchmarks | Zhou et al., AAAI 2026 | Benchmarks | No single dimension; item saturation | [P] |
| 5 | Surprisingly popular | Prelec, Seung & McCoy 2017 | Human quizzes | **−21.3 % errors vs majority** | [P] |
| 6 | Inverse SP | Ai et al., ICML 2026 | UltraFeedback/MMLU | **73.26 vs 72.21 %**; shrinks with K | [P] |
| 7 | BTS for LLMs | Liu, ICML 2026 | LLM panels | **−1 pt acc; −21…−32 % ECE** | [P] |
| 8 | SP on LLM truthfulness | Denisov-Blanch et al. 2026; Goel 2025 | 5 models × 4 benchmarks; TruthfulQA | No consistent gain; +24 % vs weak baseline | [P] |
| 9 | SDT; label variance; Hui–Walter | Green & Swets 1966; Chew et al. 2026; Biometrics 36:167, 1980 | Psychophysics, annotation, diagnostics | d′ vs criterion; 3 tests identify se/sp/prev | [P] |
| 10 | Crowd Truth | Aroyo & Welty 2015 | Annotation | Disagreement as unit signal | [P] |
| 11 | Condorcet / optimal jury under correlation | Ladha 1992; Kaniovski 2010; Kaniovski & Zaigraev 2011 | Theory | Bounded below 1; size + threshold jointly | [P] |

---

## 5. Why these might fail

### 5.1 Identifiability: the truth is 244 nats worse than the wrong answer

Drop the gold and fit CCT-MC (3 parameters) and Dawid–Skene (36 + prior) by EM, three random starts each **[R]**:

| Quantity | Value |
|---|---|
| CCT-MC competences recovered | 0.971 / 0.970 / 0.978 |
| True accuracies | 0.867 / 0.813 / 0.873 |
| CCT-MC accuracy vs gold | 0.8633 (= plurality exactly) |
| Dawid–Skene accuracy vs gold | 0.8633 (= plurality exactly) |
| DS estimated confusion diagonal, model 1 | 1.00 / 1.00 / 0.94 / 0.95 |
| DS true confusion diagonal, model 1 | 0.87 / 0.87 / 0.73 / 1.00 |
| LL at true key + true confusions | **−761.2** |
| LL at plurality key + fitted confusions | **−517.0** |

Every unsupervised method here — CCT, Dawid–Skene, Hui–Walter, a 2PL with guessing, an Ising coupling — maximises the same likelihood, and that likelihood is **244 nats higher at the wrong answer**. The fitted model reports 94–98 % accuracy for three models that are 81–87 % accurate, with tight posterior intervals.

It does not shrink with more data: a unanimous-wrong and a unanimous-right record contribute likelihood in the same functional form. **The only identifying information in the dataset is the 33 records where models disagree.** Everything else is a label shuffle — the formal content of "the ceiling is arithmetic". Corollary for the product: a gold-free consensus-confidence score is not merely imprecise, it is biased upward by roughly the size of the blind spot, here 12 points.

### 5.2 Statistical power: everything is inside the noise

At `n_eff = 89` the SE on 86 % is 3.7 points. The competing interventions are worth +0.4 pt (k = 51), +1.7 pt (per-class routing, 5-fold CV), +1.05 pt (ISP), −1 pt (BTS) — **all within a quarter of a standard error of one another**. Only structural effects are detectable here: `c` moving ≥ 4 points, and CI width itself.

### 5.3 The methods import assumptions the data violate in a known direction

| Method | Assumption | Violation | Bias direction |
|---|---|---|---|
| IRT | Local independence across items | 99 stems × ≤9 paraphrases; ICC_stem 0.555 | Item information inflated ~3.4× |
| CCT | Conditional independence of informants | φ = 0.78 | Competence inflated (measured +12 pts) |
| Dawid–Skene | Same, plus identified confusion | 36 params vs 19 observed patterns | Recovers plurality by construction |
| Hui–Walter | ≥3 independent tests | exactly 3, saturated (7 df, 7 params) | Dependence untestable |
| SP / BTS | Forecast from a different information set | LLM forecasts self-anchored | SP ≡ plurality (proved) |
| Condorcet | Exchangeable votes, independent items | both violated | Ceiling `1 − r` |
| SDT | Many trials per class | 75 items, ~15 errors | Threshold SE > effect |

The pattern: **each method's diagnostic is optimistic in exactly the direction that would hide the real problem** — which is why importing them unchecked would look like progress.

**5.4 Corollary.** The panel gives 900 bits about 300 items, of which the identifiable part is the 33 disagreements **[I]**. No function of those bits recovers what is not there: every tradition here is a better way to read the same bits, and the best reading is already known (plurality 86.3 %, oracle 89.7 %). One escape lies inside this memo's scope — elicit a quantity that is *not* a function of the existing votes (§3.1); one lies outside it, and the data makes it precise: **fix eight stems**.

---

## 6. Concrete design and the decisive experiment

### 6.1 Phase 0 (free, 1 day) — re-base every number on stems

1. **Add `stem_id`** (parentheticals stripped, lowercased); verify it yields 99 clusters.
2. **Report `c` at both levels**: record 31/300 = 10.33 %; stem 8/99 = **8.08 %**, ratio 3.9×, so the stem-level oracle is **91.9 %** — *higher* than 89.7 %. Publish both, labelled.
3. **Cluster-robust CIs** (bootstrap over stems, or the 1.84× inflation).
4. **Re-size the audit**: one record per stem, stratified by class, DEFF-free.
5. **Fix `_phi` on constant vectors** — with a stem-level class breakdown, `technical_support` (plurality 1.000) hits exactly that degenerate case.

**Gate:** the map must reproduce the 8-stem concentration; otherwise §6 is wrong and should be abandoned.

### 6.2 Phase 1 (8 adjudications, not 31) — highest information per unit cost

Adjudicate **one record per all-wrong stem**, then check the stem's other records. Classify each: (a) gold error, (b) model blind spot, (c) genuinely ambiguous, (d) label-policy boundary a written rule could resolve.

Predicted distribution from the text **[I]**, to be checked not assumed: `who do i ask about an invoice from last year?` (6 records, gold `general_inquiry`, all three say `billing`) is a shared linguistic blind spot — models key on "invoice" and miss that the question asks *who to ask* — (b). `what happens if we downgrade?` (5) and `what tier are we on?` (5) are boundary cases, likely (d). `the number changed without anyone telling us` (5) and `we pay for five seats and only three work` (5) read as bugs — (b)/(d). `wish this worked on my phone` (3) is (b) and the most clearly fixable by policy text.

If the (a)/(d) share is high the ceiling moves with no modelling at all. If it is low the blind spot is real and L2 is the only path — but it is **eight misconceptions**, so the intervention is eight retrieved policy sentences, not a new vendor.

### 6.3 Phase 2 — the decisive experiment: counterfactual second-order elicitation

**H1.** Models' forecasts of "what would a model *without* the policy guidelines answer" are anti-correlated with their own answers exactly where the policy matters, and the residual ranks the all-wrong band better than confidence (baseline AUC 0.707).

**Design.** Same 300 records (gold exists). Factor A (within-record): elicitation mode — answer only [existing]; answer + forecast of other models; answer + forecast of *the same model without the policy*. Factor B (within-record): with vs without retrieved policy (the L2 intervention). Statistic `Δ(r) = Σ_c v(c)(v(c) − q̄(c))` per condition. 900 calls for the primary endpoint; 5,400 for the full factorial.

**Primary endpoint.** AUC of `Δ` for detecting the 31 all-wrong, vs the 0.707 confidence baseline, paired bootstrap over stems (10 k resamples, cluster-respecting).

**Secondary.** (a) `corr(q̄, v)` — if ≈ 1, report and stop; (b) does counterfactual SP beat plurality on the 33 splits (bar 22/32, now 21/32); (c) `Δ` as a label-free proxy for policy effect.

**Pre-registered decision rule.** Ship the audit-ranking use only if AUC ≥ 0.80 and the paired 95 % bootstrap interval excludes 0.707. Ship the aggregation use only if it recovers ≥ 22/32 splits. Otherwise publish the null — at 900 calls it is the cheapest decisive result in the project and it closes the SP branch permanently.

**Why this and not the others.** Every other candidate is pre-determined by the arithmetic: panel expansion (86.0 % asymptote), CCT/DS (plurality, 244 nats), per-class routing (+1.7 pt, in-sample-optimistic). Counterfactual elicitation is the only place where the second-order report is *not* a function of the first-order vote.

### 6.4 Disposition of the rest

| Tradition | Disposition |
|---|---|
| IRT | Adopt the vocabulary (difficulty vs discrimination vs guessing) in item reports; do not fit a 2PL. Report the **bifactor** general-factor share (0.93) as the honest "how redundant is my panel" number, replacing φ. |
| CCT | Not as an aggregator (it certifies the blind spot). Ship the stem-level mixture (§3.3) as an acquisition function once Phase 1 supervision exists. |
| SP / BTS | Not as an aggregator (proved equivalent to plurality under self-anchoring; −1 pt empirically). Test the counterfactual variant (§6.3). |
| SDT / Crowd Truth | SDT defines what is *fixable* — bias moves, sensitivity does not; report per-model per-class d′ but do not optimise thresholds at n = 75. Crowd Truth is the argument for splitting `general_inquiry` (16/31 all-wrong, ICC 0.84); multi-label output there is the only honest way to raise the headline number. |
| Social choice | Use the correlated-jury table as the ceiling display. Cite Ladha/Kaniovski, not Condorcet. |
| Testlets | **Adopt immediately** — 3.4× wider intervals, 8 adjudications instead of 31, correct audit design. |

---

## 7. References

1. Ai, R., Pan, Y., Simchi-Levi, D., Tambe, M., Xu, H. *Beyond Majority Voting: LLM Aggregation by Leveraging Higher-Order Information.* ICML 2026; arXiv:2510.01499. [P]
2. Anders, R., Batchelder, W. H. *Cultural Consensus Theory for the Ordinal Data Case.* Psychometrika 80(1):151–181, 2015. [P]
3. Aroyo, L., Welty, C. *Truth Is a Lie: Crowd Truth and the Seven Myths of Human Annotation.* AI Magazine 36(1):15–24, 2015. [P]
4. Batchelder, W. H., Anders, R. *Cultural Consensus Theory: Comparing Different Concepts of Cultural Truth.* J. Math. Psych. 56(5), 2012. [P]
5. Bradlow, E. T., Wainer, H., Wang, X. *A Bayesian Random Effects Model for Testlets.* Psychometrika 64:153–168, 1999. [P]
6. Chew, R., Eckman, S., Kern, C., Kreuter, F. *From Ground Truth to Measurement.* arXiv:2604.07591, 2026. [P, preprint]
7. Denisov-Blanch, B. et al. *Consensus is Not Verification: Why Crowd Wisdom Strategies Fail for LLM Truthfulness.* arXiv:2603.06612, 2026. [P, preprint]
8. Goel, N. *On the Truthfulness of "Surprisingly Likely" Responses of Large Language Models.* arXiv:2311.07692, 2025. [P]
9. Gürkan, N., Suchow, J. W. *Harnessing Collective Intelligence Under a Lack of Cultural Consensus.* arXiv:2309.09787, 2023. [P, preprint]
10. Hui, S. L., Walter, S. D. *Estimating the Error Rates of Diagnostic Tests.* Biometrics 36(1):167–171, 1980. [P]
11. Kaniovski, S. *Aggregation of Correlated Votes and Condorcet's Jury Theorem.* Theory and Decision 69(3):453–468, 2010. [P]
12. Kaniovski, S., Zaigraev, A. *Optimal Jury Design for Homogeneous Juries with Correlated Votes.* Theory and Decision 71, 2011. [P]
13. Ladha, K. K. *The Condorcet Jury Theorem, Free Speech, and Correlated Votes.* AJPS 36(3), 1992. [P]
14. Liu, S. L. *Bayesian Truth Serum for LLMs?* ICML 2026 (poster). [P]
15. Lord, F. M., Novick, M. R. *Statistical Theories of Mental Test Scores.* Addison-Wesley, 1968 (incl. Birnbaum's 3PL chapter). [P]
16. Luo, T., Liu, Y. *Machine Truth Serum.* arXiv:1909.13004; Machine Learning, 2023, doi:10.1007/s10994-022-06183-y. [P]
17. Macmillan, N. A., Creelman, C. D. *Detection Theory: A User's Guide*, 2nd ed. Erlbaum, 2005. [P]
18. Oravecz, Z., Vandekerckhove, J., Batchelder, W. H. *Bayesian Cultural Consensus Theory.* Field Methods 26(3):207–222, 2014. [P]
19. Prelec, D. *A Bayesian Truth Serum for Subjective Data.* Science 306(5695):462–466, 2004. [P]
20. Prelec, D., Seung, H. S., McCoy, J. *A Solution to the Single-Question Crowd Wisdom Problem.* Nature 541(7638):532–535, 2017. [P]
21. Romney, A. K., Weller, S. C., Batchelder, W. H. *Culture as Consensus.* American Anthropologist 88(2):313–338, 1986. [P]
22. Schoenegger, P., Tuminauskaite, I., Park, P. S., Tetlock, P. E. *Wisdom of the Silicon Crowd.* Science Advances 10, 2024. [P]
23. Wainer, H., Bradlow, E. T., Wang, X. *Testlet Response Theory and Its Applications.* CUP, 2007. [P]
24. Whitehill, J., Ruvolo, P., Wu, T., Bergsma, J., Movellan, J. *Whose Vote Should Count More.* NIPS 2009. [P]
25. Zhou, H. et al. *Lost in Benchmarks? Rethinking LLM Benchmark Evaluation.* AAAI 2026; arXiv:2505.15055. [P]

Read, not relied on: Shi et al. 2025 (abstract only) [U]; Kaniovski 2026 preprint [U]; Pivato 2017 [P, not used numerically]; Dametto 2026 [U].

**Not found, therefore not claimed:** any published CCT application to LLM panels; any CCT variant modelling correlated informants directly; any replication of Prelec et al. (2017) where forecasts are generated by the same process as answers and SP still wins; any IRT study with < ~20 examinees reporting stable item discrimination.

---

### Appendix — reproductions

All **[R]** figures come from `repo/data/hard.db` and re-run in < 5 s. Stems: `re.sub(r"\s*\([^()]*\)", "", text).strip().rstrip(".").lower()` on `dataset_records.metadata->>'text'` → 99 strings, sizes `1×39, 2×13, 3×6, 4×17, 5×11, 6×4, 7×4, 8×3, 9×2`. CCT-MC and Dawid–Skene: EM, 3 starts each, identical fixed point. Jury simulation: `Z_i = √ρ·U + √(1−ρ)·E_i`, correct iff `Z_i > Φ⁻¹(1−p)`, ρ solved so `P(both wrong) = 0.1144` at `p = 0.8511`, 600 k draws, seed 23. Variance components: `MixedLM("y ~ C(model)", groups=stem)`, REML. DEFF `= 1 + (m̄−1)·ICC`, ICC by one-way ANOVA within multi-record stems.
