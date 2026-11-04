# W6 — Uncertainty Quantification and Distribution-Free Guarantees for Label Certification

**Date:** 2026-11-04 · **Scope:** conformal prediction, conformal risk control, selective
prediction, LLM uncertainty, calibration, sequential/anytime-valid inference, 2025–2026 work, and
a certificate design for this codebase. Builds on R4 and §3/L4 of `00-SYNTHESIS.md`; contradicts
the synthesis where the computation says so, and shows the computation.

**Marks.** `[P]` proved/computed here, reproducibly, from `repo/data/hard.db` or first principles.
`[R]` read and verified in the cited source. `[I]` inference. `[U]` unverified.

Every number in §3 and §6 was recomputed from the 900 stored votes and 300 gold labels on
2026-11-04 (Python 3.12.10, numpy 2.5.4, scipy 1.18.1). None is copied from the design docs.

---

## 1. Executive summary

**The strongest certificate is not conformal. It is an exact finite-population bound on a
physical random sample of the labels you are about to ship.**

Conformal machinery answers a superpopulation question: what will this policy's error rate be on
future exchangeable data? A reviewer asks a different question: are *these* 12,000 labels, in
*this* version, correct? That is finite-population inference, and it is sharper. If the sample is
drawn by a published, seeded, uniform procedure, the only assumptions are that the sampler ran as
published and that the audit labels are right. Neither is distributional. A reviewer can attack
the audit protocol; the mathematics is out of reach.

**1. 95% is not certifiable on the current fixture at any coverage `[P]`.** Sweeping every
confidence-ordered prefix of the 300 rows, the maximum one-sided Clopper–Pearson bound is
**0.9402**, at 173 accepted rows with 5 errors (observed precision 0.9711). The design doc's "96%
precision at ~50% coverage" is a point estimate; its 95% lower bound there is 0.9312.

**2. A clean audit of 59 labels certifies a 95% floor at 95% confidence `[P]`.** Exact:
`0.05^(1/59) = 0.9505`; 58 gives 0.9497 and fails. If the shipped set is finite (300 accepted)
and sampled without replacement, **51** suffices. With errors: 93 audits for 1 error, 124 for 2,
153 for 3, 181 for 4, 208 for 5, 234 for 6.

**3. Cost is set by quality, not by the target.** True precision 99% → 59 audits (50% power) /
124 (80%). 98% → 124 / 234. 97% → 286 / 601. 96% → 1,215 / 2,698 `[P]`. One point of precision
costs roughly a factor of two in audit budget. That is the quantitative case for the synthesis's
L2: quality is the price of proof.

**4. The winner's curse in `selection.py` is second-order; the first-order defect is a
mislabelled bound.** `wilson_lower_bound` uses `Z_95 = 1.95996`, the *two-sided* multiplier, so
the "95%" certificate is really a one-sided **97.5%** bound — conservative, mislabelled, and it
inflates audit sizes (the code asks for 1,760 audits at an assumed 96% precision; 95%-one-sided
at 50% power needs 1,215). Separately, the selection loop (line 108) keeps scanning after a
prefix has failed, which forfeits the only argument that makes same-set certification valid
(fixed-sequence testing). In simulation coverage stayed ≈98–100%, so no false certificate has
been issued — Wilson's conservatism absorbs it. "Not yet harmful" is not "valid".

**5. Templating changes every sample size here.** The 300 rows are 101 distinct sentences under
one normalization (107 under another). I measure ICC = 0.762, design effect 2.49, effective
n = 120.5 `[P]`; the Lead measures 0.715 / 3.37 / 74.5 `[P]`. A cluster bootstrap CI for accuracy
is 0.174 wide versus 0.081 naive — 2.15× `[P]`. **Any row-level binomial audit is 2–4× too
optimistic.** Name the exchangeable unit before any p-value.

**6. Conformal risk control is the wrong object for a "precision floor".** CRC controls
`E[L(λ̂)] ≤ α` — an expectation, not a `1−δ` statement — and the natural selective loss
`1{accepted ∧ wrong}` bounds the *corpus-level error mass*, not the conditional precision. With
acceptance rate r, a CRC guarantee of α licenses a conditional error rate of `α/r` in the
accepted band. At r = 0.5, α = 0.05 that is 10%, not 5%. Advertising "95% precision" from a CRC
bound overclaims by 2×.

The design in §6 fixes this with four ingredients: an exact binomial (or hypergeometric) bound, a
fixed-sequence selection rule, cluster-level sampling, and a signed artifact bound to the version
manifest.

---

## 2. Breakthrough candidates

Ranked by defensibility × usefulness per unit of engineering. "Breakthrough" means "survives a
hostile reviewer", not "novel".

### B1. The finite-population certificate `[P]`

The estimand is a count, not a rate: "of the N labels in this version, at most `⌊(1−ε)N⌋` are
wrong." Audit n drawn uniformly without replacement. The exact `1−δ` upper bound on the error
count is the largest D with `P(X ≤ k | D) ≥ δ` under the hypergeometric law — tighter than the
binomial by a factor that grows with the sampling fraction, and requiring no exchangeability with
anything outside the frozen set.

For a 300-label set with zero errors: 51 audits certify ≥95.0%, 150 certify ≥98.67%, 200 certify
≥99.33%. The binomial needs 59 for a 95% floor and 299 for 99%; at N=300 the finite-population
bound reaches 99% with **158** audits — 1.9× cheaper. The advantage decays with N: 47 at N=200, 50
at N=300, 56 at N=1,000, 58 at N=5,000, 59 at N=20,000 `[P]`.

This turns a statistical claim into an audit trail: "we drew these 51 indices by permuting the
version hash, and all 51 were correct" is checkable by a third party with no statistical training.
Nothing else in this report is.

### B2. Fixed-sequence selection — the winner's curse, dissolved `[P]/[R]`

The candidate thresholds are nested and ordered: A(λ₁) ⊃ A(λ₂) ⊃ … Test H_j: "precision of A(λ_j)
≤ ε" at level α in a pre-registered order and **stop at the first non-rejection**. Then
`P(any certified prefix has precision ≤ ε) ≤ α` with no multiplicity correction (proof, §3.6).
Selection and certification on the same gold set is therefore legitimate, provided the score
ordering does not depend on the audit labels.

The current code violates this at line 108 by continuing past a failure. On this data at target
0.90 the CP trajectory passes at n=103, fails at 209, passes again at 230; the Wilson trajectory
the code actually uses has the same shape and also ends at 230. A valid fixed-sequence procedure
stops at 208. Twenty-two labels of over-acceptance from a one-line bug that is invisible unless
you know the rule.

A disjoint split is still advisable — it costs nothing and removes a dependency — but the reason
is "freeze the ordering before the audit", not "the bound would be invalid". That is a weaker and
more useful requirement than the synthesis assumes.

### B3. Cluster-aware certification — mandatory `[P]`

101 templates, largest cluster 9 rows, ICC 0.762, design effect 2.49–3.37. Every interval in
`metrics.py`, `selection.py` and the design docs treats 300 rows as independent. The fix is a
design change, not a code change: **sample templates, audit one row per template.** At K = 101,
40 audited templates with zero errors certify ≥95.05% at cluster level; 46 with up to 4 errors
certify ≥96.0%. Exactly valid, and free.

### B4. Pre-registered looks instead of a continuous bound `[P]`

Simulated at p = 0.95, floor 0.95, nominal 5% per look, horizon 400 `[P]`: one look → 3.4% FWER;
5 looks → 9.6%; 20 looks → 13.8%; continuous peeking → 17.5%; 5 looks at 3% each → 5.0%.

Five pre-registered checkpoints at 3% cost **+17%** (69 audits for a clean set) and preserve 95%.
Continuous peeking costs **+50%** (88–90), which the always-valid construction independently
confirms (§3.8). Ship the five-checkpoint design: exact enough to defend, cheap enough to
schedule, and it gives the UI a live number at a known price.

### B5. Fallible audits — the attack nobody makes `[P]/[I]`

Every certificate assumes the audit labels are right. Yours are not: ≈91% for a single blinded
annotator, 97–98% for a majority of three. With independent auditor error e, measured precision is
`p + e(1−2p)`, and inverting gives `p = (p_obs − e)/(1 − 2e)` — a factor of 1.22 at e = 0.09 that
explodes as e → 0.5. Correcting is unstable. **Define the claim against the audit protocol**
("≥95% agree with two-blind + adjudication"), which is exact, measurable, and leaves only the
attack every vendor shares.

### B6. Non-monotone risk–coverage — a measured anomaly `[P]`

Confidence-ranked coverage: 10% → 90.0%, 25% → 93.3%, 50% → **96.7%**, 75% → 92.4%, 90% → 88.5%,
100% → 86.3%. The mid-confidence band is cleaner than the top decile. Consequences: Chow's rule
and every "threshold on confidence" argument assume monotonicity and are invalid here; AURC is
computable but meaningless as a summary; the monotone-loss premise of CRC is violated in the
direction that matters.

This is the setting of 2026 work on conformal risk control under non-monotone losses
(arXiv:2604.01502; Phil. Trans. R. Soc. A 384(2327), 2026) `[R]`, which shows the guarantee can
survive non-monotonicity under stability conditions. The narrower, blunter implication: never
assume raising the threshold lowers the accepted error rate. Test it each version and refuse to
solve a threshold when the curve is non-monotone — the Phase 0 gate is right.

### B7. Methods that sound applicable and are not

Prediction-powered inference (Science 2023) `[R]` needs a cheap predictor `f`; with `f` = mean
confidence the residual-variance ratio is **0.934** — a 6.6% reduction, about 3% fewer audits `[P]`
(AUC 0.763; a weak predictor cannot rescue a weak model). PPI pays only when a trained probe
reaches AUC ≈ 0.95. Semantic entropy (Nature 630, 2024) `[R]` needs resampling and semantic
clustering; for 4-way classification with one call per model, vote entropy is already available
and is *worse* than confidence (agreement AUC 0.636) `[P]`. P(True) (Kadavath et al. 2022) `[R]`
needs a second pass and a self-evaluating model, and is a ranking signal, not a guarantee.

### B8. Below ~250 items, census beats certificate `[P]`

The audit required to certify a floor grows as true precision approaches that floor, and is
independent of population size. A census costs exactly N. Certification is worth doing only when
`n(ε, δ, p) < N`. At ε = 0.95, 80% power: p = 0.99 → n = 124 (census wins below 124 accepted
labels); 0.98 → 234; 0.97 → 601. Per class on this fixture (75 rows) the census always wins.
**The certificate is a large-dataset instrument.** Selling it on 300 rows is selling something
worse than "we checked all of them".

---

## 3. Mathematics

### 3.1 Three claims, three statistics

| Claim | Estimand | Machinery | Assumption |
|---|---|---|---|
| **C1 Version certificate** | fraction correct among the N labels of v | hypergeometric bound | randomized sampling design |
| **C2 Policy certificate** | error rate on future data | CP / conformal / CRC | exchangeability |
| **C3 Live certificate** | C1 or C2 valid at every t | confidence sequence / e-process | C1/C2 + martingale |

C1 is what a customer's auditor wants; C2 is what a paper reports; C3 is what the UI wants. C2
does not imply C1: a policy with 99% expected precision can emit a batch at 90%, and only C1
catches it. Build C1 as the artifact, C3 as its live shadow, C2 only with the word "expected".

### 3.2 Exact binomial bound

With k successes in n exchangeable Bernoulli trials,

```
p_L(k, n, δ) = Beta^{-1}(δ; k, n−k+1)   1 ≤ k ≤ n−1
             = δ^{1/n}                  k = n
             = 0                        k = 0
```

and `P_p(p_L ≤ p) ≥ 1−δ` for all p `[R]` (Clopper & Pearson 1934). Zero-error case:
`n = ⌈ln δ / ln ε⌉`; ε = 0.95, δ = 0.05 → **n = 59**.

| errors k | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| ε = 0.90 | 29 | 46 | 61 | 76 | 89 | 103 | 116 |
| ε = 0.95 | **59** | 93 | 124 | 153 | 181 | 208 | 234 |
| ε = 0.99 | 299 | 473 | 628 | 773 | 913 | 1,049 | 1,182 |

Any tool reporting a number not derived from this recursion is approximating. The 0.99 row is why
"99% precision" is an advertising claim: nobody audits 299 labels to prove it.

### 3.3 Finite population (C1)

With N labels, D defective, n drawn without replacement, k defects observed:

```
D_max = max { D : Σ_{x=0..k} C(N−D,x)·C(D,n−x) / C(N,n) ≥ δ }     certificate: 1 − D_max/N
```

Monotone in D, so bisection suffices; zero errors gives `C(N−D,n)/C(N,n) ≥ δ`, approximated by
`n ≳ N(1 − δ^{1/D*})`, `D* = ⌊(1−ε)N⌋`. Computed `[P]`, zero errors, δ = 0.05:

| N | n=40 | n=51 | n=59 | n=150 | n=200 |
|---|---|---|---|---|---|
| 101 (templates) | ≥95.05% | ≥96.04% | ≥97.03% | — | — |
| 173 | ≥93.64% | ≥95.38% | ≥95.95% | ≥99.42% | — |
| 300 | ≥93.33% | ≥95.00% | ≥95.67% | ≥98.67% | ≥99.33% |
| 1,000 | — | ≥94.50% | ≥95.20% | ≥98.20% | — |

Minimum n for a 95% floor, zero errors `[P]`: N=200 → 47, 300 → 50, 500 → 54, 1,000 → 56,
5,000 → 58, 20,000 → 59.

### 3.4 Wilson is not a guarantee

Wilson's interval is an approximation; coverage oscillates and dips below nominal in specific
(n, p). At (100, 97) it gives 0.9273 against CP's 0.9243 — *less* conservative, which is what you
do not want in a certificate `[P]`. It costs the same line of code to be exact. Use Wilson for
dashboards, CP for certificates, never both in one field.

Two defects in `selection.py` `[P]`: `Z_95 = 1.959963984540054` is two-sided, so
`wilson_lower_bound` returns a one-sided 97.5% bound (§1.4); and the loop continues past failures
(§2/B2). Neither yields a wrong number today. Both yield an indefensible one.

### 3.5 Concentration inequalities cost 2–16×

At n = 300, k = 291 (p̂ = 0.97), one-sided 95% `[P]`: Clopper–Pearson **0.9482**; Wilson 0.9491;
Bentkus 0.9420; empirical Bernstein 0.9064; Hoeffding 0.8993.

Hoeffding is distribution-free in the strongest sense and not variance-adaptive, so it loses 5.5
points at n = 300. To certify 95% at true 99%, Hoeffding needs `n ≥ ln(20)/(2·0.04²) = 936` audits
against CP's 59 — **16×**. Empirical Bernstein sits between and is worth it only for unbounded or
heavy-tailed losses, which a 0/1 correctness indicator is not. Bentkus is the best generic bound
and is still 0.5–1.1 points worse than exact at these n. For Bernoulli audit data, exact binomial
dominates every concentration inequality.

### 3.6 Fixed-sequence testing

Nested sets `A_1 ⊂ … ⊂ A_m` ordered a priori by score; `p_j` = precision of `A_j`;
`H_j : p_j ≤ ε`. Test in order at level α; stop at the first non-rejection.

**Claim.** `P(∃ j certified with p_j ≤ ε) ≤ α`.

**Proof.** Let `j* = min{j : p_j ≤ ε}`. An error requires rejecting `H_{j*}`, which requires
reaching it, i.e. rejecting all `H_j` for `j < j*` — all false. So {error} ⊆ {`H_{j*}` rejected},
and that probability is ≤ α since step `j*` is a marginal level-α test. ∎

The requirement is that the *order* is fixed independently of audit outcomes, which the frozen
confidence ranking satisfies. This is the classical fixed-sequence procedure; its use in risk
control is developed in Learn then Test (arXiv:2110.01052, AOAS 2024) `[R]`, which also covers
non-nested families (Bonferroni/graphical FWER, at real cost).

### 3.7 What conformal risk control actually guarantees

For a loss non-increasing in λ and bounded by B `[R]` (ICLR 2024, arXiv:2208.02814):

```
λ̂ = inf { λ : (n/(n+1)) R̂_n(λ) + B/(n+1) ≤ α }        E[ L_{n+1}(λ̂) ] ≤ α
```

Three observations. (i) It is an **expectation**, not `P(risk ≤ α) ≥ 1−δ`; "with what confidence?"
has no answer. (ii) The `B/(n+1)` term is the price of selecting λ on the same data — a different
way to pay for the winner's curse, cheaper than splitting (0.003 at n = 300). (iii) The loss is
per-item, not conditional: for selective labelling it bounds `P(accepted ∧ wrong) ≤ α`, so the
accepted band's precision is only `1 − α/r`. **At r = 0.5 this guarantees 90%, not 95%.**

No standard CRC variant bounds the conditional precision, because that is a ratio of expectations.
The exact audit bound does, for free. CRC is nonetheless right for `[I]`: a corpus-level error
budget ("≤50 wrong labels per 1,000 emitted, in expectation"); multiple simultaneous risks
(per-class recall floors) via Learn then Test; and **conformal factuality** (Mohri & Hashimoto,
ICML 2024, arXiv:2402.10978) `[R]`, which calibrates a subset of atomic claims so the retained set
is false-claim-free with probability ≥ 1−α. That is the closest published analogue to what
Curlset should sell, and it is built on an exact binomial bound over the calibration set — the
machinery recommended here.

### 3.8 Anytime-valid bounds

Ville: for a nonnegative supermartingale `M_t` with `M_0 = 1`, `P(∃t : M_t ≥ 1/α) ≤ α` `[R]`
(Ramdas, Grünwald, Vovk & Shafer, Statistical Science 38(4), 2023). With a uniform prior on
`[p_0, 1]`, on the all-successes path

```
M_n(p_0) = [ (1 − p_0^{n+1}) / ((n+1)(1 − p_0)) ] / p_0^n
```

Computed `[P]`: `M_59(0.95) = 6.56`, `M_88(0.95) = 20.3` → **88 clean audits** for a 95% floor
valid at every stopping time, against 59 fixed-n. The ratio (1.49×) matches the simulated cost of
continuous peeking. Betting constructions (Waudby-Smith & Ramdas, JRSS-B 2024) are often tighter
but depend on the betting grid and its tuning `[R]/[I]`. For a product the five-checkpoint design
is the better trade.

**Verdict on a live certificate:** practical and honest if the UI separates three states —
provisional (n of 59), fixed-n certified, anytime-valid certified (n of 88). What is dishonest is
a bound recomputed on every audit without an anytime construction; that number is not valid at the
moment it is displayed.

### 3.9 Clusters and the design effect

```
ρ = (MSB − MSW)/(MSB + (n̄₀ − 1)MSW),  n̄₀ = (N − Σn_i²/N)/(K−1)
DEFF = 1 + (n̄₀ − 1)ρ,  n_eff = N/DEFF
```

hard.db, cluster = normalized sentence `[P]`: K = 101, n̄₀ = 2.954, ρ = 0.762, DEFF = 2.489,
n_eff = 120.5. The Lead's normalization: 107 / 0.715 / 3.37 / 74.5 `[P]`. The gap is a
normalization choice, not an error, and does not change the recommendation: sample clusters, or
inflate by 2.5–3.4. Cluster-level certification is exactly valid because the cluster is the
exchangeable unit: draw templates uniformly, audit one row each, apply §3.2 with n = number of
templates. State whether the estimand is the cluster-average or the size-weighted precision.

### 3.10 Fallible audits

`p_obs = p(1−e) + (1−p)e` ⇒ `p = (p_obs − e)/(1 − 2e)`. At e = 0.09 and p_obs = 0.96 this gives
1.06 — the inversion is unstable and amplifies variance by `1/(1−2e)² = 1.49`. Do not correct.
**Define the claim against the protocol** and drive e down by construction: two blind annotators
plus adjudication takes e from ~0.09 to ~0.01 at 2× audit cost, far cheaper than outperforming a
9%-noisy oracle. The 2026 literature on conformal prediction with noisy calibration labels (e.g.
Penso et al., PMLR v266, 2025) `[R]` applies when noise is the only problem; here the templating
dominates.

### 3.11 Sizing formulas

```
(A) fixed n, zero errors:     n = ⌈ln δ / ln ε⌉
(B) fixed n, k errors:        min n with I_ε(n−k, k+1) ≤ δ
(C) finite population, 0 err: min n with C(N−D*, n)/C(N, n) < δ
(D) power-based:              min n with P(Bin(n,p) ≥ k_min(n,ε)) ≥ 1−β
(E) always-valid:             min n with M_n(p_0) ≥ 1/δ
```

**(D) is the one people should use and never do.** (A)–(C) give the size *conditional on the
observed error count*, which is random, so they cannot plan an audit. Planning needs power:

| true precision p | 50% power | 80% power | 90% power |
|---|---|---|---|
| 0.99 | 59 | 124 | 153 |
| 0.98 | 124 | 234 | 311 |
| 0.97 | 286 | 601 | 832 |
| 0.96 | 1,215 | 2,698 | 3,701 |

ε = 0.95, δ = 0.05, exact CP `[P]`. Power is non-monotone in n (discreteness): at p = 0.96 power
is 0.090 at n = 59 and 0.045 at n = 120 because `k_min` jumps. Computed on a grid, never
interpolated.

### 3.12 The conformal variants, and which apply

| variant | what it gives | applies here? |
|---|---|---|
| split conformal (sets/intervals) | marginal coverage of the true label | No — we need a precision bound, not a prediction set |
| Mondrian / class-conditional | coverage per class | Only as stratified sampling; costs 86 audits/class (§5) |
| conformal risk control | `E[L] ≤ α` | corpus error budgets, not conditional precision (§3.7) |
| conformal factuality | `P(retained claim set is false-free) ≥ 1−α` | closest analogue; exact binomial over a calibration set |
| "conformal semantic uncertainty" | not a standard named method | composable, but the entropy must first be shown to rank correctness — it does not here (AUC 0.636 vs 0.763) |
| weighted conformal | coverage under covariate shift | needs density ratios; undefined under a label-ontology change |
| ACI / conformal PID | long-run coverage under arbitrary shift | monitoring, not version certificates |

Abstention methods (Chow 1970; SelectiveNet) optimize the same risk–coverage trade-off with no
finite-sample guarantee. With a human review budget B the operating point is fixed by B, so the
only open question is the precision at that point — which is exactly what the certificate answers.
Calibration variants are similarly subordinate: temperature, vector, and isotonic scaling are
monotone or near-monotone reparametrizations that change the level but not which items are risky,
and all of them are fitted on data that must be disjoint from the audit.

---

## 4. Comparison

Tightness = one-sided 95% lower bound at an observed 0.97, computed exactly `[P]`.

| Method | Guarantee | Assumption | n=100 | n=300 | Cost |
|---|---|---|---|---|---|
| Clopper–Pearson | `P(p_L ≤ p) ≥ 1−δ`, all p | exchangeability | **0.9243** | **0.9482** | 1 function |
| Finite-population hypergeom. | `P(D ≤ D_max) ≥ 1−δ` | randomized SRSWOR | **0.9333** (N=300) | **0.9520** (N=1,000) | +`math.comb` |
| Wilson (one-sided) | approximate only | asymptotic normality | 0.9273 | 0.9491 | shipped, mislabelled |
| Bentkus | `P(mean ≥ p+t) ≤ e·P(Bin≥…)` | i.i.d., bounded | 0.9108 | 0.9420 | 1 bisection |
| Empirical Bernstein | `P ≥ 1−δ` | i.i.d., bounded | 0.8130 | 0.9064 | 1 function |
| Hoeffding | `P ≥ 1−δ` | i.i.d., bounded | 0.8476 | 0.8993 | 1 line |
| Conformal risk control | `E[L] ≤ α` | exchangeability, monotone loss | — | — | wrong estimand here |
| PAC prediction sets | `P(risk ≤ ε) ≥ 1−δ` | exchangeability | ≈CP | ≈CP | moderate |
| PPI / PPI++ | asymptotic CI | `f` independent of audit | 0.934 var. ratio | same | no gain here |
| Bayesian Beta | credible interval | prior + exchangeability | prior-dependent | prior-dependent | unfalsifiable prior |
| Always-valid CS | `P(∀t: p ≥ L_t) ≥ 1−δ` | exchangeability | 88 audits @ ε=.95 | — | martingale bookkeeping |
| Group-sequential CP (5) | `P(any false certificate) ≤ δ` | exchangeability | 69 audits @ ε=.95 | — | scheduler + pre-registration |
| Cluster-level CP | `P ≥ 1−δ` at cluster level | clusters exchangeable | 40 templates (K=101) | — | sampling design |

**Tightest for n = 50–500: the exact finite-population bound when N is known and n/N > ~10%,
otherwise exact Clopper–Pearson.** The choice is not close; everything else is dominated.

---

## 5. Hype and limits

**"Conformal is distribution-free."** It is exchangeability-conditional. This dataset violates
exchangeability at row level (ICC 0.76) and a production stream violates it after any prompt
change, model upgrade or traffic shift. Weighted conformal (Barber et al., AoS 51(2), 2023) `[R]`
repairs this only if you can estimate the density ratio — at n = 300 you cannot, and the ratio is
undefined for a change of label ontology, which is precisely this fixture's failure mode (31
all-wrong rows = 8 ontology disputes).

**"CRC is the formal object behind certified precision."** Not for a conditional claim (§3.7).

**"Uncertainty tells you which labels to trust."** Best available score (confidence) has AUC
0.763 for correctness; agreement alone 0.636 `[P]`. That sorts at the extremes and is useless in
the middle, and the risk–coverage curve is non-monotone. Uncertainty is a routing signal — which
is wave 1's conclusion — and a nuisance for certification. The 2026 position papers make the same
point from another direction: a marginal uncertainty estimate does not determine the decision, and
calibrated probabilities do not imply calibrated decisions `[R]/[I]`.

**"Semantic entropy solves hallucination."** It detects confabulation in free-form generation
where resampling and meaning-clustering are possible. On 4-way classification with one call per
model there is nothing to cluster, and vote entropy underperforms confidence `[P]`. The Nature
result is real and does not transfer. Likewise PPI: its 0.934 variance ratio here means PPI is a
tool for a strong predictor, not a substitute for one, and its guarantee is asymptotic or requires
an `f` fitted independently of the audit — both conditions easy to violate accidentally.

**"Verbalized confidence is a probability."** It correlates with correctness and is systematically
too high (Xiong et al., ICLR 2024; Tian et al., EMNLP 2023) `[R]`. Here ensemble confidence is
0.9155 against 0.8633 accuracy — 5.2 points overconfident, ECE 0.0649 `[P]`. Rescaling on the same
gold set is a winner's curse; on a disjoint set it buys a better ranking, not a guarantee.

**"Calibrate, then threshold."** Calibration is necessary for Chow-optimality and insufficient for
a guarantee. Worse, ECE is unmeasurable at these sizes: bootstrap SD 0.035 at n=50, 0.024 at
n=100, 0.013 at n=200 against a true 0.065, with a +0.02 upward bias at n=50 `[P]`. You need ≈200
samples for ±0.025 and ≈500 for ±0.015; class-conditional ECE needs that *per class*, 800+ for
four classes. With 75 rows per class it is not measurable, let alone certifiable. Temperature
scaling fixes the level, not the ranking — it is monotone and cannot change AUC — and the ranking
is what fails here.

**"ACI handles distribution shift."** ACI (Gibbs & Candès, NeurIPS 2021; JMLR 2024) `[R]` gives
long-run coverage over an infinite horizon. It does not certify a static artifact. Right tool for
a monitoring dashboard, wrong tool for a version certificate.

**"Use a Bayesian posterior."** With a uniform prior it reproduces CP to a lattice step; with an
informative prior it is tighter and unfalsifiable, since the prior is a modelling choice the
reviewer cannot check. No reason to take that risk.

**Multiple comparisons.** Four classes certified at 95% each gives ~19% chance at least one is
wrong. Bonferroni means 98.75% per class = 86 audits per class, and this fixture has 75 rows per
class. Per-class certification at 95/95 is **infeasible by 11 rows per class**. Certify pooled; if
a per-class claim is required, use a pre-registered worst-class rule and state the multiplicity.

**The n_eff trap.** Every CI in the codebase, the "130/260/1,445" figures, and every audit size in
this report assume independent units. The true unit count is 101–107, not 300. Any certificate
computed on rows and applied to the population of intents is wrong by 2–3.4× in variance.

---

## 6. Certificate design for this codebase

### 6.1 The artifact

A signed JSON object bound to `dataset_version_id` and the manifest hash. Everything a reviewer
needs is inside it; nothing is "in the dashboard".

```
claim / estimand      "precision", "finite_population" | "superpopulation"
floor ε, conf 1−δ
population            N = |accepted set|, plus the exact record-id hash of that set
design, unit          "srs_wor" | "cluster_srs"; "record" | "template"
cluster_key           hash of normalized text, or null
seed, permutation     BLAKE2b(manifest_hash ‖ "audit/v1") → Fisher–Yates index list
n, k                  audited, errors
statistic             "clopper_pearson_lower" | "hypergeom_lower"
bound                 the numeric lower bound
assumptions[]         sampler ran as published; audit per protocol P-2; score frozen at hash …
audit_protocol        annotators, blinding, adjudication rule, IAA
provenance            hashed auditor ids, timestamps, per-item verdict hash
```

### 6.2 Procedure

1. **Freeze** the accepted set, N, and a content hash. Any later change voids the certificate.
2. **Name the unit.** Deduplicate by template. Small K (here 101) → sample templates; otherwise
   sample records and inflate by DEFF.
3. **Sample** uniformly without replacement, seeded from the manifest hash so a third party can
   reproduce the draw. Stratify by predicted class only if a per-class claim is wanted, and
   register the multiplicity now.
4. **Pre-register n** from §3.11(D). Skipping this is optional stopping.
5. **Audit** under P-2: two blinded annotators, adjudication on disagreement, both blind to the
   model's answer (showing it measured: 44% slower, collapsed diversity).
6. **Compute** the bound exactly. Never substitute an approximation.
7. **Refuse** to publish when `bound < ε`, with the same UI prominence as a pass.
8. **Sign and commit** beside the manifest.

### 6.3 Split discipline, corrected

Minimum requirement: **fit** (weights, temperature, any learned score) disjoint from the audit,
else the ordering is a function of the audit labels; **select and certify** may share a set if the
scan stops at the first failure and the score is frozen (§3.6); **the audit** is drawn from the
accepted set, not the corpus, so the bound applies to precision directly with no model of the
acceptance rate. A 3-way split is still fine and costs nothing — the audit budget is unaffected
because it samples the accepted set either way.

### 6.4 The formula for n, stated once

```
exchangeable, fixed n:   n = min { m : I_ε(m−k, k+1) ≤ δ }        (k = 0 → ⌈ln δ / ln ε⌉)
finite population N:     n = min { m : C(N−D*, m)/C(N, m) < δ },  D* = ⌊(1−ε)N⌋
power-based:             n = min { m : P(Bin(m,p) ≥ k_min(m,ε)) ≥ 1−β }
clustered:               count clusters, or divide effective n by DEFF
```

| question | answer |
|---|---|
| 95% floor, 95% conf, zero errors | **59** |
| same, N = 300 shipped, SRSWOR | **51** (exact min 50) |
| same, K = 101 templates, cluster sampling | **40** (certifies 95.05%) |
| same, 5 pre-registered looks | **69** (α = 0.03 each) |
| same, anytime-valid | **88** |
| 95% floor, true 99%, 80% power | **124** |
| 95% floor, true 98%, 80% power | **234** |
| 95% floor, true 97%, 80% power | **601** |
| 99% floor, zero errors | **299** |
| 90% floor, zero errors | **29** |
| per-class 95/95 × 4 classes (Bonferroni) | **86 per class** (fixture has 75) |

### 6.5 Code changes

**New `packages/dataset_evaluation/certificate.py`**, pure functions:

- `cp_lower(k, n, alpha)` — exact one-sided. Handle `k=0 → 0` and `k=n → alpha**(1/n)` explicitly;
  this is where implementations break.
- `hypergeom_lower(k, n, N, alpha)` — bisection over D, `math.comb`.
- `fixed_sequence_select(prefix_stats, eps, alpha)` — last prefix before the first failure;
  replaces the "keep the largest passing" loop.
- `design_effect(cluster_labels, errors)` — ICC and DEFF by one-way ANOVA.
- `required_n(eps, delta, design, k=0, N=None)`, `power_n(eps, delta, p, power)`.

**`selection.py`**: stop at the first failing prefix (line 108) and return the CP bound; rename
`wilson_lower_bound` or change `Z_95` to 1.6449 and document the one-sidedness; replace
`audit_sample_size`'s plug-in scan with `power_n` returning `(n, power)`.

**`metrics.py`**: every float gets a sibling
`{"value": 0.8633, "n": 300, "ci": {"method": "wilson", "level": 0.95, "low": 0.819,
"high": 0.900}, "unit": "record", "deff": 2.49}`; `method` becomes `"cluster_bootstrap"` where
the cluster correction is applied. `EvaluationReport` gains `certificate_id` and `n_effective`.

### 6.6 What to do about the current fixture

1. **Do not ship a 95% certificate.** The maximum achievable is 94.02% at 173 accepted rows.
2. **Ship 90% now.** At 103 accepted with 5 errors the CP bound is ≈0.90; 29 clean audits certify
   90% on a small set.
3. **Fix the guideline, not the model.** The 31 all-wrong rows are 8 sentences, all ontology
   disputes — an 8-decision document, free, and the only lever that makes a 95% certificate cheap.
4. **Then certify at template level.** 40 of 101 templates with zero errors certifies 95%. This is
   the first defensible claim the project can make, and it is available today.
5. **Then scale.** Past ~250 accepted labels at ≥98% precision, sampling beats census and the
   certificate becomes a product rather than a compliance exercise.

### 6.7 What a reviewer attacks, and the answer

| Attack | Answer |
|---|---|
| "Rows are not independent." | We audit at template level; the bound is over templates. |
| "You picked the threshold on the same data." | Fixed-sequence, pre-registered order, stop at first failure (§3.6). |
| "Wilson is not exact." | We use Clopper–Pearson. Here is the beta quantile. |
| "You peeked." | Five pre-registered looks at α = 0.03, or the anytime bound at n = 88. |
| "Your annotators are 9% wrong." | The claim is against protocol P-2, two blind annotators plus adjudication (e ≈ 0.01). |
| "You audited 59 of 12,000." | Finite population: 51 suffices at N = 300; at N = 12,000 the design effect, not N, sets n. |
| "The population changed after the audit." | The certificate is bound to the manifest hash; any change voids it. |

Six of seven are closed by a formula and a committed artifact; the seventh by a protocol and a
second annotator. That is as close to unattackable as a label-quality claim gets.

---

## 7. References

**Conformal and risk control.** 1. Angelopoulos, Bates, Fisch, Lei, Schuster, *Conformal Risk
Control*, ICLR 2024, arXiv:2208.02814 (Thm 1: `E[L_{n+1}(λ̂)] ≤ α`, `λ̂ = inf{λ :
(n/(n+1))R̂_n(λ) + B/(n+1) ≤ α}`) `[R]`. 2. Angelopoulos, Bates, Candès, Jordan, Lei, *Learn then
Test*, arXiv:2110.01052, AOAS 2024 (DOI 10.1214/24-AOAS1998) `[R]`. 3. Bates, Angelopoulos,
Romano, Sesia, Jordan, *Distribution-Free, Risk-Controlling Prediction Sets*, JMLR 22(193), 2021
`[R]`. 4. Barber, Candès, Ramdas, Tibshirani, *Conformal Prediction Beyond Exchangeability*, AoS
51(2):816–845, 2023, arXiv:2202.13415 `[R]`. 5. Gibbs, Candès, *Adaptive Conformal Inference Under
Distribution Shift*, NeurIPS 2021 `[R]`. 6. Gibbs, Candès, *Conformal Inference for Online
Prediction with Arbitrary Distribution Shifts*, JMLR 25(162), 2024, arXiv:2208.08401 `[R]`.
7. Mohri, Hashimoto, *Language Models with Conformal Factuality Guarantees*, ICML 2024, PMLR 235,
arXiv:2402.10978 `[R]`. 8. Quach et al., *Conformal Language Modeling*, ICLR 2024 `[R]`. 9. Park,
Bastani, Matni, Lee, *PAC Confidence Sets … via Calibrated Prediction*, ICLR 2020 `[R]`.
10. *Conformal Risk Control under Non-Monotone Losses*, arXiv:2604.01502 (2026); Phil. Trans. R.
Soc. A 384(2327), 2026 `[R]`. 11. Penso et al., *Conformal Prediction of Classifiers with Many
Classes based on Noisy Labels*, PMLR v266, 2025 `[R]`.

**Estimation and testing.** 12. Clopper, Pearson, Biometrika 26(4):404–413, 1934 `[R]`.
13. Wilson, JASA 22:209–212, 1927 `[R]`. 14. Hoeffding, JASA 58:13–30, 1963 `[R]`. 15. Bentkus,
*On Hoeffding's Inequalities*, Ann. Prob. 32(2):1650–1673, 2004 `[R]`. 16. Maurer, Pontil,
*Empirical Bernstein Bounds and Sample Variance Penalization*, COLT 2009 `[R]`. 17. Ramdas,
Grünwald, Vovk, Shafer, *Game-Theoretic Statistics and Safe Anytime-Valid Inference*, Statistical
Science 38(4), 2023, arXiv:2210.01948 `[R]`. 18. Waudby-Smith, Ramdas, *Estimating Means of
Bounded Random Variables by Betting*, JRSS-B 86(1), 2024 `[R]`. 19. Vovk, Wang, *E-values:
Calibration, Combination and Applications*, AoS 49(3), 2021 `[R]`. 20. Angelopoulos, Bates,
Fannjiang, Jordan, Zrnic, *Prediction-Powered Inference*, Science 382:669–674, 2023,
arXiv:2301.09633 `[R]`. 21. Fisch et al., *Stratified Prediction-Powered Inference*, NeurIPS 2024
`[R]`.

**Selective prediction.** 22. Chow, *On Optimum Recognition Error and Reject Tradeoff*, IEEE
Trans. IT 16(1):41–46, 1970 `[R]`. 23. Geifman, El-Yaniv, *Selective Classification for Deep
Neural Networks*, NeurIPS 2017 `[R]`. 24. Geifman, El-Yaniv, *SelectiveNet*, ICML 2019 `[R]`.

**Calibration.** 25. Guo, Pleiss, Sun, Weinberger, *On Calibration of Modern Neural Networks*,
ICML 2017 `[R]`. 26. Kull et al., *Dirichlet Calibration*, NeurIPS 2019 `[R]`. 27. Nixon et al.,
*Measuring Calibration in Deep Learning*, CVPR-W 2019 `[R]`. 28. Zhao et al., *Calibrating
Predictions to Decisions*, NeurIPS 2020 `[R]`. 29. Kumar et al., *Verified Uncertainty
Calibration*, NeurIPS 2019 `[R]`.

**LLM uncertainty.** 30. Farquhar, Kossen, Kuhn, Gal, *Detecting Hallucinations in LLMs Using
Semantic Entropy*, Nature 630:625–630, 2024 `[R]`. 31. Kuhn, Gal, Farquhar, *Semantic
Uncertainty*, ICLR 2023, arXiv:2302.09664 `[R]`. 32. Kadavath et al., *Language Models (Mostly)
Know What They Know*, arXiv:2207.05221, 2022 `[R]`. 33. Tian et al., *Just Ask for Calibration*,
EMNLP 2023, arXiv:2305.14975 `[R]`. 34. Xiong et al., *Can LLMs Express Their Uncertainty?*,
ICLR 2024, arXiv:2306.13063 `[R]`.

**Project sources.** 35. `research/00-SYNTHESIS.md` — baseline, ceiling, L4 `[R]`.
36. `packages/dataset_ensemble/selection.py` — `wilson_lower_bound` (l.26),
`solve_threshold_for_precision` (l.83), `audit_sample_size` (l.179) `[P]`.
37. `packages/dataset_evaluation/metrics.py` — bare-float metrics (l.99, 144–146) `[P]`.
38. `docs/ENSEMBLE_PSEUDO_LABELING.md` l.352 — the 130/260/1,445 claim `[P]`.
39. Lead finding 2026-11-04 — templated fixture, 107 / 0.715 / 3.37 / 74.5 `[P]`, independently
recomputed here at 101 / 0.762 / 2.49 / 120.5 under a different normalization.

---

## Appendix — verification log

All figures were produced 2026-11-04 against `repo/data/hard.db` (300 records, 900 votes, 3
models, 4 balanced classes) by direct count over `ensemble_votes` joined to
`annotations.payload.label`; `beta.ppf(0.05, k, n−k+1)` for CP; `C(N−D,n)/C(N,n) < 0.05` bisected
over D for hypergeometric; one-way ANOVA over 101 template clusters for ICC/DEFF with a
2,000-resample cluster bootstrap; `Var(y−f)/Var(y)` for PPI; 20,000 simulated paths at p = 0.95
over horizon 400 for peeking; `M_n(0.95) ≥ 20` for the anytime bound; `P(Bin(n,p) ≥ k_min)` with
`k_min` by bisection for power. The whole computation is ~40 lines of stdlib Python plus
`scipy.stats.beta`/`binom` and should be committed as `tests/test_certificate_math.py` — a
certificate whose statistic is untested is not a certificate.
