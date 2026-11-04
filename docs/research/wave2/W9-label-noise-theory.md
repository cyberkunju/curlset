# W9 — Label Noise: Theory, Limits, and Best Methods

**Date:** 2026-11-04 · **Scope:** theoretical limits of label accuracy, identifiability of latent truth, detection and robust-training methods, and their consequences for Curlset's 4-class, 3-voter, 300-record setting.
**Relation to wave 1:** does not restate R1's correlated-error identity, R2's confident-learning algorithm, or R10's gain table. Where those apply, this report cites and extends them.

**Evidence tags.** **[P]** primary source, peer-reviewed, or a result the paper states about itself. **[R]** reported at abstract level or via a secondary description — direction reliable, exact number not independently reproduced here. **[I]** inference or derivation by me, not a published theorem. **[U]** unverified or unknown.

---

## 1. Executive summary

1. **"Near-perfect" labelling requires two conditions, both measurable, neither satisfied here:** a nearly deterministic task (`R*` near zero) and a nearly perfect reference standard. These are separate failures with separate arithmetic. A *perfect* labeller measured against gold with error rate `e` scores exactly `1 − e` — **96.7%** at Northcutt's 3.3% average, **94.2%** at ImageNet's 5.83%. Any claim above that is a claim about the gold, not the labeller.

2. **Three noise regimes, three ceilings.** Symmetric noise never changes the Bayes classifier or the Bayes risk — only a constant. Class-conditional noise with an identifiable `T` preserves even the minimax *rate*, up to log factors. Instance-dependent noise carries an additive, irreducible floor proportional to the mass of instances whose signal is destroyed (Zhu et al., NeurIPS 2024). LLM noise on hard examples is the third case.

3. **A two-labeller disagreement bound settles the 99% question with no modelling.** For any two labellers disagreeing on a fraction `d` of items, `(acc₁ + acc₂)/2 ≤ 1 − d/2`. If two careful humans disagree on more than **2%** of this dataset, 99% is impossible for *any* labeller. The highest-value experiment available.

4. **Three correlated annotators and no gold do not identify the truth.** Three noisy labels per instance is exactly the Kruskal boundary — necessary *and* sufficient (Liu et al., ICML 2023) — but sufficiency requires informative, conditionally independent labels. At φ = 0.78 the second premise fails. The latent-class model has 39 parameters against 63 observable degrees of freedom; at n = 300 the cells average 4.7 counts and φ is estimated on ~34 errors per model, giving a standard error near 0.1. **You can know the votes are correlated; not by how much.**

5. **Detection methods are ranked by whether their assumption holds.** A 2025 benchmark finds plain in-sample probabilities with a logit margin beat elaborate pipelines in most settings [P]. AUM needs a training trajectory a hosted LLM does not have; confident learning needs a "sufficiently accurate" model, which a 10% blind spot denies; LLM auditing finds 6–21% of benchmark errors at ≈⅔ precision above 95% confidence — a router, not a certifier.

6. **Robust training works where there is data to spare.** DivideMix reaches 94.6% at 50% symmetric noise; co-teaching gains 14 points at 45% pair noise; both need 50k–1M examples and from-scratch training. At n = 300 there is no early-learning phase to exploit, which is why early stopping is the strongest baseline.

7. **Instrument and object are the same thing.** The 31 all-wrong records are, by construction, where a third opinion is most likely to share the bias — and where gold is most likely wrong. The ceiling `(269 + k)/300` is a random variable driven by an unmeasured gold error rate concentrated exactly there.

8. **The number to carry forward.** 99% against the current gold requires 28 of the 31 unanimous errors to be gold errors. That is arithmetic impossibility, not a research problem. 95% requires 16 of 31: bounded and testable.

---

## 2. Theoretical limits

### 2.1 Four noise models and what each preserves

Let `Y ∈ {1..K}` be true, `Ỹ` observed, `η_k(x) = P(Y=k|x)`, `η̃_k(x) = P(Ỹ=k|x)`. Bayes risk is `R* = E_X[1 − max_k η_k(X)]`.

**M1 — symmetric noise.** With probability `ρ` the label is replaced by a uniform wrong class:

> `η̃_k = (1−ρ)η_k + ρ(1−η_k)/(K−1) = α·η_k + ρ/(K−1)`,  `α = (K−1−Kρ)/(K−1)`.

`α > 0` iff `ρ < (K−1)/K`, so the map is a monotone affine transform of `η` and **argmax is preserved**: `R̃* = R*`. For K = 4 the information-destruction threshold is ρ = 75%; at 10% noise the signal is scaled by `α = 0.867`. [I, from the algebra; consistent with Zhu et al. 2024's consistency condition `ρ < (K−1)/K` [P]]

**M2 — class-conditional (asymmetric) noise.** A fixed `T`, `T_ij = P(Ỹ=i|Y=j)`, independent of x: `η̃ = Tᵀη`. If `T` is known and invertible, `η = (Tᵀ)⁻¹η̃` and the clean Bayes classifier is recoverable, at a price of `‖T⁻¹‖ = 1/σ_min(T)`: the effective sample size for any contrast is deflated by `σ_min(T)²` [I]. If `T` is singular — two classes the annotators cannot distinguish — no correction exists, and the confusion is an information barrier rather than an estimation problem.

**M3 — instance-dependent noise.** `T(x)`, so `η̃(x) = T(x)ᵀη(x)`. For any candidate `η` and any observed `η̃` some `T(x)` maps one to the other, so the model is **not identified without restrictions**. This is the realistic model for LLM labels.

**M4 — semi-supervised / anchored.** A clean subset of size `m` plus a noisy remainder. `T` is then estimable at rate `O(1/√m)` in operator norm, and the corrected classifier inherits error of order `‖T̂ − T‖·‖T⁻¹‖²` [I]. Curlset already does this: gold is the anchor. The consequence is that **every correction is a measured extrapolation whose error bar is set by the gold set**, not by the number of unlabelled records.

### 2.2 Identifiability: what can be recovered without clean data

**(a) Label switching is unavoidable.** Any latent-class model is identified at best up to a permutation: `(π, T) → (Ππ, ΠTΠᵀ)` leaves the likelihood unchanged. An anchor per class, known prevalence, or a fixed prior pins it; without one, "class 1" is only "the class everyone calls 1".

**(b) Two annotators are not enough.** Two binary raters with free sensitivity and specificity give 5 parameters against 3 observable degrees of freedom. Three raters under conditional independence give 7 and 7 — exactly identified (Hui & Walter, *Biometrics* 1980) [P].

**(c) Three noisy labels is the exact boundary.** Liu et al. (ICML 2023, Thm 5) show via Kruskal rank that "three informative noisy labels `Ỹ₁,Ỹ₂,Ỹ₃` are **both sufficient and necessary** to identify `T(X)`" [P]. This is the sharpest statement available: with two voters the transition structure is unidentifiable in general; with three it is identified *only if* the Kruskal rank condition holds — a statement about the diversity of the error structure, not the count of voters.

**(d) Our parameter count.** For K = 4, m = 3: a three-way 4-level table has `4³ − 1 = 63` free cells. The latent-class model has `3` prior parameters plus `3 × 12 = 36` confusion entries = **39**, leaving **24 df**. So conditional independence is testable in principle. A class-independent pairwise coupling costs `(K−1)² = 9` parameters per pair — `27` for three pairs, still more than the 24 available, so even that is not identified. A single scalar coupling per pair (3 parameters) leaves 21 df and is. [I]

**(e) The empirical fact.** At n = 300 the cells average `300/64 ≈ 4.7` observations, and the dependence parameter is estimated on the error indicator, which has ~34 positives per model. The standard error on φ is of order 0.1 [I]. Curlset's φ = 0.776–0.799 is therefore "strongly positive, magnitude uncertain by ±0.1", and `n_eff` ranges over roughly 1.10–1.26 on that interval. **The ceiling is known to be near 90%; it is not known to the percentage.**

**(f) Dawid–Skene is not strictly identifiable in general** (2026 review, which adopts a weaker local-uniqueness notion instead) [R]. With correlated annotators the conditional-independence premise fails outright; a TMLR 2026 audit on MultiPref finds it failing on real multi-annotator preference data [R, abstract-level]. Operationally: **fitting DS to three correlated LLM voters without gold produces numbers, not estimates.**

### 2.3 The Bayes floor and the margin condition

The decomposition that matters is `R(h) = R* + [R(h) − R*]`: the first term is irreducible given the label definition, the second is estimation error. The Tsybakov margin condition

> `P(|2η(X) − 1| ≤ t) ≤ C·t^α`,  `α ≥ 0`

controls only the second. Under it, ERM over a class with VC dimension `V` attains excess risk between `n^{-1/2}` (α = 0) and `n^{-1}` (α = ∞, Massart) (Tsybakov 2004; Audibert & Tsybakov 2007) [P]. **It says nothing about `R*`**, which for a 4-class task with genuine ambiguity is a property of the label definition and can be several percent; no estimator removes it.

### 2.4 Minimax rates: what noise does and does not cost

- **Symmetric:** rates unchanged. In the binary case, `R̃(h) − R̃(h*) = (1 − 2ρ)(R(h) − R(h*))` (Natarajan et al., NIPS 2013) [P]; the factor vanishes at ρ = ½, where the label carries no information. For K classes the factor is `α`, vanishing at `(K−1)/K`.
- **Class-conditional, unknown rates: the rate need not degrade at all.** Reeve & Kaban (ICML 2019) prove the Robust kNN classifier attains "the minimax optimal rates of the noise-free setting, up to a log factor, even when trained on data with unknown asymmetric label noise", given the identifiability conditions, a measure-smoothness condition and Tsybakov's margin condition [P]; **standard kNN is not even consistent** there. This reframes the problem: asymmetric noise is not a ceiling, it is a requirement to satisfy identifiability and use the right estimator.
- **Instance-dependent: an additive floor.** Zhu et al. (NeurIPS 2024) prove, for excess risk against the **clean** Bayes classifier,

> `inf sup E[R(f̂) − R(f*)] ≥ ((K−1)/K)·ε + Ω(1/(κ√n))`,  `E[R(f̂) − R(f*)] ≤ ε + Õ(1/(κ√(V/n)))`

where `ε` is the mass of instances whose relative signal strength is too low to recover the class [P]. The bounds match up to constants. For K = 4 the coefficient is 0.75: **each point of unrecoverable instance mass costs at least 0.75 points of excess risk.**
- **Knowing the noise rates is not the lever.** The same paper's title result is that noise-ignorant ERM attains near-optimal risk and outperforms methods given the noise rates [P]. Correction machinery is not where the gains are.

### 2.5 Two identities that decide what a number means

**Agreement.** With `a = P(model wrong)`, `e = P(gold wrong)`, `c = P(both wrong)`, model and gold agree unless exactly one is wrong, so

> **measured accuracy = 1 − a − e + 2c.**

A perfect model (`a = c = 0`) measures `1 − e`: **the measurement ceiling of a perfect labeller is the gold error rate.** A model that errs where gold errs (`c = min(a,e)`) measures `1 − |a − e|`: **agreement with gold rewards shared error.** Same algebraic shape as R1's `1 − 3p + 2c`, same lesson — accuracy is a statement about a relationship, not about truth.

**Disagreement.** For any two labellers on the same items with disagreement rate `d`, `(acc_A + acc_B)/2 ≤ 1 − d/2`, hence `max ≤ 1 − d/2`. *Proof:* on each of the `dn` disagreement items at most one is correct, so correct answers total at most `2(n − dn) + dn = 2n − dn`. ∎ [I]

**Corollary.** If two careful annotators disagree on more than 2% of items, no labeller — human, model or ensemble — reaches 99% on that task *as defined*. At 4% disagreement the cap is 98%; at 5%, 97.5%. This needs no model and assumes only that both label the same items under the same instructions. Its limit: it bounds the better of the two annotators, not `R*`.

### 2.6 The numbers for this project

| Quantity | Value | Source |
|---|---|---|
| All-three-wrong mass `c` | 31/300 = 10.33% | measured |
| Plurality accuracy | 86.33% | measured |
| Oracle vote ceiling (≥1 correct vote) | 269/300 = **89.67%** | measured |
| Effective votes at φ = 0.78, k = 3 | 1.17 (limit 1.28) | R1 |
| Records to reach 95% | **16 of 31** | arithmetic |
| Records to reach 99% | **28 of 31** | arithmetic |
| Measurement ceiling if gold is 3.3% wrong | **96.7%** | §2.5 |
| Clean audits to certify 95% / 99% at zero errors | 59 / 299 | synthesis |

The gap from 89.67% to 95% is 16 records; from 95% to 99% another 12, all drawn from a band where the evidence is unanimous *and wrong*. At 99% you assert that 28 of 31 unanimous model errors are gold errors — a contradiction with the measured 86.33%.

**Answer, stated plainly.** Attainable accuracy with the current information is **89.7%** and no higher. Adjudicating the 31 raises it by at most the number of genuine gold errors — plausibly to **92–95%**. 99% additionally requires `R* ≤ 1%`, human disagreement ≤ 2%, gold ≥99% correct, and errors disjoint from the 31; the first two are properties of the task, not the technology.

---

## 3. Methods with evidence

### 3.1 Detection: five families and what each assumes

**Confident learning** estimates `P(Ỹ, Y)` from out-of-sample probabilities via a confident joint pruned per class. Its guarantee requires the model to be *sufficiently accurate* on each class — exactly what a 10% blind spot denies [P]. R2 covers the algorithm; the failure mode is the point: **when model errors correlate with label errors, CL cannot separate them and the confident joint absorbs the correlation into the estimated noise rate.** Reported performance is strong (best of five methods) [R], but the condition is unverifiable without gold.

**AUM** — `(1/T)Σ_t[logit_t(y_i) − max_{j≠y_i} logit_t(j)]` — assumes clean examples are fitted before noisy ones. Removing 17% of WebVision-50 gives −1.6% error; 13% of CIFAR-100 gives −1.2% [P]; precision/recall above 90% is claimed at high noise [R]. It requires from-scratch training with fixed augmentation; label smoothing and strong augmentation destroy the signal; there is no analogue for a hosted API model.

**Forgetting events** (Toneva et al., ICLR 2019) and **data maps** (Swayamdipta et al., EMNLP 2020) share the early-learning premise; their distinctive contribution is the *ambiguous* region, which is not the same as *wrong* — important here, since much of the 31 may be ambiguity rather than error. Neither yields a calibrated error probability. **Influence functions** are "fragile" in deep learning (Basu et al., ICLR 2021) [P] and have nothing to differentiate at n = 300 with a hosted model.

**Disagreement and k-NN consistency.** k-NN needs an embedding where neighbours share a label and fails on the hard items that dominate the error. Ensemble disagreement is the cheapest detector and Curlset already has it — unanimous 88.8% precision vs 59.1% for splits — but it reaches only ~24% of errors because 31 of ~41 are unanimous (R1). **Disagreement is a router, not a detector.**

**LLM-assisted auditing.** Nahum et al. (EMNLP 2025) find 6–21% errors in the TRUE benchmark family, with precision rising to about ⅔ above 95% confidence, and correction shifting reported performance by up to 4 points in training and 15 in evaluation [P]. Recall is unmeasured; precision at usable confidence is ≈0.67, far below any certification threshold.

**The deflationary benchmark result.** Decomposing detectors into (gathering × disagreement measure × aggregation), the best combination across most settings is **in-sample gathering + average predicted probability + logit margin** — the simplest pipeline [P]. Caveat for R2's design: this contradicts the out-of-sample orthodoxy, and at n = 300 in-sample probabilities will be optimistic, so it must be re-tested rather than adopted.

### 3.2 Robust training: what moves accuracy, at what scale

| Method | Best reported effect | Caveat |
|---|---|---|
| DivideMix (Li et al., ICLR 2020) | **94.6%** @50% symmetric; 75.4% @90%; 92.1% @40% asymmetric; 74.2% CIFAR-100 @50% | 50k images, two networks, semi-supervised machinery; essentially recovers clean accuracy [P] |
| Co-teaching (Han et al., NIPS 2018) | **72.62% vs 58.14%** at 45% pair noise; 87.63% vs 80.88% on MNIST | Both networks can converge to the same bias [P] |
| AUM pruning | −1.6% error on WebVision-50 (−17% data); −1.2% on CIFAR-100 (−13%) | Needs training dynamics [P] |
| GCE / symmetric losses, label smoothing, MixUp | Noise-tolerant by construction or calibration-friendly; slower convergence, lower final accuracy; smoothing under asymmetric noise reinforces the bias | Trade clean accuracy; none targets instance-dependent noise [P]/[I] |
| Early stopping | Often matches or beats the above on real human noise | The embarrassing baseline (Wei et al., ICLR 2022) [P] |

Three structural points:

1. **Scale is the hidden variable.** Rolnick et al. (2017) show DNNs generalise when "true labels are massively outnumbered by incorrect labels", at the cost of a proportionate increase in dataset size [P]. The benign regime is millions of examples; Curlset has 300.
2. **Wei et al. (ICLR 2022) is the negative result that matters.** On real human annotations (CIFAR-10N/100N, 20%/40%), "existing methods … are not as effective" and simple baselines such as early stopping often outperform them, because deep nets memorise *human* noise more easily than synthetic noise [P]. The synthetic benchmarks behind the 90%+ numbers are not representative.
3. **Early learning needs a trajectory,** and a frozen hosted LLM has none; the nearest substitute here is out-of-sample probe behaviour — what R2's confident-learning gate proposes.

### 3.3 Instance-dependent noise: the hardest realistic case

The defining difficulty is that **hard examples and label errors are the same objects**: errors are detectable only to the extent that the feature distribution of an erroneous `(x, ỹ)` differs from a correct one. If `P(x | ỹ=i, Y=j) = P(x | ỹ=i, Y=i)` for all `j`, the mislabel posterior is constant in x and no detector beats the base rate [I]. Every detector therefore degrades on the subpopulation that matters.

- **Structure-based identification** (Xia et al. 2020 parts-dependent; Yao et al. 2021 structural causal model) factorises `T(x)` so it becomes identifiable — the right theoretical move, since it restores identifiability by assumption, but the assumptions are not testable from noisy labels alone [I].
- **Ignorance-is-bliss ERM** (Zhu et al. 2024) is the strongest recent result: NI-ERM on self-supervised features reaches state-of-the-art on CIFAR-N *without* modelling the noise [P] — a negative result about correction dressed as a positive one about features.
- **Instance-level difficulty modelling** (Zhang et al., NeurIPS 2025) reports SOTA on five benchmarks including instance-dependent noise with ~75% faster computation [R]. **Instance-dependent outliers** (Nguyen et al., NeurIPS 2024) extends identifiability to outlier items, again requiring multiple annotators [P/R].
- **The deflationary result.** Feng et al. (CVPR 2026) hand correction methods a **perfect, oracle transition matrix** and find they "still suffer from performance collapse during training", attributing it to convergence states, optimisation dynamics, and "information-theoretic limits on what can be learned from noisy labels" [P]. If oracle `T` does not fix correction, estimated `T` will not either.

**Do the 2024–2026 methods beat simple baselines?** On synthetic instance-dependent benchmarks, yes, by 1–4 points. On real human noise the honest answer from the best-controlled study is *not reliably*. The gap between those answers is the gap between a noise model that matches the generative process and one that does not.

### 3.4 Crowd and latent-truth models under dependent annotators — the crux

**What the classical model gives.** Dawid–Skene (1979) is a latent-class EM with one confusion matrix per annotator and no gold — the principled version of `weights.py`. Under conditional independence and enough annotators it recovers per-annotator accuracy and a posterior over the truth. **Three things break, in order of severity.**

1. **Identification requires conditional independence.** With K = 4, m = 3 there are 24 residual df, which makes CI *testable* — and φ = 0.78 is that test failing. Once it fails the fitted confusion matrices estimate nothing: they absorb dependence into apparent accuracy [P for general non-identifiability, R for the MultiPref audit, I for the mapping here].
2. **Dependence and accuracy trade off exactly.** In the two-regime model (with probability `r` all voters share the same error; otherwise independent at rate `q`), unanimity precision is `(1−r)(1−q)³ / [(1−r)((1−q)³ + q³) + r]`. At `r = 0.10`, `q = 0.05` this is 0.88, matching the measured 88.8%. But `r` and `q` are not separately observed from votes. **Without gold you cannot distinguish "three accurate but correlated voters" from "one voter counted three times."** [I]
3. **Information is bounded by `1 − φ`.** R1's `n_eff = k/(1+(k−1)φ̄)` puts the panel at 1.17 of 3 votes, never above 1.28, so **latent-truth inference here is prior-dominated**: changing the prior moves the answer more than adding a voter.

| Quantity | Without gold | With gold |
|---|---|---|
| Marginal vote distribution `P(v)` | yes (that is all you observe) | yes |
| Pairwise error correlation φ | yes, ±0.1 at n=300 [I] | tighter |
| Per-annotator confusion `T_i` | only under CI + Kruskal, which fail here | yes, at rate `1/√m` |
| All-wrong mass `c` | **no** — needs a dependence model (untestable) or an anchor | yes, on the gold's support |
| Per-item posterior over truth | prior-dominated | calibrated only where gold is representative |
| Whether gold is wrong on an item | **no** | no — the regress |

**The regress is the point.** Estimating `c` requires knowing which unanimous items are wrong; that requires an independent label; the only one available is gold; and gold is least reliable exactly there. Northcutt's 3.3–6% estimates are for benchmark test sets, not a 300-item adjudicated set — but they set the order of magnitude.

**2024–2026 work on exactly this.** CARE (Zhao et al., 2026) models judge scores as latent quality plus shared confounders, claims identifiability "via eigengaps", and reports up to 26.8% error reduction [R, preprint]. The Ising aggregator of Balasubramanian et al. (2026) drops conditional independence for explicit couplings and reports gains over majority vote and DS [R, deltas unverified]. Both are the right direction; neither removes the need for an anchor, because a confounder model with unknown structure is a latent-variable model with the same identification problem one level up.

### 3.5 Test-set label errors and ranking instability

Northcutt et al. (NeurIPS 2021 D&B) find a mean of at least **3.3%** errors across ten test sets and **2,916/50,000 = 5.83%** in ImageNet validation [P]. The ranking result is what matters: after correcting ImageNet validation labels and re-ranking 34 models, **NASNet-large falls 1/34 → 29/34 and ResNet-18 rises 34/34 → 1/34** [P]. A 5.83% contamination reversed the entire ordering.

The mechanism is elementary. Under symmetric test-label noise at rate `e`, `Δ_measured = (1 − eK/(K−1))·Δ_true`: for ImageNet (K = 1000, e = 0.058) the factor is 0.942, so a 1-point gap measures as 0.94 and nothing reorders by itself. The reordering comes from the *realised* noise — the 2,916 items are a fixed set, and models differ in how often they agree with the wrong label. If A errs on 30% of them and B on 20%, the gap shifts by `0.058 × 0.10 = 0.58` points, enough to flip any sub-point gap [I]. **A contaminated test set ranks models by behaviour on the contaminated subset, not by accuracy.**

---

## 4. Evidence table

| Claim | Source | Number | Tag |
|---|---|---|---|
| Bayes classifier unchanged under symmetric noise | algebra; Zhu et al. 2024 | `α > 0` iff `ρ < (K−1)/K` | [I]/[P] |
| Binary excess risk scales by `(1−2ρ)` | Natarajan et al. 2013 | exact | [P] |
| Asymmetric noise need not cost rate; plain kNN inconsistent | Reeve & Kaban 2019 | minimax rate up to log | [P] |
| Instance-dependent floor | Zhu et al. 2024 | `≥ (K−1)/K·ε + Ω(1/(κ√n))` | [P] |
| Noise-ignorant ERM near-optimal | Zhu et al. 2024 | beats noise-aware | [P] |
| 3 labels necessary and sufficient for `T(X)` | Liu et al. 2023, Thm 5 | exact | [P] |
| CI fails on real multi-annotator data | TMLR 2026 | qualitative | [R] |
| 2 tests insufficient / 3 sufficient under CI | Hui & Walter 1980 | 5 vs 7 parameters | [P] |
| Benchmark error rates; ranking reversal | Northcutt et al. 2021 | 3.3% mean; 5.83% ImageNet; NASNet 1→29, ResNet-18 34→1 | [P] |
| LLM auditing | Nahum et al. 2025 | 6–21%; ≈⅔ precision at >95% conf. | [P] |
| CL needs a "sufficiently accurate" model | Northcutt et al. 2022 | theorem condition | [P] |
| AUM pruning | Pleiss et al. 2020 | 17% removed → −1.6% err | [P] |
| DivideMix @50% symmetric | Li et al. 2020 | 94.6% CIFAR-10 | [P] |
| Co-teaching @45% pair | Han et al. 2018 | 72.62 vs 58.14 | [P] |
| Real human noise defeats SOTA methods | Wei et al. 2022 | early stopping competitive | [P] |
| Oracle `T` still collapses | Feng et al. 2026 | qualitative | [P] |
| Simplest detector wins | arXiv 2510.16211 | in-sample + avg prob + margin | [P] |
| Shared-confounder bias | CARE 2026 | up to 26.8% error reduction | [R] |
| Ising aggregation beats MV/DS | Balasubramanian et al. 2026 | deltas unverified | [R] |

---

## 5. What is provably impossible

1. **Exceeding `1 − e` against gold with error rate `e`, with a perfect labeller.** At `e = 3.3%` the ceiling is 96.7%.
2. **Exceeding `1 − d/2` when two labellers disagree at rate `d`.** At d > 2%, 99% is impossible.
3. **Recovering the Bayes classifier under instance-dependent noise with no assumption on `T(x)`.** For any `η` some `T(x)` explains the data.
4. **Removing the shared blind spot by aggregation.** With `r = P(shared error)` accuracy is bounded by `1 − r`; adding voters changes `q`, not `r` (R1's mixture; Ladha 1992 for the correlated-jury limit). At `r = 0.103` the bound is 89.7%.
5. **Detecting label errors indistinguishable from correct labels in feature space.** If `P(x|ỹ, Y≠ỹ) = P(x|ỹ, Y=ỹ)`, the mislabel posterior is flat and every detector is at chance. This is the formal version of "hard examples look like label errors."
6. **Estimating per-annotator accuracy from correlated votes without an anchor, known prevalence, or known dependence structure.** DS is not identified; with three annotators a general pairwise model exceeds the available degrees of freedom.
7. **Fixing correction by improving `T`.** Oracle `T` still collapses (CVPR 2026); if perfect knowledge of the process does not fix the learner, better estimation of it will not either.
8. **99% on this dataset against the current gold.** 28 of 31 unanimous errors would have to be gold errors, contradicting the measured 86.33% plurality accuracy.

---

## 6. Implications and design for this codebase

**6.1 Set the target from the task, not the models.** Achievable accuracy is `1 − R* − gold effect`. Measure a bound on `R*` with a disagreement audit: 300 items, two independent annotators, compute `d`, publish `1 − d/2` as the ceiling *before* running any model. If `d > 2%`, 99% is unattainable and should be said so.

**6.2 Gold is an instrument with its own error bar.** Every number in `packages/dataset_evaluation/metrics.py` is a bare float. Besides the CI it needs the adjusted reading `measured ≤ 1 − ê_gold`, with `ê_gold` from the adjudication log; and if gold contains templated near-duplicates, the effective n is far below 300 and every interval widens accordingly. Until the 31 are adjudicated, 89.7% is a lower bound on the ceiling, not the ceiling.

**6.3 Never fit an unsupervised label model to three correlated voters.** `weights.py` collapses to scalar reliabilities and the temptation will be to replace it with Dawid–Skene. Fit it **supervised on gold** with an explicit dependence term — and only a scalar coupling per pair, since a full `K×K` potential exceeds the 24 residual df (§2.2d). R1 reached this from aggregation; §2.2 from identification.

**6.4 Report `n_eff` and the ceiling with every precision figure.** `EnsembleOutcome` should carry `c`, `phi`, `n_eff`, `ceiling = 1 − c_upper`; `selection.py` should refuse to solve a threshold whose target exceeds the ceiling. Two lines of code: the impossible request fails loudly instead of returning a number.

**6.5 Build the simple detector, and measure recall on the unanimous band.** In-sample probabilities plus a margin are a strong baseline (2025 benchmark); guard on probe accuracy (R2). Do not build influence functions (no gradient access, fragile) or AUM (no trajectory). The realistic stack: calibrated-probe margin, k-NN consistency in a frozen embedding, high-confidence LLM re-audit, disagreement band. Report recall on the unanimous band, where 31 of 41 errors live and where it is likely near zero.

**6.6 Only new evidence moves `c`.** Aggregation cannot create information (`n_eff → 1.28`); robust training cannot help at n = 300; correction cannot help without identifiable `T`. What remains is the synthesis's L2 — retrieval of policy and adjudicated cases, rules as voters, a small probe, sources whose errors are structurally unlike an LLM's. §2.4 is the justification: asymmetric noise need not cost rate *if* identifiability holds, and independence is what makes Kruskal hold.

**6.7 Refuse the 99% certificate and state what it needs.** `R* ≤ 1%` (disagreement ≤ 2%), gold error ≤ 1% on the audited population, an exchangeable audit of ~299 clean items, and a labeller whose errors are disjoint from the 31. Each is checkable; none holds.

**6.8 Store per record `(predicted_label, gold_label_or_null)`.** Without per-item outcomes neither the identities in §2.5 nor the bound can be computed after the fact, and the adjudication cannot be joined back to the votes. R4 flagged the missing `dataset_version_id`; this is its label-noise-specific form.

---

## 7. References

1. Scott, C., Blanchard, G., Handy, G. (2013). Classification with Asymmetric Label Noise: Consistency and Maximal Denoising. ICML 2013; EJS 10(2), 2016. https://proceedings.mlr.press/v30/Scott13.html
2. Natarajan, N., Dhillon, I. S., Ravikumar, P., Tewari, A. (2013). Learning with Noisy Labels. NIPS 2013. https://papers.nips.cc/paper/5073-learning-with-noisy-labels
3. Liu, Y., Cheng, H., Zhang, K. (2023). Identifiability of Label Noise Transition Matrix. ICML 2023. https://arxiv.org/abs/2202.02016
4. Zhu, Y., Zhang, J., Gangrade, A., Saligrama, V. (2024). Label Noise: Ignorance Is Bliss. NeurIPS 2024. https://arxiv.org/abs/2411.00079
5. Reeve, H. W. J., Kaban, A. (2019). Fast Rates for a kNN Classifier Robust to Unknown Asymmetric Label Noise. ICML 2019. https://proceedings.mlr.press/v97/reeve19a.html
6. Northcutt, C. G., Athalye, A., Mueller, J. (2021). Pervasive Label Errors in Test Sets Destabilize Machine Learning Benchmarks. NeurIPS 2021 D&B. https://arxiv.org/abs/2103.14749
7. Northcutt, C. G., Jiang, L., Chuang, I. L. (2022). Confident Learning: Estimating Uncertainty in Dataset Labels. JMLR 22(137). https://arxiv.org/abs/1911.00068
8. Pleiss, G., Zhang, T., Elenberg, E., Weinberger, K. Q. (2020). Identifying Mislabeled Data using the Area Under the Margin Ranking. NeurIPS 2020. https://arxiv.org/abs/2001.10528
9. Toneva, M., et al. (2019). An Empirical Study of Example Forgetting during Deep Neural Network Learning. ICLR 2019. https://arxiv.org/abs/1812.05159
10. Swayamdipta, S., et al. (2020). Dataset Cartography. EMNLP 2020. https://arxiv.org/abs/2009.10795
11. Basu, S., Pope, P., Feizi, S. (2021). Influence Functions in Deep Learning Are Fragile. ICLR 2021. https://arxiv.org/abs/2006.14651
12. Han, B., et al. (2018). Co-teaching. NeurIPS 2018. https://arxiv.org/abs/1804.06872
13. Li, J., Socher, R., Hoi, S. C. H. (2020). DivideMix. ICLR 2020. https://arxiv.org/abs/2002.07394
14. Wei, J., Zhu, Z., Cheng, H., Liu, T., Niu, G., Liu, Y. (2022). Learning with Noisy Labels Revisited. ICLR 2022. https://arxiv.org/abs/2110.12088
15. Rolnick, D., Veit, A., Belongie, S., Shavit, N. (2017). Deep Learning is Robust to Massive Label Noise. https://arxiv.org/abs/1705.10694
16. Dawid, A. P., Skene, A. M. (1979). Maximum Likelihood Estimation of Observer Error-Rates Using the EM Algorithm. JRSS C 28(1):20–28.
17. Hui, S. L., Walter, S. D. (1980). Estimating the Error Rates of Diagnostic Tests. Biometrics 36(1):167–171.
18. Feng, C., et al. (2026). Deconstructing the Failure of Ideal Noise Correction. CVPR 2026. https://arxiv.org/abs/2603.12997
19. Nahum, O., et al. (2025). Are LLMs Better than Reported? EMNLP 2025. https://aclanthology.org/2025.emnlp-main.1360/
20. Benchmarking Noisy Label Detection Methods (2025). https://arxiv.org/abs/2510.16211
21. Zhao, J., et al. (2026). Confounder-Aware Aggregation for Reliable LLM Evaluation. https://arxiv.org/abs/2603.00039
22. Balasubramanian, K., et al. (2026). Dependence-Aware Label Aggregation for LLM-as-a-Judge via Ising Models. PMLR v306.
23. Conditional Independence Fails on MultiPref: Auditing the Assumption Behind Annotator Reliability Scores (2026). TMLR. https://openreview.net/forum?id=lXpBFSvmyO
24. Nguyen, T., et al. (2024). Noisy Label Learning with Instance-Dependent Outliers. NeurIPS 2024.
25. Zhang, K., et al. (2025). Handling Label Noise via Instance-Level Difficulty Modeling. NeurIPS 2025. https://arxiv.org/abs/2505.00812
26. Yao, Y., et al. (2021). Instance-dependent Label-noise Learning under a Structural Causal Model. NeurIPS 2021. https://arxiv.org/abs/2109.02986
27. Xia, X., et al. (2019). Are Anchor Points Really Indispensable in Label-Noise Learning? NeurIPS 2019.
28. Tsybakov, A. B. (2004). Optimal Aggregation of Classifiers in Statistical Learning. Annals of Statistics 32(1):135–166.
29. Audibert, J.-Y., Tsybakov, A. B. (2007). Fast Learning Rates for Plug-in Classifiers. Annals of Statistics 35(2):608–633.
30. Ladha, K. K. (1992). The Condorcet Jury Theorem, Free Speech, and Correlated Votes. AJPS 36(3).

**Sourcing note.** Items 1–15 and 18–26 were read here at abstract or full-text level; numbers attributed to them are the papers' own. Item 23 is abstract-level only. Items 16–17, 27–30 are cited by title and venue.
