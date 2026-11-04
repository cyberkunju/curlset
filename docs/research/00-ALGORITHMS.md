# 00 — ALGORITHMS: the formal core

**Date:** 2026-11-04
**Status:** original derivations. Theorem 1 is proved here and tested on `repo/data/hard.db`.
Novelty claims are *as far as my search found*; precedents are named.

---

## 1. Master formulation

Items `x₁…xₙ`, label space `Y` with `|Y| = K`. Candidate evidence sources `s ∈ U`, each producing
`v_s(x) ∈ Y ∪ {∅}` at cost `c_s`. The platform's job is to choose a *policy* (which sources to consult,
in what order, on which items) that maximises certified accuracy subject to cost.

```
maximise_π   LB(π)                       # certified lower bound on accuracy
subject to   Σ_s cost(s) ≤ B
             coverage(π) ≥ γ
             ambiguity(π) ≤ α
             provenance(π) complete
```

Everything below is an algorithm for one term of that problem.

---

## 2. Theorem 1 — Rescue Submodularity (proved here, tested on your data)

**Setup.** For item `x` and source `s`, let `u_s(x) = 1` if source `s` is correct on `x`, else 0.
For a source set `S ⊆ U`, the **oracle router** (the best possible per-item selector) achieves

```
A(S) = (1/n) Σ_x max_{s∈S} u_s(x)
```

**Claim.** `A(S)` is monotone and **submodular** in `S`.

**Proof.** Fix an item `x` and write `f_x(S) = max_{s∈S} u_s(x)`, with `f_x(∅) = 0`.
For `S ⊆ T` and `s ∉ T`:

```
f_x(S ∪ {s}) − f_x(S) = max(0, u_s(x) − max_{t∈S} u_t(x))
                      ≥ max(0, u_s(x) − max_{t∈T} u_t(x))
                      = f_x(T ∪ {s}) − f_x(T)
```

because `max_{t∈T} u_t(x) ≥ max_{t∈S} u_t(x)`. Hence `f_x` is submodular; monotonicity is immediate.
A sum of submodular functions is submodular, so `A(S)` is monotone submodular. ∎

**Corollary 1 (near-optimal greedy).** By Nemhauser–Wolsey–Fisher (1978), greedy maximisation of `A`
under `|S| ≤ k` achieves at least `(1 − 1/e) A(S*)`. Under a knapsack cost constraint, cost-benefit
greedy achieves the standard submodular-knapsack approximation.

**Corollary 2 (the rescue rate is the marginal).** The marginal gain of adding `s` to `S` is

```
Δ(s | S) = A(S ∪ {s}) − A(S)
         = (1/n) Σ_x 1{ u_s(x) = 1 and u_t(x) = 0 ∀ t ∈ S }
         = P(s correct AND no source in S correct)
```

For `S = U \ {s}` this is exactly the **rescue rate ρ⁺_s**. So the rescue rule is not a heuristic:
it is the marginal of a submodular objective, and greedy acquisition is near-optimal.

**Corollary 3 (why vendor diversity saturates).** Submodularity is *diminishing returns by theorem*.
Each added source can only help on items no existing source solves. Once the blind-spot mass `c` is
reached, every further source has marginal zero — which is precisely what `n_eff → 1/φ` expresses
probabilistically.

### Tested on `repo/data/hard.db`

| Subset | Oracle-router accuracy |
|---|---|
| {gpt} | 0.8733 |
| {deepseek} | 0.8667 |
| {muse} | 0.8133 |
| {deepseek, gpt} | **0.8967** |
| {deepseek, muse} | 0.8800 |
| {gpt, muse} | 0.8800 |
| all three | 0.8967 |

Greedy selection: **gpt (+0.8733) → deepseek (+0.0233) → muse (+0.0000)**.
The greedy portfolio `{gpt, deepseek}` attains the global optimum 0.8967, and **muse's marginal is
exactly zero** — the same conclusion as the rescue/flip analysis, reached by optimisation rather than
by correlation.

**Engineering consequence:** the platform can compute the exact marginal value of any candidate source
on an audit set and stop buying sources when the marginal falls below the value of one human label.

---

## 3. Algorithm 1 — Rescue-Optimal Sequential Evidence Acquisition (ROSEA)

A sequential, cost-aware version of the same idea, for the *per-item* case.

For item `x`, let `a(x) = P(current label correct)`. Acquiring source `s` on `x` has expected gain

```
G(x, s) = (1 − a(x)) · ρ⁺_s(x) − a(x) · ρ⁻_s(x)
```

where `ρ⁺_s(x)` is the probability `s` is correct given the current label is wrong, and `ρ⁻_s(x)` the
probability `s` is wrong given the current label is right.

**Rule.** Acquire `argmax_s G(x, s) / c_s` while the maximum exceeds the value of a human label;
otherwise defer to a human. This is a *myopic value-of-information* policy with an explicit stopping
condition, and it degrades gracefully: if every source is redundant (`G ≤ 0`), it stops spending.

Because `A(S)` is submodular, the myopic policy inherits diminishing returns and cannot overspend on
correlated sources.

---

## 4. Algorithm 2 — Blind-Spot-Aware Aggregation (BSA)

A generative model that makes the blind spot an explicit latent class instead of an emergent artifact.

For each item `x`, introduce `z ∈ {0,1}` = "resolvable" (at least one source knows the truth).

```
z ~ Bernoulli(π)
if z = 1:  y ~ Cat(p_x)
           v_s = y            with prob θ_s
           v_s ~ q_s(·)       with prob 1 − θ_s
if z = 0:  v_s ~ q_s(·)       (independent of y; no source knows it)
```

Likelihood:

```
P(V | z=0) = Π_s q_s(v_s)
P(V | z=1) = Σ_k p_x(k) Π_s [ θ_s·1{v_s=k} + (1−θ_s)·q_s(v_s) ]
```

EM: E-step gives posteriors over `z` and `y`; M-step updates `θ_s`, `q_s`, `p_x`.
The output is not just a label but a **decomposition**: `P(resolvable | V)` and `P(y | V, z=1)`.

**Identifiability warning (measured).** With J = 3 sources and K = 4 classes there are 64 possible vote
patterns; your 300 rows populate **19**. A full Dawid–Skene model has 37 free parameters against 18
observed degrees of freedom, and unsupervised EM prefers a wrong solution by **93 nats**. So BSA must be
fit with *constraints* (shared `q_s`, or a small gold set) — otherwise it is prior-dominated. This is a
real limit, not an implementation detail.

---

## 5. Algorithm 3 — D-Optimal Synthesis (generating for information, not realism)

Standard generation optimises realism or diversity. Neither is what training needs.

For a parametric model `p(y|x;θ)`, the Fisher information of a candidate set `S` is

```
F(S) = Σ_{x∈S} E_y[ ∇θ log p(y|x;θ) ∇θ log p(y|x;θ)ᵀ ]
```

Choose items to maximise `log det F(S)`. By the matrix determinant lemma, the greedy gain of adding `x`
with gradient `g_x` is

```
log det(F + g_x g_xᵀ) − log det F = log(1 + g_xᵀ F⁻¹ g_x)
```

**Rule.** Generate candidates, then admit the ones maximising `g_xᵀ F⁻¹ g_x` — the *standardised*
gradient norm, i.e. items the current model explains worst *in directions it has not yet covered*.

This is D-optimal experimental design applied to dataset generation. It is computable with a small probe
on frozen embeddings, so it is CPU-feasible.

**Precedent:** optimal experimental design is classical (Fedorov 1972). Using it as the *admission
objective* for synthetic data, with a provenance-carrying batch, is not a pipeline I found published.

---

## 6. Algorithm 4 — Policy Learning via Membership Queries (PLMQ)

Instead of learning a classifier from labels, **learn the guideline** from a logarithmic number of human
decisions.

Let `H` be a finite hypothesis class of candidate policies (each a small rule set). The **halving
algorithm**:

```
repeat:
    choose the item x that splits H most evenly (≈ 50/50 predicted labels)
    ask the human for the label of x
    eliminate inconsistent hypotheses
until |H| = 1
```

Query complexity: `⌈log₂|H|⌉`, independent of dataset size. For linear threshold policies over `d`
features, membership-query learning needs `O(d log(1/ε))` queries.

**Consequence for your 8 dispute stems:** if the candidate policy class is small, the guideline is
learnable in a handful of well-chosen questions rather than hundreds of labels. The item to ask about is
*the one that halves the hypothesis space*, not the one with the lowest model confidence.

---

## 7. Algorithm 5 — Coverage-by-Construction Generation (CCG)

Represent the policy as a grammar: each class has productions for the typical case, the boundary case,
and the exceptions. Every synthetic item is a **derivation**.

Objective: choose derivations to maximise weighted path coverage

```
maximise  Σ_p w_p · 1{ path p covered }
```

This is **maximum coverage**, which is monotone submodular → greedy gives `(1 − 1/e)`.

Output: a **coverage certificate** — "this synthetic set covers 92% of the policy's derivation space" —
which is a claim about *completeness*, not about realism. This is the correct objective for taxonomy
bootstrapping, where W2 measured the largest gains (+4 to +10 AP).

---

## 8. Algorithm 6 — Box Algebra with Certified Contradictions (for detection)

Treat bounding boxes as elements of a constraint system, not as free-form annotations.

```
C1  0 ≤ x, y     and    x + w ≤ W,  y + h ≤ H          (bounds)
C2  area(b) ≥ a_min(class)                              (degenerate boxes)
C3  IoU(b₁,b₂) > τ  and  label(b₁) ≠ label(b₂)  ⇒  contradiction
C4  |aspect(b) − μ_class| > k·σ_class  ⇒  outlier
C5  partOf(A,B)  ⇒  box(A) ⊆ box(B)                     (containment)
C6  frame t and t+1: same track ⇒ same label            (temporal)
```

These are checkable in polynomial time and yield **provable** annotation errors, not suspicions.
The certified output is the *contradiction set*, each with the exact violated constraint.

---

## 9. Algorithm 7 — Set-Valued Annotation (SVA)

Replace the hard label with a **prediction set** carrying a coverage guarantee.

Using split conformal on a calibration set, emit `S(x) ⊆ Y` such that

```
P( y ∈ S(x) ) ≥ 1 − α
```

`|S| = 1` → auto-accept; `|S| ≥ 2` → human review; `S = ∅` → ontology gap. The exported dataset then
contains *set-valued labels with a certified coverage level*, which preserves uncertainty for downstream
training instead of destroying it.

**Caveat (W6):** conformal requires exchangeability. On your fixture ICC = 0.715, so calibration must be
done at the **template** level, or the coverage guarantee is void.

---

## 10. Algorithm 8 — Information-Priced Datasets

Price each sample by its marginal contribution, using a Shapley approximation:

```
φ_i = Σ_{S ⊆ D\{i}} w(S) · [ U(S ∪ {i}) − U(S) ]
```

with `U` = downstream validation accuracy. Exact Shapley is exponential; KNN-Shapley and truncated Monte
Carlo give usable estimates. The output is a **per-sample information price**, which gives a principled
dedup rule (two samples with high mutual information are redundant) and a principled acquisition price.

**Precedent:** Data Shapley (Ghorbani & Zou 2019), KNN-Shapley (Jia et al. 2019). New as a *platform
primitive* that prices every row.

---

## 11. What is actually new here

| Result | Status |
|---|---|
| **Rescue Submodularity theorem** | Derived and proved here; tested on your data. I found no publication stating that oracle-router accuracy is submodular in the source set, nor that the rescue rate is its marginal. **This is the strongest candidate for a genuine contribution.** |
| ROSEA | Sequential VOI with a rescue-based utility and a cost stopping rule. VOI is classical; the rescue formulation and the stopping rule are the new part. |
| BSA | Mixture with an explicit unresolvable class. Related abstention/latent models exist; the identifiability analysis at J=3, K=4 is new and negative. |
| D-optimal synthesis | Optimal design is classical; as an admission objective for synthetic batches it is not a pipeline I found. |
| PLMQ | Membership-query learning is classical (Angluin). Applied to *guideline* learning with a halving rule, it is new as a system. |
| CCG | Maximum coverage is classical; policy-grammar coverage with a certificate is new. |
| Box algebra | Constraint validation exists; a certified contradiction algebra for boxes is a product novelty. |
| SVA | Conformal sets are known; as an exported *label type* with coverage, new. |
| Information pricing | Shapley data valuation exists; as a per-row platform price, new. |

---

## 12. The one experiment that decides the whole programme

Compute, on your existing gold, the **rescue rate of a rule set** (8 rules for the 8 dispute stems) and of
**a retrieved-policy verifier**, then run greedy submodular selection over `{models, rules, verifier}`.

- If greedy adds the rules and the accuracy moves above 89.67%, **the blind spot was policy, not model**,
  and the entire algorithmic programme is validated in one day.
- If greedy adds nothing, the residual is genuinely unrecoverable from these sources, and the honest
  product is certification plus deferral — also a result, and also publishable.
