# W3 — Synthetic Text and Labels, Deep

**Date:** 2026-11-04 · **Scope:** synthetic text/label generation for small, subjective, multi-class text classification · **Status:** research + design; no new experiments executed here.

**Markers.** **[P]** primary source read (paper or official report I fetched). **[R]** replicated across ≥2 independent primary sources. **[I]** my inference/derivation. **[U]** unverified (secondhand, abstract-only, or forum).

---

## 1. Executive summary

**The question as asked cannot be answered, because it cannot be measured.** The fixture is 200 rows — 120 train / 40 val / 40 test, four classes, median 62 characters. At n = 40, 87% accuracy has a 95% Wilson interval of **[73.9, 94.5]**, a 20.7-point span. Moving 87% → 93% means **2.4 more correct items**; exact McNemar yields **p = 0.63–0.79** for every plausible discordance pattern (computed here, §3.7). With 5-fold CV over all 200 rows a true +6-point gain gives a paired CI of **[-0.1, 12.1]** — it touches zero. Detecting +6 points at 80% power needs **~430 held-out items**; +3 points needs ~1,740. **Any "87% → 93%" claim on the current fixture is unfalsifiable in either direction.** The first deliverable is not a generator; it is a gold set large enough to see the effect.

**Conditional on fixing measurement, the honest expectation is +1 to +3 macro-F1, not +6.** The literature's large effects all sit on weaker baselines than this one: Sahu et al. **90.28 → 94.07** on CLINC150 at k = 10 per intent across 150 intents [P]; Wagner et al. **F1 0.693 → 0.723** on 3-class subjective stance with 1,000 synthetic samples [P]; LLM2LLM **26.2 → 78.8** on 6-class TREC from 60 seeds [P]. Those baselines are at or near chance.

**A directly adverse result exists on a 4-class task.** Li et al. (EMNLP 2023): AG News — four classes, like this project — at **95.3 macro-F1 real-only vs 93.1 with synthetic added**, IMDB **87.6 vs 80.2** [P; table values from HTML, see §7]. Adding synthetic text to a competent classifier made it worse.

**The mechanism is information, not volume.** EntiGraph: **56.42% (compositional, 600M tokens) vs 43.08% (paraphrase, 1.8M) vs 38.15% (raw)** — paraphrase **plateaus at ~0.9M tokens**, compositional keeps scaling [P]. LLM2LLM seeds from the student's own errors, and its ablation shows real-data seeding beats re-augmenting synthetic [P]. TADA (ICLR 2026): *targeted* augmentation beats full-data augmentation [P]. KITE (2026) names the dominant failure of self-improving loops **"polarization of competence"** — strong skills improve while weak ones degrade [P]. For a 35/33/32/**20** train split, that is a precise prediction of what will break.

**A verified counter-intuitive result that should change the gate.** Diversity filtering is not load-bearing and can be harmful: removing the top 20% most similar synthetic samples improved diversity metrics (INGF −9 to −12%, APS −5 to −11%) and **reduced F1 in 9 of 12 cases** — Functional class **0.425 → 0.396 (−7.4 points)**. The authors: "not all redundancy is detrimental" [P]. A pipeline that rejects near-duplicates on principle discards the samples doing the regularizing.

**Verdict.** Synthetic text as augmentation **will not** take a 4-class intent classifier from 87% to 93%+. Evidence supports **+1 to +3**, with real risk of **−2 to −5** if generation is ungrounded, the share exceeds ~30–50%, or the gate is a diversity filter. 93% requires attacking the all-wrong mass (10.3% of records carry three wrong votes, per wave 1) with *independent evidence*. Synthetic data has a genuine role — as **targeted, policy-grounded draft generation whose output is adjudicated**, not bulk paraphrase — and that narrower role is the only synthetic method with a defensible route past +4.

---

## 2. Breakthrough candidates

Five candidates, ranked by expected value. Each is a transplant, not a validated off-the-shelf method, so the extrapolation is [I] and the underlying evidence [P]. Each has a two-day kill test.

### B1. Policy-graph compositional synthesis (highest ceiling)

Parse the annotation guideline into a graph — rules, exceptions to those rules, confusable pairs — then generate by walking **paths** through it (rule × exception × surface context) instead of paraphrasing existing rows.

This is EntiGraph's mechanism moved from documents to label policy, and its ablation is the most relevant number here: **56.42 vs 43.08 vs 38.15**, with paraphrase **saturating at 0.9M tokens** while composition scaled to 600M [P]. Paraphrase has a low ceiling because it resamples the same semantic points; composition samples new combinations, the only way synthetic data covers a region the real data lacks.

**What must be true:** the guideline contains rules not already implicit in 120 examples; `billing` vs `general_inquiry` confusions are rule-governed ("is the user asking *why* a charge occurred, or *for* a correction?"); a generator can follow a path without inventing rules.

**Kill test:** hand-write 40 policy-path items (2 hours). If a human cannot label them from the guideline alone at ≥90% agreement with the intended label, the policy is not crisp enough to synthesize from.

### B2. Error-targeted generation (best evidence-to-effort ratio)

Spend the whole budget where the model is wrong — out-of-fold errors, low-agreement records, specific confusion cells — rather than uniformly.

Three lines converge: LLM2LLM **26.2 → 78.8** on TREC from 60 seeds, with real-data seeding beating synthetic re-augmentation [P]; TADA augments only examples "not learned early" and **targeted consistently beats full-data augmentation** [P]; DEALT (AAAI 2026) uses an **adaptive incremental sampler** that steers the next round by what the last failed to fix [P].

**Why it matters here.** With 120 training rows each synthetic row has influence ~1/(120+N). Thirty uniform paraphrases per class move nothing; the *same* thirty concentrated on the eight cross-validated errors move the boundary locally. Uniform synthesis has diffuse influence; targeted synthesis has concentrated influence, and only concentrated influence can outvote a systematically wrong region.

**Kill test:** 5-fold out-of-fold errors on the 120 training rows. Below 15% error rate, there is no region to target and B2 collapses to B4.

### B3. Verifier independence as the design variable (the reframing)

Stop asking "which filter"; ask "does the verifier know anything the generator does not?" Yi et al. (ICLR 2026) show synthetic retraining does not collapse **when information is injected through an external verifier — a human or a better model** — and that filtering consistently improves performance with convergence over iterations [P]. Fu et al. (NeurIPS 2025) prove self-verification via internal confidence suffices [P].

A same-family LLM judge, an NLI model trained on the same distribution, and a reward model distilled from the same teacher are all informationally redundant with the generator: they pass what it was already confident about. The genuinely independent verifiers available here are human-adjudicated gold, a rule engine over the policy, and a small encoder trained only on adjudicated data.

**Kill test:** on 100 generated pairs, compare verifier–human agreement with verifier–generator agreement. If the latter is ≥ the former, the verifier is decoration and must be disabled.

### B4. Semi-synthetic editing (safest, least glamorous)

Have a human make one edit to a generated candidate rather than accept/reject it. The output is semi-synthetic: token-level distribution still anchored to a real document. Zhu et al. show semi-synthetic data — human-edited model output — avoids the collapse that fully synthetic data induces, while fully synthetic performance correlates negatively with synthetic proportion [P]. At 4 classes × 60 candidates this is 240 edits, not 240 annotations, and it removes the verifier-independence problem because the human *is* the independent verifier.

**Kill test:** time 20 edits. Above 40% of annotation time, the economics fail.

### B5. Synthetic-as-pool selection, not synthetic-as-dataset

Generate 10–20× more candidates than needed, then select a small coverage-optimal, boundary-heavy subset. Adaptive Coverage Sampling reports **~10% of data** beating full-corpus training when prioritising input-space coverage [P — abstract-level]. In stance detection the selection pipeline reached **0.754** vs **0.723** for plain augmentation vs **0.693** baseline [P] — selection added **+3.1 on top of +3.0**, roughly doubling the gain. DEALT is the same shape for long tails [P].

**Caveat:** at M = 1000 *random* selection outperformed both SQBC and CAL [U]. Selection has a regime.

**Kill test:** "generate 60/class, keep 20 by coverage" vs "generate 20/class, keep all" at equal final size. Under +1 point, drop it.

---

## 3. Methods with numbers

### 3.1 Instruction synthesis: what is the actual mechanism?

Self-Instruct bootstraps 33K instructions from 175 seeds, **+33% absolute** over GPT-3 on Super-NaturalInstructions [P, via wave 1]; Evol-Instruct reaches **>90% of ChatGPT on 17/29 skills** [P]; Magpie selects 300K of 4M and matches a 10M-SFT model on some tasks [P]; Genie's filters move relevance **67% → 92%**, faithfulness **53% → 76%**, overall **3.48 → 4.58** [P].

Three mechanisms are offered; the evidence separates them. **Distillation dominates every instruction-tuning result** — all four generate with a model stronger than the student on the target task. Where that fails, the mechanism fails; there is no credible weak-model bootstrap, and LLM2LLM is not an exception (it is error-targeted distillation with a stronger generator) [P]. **Coverage dominates when the source is a corpus** — EntiGraph is the clean experiment, **56.42 / 43.08 / 38.15** [P], where coverage of *relations* beat coverage of *surface forms* by 13 points. **Regularization is what remains for small classifiers** — adding 30 rows per class to 120 constrains the variance of a boundary estimated from 30 points; this is the most plausible account of the +1–3 point effects [I].

**Consequence:** you are the student, and the generator comes from the same family that produced your labels. The distillation channel is closed. Only coverage and regularization remain, and both have low ceilings.

### 3.2 Small classification datasets: the actual effect sizes

| Study | Task | Real data | Result | Read |
|---|---|---|---|---|
| Sahu 2022 [P] | CLINC150 (**150 intents**), SNIPS, HWU64, Banking77 | **k = 10/intent** | **90.28 → 94.07**; gains larger when intents distinct | +3.8 at k=10 |
| Li et al. EMNLP 2023 [P] | AG News **4-class**, IMDB | +3k synthetic/label | AG **95.3 → 93.1**; IMDB **87.6 → 80.2**; synthetic-only 89.3/81.2 | Negative at high share |
| LLM2LLM, ACL 2024 [P] | TREC(6), SNIPS, SST-2, CaseHOLD | **60 seeds** | **26.2 → 78.8** | Baseline near chance |
| Wagner, ICLR 2025 [P] | X-Stance, **3-class subjective** | limited | **0.693 → 0.723 → 0.754** | Closest analogue: +3.0 |
| 2407.12813 [P] | SST-2, EMO(6), NYT(8), Review(5), RTE, BoolQ | varied | **+3–26% when real < 1k; negative > 1k**; 1k synthetic | Best boundary condition |
| Requirements, 2025 [P] | Defects (**6-class**), three 2-class | **100% synthetic**, 500/label | Defects **0.372 → 0.526 (+15.4)**; 2-class **−7.9 to −9.5** | Gain tracks baseline weakness |
| Low-resource intent, 2026 [P] | 7-class topic, **10-class intent** | low-resource | **+40%** intent; **absent** high-resource; 200/class | Same shape |
| Li et al. 2023 [P] | 10 datasets | varied | effectiveness **negatively associated with subjectivity** | This task is subjective |

**The pattern is monotone and it is not about the method.** Every large gain sits on a weak baseline (26.2%, 37.2%, near-chance low-resource). Every null or negative sits on a strong one (95.3%, 87.6%, >1k real). A 2024 systematic comparison agrees from the other side: LLM paraphrase beats established augmentation **"only when a very small number of seeds is used"**, and established methods are "similar or better" on six datasets otherwise [P].

**87% / 120 rows sits toward the strong-baseline end** [I]: 30 rows per class is small, but the classifier is not at chance and its errors are policy errors, not coverage errors. Expect **+1 to +3**.

### 3.3 Quality filtering: which filter is load-bearing?

The most decision-relevant finding in this report is negative. In the 2025 requirements study, curation removed the **top 20% most similar** samples by Sentence-BERT. Diversity metrics improved (INGF −9 to −12%, APS −5 to −11%); F1 **fell in 9 of 12 cases**, Functional **0.425 → 0.396 (−7.4)**. Curation "discards examples valuable for model learning" [P].

Diversity metrics also have inconsistent predictive validity: one ACL 2025 instruction-tuning study reports NovelSum at **0.97 correlation** with performance, with Vendi and self-BLEU lower [P], while the image-scaling literature finds negligible correlation (wave 1). Both can hold — a diversity metric measures a property, not a value. Use it as a **mode-collapse reject gate only**, never as a select score.

Load-bearing, in order: (1) **label correctness**, verified by something not derived from the generator — Genie's stack moves faithfulness 53% → 76%, not to 100%, and every accepted error is *systematically* wrong, worse than random noise [P]; (2) **grounding** in real seeds or a real structure [P]; (3) **verifier independence** (B3); (4) **difficulty/uncertainty targeting** [P]; (5) dedup, for memorization and class-swamping control, not quality; (6) diversity/Vendi/self-BLEU, last.

**Quality classifiers do not transfer.** FineWeb-Edu's educational classifier lifted MMLU **33% → 37%** in a 28B-token ablation [P], and Ultra-FineWeb reports **28.84 → 31.80** [P] — web-scale selection for knowledge density among trillions of tokens. For 240 short in-domain intent utterances there is no comparable signal; a quality classifier here would discriminate between two samples of the same distribution.

The **QDC decomposition** is the cleanest summary: quality boosts in-distribution performance, diversity aids OOD generalization, complexity helps both but excess harms [P]. For in-distribution evaluation, **quality is the axis that matters and diversity is not.**

### 3.4 Ratios, scaling, and when synthetic data hurts

- **≤4 epochs** of repeated real data ≈ unique data; beyond that repetition decays [P — Muennighoff].
- **~1% synthetic can cap scaling**: with that little, "larger and larger training sets do not enhance performance" [P — Dohmatob, ICLR 2025]. Recursive-training regime, but it kills "a little synthetic is always safe."
- **20B synthetic on 34B real is the peak** for a 350M model; performance drops once synthetic exceeds real. Peak share ≈ **37%** [P — Zhu].
- **90% replacement is "marginal"** across 8 datasets; **the final 10% of real data is irreplaceable** [P — Ashok & May, ACL 2025].
- **~30% is the pretraining optimum**, 1/3 synthetic + 2/3 real reaching fixed loss **5–10× faster** [P — Kang, EMNLP 2025].
- **Negative beyond ~4–5× synthetic** in vision [P — Azizi]; **negative when real data exceeds ~1,000 rows** for text classification [P — 2407.12813].

**For 120 rows / 4 classes** [I]: safe additive budget is **20–30%**, i.e. **24–36 rows total, 6–9 per class**. That is the uncomfortable arithmetic at the heart of this report — at the safe ratio, the largest intervention available is smaller than the error mass being targeted. To add 100 synthetic rows you first need ~330 real rows.

### 3.5 Grounded generation: which structures win?

1. **Relational/compositional (EntiGraph).** **56.42 vs 43.08 vs 38.15**, and the only arm still scaling [P]. Composition explores combinations the source never states.
2. **The label policy itself (rule + exception + boundary).** No direct intent-classification experiment found [U]. Closest evidence is counterfactual minimal-edit augmentation, which reduces reliance on spurious features [P — Kaushik, ICLR 2020], with 2025 work continuing [P]. This is B1, the highest-ceiling unvalidated idea here.
3. **Adjacent-class negatives.** Near-miss examples labelled as the neighbour sharpen the `billing`/`general_inquiry` boundary; DEALT is the 2026 long-tail instantiation [P].
4. **Source documents.** Genie [P] — but the guideline is the only corpus this project has.
5. **Personas.** Persona Hub supplies 1B personas as a diversity device [P]. For customer support, persona conditioning ("frustrated enterprise admin", "first-time user") produces surface variation at constant label — coverage, not information.

The ranking is entirely about whether the structure encodes **decisions or surfaces**. Documents and personas encode surfaces; rules, exceptions and confusions encode decisions.

### 3.6 2025–2026: what is genuinely new

**Verifier-gated synthesis became theory.** Yi et al. (ICLR 2026): escape from collapse requires an **external verifier injecting information**, and gains converge over iterations [P]. Practical reading [I]: the gate must be informationally independent, and the loop needs a stopping rule.

**Self-improving loops were diagnosed precisely.** Across 1.7B–8B models, iterative synthetic tuning does not degrade uniformly — **strong skills improve while weak ones degrade**; the KITE intervention recovers **+1.92% average over baselines after five iterations** [P]. Translated here [I]: after two rounds expect `billing` (35 rows) to improve and `general_inquiry` (20 rows) to worsen, with macro-F1 flat or slightly up. **Per-class deltas are mandatory.**

**Targeted synthesis matured** — TADA [P], DEALT [P], LLM2LLM [P]. The convergent claim: *where* you generate matters more than *how much*.

**Curriculum synthesis is mostly vision** (DisCL, ICCV 2025 [P]); no text-classification numbers found [U]. **Adversarial/contrastive generation for text classification remains thin** — hard-sample generation for contrastive learning exists [P, AAAI 2023], but the 2025–26 hard-negative work I found is vision or retrieval [U]. Nobody has published a clean "generate hard negatives for a 4-class intent classifier and measure the boundary shift" study that I could locate: an opportunity, and a warning that the effect size is unknown.

**On LLMs as intent-classification augmenters**, the 2026 low-resource study is the most direct evidence: 10-class intent, 200 synthetic per class, **+40% low-resource**, gains **absent** in the high-resource control, self-revision as the filter [P — abstract-level]. With Sahu (k=10) and 2407.12813 (<1k real), the boundary is consistent: **this is a low-resource intervention**, and its effect at 120 rows per class is established by no study I found.

### 3.7 Measurement: why the headline question is unanswerable

Computed here from the fixture's splits (test n = 40), Wilson intervals and exact McNemar:

| n | 87%, 95% Wilson CI | width |
|---|---|---|
| **40** (current test) | **[73.9, 94.5]** | 20.7 pts |
| 100 | [79.0, 92.2] | 13.2 |
| 200 (5-fold CV over all rows) | [81.6, 91.0] | 9.3 |
| 400 | [83.3, 89.9] | 6.6 |
| 800 | [84.5, 89.2] | 4.7 |

87% → 93% on 40 items is +2.4 items; exact McNemar for net +2 with 4–14 discordant pairs gives **p = 0.63–0.79**. No discordance pattern at n = 40 makes +6 points significant.

At n = 200, a true +6 points with 20% discordance (b=26, c=14) gives a paired 95% CI of **[-0.1, 12.1]**, McNemar **p = 0.081**; with heavier discordance (b=32, c=20), **[-1.0, 13.0]**, p = 0.126. At n = 400: **[1.7, 10.3]**, significant. Power at 80%, δ = 6, 20% discordance: **n ≈ 433**; at δ = 3: **n ≈ 1,740**.

**Consequence [I]:** expanding frozen gold to **≥400 items** is a prerequisite for the whole programme, and cheaper than the programme. Without it the team will observe +2 or +7 by chance and ship a false conclusion in whichever direction the coin lands.

---

## 4. Evidence table

| Method | Venue / year | Effect (as reported) | Dataset / setting | Replication |
|---|---|---|---|---|
| Grounded paraphrase, 30% share | EMNLP 2025 | 5–10× speedup to fixed loss; ~30% optimum | Pretraining, >1000 LMs | **[R]** |
| Compositional synthesis (EntiGraph) | ICLR 2025 | **56.42 vs 43.08 (paraphrase) vs 38.15 (raw)**; paraphrase plateaus ~0.9M tok | QuALITY, Llama-3-8B | [P] |
| GPT-3 augmentation, k=10 | NLP4ConvAI 2022 | **90.28 → 94.07** | CLINC150, 150 intents | [P] |
| LLM synthetic augmentation | EMNLP 2023 | AG **95.3 → 93.1**; IMDB **87.6 → 80.2** | 4-class AG News, IMDB | [P] adverse |
| Size sweep | arXiv 2407.12813 | **+3–26% <1k real; negative >1k** | 6 datasets | [P] |
| Error-seeded synthesis (LLM2LLM) | ACL 2024 Findings | TREC **26.2 → 78.8** from 60 seeds | TREC(6), SNIPS, SST-2 | [P] |
| Synthetic + selection (SQBC) | ICLR 2025 | **0.693 → 0.723 → 0.754** | X-Stance, 3-class subjective | [P]; random > SQBC at M=1000 [U] |
| Targeted augmentation (TADA) | ICLR 2026 | Targeted > full-data | Vision | [P]; text analogue unproven [U] |
| Quality+diversity validator (DEALT) | AAAI 2026 | Beats SOTA on tail classes | Long-tail text | [P] |
| **Diversity curation** | arXiv 2506.21138, 2025 | **F1 fell 9/12; 0.425 → 0.396 (−7.4)** | Requirements, 6-class | [P] adverse |
| 100% synthetic, 6-class | arXiv 2506.21138, 2025 | **0.372 → 0.526 (+15.4)**; 2-class **−7.9 to −9.5** | Requirements, 500/label | [P] |
| Verifier-gated synthesis | ICLR 2026 / NeurIPS 2025 | Filtering improves; external verifier prevents collapse | Theory + LMs | **[R]** |
| Self-improving failure mode | arXiv 2607.17043, 2026 | "Polarization of competence"; KITE **+1.92%** / 5 iters | 1.7B–8B | [P] |
| Semi-synthetic (human-edited) | arXiv 2412.14689, 2024 | Fully synthetic correlates negatively; semi-synthetic avoids collapse | LM pretraining | [P] |
| Synthetic ratio, additive | arXiv 2410.15226, 2024 | Peak **20B synthetic / 34B real**; hurts beyond | 350M model | [P] |
| Synthetic replacement | ACL 2025 | **90% marginal; final 10% severe** | 8 datasets | [P] |
| Repeated data | NeurIPS 2023 | **≤4 epochs ≈ unique** | LMs | [P] |
| Strong model collapse | ICLR 2025 | **~1% synthetic caps scaling** | Theory + empirics | [P] |
| Educational quality classifier | arXiv 2406.17557 | MMLU **33 → 37** (28B-token ablation) | Web pretraining | [P] |
| Low-resource topic/intent synth | arXiv 2601.16278, 2026 | **+40%** 10-class intent; absent high-resource | 200/class | [P] abstract |
| Diversity metric ↔ performance | ACL 2025 | NovelSum **0.97**; Vendi/self-BLEU lower | Instruction tuning | [P], conflicts with wave 1 → weak |
| Coverage-based subset | arXiv 2504.14508 | **~10% of data** beats full corpus | Synthetic training | [P] abstract |
| Counterfactual minimal edits | ICLR 2020 | Reduces spurious-feature reliance | Sentiment, NLI | [P] |

---

## 5. Hype and dead ends

**"Generate 10k from class names and fine-tune."** The current default prompt — `"Generate realistic training examples for class: {class_name}"` (`packages/dataset_synthesis/models.py`) — is exactly this. Wave 1's fake-generator experiment falsified it locally (0.196 trigram ratio, 52.1% simulated preservation); Li et al. falsified it externally (AG News 95.3 → 93.1) [P].

**"More synthetic data is more data."** Dohmatob's 1% [P], Muennighoff's 4 epochs [P] and the <1k boundary [P] all contradict it. At 120 real rows the safe budget is ~30 rows, not 3,000.

**"Filter aggressively for diversity/dedup."** The −7.4 point curation result [P] is the clearest adverse finding here. Redundancy is partly *signal* — repeated exposure to the same decision pattern is how a small model learns it.

**"Use a reward model / LLM judge."** Same-family judges are informationally redundant and reward models are over-optimized against (wave 1). The 2025–26 theory makes the criterion precise: the verifier must carry information the generator lacks [P].

**"Self-improving loop: retrain, regenerate, repeat."** The exact configuration where polarization of competence bites [P]: the aggregate looks fine, the minority class dies. Even in the good case, performance converges, so the loop offers no compounding advantage.

**"Synthetic data will fix the hard cases."** The 31 all-wrong records are wrong from shared model ignorance or genuine ambiguity (the 89.7% oracle bound). A generator built on the same models reproduces the same ignorance. **Synthetic data cannot manufacture information that is missing.**

**"Backtranslation as augmentation."** Not label-preserving for intent — it drops negation, entities and constraints (wave 1). Consistency check only.

**"Curriculum synthesis for text classification."** Vision evidence only (DisCL, ICCV 2025 [P]); no text numbers [U]. Do not budget.

**Forum reality check.** Practitioner reports match the academic adverse results and are best read as failure-mode evidence, not effect sizes: synthetic-only training collapses because it is "not constrained by the real world feedback" (r/LocalLLaMA 1qfysbh) [U]; instruction-only data degrades prediction when context is not instruction-shaped ("All work and no play makes your LLM a dull boy") [U]; first LoRA attempts routinely make small models worse [U]; and the enduring HN objection that statistically-derived synthetic data is "either worthless or leaky" (HN 22377092) [U]. The thing practitioners report and papers under-report: **degradation is silent.** Benchmarks stay flat while the output distribution narrows — precisely the polarization failure now formalized [P], and the reason per-class deltas and a held-out distribution check are non-negotiable.

---

## 6. Design for this codebase

### 6.1 The strategic decision

Do not build "synthetic data augmentation." Build **targeted, policy-grounded draft generation with human adjudication on the boundary**, and treat synthetic rows as *probes* that expose where the policy is underspecified. The success metric changes from "macro-F1 delta" to "policy gaps discovered and closed per 100 drafts" — measurable at n = 40, because it counts discoveries rather than estimating an accuracy. Uniform paraphrase is still built, as the **control arm**: the thing you must beat, which the literature says will deliver +1–3 at best.

### 6.2 What exists, and what must change

- `models.py` — `SynthesisBatchRequest` defaults to a bare-class-name template.
- `generation_pipeline.py::_generate_candidates` (line 117) iterates `labels × per_class` passing only `{"target_class", "index", "seed"}` — no seeds, definition, negatives or policy.
- `diversity.py::filter_candidates` (line 120) — trigram Jaccard, batch trigram ratio, class-share cap. No embeddings, no NLI, no verifier-independence tracking.
- `dataset_evaluation/metrics.py::compute_classification_metrics` (line 45) — where the paired-delta + CI contract lands.

Four additions, in dependency order.

**1. `context.py` — `SynthesisContext`.** The generator's input stops being a label string:

```
class_definitions: {label: one-sentence rule}
seeds: {label: [3-5 human-adjudicated rows]}
negatives: {label: [2-3 rows from the adjacent class + why they differ]}
confusions: [(label_a, label_b, distinguishing_question)]
policy_rules: [rule ids the sample must satisfy]
```

**2. `policy_graph.py`.** Nodes are rules, exceptions, confusable pairs; edges are "overridden by". Sample a length-2–3 path, render it as a scenario brief, then generate. Report `paths_covered / paths_total` per batch; a batch that does not increase path coverage is not doing compositional synthesis and should be rejected on that ground. This is B1, and the coverage metric is cheap and honest.

**3. `targeting.py`.** Inputs: out-of-fold predictions over the 120 training rows plus stored ensemble votes. Output: per-class and per-confusion-cell quotas. Rules: no quota for a class with zero out-of-fold errors; ≥50% of budget to confusion cells; hard cap 30% synthetic per class, 25% dataset-wide. This is B2.

**4. `verification.py`.** Every verifier declares `family` and `information_source` (`human_gold` | `rules` | `model:<family>`). A batch is admissible only if **at least one accepting verifier's source differs from the generator's family**. Record `verifier_overlap = (verifier_generator_agreement ≥ verifier_human_agreement)` on 100 calibration pairs; if true, disable that verifier. Cheapest genuinely new idea here.

### 6.3 Measurement protocol (build first)

1. **Expand frozen gold to ≥400 items**, stratified, with 100 double-annotated to estimate gold noise. Without this, stop — every downstream number is unfalsifiable (§3.7).
2. Every evaluation returns `{value, n, ci:{method, level, low, high}, per_class:{...}}`. No bare floats.
3. Paired design: real-only vs real+admitted, identical folds, seed and model. Report exact McNemar, paired bootstrap CI (10k, stratified), and the **per-class delta vector**.
4. **Pre-register the rule:** admit only if the paired 95% CI lower bound on macro-F1 exceeds **0**, the point estimate exceeds **+1.0**, no class recall drops >2 points, and the polarization score (max class delta − min class delta) is ≤ 4. The last clause is the KITE lesson [P] and it will fire.
5. **Version-bind** `synthesis_impact` to `baseline_eval_run_id`, `treatment_eval_run_id` and the frozen manifest hash (wave 1, L5).

### 6.4 Experiment ladder

| ID | Question | Design | Pass bar |
|---|---|---|---|
| S0 | Is the effect measurable? | Gold → 400; re-run baseline | Paired CI width ≤ 6 pts |
| S1 | Grounding vs bare class names | 5 arms: bare / +definition / +seeds / +negatives / +policy-graph; 3 seeds, 24 rows/class | Monotone increase; policy-graph ≥ bare + 5 pts preservation |
| S2 | Targeting vs uniform | Equal budget; uniform / error-targeted / confusion-cell | Targeted ≥ uniform + 1.5 pts macro-F1 |
| S3 | Verifier independence | Same-family judge / NLI / rules / human audit | Independent false-admit ≤ half of same-family |
| S4 | Safe share | 0 / 10 / 25 / 50 / 100%, 5 seeds | Admit smallest share clearing S2; reject ≥50% unless it beats 25% |
| S5 | Edit vs accept/reject | 60 drafts × {accept, edit, reject} | Edited rows' delta ≥ accepted rows' |
| S6 | Round-2 degradation | Repeat S2 twice; track per-class | Polarization ≤ 4; `general_inquiry` recall not −2 |

S0 gates everything. S1–S6 cost roughly 1,500–3,000 short generations; at CPU rates consistent with wave 1 (Qwen2.5-3B Q4, ~8–20 output tok/s, 100–500 short candidates/hour) that is **3–15 hours of generation** [I], plus human time for S5 and the gold expansion. A two-week programme, not a quarter.

### 6.5 Cost and local-first honesty

Generation is not the bottleneck; **adjudication is.** B4 needs 240 edits; S0 needs ~200 new gold labels. Budget human time first. GPU is optional: a 3B Q4 model on CPU is adequate for 40-token utterances, and the 3B-vs-7B quality delta on this task is unmeasured [U] — measure it on 100 pairs before assuming a GPU is required.

### 6.6 The risk to design against

Not collapse, not cost. It is **shipping a +2-point improvement that is a −3-point regression on the smallest class, invisible in the macro average because the largest class improved.** The 2026 polarization result [P] predicts exactly this for a 35/33/32/20 split. The defence is structural: per-class deltas in every report, a polarization gate, a minimum class-recall floor. With those three in place the pipeline cannot silently damage the dataset — which, at these effect sizes, is worth more than the +1–3 points it might deliver.

---

## 7. References and verification notes

**Primary sources read.**

1. Sahu et al., *Data Augmentation for Intent Classification with Off-the-Shelf LLMs*, NLP4ConvAI 2022 — arXiv:2204.01959
2. Li et al., *Synthetic Data Generation with LLMs for Text Classification: Potential and Limitations*, EMNLP 2023 — arXiv:2310.07849
3. Wagner et al., *The Power of LLM-Generated Synthetic Data for Stance Detection*, ICLR 2025 — arXiv:2406.12480
4. Cegin et al., *LLMs vs Established Text Augmentation Techniques for Classification*, NAACL 2025 — aclanthology.org/2025.naacl-long.526
5. *Data Generation using LLMs for Text Classification* — arXiv:2407.12813
6. Lee et al., *LLM2LLM*, ACL 2024 Findings — arXiv:2403.15042
7. Yang et al., *Synthetic Continued Pretraining (EntiGraph)*, ICLR 2025 — arXiv:2409.07431
8. Geng et al., *Genie*, ICLR 2024 — arXiv:2401.14367
9. Ashok & May, *A Little Human Data Goes A Long Way*, ACL 2025 — arXiv:2410.13098
10. Zhu et al., *On the Diversity of Synthetic Data and its Impact on Training* — arXiv:2410.15226
11. Zhu et al., *How to Synthesize Text Data without Model Collapse?* — arXiv:2412.14689
12. Muennighoff et al., *Scaling Data-Constrained Language Models*, NeurIPS 2023 — arXiv:2305.16264
13. Dohmatob et al., *Strong Model Collapse*, ICLR 2025 — arXiv:2410.04840
14. Nguyen et al., *TADA*, ICLR 2026 — arXiv:2505.21574
15. Yi et al., *Escaping Model Collapse via Synthetic Data Verification*, ICLR 2026 — openreview.net/forum?id=yfk6c39omW
16. Fu et al., *Self-Verification Provably Prevents Model Collapse*, NeurIPS 2025
17. *Learning from Synthetic Data without Model Collapse (KITE)* — arXiv:2607.17043
18. *How Good Are Synthetic Requirements?* — arXiv:2506.21138
19. Lu & Cui, *DEALT*, AAAI 2026 — ojs.aaai.org/index.php/AAAI/article/view/40508
20. *Leveraging LLMs and Synthetic Data for Low-Resource Topic and Intent Classification* — arXiv:2601.16278
21. Yang et al., *Measuring Data Diversity for Instruction Tuning*, ACL 2025 — aclanthology.org/2025.acl-long.908
22. *Less is More: Adaptive Coverage for Synthetic Training Data* — arXiv:2504.14508
23. *Surveying the Effects of Quality, Diversity, and Complexity of Synthetic Data* — arXiv:2412.02980
24. Penedo et al., *FineWeb / FineWeb-Edu*, arXiv:2406.17557
25. Xu et al., *Magpie*, ICLR 2025 — arXiv:2406.08464
26. Kaushik et al., *Counterfactually-Augmented Data*, ICLR 2020 — arXiv:1909.12434
27. Zhang et al., *Dually Self-Improved Counterfactual Data Augmentation*, ACL 2025 — aclanthology.org/2025.acl-long.260
28. Liang et al., *Diffusion Curriculum (DisCL)*, ICCV 2025 — arXiv:2410.13674
29. Chan et al., *Persona Hub* — arXiv:2406.20094
30. Hugging Face, *Cosmopedia* (25B tokens, 30M+ files) — huggingface.co/blog/cosmopedia [U, vendor blog]
31. Kang et al., EMNLP 2025 — aclanthology.org/2025.emnlp-main.544 [via wave 1]

**Carried from wave 1, not re-derived:** Shumailov (Nature 2024); Gerstgrasser (ICML 2024); Seddik 2024; Kazdan 2024; Lee et al. dedup (ACL 2022); Friedman & Dieng, Vendi (TMLR 2023); Angelopoulos, conformal risk control.

**Verification notes — read before quoting externally.**

- **Li et al. (AG 95.3 → 93.1; IMDB 87.6 → 80.2).** Read from the arXiv HTML rendering; the PDF was binary and unreadable to the fetch tool. The table layout (`Real F1 [0/3k]`, `Synth-F1 [3k]`, `Real+Synth [0.3k real + 3k synth]`) does not fully resolve which real-data condition each figure belongs to. **Direction is safe to cite; exact deltas should be re-checked against the published PDF.**
- **SQBC "random > SQBC at M=1000"** came from a third-party review page, not the paper body — [U].
- **Adaptive Coverage Sampling** ("~10% beats full corpus") is abstract-level; effect-size table not extracted.
- **arXiv 2601.16278** (+40%, 200/class, self-revision filter) is abstract-level; per-task tables not extractable.
- **All statistics in §3.7** (Wilson, exact McNemar, paired CIs, power) were computed for this report from the fixture's actual splits and are reproducible in a few lines of Python; they are [I], not published results.
- **Forum material (§5)** is [U] throughout: Reddit bodies were not retrievable (login wall), so only search-result snippets were used.

---

*Two claims here contradict wave 1 and should be reconciled by the Lead: (a) diversity metrics are weaker selectors than wave 1 implies — the requirements study shows curation reducing F1 in 9 of 12 cases; (b) the 52.1% label-preservation figure is a gate unit test, not an estimate of what a real generator achieves, and must not be used to size the expected gain.*
