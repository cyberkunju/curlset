# W10 — Human baselines, annotator quality, and how benchmarks validate labels

**Date:** 2026-11-04. **Scope:** the real human bar for labeling, so any "near-human / beyond-human" claim can be stated honestly.
**Relation to wave 1:** does not re-derive R1–R10; uses the synthesis's plurality figure (86.3%) only as a reference point.

**Tags:** `[P]` primary source fetched and read today, number appears in that document. `[R]` reported via a secondary surface (snippet, review, vendor page), not confirmed in the primary text. `[I]` inferred/derived by me, arithmetic shown. `[U]` unknown — stated as a gap, not a fact.

---

## 1. Executive summary

**1.1 There is no single "human accuracy." There is a ladder, and its rungs differ by 5–15 points.** The same 4-class task yields four different "human" numbers: a single annotator (~88–92%), a majority of three (~95–98%), an adjudicated gold (~97–99% against the adjudicator's own judgment), and an expert-adjudicated set. Papers that say "humans get X%" almost never say which rung. That omission is where most "AI beats humans" claims are manufactured.

**1.2 Measured ceilings are lower than practitioners assume.** ImageNet 1000-way top-1, careful multi-annotator protocol: **91.2%** (88.5% on ImageNetV2) `[P]`. SuperGLUE RTE: **93.6%** for a *majority of five* workers `[P]`. SQuAD v1.1: human EM **77.0**, F1 **86.8** `[P]`. GPQA Diamond: PhD experts **65%**, web-enabled non-experts **34%** `[P]`. HellaSwag: **95.6%** `[P]`. Humans sit at 90–95% where there is a written decision rule and a small label space, and fall to 65–77% where the answer needs deep inference or span selection.

**1.3 The most useful number here is an identity, not a citation.** For a balanced 4-class task with independent errors spread over the other three classes:

`raw agreement = a² + (1−a)²/3`, `κ = (agreement − 0.25)/0.75`, so `a = 0.5 + 0.5·√(3·agreement − 0.75)`

| Single-annotator accuracy `a` | Raw agreement | Cohen's κ | Majority-of-3 |
|---|---|---|---|
| 0.85 | 0.730 | 0.640 | 0.939 |
| 0.88 | 0.779 | 0.706 | 0.960 |
| 0.90 | 0.813 | 0.751 | 0.972 |
| 0.92 | 0.849 | 0.798 | 0.982 |
| 0.94 | 0.885 | 0.846 | 0.990 |

Read backwards: **κ = 0.80 implies a single annotator is right ~92% of the time, and a 3-annotator majority ~98%.** This is why teams with "κ = 0.8, excellent agreement" datasets get models that cap out at 88% and then feel cheated — the gold is a majority of three, while the model is being compared to a single annotator's number. Different rungs.

Caveat, and it is real: the identity assumes independent, uniformly-spread errors. Shared misreadings raise agreement without raising accuracy. High agreement is necessary but not sufficient evidence of a clean label — the same direction that matters for a platform selling certified precision.

**1.4 LLMs beating crowdworkers replicates; LLMs beating adjudicated experts does not.** Gilardi et al. (PNAS): ChatGPT beat crowdworkers on **4 of 5** tasks, exceeded *intercoder agreement* on all, at **< $0.003 per annotation** `[P]`. The critiques are also real: the comparison was against *individual* workers, gold was itself crowd-produced, and public benchmarks were plausibly contaminated — a 27-task replication on private data found GPT-4 at median **F1 0.707** with substantial divergence from human judgment `[R]`. On expert tasks, a 2025 evaluation across finance, law and biomedicine found **47–86%** accuracy and "only marginal or even negative performance gains"; they did not match experts `[P]`.

**1.5 Benchmarks are not clean, and their human baselines are often not measurements.** Northcutt et al.: **≥3.3%** label errors across ten test sets, **≥6%** in ImageNet validation `[P]`. MMLU: **6.49%** of questions contain errors `[P]`. A 2026 COCO re-audit reports **16,219 missing annotations (44.1%)** and 7,736 misaligned boxes in the audited slice `[P]`. CoNLL-2003: **7.0%** of labels corrected `[P]`. Open Images publishes its own agreement numbers — box-drawing IoU **0.87**, verification IoU **0.77**, first-pass acceptance **48%** `[P]` — which is what honest annotation QA looks like when a vendor must publish it.

**1.6 The market changed four months ago.** Amazon Mechanical Turk **permanently closed on 30 September 2026**, after closing to new customers on 30 July `[P]`. The "crowdworker baseline" every 2022–2024 paper compared against is no longer purchasable, so any 2026 baseline must name its population (Prolific panel, in-house, experts).

**1.7 The honest bar for Curlset's task.** Point estimates to be replaced by measurement: single blinded annotator vs adjudicated gold **≈91%** (88–93%); majority-of-three **≈97–98%**; the gold's own error rate **≈1–3%**. A plurality-of-three-models at **86.3%** sits ~5 points *below* a single human and ~11 below a three-human majority.

---

## 2. Human accuracy by task

### 2.1 The table

| Task | Human figure | Rung / protocol | Tag | Source |
|---|---|---|---|---|
| ImageNet 1000-way top-1 | **91.2%** (ImageNet), 88.5% (V2) | Accuracy vs multi-annotator re-annotation, ~3 annotators | `[P]` | Shankar et al., ICML 2020 |
| ImageNet val label validity | ≥**6%** of labels wrong | Model-flag + human verification | `[P]` | Northcutt et al. 2021 |
| ImageNet label stability | **33%** of val identical across studies; **21%** multi-label | Meta-comparison of re-annotations | `[R]` | ICLR 2025 "Flaws of ImageNet" |
| Box drawing (Open Images) | mean IoU **0.87** | 1 expert/box, extreme clicking | `[P]` | Kuznetsova et al., IJCV 2020 |
| Box verification (Open Images) | IoU **0.77**; acceptance **48%** → **70%** | Independent verifier | `[P]` | ibid. |
| NER, CoNLL-2003 | **7.0%** of labels corrected | Consistency check + correction | `[P]` | CleanCoNLL |
| NER sentence-level error | reported fall from **47%** | Re-annotation | `[R]` | ibid. |
| NLI, RTE | **93.6%** | Majority of 5 | `[P]` | SuperGLUE |
| NLI, CB | **95.8 / 98.9** | Majority of 5 | `[P]` | ibid. |
| MultiRC | **81.8 / 51.9** | Majority of 5 (EM/F1a) | `[P]` | ibid. |
| COPA / WSC | **100.0** | Majority of 5 | `[P]` | ibid. |
| WiC | **80.0** | Majority of 5 | `[P]` | ibid. |
| SQuAD v1.1 span QA | EM **77.0**, F1 **86.8** | Single baseline vs gold spans | `[P]` | Rajpurkar et al. 2016 |
| GPQA Diamond | **65%** PhD experts; **34%** non-experts | Expert-validated items | `[P]` | Rein et al. |
| GPQA Diamond, re-recruited | **69.7%** | OpenAI-recruited PhDs | `[R]` | Epoch AI |
| HellaSwag | **95.6%** | Validation human accuracy | `[P]` | Zellers et al. 2019 |
| GoEmotions (28-way) | pairwise κ ≈ 0.44, α ≈ 0.31 | 3 raters/item | `[R]`/`[U]` | third-party summary; original IAA not obtained |
| **4-class intent (this project)** | **≈91%** single; **≈97–98%** majority-3 | Derived from §1.3 identity | `[I]` | this report |
| MMLU | **no measured human baseline**; the common ~90% expert figure is an estimate | — | `[U]` | Hendrycks et al. 2021, not confirmed |
| MMLU question validity | **6.49%** of questions erroneous | Expert audit, 5 categories | `[P]` | Gema et al., NAACL 2025 |

### 2.2 Three regularities

**(a) Human accuracy tracks label-space size and rule explicitness, not domain prestige.** Binary NLI with a written definition: 93.6%. 1000-way classification: 91.2%. Span extraction where several spans are defensible: EM 77.0 — and note the EM/F1 gap (77.0 vs 86.8): most "error" is span-boundary convention, not comprehension. A 4-class support-intent task sits at the easy end: few classes, explicit routing rules, and a business consequence that makes the right answer operationally definable.

**(b) Aggregation buys 5–7 points and is not free.** SuperGLUE's 93.6% is a 5-worker majority; the single-worker figure is unpublished, but §1.3 implies ~88–90%. Papers routinely take a single-worker figure from one source and a 5-worker benchmark from another in the same table.

**(c) Published baselines are collected once and never revisited.** SQuAD's 77.0 EM is one 2016 number; neither SQuAD nor SuperGLUE ships per-annotator data, so neither can be re-analysed for variance.

### 2.3 Using the identity

- **Auditing a purchased gold set.** 85% raw agreement with 4 balanced classes implies ~92% single-annotator accuracy `[I]`. If a vendor reports κ = 0.85 as "excellent," that implies ~94.5% single and ~99% majority-of-3 — believable only if annotators shared a guideline and erred independently. If they report 96% raw agreement *and* κ = 0.85, check class balance: on unbalanced data, raw agreement inflates while κ does not.
- **Setting the AI target.** Parity with a *single* human needs ~91% ± 3.4 pp (n = 300) `[I]`. Parity with a *three-human majority* needs ~97–98%, which is outside what any ensemble in this project reaches (86.3%) and outside what a 300-item interval can resolve.

### 2.4 Expert vs crowd

- **Domain inference.** The 2025 expert-annotation evaluation (finance, law, biomedicine) found LLMs at 47–86% with no reliable gains from prompting or scale, and no match to experts `[P]`. No crowd-vs-expert head-to-head number was found in the fetched text `[U]`.
- **Medical imaging.** Dermatologists *without* CNN support scored **74.1%** mean accuracy (95% CI 68.1–79.4), improving with CNN assistance `[P]` (Winkler et al., JAMA Dermatology 2023). The earlier "CNN outperformed 136 of 157 dermatologists" result is real on a curated image set `[R]`. Both are true: the human number is a function of the image distribution and reading protocol. This is the cleanest documented case of a "we beat the doctor" headline that does not survive a change of test set.
- **Law.** "GPT-4 near the 90th percentile on the bar exam" (Stanford, 2023) was re-evaluated as overstating capability on novel questions `[R]`. Lawyer performance varies enormously by task, so "the average lawyer" is a weak baseline that averages across difficulties.
- **Where experts are irreplaceable.** When the label needs context not in the item (patient history, jurisdiction, prior rulings), accountability, or a genuinely contested decision rule. They are replaceable where the rule is written down and the item is self-contained — the definition of a support-ticket intent task.

### 2.5 Human label variation

Three claims from Plank (EMNLP 2022) `[P]`, Uma et al. (JAIR 2021) `[P]` and Pavlick & Kwiatkowski (TACL 2019) `[P]`:

1. **Aggregation destroys information.** Majority vote is a lossy projection of a distribution; on subjective items the majority label may be one no annotator held.
2. **Disagreement persists as annotators are added** — Pavlick & Kwiatkowski's central finding, that the distribution does not collapse to a point mass with more ratings, i.e. it is not sampling noise `[P]` (the exact percentage was not obtained from the fetched pages `[U]`).
3. **Evaluation must report the distribution, not only the mode** — soft labels and Dawid–Skene/MACE recover per-annotator reliability and per-item distributions.

Implication for "correct": on a **constitutive** task like intent routing, the correct label is the one the business process would route to, and a written precedence rule makes it near-objective. On a **subjective** task (sentiment intensity, toxicity), "correct" is a distribution and accuracy against a mode is a category error. Curlset's task is constitutive, so hard labels are defensible — **provided** the guideline carries an explicit precedence order (e.g. "if payment failed, it is billing even when the user also reports an error"). Without that document, label variation is guideline-induced rather than inherent, and it presents as irreducible model error. Writing it is the highest-leverage unfunded task in the project.

### 2.6 What each benchmark actually validated

| Benchmark | Validation performed | Known defect | Correction |
|---|---|---|---|
| **ImageNet** | One MTurk annotator per image; no IAA reported | ≥6% val errors `[P]`; 21% multi-label, 33% cross-study stability `[R]`; 11–14% drop on ImageNetV2 `[R]` | ReaL, ImageNetV2, Shankar multi-label gold, Yun re-labelling |
| **COCO** | Crowd + vendor QA; no published per-category IAA | **16,219 missing annotations (44.1%)**, 7,736 misaligned boxes `[P]`; boundary ambiguity dominates small objects `[R]` | Boundary IoU/AP, missing-annotation audits, LVIS-style expert verification |
| **GLUE / SuperGLUE** | SuperGLUE: 5 workers, majority vote, per-task human baselines `[P]` | Baselines single-shot, small-n, no per-annotator data; GLUE saturated and retired | SuperGLUE built for difficulty; no systematic relabel |
| **MMLU** | No measured human baseline; items from exams | **6.49%** erroneous, 5 categories, affects rankings `[P]` | MMLU-Redux (expert-verified), MMLU-Pro |
| **GPQA** | Expert-written and expert-validated, "Google-proof"; experts 65% `[P]` | Small expert n; baseline moves with recruitment (65% vs 69.7%) `[R]` | Validation built into construction |
| **HellaSwag** | Adversarial filtering + human validation, 95.6% `[P]` | AF is model-dependent: items that fool model A can be trivial for model B | Per-family re-filtering |
| **CoNLL-2003** | No formal IAA in the parts fetched `[U]` | **7.0%** labels corrected `[P]`; sentence-level errors 47% `[R]` | CleanCoNLL |

Two lessons. **The best-validated benchmarks made validation part of construction** (GPQA, HellaSwag) rather than an afterthought (ImageNet, COCO, MMLU). And **every large benchmark independently re-audited has shown 3–7% label error.** A platform assuming 0% gold error is off by an order of magnitude against the published evidence.

---

## 3. LLM vs human: the evidence table

| Study | Year | Task | Result | Caveats |
|---|---|---|---|---|
| Gilardi, Alizadeh & Kubli (PNAS) | 2023 | 5 text-annotation tasks | Beat crowd on **4 of 5**; ~**25 pp** higher zero-shot accuracy on four datasets; exceeded *intercoder agreement* on all; **< $0.003/annotation** `[P]` | Compared to *individual* workers, not majority crowds; crowd-produced gold; one model version; no expert arm |
| Törnberg | 2023 | Political tweets (7 classes) | GPT-4 higher accuracy, higher reliability, equal/lower bias than expert and crowd classifiers `[R]` | Single human coder per item; author-defined gold; small n |
| Pangakis & Wolken (ICWSM) | 2025 | 27-task replication, private data | GPT-4 median **F1 0.707**, < $500; "diverging significantly from human judgment in many cases"; argues public-benchmark wins are contamination-inflated `[R]` | Private data removes contamination but also comparability; F1 hides per-class failure |
| "Who Annotates in NLP?" | 2026 | Meta-audit, 1,603 papers; 12 humans + 6 LLMs | Best LLM **79.9%** macro agreement vs human **79.2%**; α **0.606** vs **0.585** `[P]` | Agreement, not accuracy; pooling heterogeneous tasks makes the headline nearly uninterpretable |
| Bojić et al. (Sci. Reports) | 2025 | Sentiment, political leaning | GPT-4 "can effectively replicate human analysis… although human…" (abstract truncated at fetch) `[R]` | Single domain; no expert adjudication |
| Expert-annotation eval (arXiv 2508.07827) | 2025 | Finance, law, biomedicine | **47–86%** accuracy; "only marginal or even negative performance gains"; did not match experts `[P]` | Small task set; expert n not reported in fetched text `[U]` |
| Zheng et al. (MT-Bench/Arena) | 2023 | Pairwise judging | GPT-4–human **85%** (859 votes) vs human–human **81%** (479); Arena **87%** (1,944) `[P]` | Agreement ≠ accuracy; shared bias inflates both; position and verbosity bias documented in the same paper |
| Horych et al. (NAACL Findings) | 2025 | Media-bias detection | ChatGPT strong; open models substantially worse `[R]` | One task; construct validity contested |
| Calderon et al. (ACL) | 2025 | LLM-vs-human equivalence test | Statistical equivalence procedure, **n ≈ 100**; warns it can be gamed by choosing weak human samples `[P]` | Equivalence to *a random human annotator*, not to consensus or experts |

**What replicates.** LLMs beat *individual* crowdworkers on well-specified short-text classification with a small label space, at 1/100–1/1000 the marginal cost, with higher run-to-run consistency than a crowd has person-to-person. Robust across 2023–2026 and multiple labs. Curlset's task is exactly in this zone.

**What does not.** Claims that LLMs beat *aggregated* humans (majority of 3–5) or *experts*. Control for aggregation and the margin goes to zero (79.9% vs 79.2% `[P]`); add experts and it goes negative `[P]`.

**Three traps:**

1. **Aggregation asymmetry** — comparing a model to one worker and calling it human-level. Fix: compare against the same aggregation the gold used; report both.
2. **Criterion circularity** — if gold came from the same crowd, "beating the crowd" means agreeing with its aggregate better than its members do, which is near-tautological for a mode-seeking model. Fix: adjudicated gold produced independently of both.
3. **Contamination** — public benchmarks leak into pretraining. Fix: private post-cutoff items, and report public and private numbers separately.

**Cost** `[I]`, rate assumptions `[U]`: 4 annotators × 300 items × 25 s = 8.3 h ≈ **$100** at $12/h (Prolific's recommended minimum `[R]`), ~**$143** with a 43% platform fee `[R]`; adjudication of 45 disagreements ≈ 1.1 expert hours ≈ **$45**. Total ≈ **$190**. A four-model pass over the same 300 items costs **$0.15–$3.24** at assumed API prices `[U]`. The human baseline costs ~$200 once and is the only way to know whether the $0.15 number means anything.

---

## 4. What "beyond human" can legitimately mean

### 4.1 Six rungs, three defensible

| Claim | Meaning | Defensible? |
|---|---|---|
| **R0 beats one annotator** | Model > a single blinded annotator, same items and guideline, adjudicated gold | **Yes**, if powered and pre-registered. The only strong claim most teams can support. |
| **R1 beats the crowd's mode** | Model > majority-of-3/5 | Rarely. Requires the model to be right where the majority is wrong — i.e. gold errors. On 300 items that needs ~15+ majority-wrong items, which usually means *the gold is wrong*, not that the model is superhuman. |
| **R2 beats adjudicated gold** | Model > the labels you ship | **Incoherent.** You cannot exceed the criterion by more than its own error rate. What you can claim is *the gold is wrong on k items*, then show the corrected gold. |
| **R3 predicts the human distribution** | Lower KL to the annotator distribution than any individual | **Yes** — the strongest legitimate "beyond human" claim in the HLV literature: a model can represent uncertainty no single human can. |
| **R4 finds label errors better than a human auditor** | Higher precision flagging mislabeled items than a human reviewer | **Yes**, documented, and a genuinely different task from labeling (confident-learning / cleanlab territory). |
| **R5 exceeds human throughput/consistency** | 1000× volume, no fatigue drift, byte-identical re-runs | **Yes**, but operational, never phrased as "more accurate." |

### 4.2 The claim Curlset can actually defend

> "On 300 held-out items from this distribution, our auto-labels agree with blinded human adjudication at 94.1% [91.0, 96.3], against 91.3% [87.8, 93.9] for a single blinded annotator on the same items (paired McNemar p = 0.04, n = 300). We do not claim to exceed three-annotator consensus, which we measure at 97.6%. We publish the 18 items on which we and the adjudicator disagree."

Better than "beyond human" because it is falsifiable, it names the rung, it carries the interval, and it survives the reviewer's first question ("compared to whom?").

### 4.3 The three conditions for exceeding the human bar

1. **The human arm must be a single, unaggregated annotator on the same items with the same guideline.** Against a three-human majority the model needs ~97–98%, which requires the humans to be wrong on 8+ of 300 items *and* the model right on them — possible via fatigue and long-tail error, but it must be *shown on those items*, not inferred from an aggregate.
2. **The model must have evidence the human did not.** Same text and same four label names = the same task, and the ceiling is the task's ambiguity. Model plus retrieved routing policy, adjudicated precedents and account state = an *easier* task. Legitimate product advantage, but it must be described as "the model had the policy and the human did not," never as "the model is smarter."
3. **The residual errors must be human errors, not label variation.** AI can beat a human on definitional confusion, long-tail recall and consistency. It cannot beat a human on genuine ambiguity: there is nothing to beat, and a "win" is a different draw from the same distribution.

A procedural condition applies to all three: **enough n and blinding to prove it.** At n = 300, detecting a 5-point paired difference needs ≈343 items for 80% power (McNemar, discordant 0.08/0.03; power at 300 is 0.745) `[I]`. Below that a "win" is a coin flip with a narrative attached.

---

## 5. Protocol: a human baseline for 300 items, 4 classes

Written for Curlset's actual task: 300 records, 4 balanced classes (`technical_support`, `billing`, `feature_request`, `general_inquiry`), single-label, short support text.

**Three quantities, reported separately.**
- **H1 single-annotator accuracy** — mean per-annotator accuracy vs adjudicated gold. What an AI must beat to claim "better than a human."
- **H2 majority-of-three accuracy** — 3-vote mode vs adjudicated gold. What an AI must beat to claim "better than a team."
- **H3 gold reliability** — rate at which adjudication reverses a unanimous label, from double-adjudicating a random 30 items. This is the ceiling: 2% gold error means no claim above 98% is meaningful.

**Sampling.** Primary sample: 300 items uniformly at random from the frozen pool, stratified only to preserve 75/75/75/75. Do **not** enrich for model-disagreement items in the primary sample — that biases H1/H2 in ways that cannot be corrected without weights. An optional +100 sample over-samples the 2-of-1 band for *error analysis only*, reported separately.

**Why 300.** At p = 0.90 the Wilson 95% interval is [0.861, 0.929], half-width 3.4 pp `[I]` — adequate to *estimate* H1/H2, marginal for *comparing* them to a model. For a superiority claim, 400–500 is the honest minimum; pre-register which you are doing.

**Pool and blinding.** Four annotators minimum: three independent labelers plus an adjudicator who does not label in the first pass. Use a paid panel (Prolific ≥ $12/h `[R]`) or in-house staff, and record which — the population is now part of the result, since MTurk is closed `[P]`. Blinding is the load-bearing control: annotators see the text, four label names, definitions, precedence rules and three worked examples per class; they do **not** see model predictions, confidence, class distribution, other annotators' labels or the external key. Randomize item order per annotator (tickets arrive in temporal clusters; a fixed order induces correlated fatigue). One pass only — discussion before labels are locked turns three independent votes into one vote plus two echoes. Insert 20 seeded items (6.7%) at random, require ≥18/20, report the exclusion rate, and keep seeded items out of the accuracy estimate.

**Guideline — the part that determines the answer.** One paragraph per class in an agent's language; **a precedence order** for multi-intent items (e.g. `billing` > `technical_support` > `feature_request` > `general_inquiry` when two apply, unless payment has not failed); ten pre-adjudicated boundary cases per adjacent class pair, decided by the product owner rather than the annotators; and an explicit **"cannot determine"** flag separate from the four classes, with items flagged by ≥2 annotators excluded from H1/H2 and reported as an ambiguity rate. Budget one day. It will move H1 more than any model change, and it is what makes the labels reusable.

**Adjudication.** Every disagreement goes to the adjudicator, who sees both labels, the guideline and a free-text reason box, but not model output. Record a reason code: `guideline_gap`, `multi_intent`, `annotator_error`, `genuine_ambiguity`, `gold_was_wrong`. A reversal of a *unanimous* label is a gold-error event — log it and re-check ten neighbouring items. Double-adjudicate 30 random items with a second expert; that agreement is your H3.

**Per-annotator accuracy, three estimators.** (1) Against adjudicated gold — the headline, mildly biased toward annotators whose judgment shaped the guideline. (2) Dawid–Skene or MACE over the 3×300 matrix — no gold used; if it diverges from the gold-based estimate by >3 points for any annotator, the gold is doing work it should not. (3) Leave-one-annotator-out — each annotator scored against the majority of the other two; unbiased by that annotator and directly comparable to a model scored against the same consensus. Report per-annotator numbers, not just the mean: 91% averaging one annotator at 84% and two at 94.5% is a different dataset from three at 91%.

**Analysis plan, pre-registered.**

| Quantity | Estimator | Interval |
|---|---|---|
| H1 | mean of per-annotator accuracies | Wilson/Clopper–Pearson 95% |
| H2 | point accuracy vs adjudicated gold | Wilson 95% |
| Agreement | Fleiss' κ, 3 annotators | bootstrap over items, 1,000 resamples |
| Model vs H1 | McNemar exact, paired on the same 300 | exact p + risk difference CI |
| Per class | recall/precision | Wilson 95% per class |
| H3 | double-adjudication agreement, 30 items | Wilson 95% |

**Decision rules, written before the data.** "Matches a human annotator" only if the model's CI overlaps H1's **and** paired McNemar is non-significant. "Exceeds a human annotator" only if McNemar p < 0.05 **and** n ≥ 343 **and** annotators were blinded **and** the comparison is against H1, not H2. Never claim against H2 unless H2 was measured in the same run. If H3 shows >3% gold error, cap every claim at `1 − H3` and say so.

**Threats.**

| Threat | Direction | Control |
|---|---|---|
| Anchoring/automation bias if annotators see model output | Inflates model agreement | Strict blinding; audit that the UI never renders predictions |
| Fatigue, order effects | Depresses H1 late in the batch | Randomize order; checks throughout, not at the end |
| Guideline ambiguity | Depresses H1 *and* H2, flatters the AI | Precedence rules; "cannot determine" flag; report ambiguity rate |
| Adjudicator capture | Inflates agreement with the guideline author | Second adjudicator on 10%; reason codes |
| Contamination of the pool | Inflates model accuracy | Post-cutoff items or a private held-out slice |
| Small-n optimism | Usually upward on the winner | Pre-registered n; intervals, not points |

**Cost and calendar** `[I]`, assumptions `[U]`: guideline ~1 day (~$400 internal); 4×300×25 s = 8.3 h (~$143 incl. platform fee); adjudication ~45 × 90 s (~$45); double-adjudication (~$30); analysis 0.5 day (internal). **~3 days, ~$620**, against cents for the model side. The asymmetry is the point: the human baseline is the expensive, one-time, irreplaceable measurement.

**Output is a rung table, not a number:**

```
H3  gold reliability      97.9%  [93.1, 99.4]   double-adjudication, n=30
H2  majority-of-3         97.2%  [94.7, 98.6]
H1  single annotator      91.3%  [87.8, 93.9]
    model plurality      86.3%  [81.9, 89.8]
    model + retrieval       ???
```

If the last row lands at 92–94% with a CI clearing H1's lower bound, the honest claim is *"we match a careful human annotator, provably, at n = 300."* If it lands at 89%, the honest claim is *"we are 2 points below a single human annotator, and here are the 33 items where we fail"* — more useful than any "beyond human" headline, because it tells the customer what they are buying and where to spend review budget.

---

## 6. References

Fetched 2026-11-04.

1. Northcutt, Athalye & Mueller. *Pervasive Label Errors in Test Sets…* NeurIPS 2021. arxiv.org/abs/2103.14749 `[P]`
2. Shankar et al. *Evaluating Machine Accuracy on ImageNet.* ICML 2020. proceedings.mlr.press/v119/shankar20c `[P]`
3. Beyer et al. *Are we done with ImageNet?* arXiv:2006.07159 `[R]`
4. *Flaws of ImageNet.* ICLR Blogposts 2025. iclr-blogposts.github.io/2025/blog/imagenet-flaws/ `[R]`
5. Recht et al. *Do ImageNet Classifiers Generalize…?* ICML 2019; imagenetv2.org `[R]`
6. Kuznetsova et al. *Open Images V4.* IJCV 2020. arxiv.org/html/1811.00982v2 `[P]`
7. *The Role of Label Errors and Annotation Uncertainty.* arXiv:2609.21822 `[P]`
8. Cheng et al. *Boundary IoU.* CVPR 2021 `[R]`
9. Gema et al. *Are We Done with MMLU?* NAACL 2025. arxiv.org/abs/2406.04127 `[P]`
10. Rein et al. *GPQA.* arXiv:2311.12022 `[P]`
11. Epoch AI, GPQA Diamond (69.7% recruited-PhD baseline) `[R]`
12. Wang et al. *SuperGLUE.* NeurIPS 2019. arxiv.org/html/1905.00537v3 `[P]`
13. Rajpurkar et al. *SQuAD.* EMNLP 2016. aclanthology.org/D16-1264.pdf `[P]`
14. Zellers et al. *HellaSwag.* ACL 2019. aclanthology.org/P19-1472.pdf `[P]`
15. Tjong Kim Sang & De Meulder. *CoNLL-2003 Shared Task.* 2003 `[R]`
16. *CleanCoNLL.* arXiv:2310.16225 `[P]`
17. Liu & Ritter. *Do CoNLL-2003 NER Taggers Still Work Well in 2023?* ACL 2023 `[R]`
18. Demszky et al. *GoEmotions.* ACL 2020 `[U]` (IAA figures not obtained)
19. Gilardi, Alizadeh & Kubli. *ChatGPT outperforms crowd workers…* PNAS 2023; arXiv:2303.15056 `[P]`
20. Törnberg. *ChatGPT-4 Outperforms Experts and Crowd Workers…* arXiv:2304.06588 `[R]`
21. Pangakis & Wolken. *Human-Centered Automated Annotation with Generative AI.* ICWSM 2025; arXiv:2409.09467 `[R]`
22. *Who Annotates in NLP?* arXiv:2606.02255 `[P]`
23. Bojić et al. *Comparing LLMs and human annotators.* Sci. Reports 2025 `[R]`
24. *Evaluating LLMs as Expert Annotators.* arXiv:2508.07827 `[P]`
25. Zheng et al. *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena.* NeurIPS 2023 `[P]`
26. Horych et al. NAACL 2025 Findings, aclanthology.org/2025.findings-naacl.75.pdf `[R]`
27. Calderon et al. *The Alternative Annotator Test.* ACL 2025 `[P]`
28. Plank. *The "Problem" of Human Label Variation.* EMNLP 2022 `[P]`
29. Pavlick & Kwiatkowski. *Inherent Disagreements in Human Textual Inferences.* TACL 2019 `[P]`
30. Uma et al. *Learning from Disagreement: A Survey.* JAIR 2021 `[P]`
31. Aroyo & Welty. *Truth is a Lie.* 2015 `[R]`
32. Hovy et al. *MACE.* 2013 `[R]`
33. Landis & Koch. *Measurement of Observer Agreement for Categorical Data.* Biometrics 1977 `[R]`
34. Bujang & Baharum. *Minimum sample size for Cohen's kappa.* 2017 `[R]`
35. Winkler et al. JAMA Dermatology 2023, pmc.ncbi.nlm.nih.gov/articles/PMC10157508/ `[P]`
36. Brinker et al. *Deep learning outperformed 136 of 157 dermatologists.* 2019 `[R]`
37. Martinez. *Re-Evaluating GPT-4's Bar Exam Performance.* law-ai.org `[R]`
38. mturk.com/help (closure 30 Sep 2026) `[P]`
39. TechCrunch, 2026-07-05, MTurk closure to new customers `[R]`
40. Prolific payment model (min $8/h, recommended $12/h) `[R]`
41. LXT, *Data Annotation Outsourcing* 2026 (~$10–$300/h) `[R]`
42. SecondTalent, *Data Annotation Costs by Country* 2026 (~$2–$150+/h) `[R]`

### Appendix — derivation and intervals `[I]`

Two annotators, true label uniform over K = 4, each correct with probability `a`, wrong answers uniform over the other three. They agree if both are correct or both pick the same wrong class: `agreement = a² + (1−a)²/3`. Chance is `1/4`, so `κ = (agreement − 0.25)/0.75`, and `a = 0.5 + 0.5·√(3·agreement − 0.75)`. Majority-of-3 is correct iff ≥2 are (`a³ + 3a²(1−a)`); a three-way split is unresolved, not correct. The model breaks when errors correlate — shared misreadings raise agreement above what accuracy alone predicts, the annotation-side mirror of the correlated-error ceiling in R1.

Wilson 95% at p̂ = 0.90: n=100 [0.826, 0.945]; n=200 [0.851, 0.934]; **n=300 [0.861, 0.929]**; n=500 [0.871, 0.923]; n=1000 [0.880, 0.917].
