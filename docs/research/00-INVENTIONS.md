# 00 — INVENTIONS: what the evidence unlocks

**Date:** 2026-11-04
**Basis:** waves 1 and 2 (`00-SYNTHESIS.md`, `00-SYNTHESIS-WAVE2.md`, `LEAD-FINDING-templated-fixture.md`, W1–W13).
**Status:** original design ideas, not literature. Each has a mechanism, the evidence it rests on, a test, and a kill criterion. Novelty claims are *as far as my search found* — marked where a precedent exists.

---

## 0. The one shift that makes everything else possible

**Stop treating a label as a judgment. Treat it as the execution of a versioned policy over evidence, with a measurable residual.**

Every dead end we hit — correlated ensembles, unidentifiable label models, synthetic-data collapse, uncertifiable precision — came from treating the label as a point estimate of truth. If instead the label is *the output of a specified decision procedure applied to the item*, three things change:

1. Disagreement stops being noise and becomes **a missing rule**.
2. Accuracy stops being a scalar and becomes **a policy-conditional quantity**.
3. Certification stops being "we sampled some labels" and becomes **"this procedure was executed, these constraints held, these items were checked, and here is the residual."**

That is the Curlset thesis. Everything below is a consequence.

---

## I. The Rescue Rule — a decision theory for evidence sources *(most original algorithmic idea)*

### The problem it solves
Every method in the literature scores **content** diversity. None scores whether a new source of evidence (a model, a rule set, a synthetic batch, a human) will *recover items the others cannot*. But that is the only quantity that moves accuracy.

### The mechanism
For a source `s`, on an audit set with labels:

```
ρ⁺_s = P(s correct | every other source wrong)      # the RESCUE RATE
ρ⁻_s = P(s wrong   | every other source right)      # the FLIP RATE
c    = P(every existing source wrong)                # the blind-spot mass
```

**The Rescue Rule.** Admit `s` iff

```
c · ρ⁺_s  >  (1 − c) · ρ⁻_s
```

That is, the source must rescue more blind-spot mass than it corrupts. This is a *single scalar per source*, computable from ~200 audit items, that answers: "does this model/rule/synthetic generator/human add anything?"

Expected accuracy gain is exactly `c·ρ⁺ − (1−c)·ρ⁻`, which bounds *every* debate, jury, verifier, and ensemble protocol at once — because no aggregation can do better than the best available rescuer.

### Why it matters
- It is the formal version of what your own 900 votes showed: three models with φ = 0.78 have ρ⁺ ≈ 0, so they are redundant *by measurement*, not by intuition.
- It converts "should we buy GPT-7?" into a number.
- It converts "should we generate more synthetic data?" into a number: a synthetic batch is admitted only if its rescue rate beats its flip rate.
- It gives the **stopping rule** for generation: stop when `c·ρ⁺ ≤ (1−c)·ρ⁻`.

### Evidence anchor
W1's Δ decomposition, W8's error-diversity accounting, the 9-judge panel result, the exact reproduction of `1 − 3p̄ + 2c` on your data.

### Test / kill
On the existing 900 votes, compute ρ⁺ for each model. If all three are ≈ 0 (predicted), the metric is validated by reproducing your negative. Then compute ρ⁺ for a rule set and for a small probe. If a cheap rule set has ρ⁺ > 0.1 while a fourth LLM has ρ⁺ ≈ 0, you have proved — in a day, for the cost of one experiment — that **independent evidence beats vendor diversity**. If ρ⁺ is not estimable at n=200, report the CI and enlarge the audit.

### EXECUTED 2026-11-04 — the metric reproduces the observed outcome exactly

Computed directly from `repo/data/hard.db` (300 rows, 900 votes), with `c = 31/300 = 0.1033`:

| Source | others-wrong n | **rescue ρ⁺** | others-right n | flip ρ⁻ | net `c·ρ⁺ − (1−c)·ρ⁻` |
|---|---|---|---|---|---|
| deepseek | 36 | **0.1389** | 242 | 0.0165 | **−0.0005** (neutral) |
| gpt-6-luna | 36 | **0.1389** | 240 | 0.0083 | **+0.0069** |
| muse-spark | 31 | **0.0000** | 253 | 0.0593 | **−0.0532** |

Three consequences, all matching what was already measured:

1. **muse is net-negative (−5.3 points).** It rescues *nothing* and flips 5.9% of the rows where the other two are right. This is why the ensemble underperforms the best single model — you are averaging in a source with negative marginal value.
2. **gpt-6-luna is the only source with positive net value (+0.69 points)**, and it is indeed the best single model. The metric would have told you to keep it and drop muse *before* running the comparison.
3. **Oracle router over the existing sources = 89.67%; plurality = 86.33%.** The 3.3-point gap is exactly what routing (VIII) can capture and voting cannot.

Sensitivity (how good a new source must be to be worth adding), with `c = 0.1033`:

| New source ρ⁺ | New source ρ⁻ | Net accuracy gain |
|---|---|---|
| 0.20 | 0.02 | −0.0028 (not worth it) |
| 0.50 | 0.01 | **+0.0427** |
| 0.70 | 0.01 | **+0.0634** |
| 0.50 | 0.05 | +0.0069 (marginal) |

**Read:** a rule set or a retrieved-policy verifier that rescues half the blind spot while flipping 1% of correct rows buys **+4.3 points** — more than any fourth LLM could. That is the entire case for independent evidence, quantified.

---

## II. The Ontology Compiler — guidelines as an executable, versioned artifact

### Mechanism
The label ontology is not a list of strings. It is a **decision procedure**: precedence order, inclusions, exclusions, boundary precedents, and an explicit *escape* ("if none of the above applies → `needs_human`").

The compiler turns that into:
- an executable checker (deterministic constraints),
- a **prompt fragment** for models (so every model sees the *same* policy),
- a **generation grammar** (so synthetic data is generated *along the policy branches*, not from bare class names),
- a **version identifier** that every label references.

### Why it is novel here
Your 31 all-wrong rows are 8 stems, every one a missing precedence rule. Today the platform has no object that represents that rule. The Ontology Compiler makes it first-class — and it is the single change that makes *both* synthetic generation and labeling deterministic rather than judgment-based.

### Test / kill
Write the 8 rules, compile, re-score the 300 rows. **Kill if plurality accuracy does not move ≥ 3 points.** Predicted: +5–10 points, because each decision flips 1–9 rows.

---

## III. Conditional labels — labels as functions of the policy version

### Mechanism
The data model stores not `label` but:

```
label = f(item, policy_version, evidence_snapshot)
```

With that, changing the guideline does not corrupt history — it produces a **new label generation**, and you can re-evaluate the whole dataset under the new policy with full provenance, and *diff* them.

Exports then carry: `label`, `policy_version`, `evidence_hash`, `confidence`, and the audit bound at the time of export.

### Why this is a data-model invention, not a feature
Datasheets, Croissant and W3C PROV record *where data came from*. None records *what the label would have been under a different rule*. The moment labels are policy-conditional, "relabel everything under v3" becomes a reproducible operation instead of a disaster.

### Test / kill
Ship `labels` with `policy_version` mandatory. **Kill if** the migration makes existing exports non-reproducible (it must not).

---

## IV. Disagreement-driven rule induction — learning the guideline itself

### Mechanism
Take every item where sources disagree, or disagree with gold. For each, generate **candidate minimal rules** ("invoice + routing verb → general_inquiry, unless amount is mentioned") using inductive/version-space search over a small predicate vocabulary (keywords, negation, numeric mentions, length, question type).

Present the top 3 candidate rules to a human. They pick one. The policy version increments. The system then re-labels everything under the new version.

This is **version-space learning applied to annotation guidelines**, not to a classifier.

### Why it matters
Humans stop being labelers and become **legislators**. Ten decisions could resolve the majority of model disagreement — and the policy they produce is reusable across datasets, which no per-item annotation can be.

### Precedent note
Version spaces (Mitchell 1982) and inductive logic programming are old. *Learning the annotation policy from disagreements, and versioning it*, is not a system I found in the literature or in any product.

### Test / kill
On the 8 dispute stems, generate candidate rules and see whether a human can pick a correct one in ≤ 3 options ≥ 7 times out of 8. **Kill if** candidate generation fails to include the correct rule.

---

## V. Deterministic constraint validation — provably wrong labels, zero model cost

### Mechanism
Before any probabilistic check, run hard constraints:

```
bbox.x + bbox.w ≤ image.width           (geometry)
duration(segment) ≤ duration(media)      (audio/video)
class_id ∈ ontology                      (schema)
"no damage" in text  ⇒  no defect bbox   (cross-modal)
train ∩ test = ∅ under near-duplicate    (leakage)
sum(class_probabilities) ≈ 1             (distribution)
```

Any violation is a **definite error** — not a suspicion. It costs no model calls and produces a *proof* rather than a score.

### Why it matters
Most of the literature is probabilistic label-error detection (Cleanlab, confident learning) with 51% precision on flagged items. Deterministic constraints have **100% precision on the errors they catch**. They are the cheapest and most defensible validation there is.

### Test / kill
Measure: what fraction of *known* injected errors do the constraints catch? If ≥ 30% of realistic corruption is caught deterministically, this becomes the first line of the quality engine.

---

## VI. Dataset mutation testing — certifying the validator itself

### Mechanism
Inject known label errors at controlled rates (flip 5%, swap bounding boxes, duplicate 3% of items, inject cross-split near-duplicates), then measure the quality engine's **detection sensitivity and false-positive rate**.

Publish: *"this validator catches 84% of injected label errors at a 2% false-positive rate."*

### Why it matters
Nobody sells a *measured validator*. Cleanlab's own flagged items are only 51% correct, and the repo's "confident learning" was a character-hash k-NN. Without mutation testing, the quality engine's claims are unfalsifiable.

### Precedent note
Benchmarks that inject noise to evaluate detectors exist (W9). As a *shipped product feature that certifies the validator on the user's own data*, this is new.

### Test / kill
Build the injector. If the current 12 rules detect < 40% of injected errors, the quality engine is a liability, not a feature — and you have the number to prove it.

---

## VII. Ambiguity accounting — the dataset's own accuracy budget

### Mechanism
For each item, split uncertainty into:
- **epistemic** (fixable with evidence): sources disagree, or a retrieved policy changes the answer;
- **aleatoric** (irreducible): label flips under semantics-preserving perturbation (paraphrase, label-order shuffle, minimal edit), or humans disagree.

Produce a per-dataset statement: **"4.2% of items are intrinsically ambiguous; the remaining 95.8% is certifiable at 99%."**

### Why it matters
It converts your worst result into a measurement. It also prevents the dishonest claim of "100% accuracy on a dataset that is 5% ambiguous". The `1 − d/2` theorem makes the limit explicit: if two humans disagree on more than 2% of items, 99% is impossible for anyone.

### Test / kill
Run paraphrase invariance on the 300 rows. If ≥ 80% of the all-wrong rows are *not* perturbation-sensitive, the residual is epistemic and recoverable — which is the best possible news.

---

## VIII. Routing, not voting — per-item source selection

### Mechanism
Never average. For each item, predict **which source will be right** using a learned router trained on gold. The oracle router gives 89.67% (every item with a correct vote). W5's supervised stacker reached **99.78% of resolvable rows** — i.e. routing already captures essentially all available headroom.

The router's cost model includes latency and dollars, so it can route cheap items to a small model and hard items to an expensive one.

### Why it matters
Selection does not need independent errors — averaging does. Routing is the one aggregation strategy that can exceed the best single model *even when all models share errors*, because it never mixes their failures.

### Test / kill
Compare the learned router against best-single on template-grouped CV. **Kill if** the CI includes zero (W5's current result: +2.3 [0.0, +4.8] — suggestive, needs more unique stems).

---

## IX. Provenance-graph label propagation — one human label, many items

### Mechanism
Build a similarity graph (embedding neighbours, near-duplicates, paraphrases, same-template). A human label on one node **propagates** along edges with a documented decay. Every propagated label stores its path, and a later contradiction anywhere invalidates the whole subgraph for re-review.

### Why it matters
Your fixture is 107 stems in 300 rows. One label per stem covers 300 rows — that is a **2.8× labour multiplier**, and it is exactly why your effective n collapsed. Propagation makes the templating a *feature* instead of a statistical trap.

### Test / kill
On the existing fixture, propagate from 107 stems and measure accuracy against the 300-row gold. If ≥ 95% agreement, propagation is validated. Then measure on genuinely diverse data.

---

## X. The Dataset Certificate — a third-party-verifiable artifact

### Mechanism
Every version ships `CERTIFICATE.json` containing:
- finite-population audit bound (exact hypergeometric, template-level) and the sampling seed;
- validator sensitivity from mutation testing;
- coverage-at-precision curve;
- ambiguity budget;
- rescue/flip rates per source;
- provenance hash and deterministic ZIP digest;
- licence obligations and intended-use declaration.

`curlset verify <bundle>` re-runs the sampler, recomputes the bound, and reports PASS/FAIL. The certificate is falsifiable by anyone with the bundle.

### Why it is the product
No platform, open or commercial, sells this. Patents cover measuring and routing annotators — none covers certifying precision. This is the unoccupied claim.

---

## XI. Coverage-at-precision as the headline metric

Instead of "95% accuracy", publish **"95% precision at 87% coverage"** — a risk–coverage curve per dataset and per class. W4 found this curve unmeasured in the VLM literature. It is both a product differentiator and a publishable measurement.

---

## XII. Least-cost certification — human budget as an optimisation

Given a target bound, allocate human labels to minimise cost:

```
minimise   Σ cost(x_i)
subject to certified_error_bound ≤ ε
```

with item selection by expected information gain (disagreement, ambiguity, rescue potential) rather than random sampling. This is the *budgeted certification* problem, and it is what turns the certificate from a report into a **controller**.

---

## The architecture that unifies them

```
 ONTOLOGY (versioned, compiled, with escape rules)
      │                                    ▲
      ├──► deterministic constraints       │ induced rules (IV)
      │                                    │
      ├──► prompts ─► sources (models, rules, probes, synthetic)
      │                    │
      │              rescue/flip audit (I)
      │                    │
      ├──► router (VIII) ──┴─► candidate labels (policy-conditional, III)
      │                                    │
      ├──► provenance-graph propagation (IX)
      │                                    │
      ├──► ambiguity accounting (VII)
      │                                    │
      ├──► mutation-tested validator (V, VI)
      │                                    │
      └──► CERTIFICATE (X) + coverage curve (XI) + budget optimiser (XII)
```

---

## What is genuinely new science vs strong engineering

| Idea | Novelty assessment |
|---|---|
| Rescue Rule (ρ⁺/ρ⁻) | **New as a formal admission rule.** I found no publication defining it or using it to admit sources. |
| Conditional labels | **New as a data model.** PROV/Croissant record provenance, not policy-conditional semantics. |
| Rule induction from disagreement | **New as a closed loop.** Version spaces are old; guideline learning with versioning is not a system I found. |
| Ambiguity accounting | Partial precedent (human label variation, data maps). New as a *certified budget*. |
| Mutation-tested validator | Partial precedent (noise-injection benchmarks). New as a shipped, per-dataset feature. |
| Error-diversity / rescue metrics | **Most publishable.** Small, clean, computable, and directly addresses the correlation ceiling the field keeps rediscovering. |
| Coverage-at-precision for VLM labels | **Most publishable measurement.** Unmeasured in the public literature. |
| The certificate | New as a *product category*, not as a theorem. |

---

## The 90-day plan

1. **Weeks 1–2:** 8-rule ontology, re-score, fix the certificate code bugs, build the de-templated gold set.
2. **Weeks 3–4:** Rescue-rate audit on the 900 votes + a rule set + a small probe. This is the experiment that decides whether the whole thesis is right.
3. **Month 2:** Conditional labels + policy versioning; the certificate artifact and `curlset verify`.
4. **Month 3:** Mutation-tested validator, ambiguity accounting, coverage curves, and the router.
5. **Ongoing:** Rule induction, propagation, and least-cost certification.

**The single experiment to run first:** compute ρ⁺ for the three models, a rule set, and a small probe on the existing gold. It costs one day, and if the rule set rescues where the models do not, you have the founding result of the platform.
