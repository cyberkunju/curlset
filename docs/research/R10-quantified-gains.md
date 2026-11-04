# R10 — Quantified Gains from Data-Centric Interventions

**Status:** evidence review, not a product claim. Date: 2026-11-04.
**Purpose:** establish what the published record supports before Curlset makes any "improves dataset
quality / downstream accuracy" claim. Companion to `docs/ENSEMBLE_PSEUDO_LABELING.md` §5, which
retracted a failed premise rather than restating it.
**Rule:** every number carries dataset, model, metric, and provenance. Numbers that could not be
verified against a primary source are marked **[U]** and support no claim.

| Tag | Meaning |
|---|---|
| **[P]** | Headline or body result of the primary paper |
| **[R]** | Independent replication, benchmark, or later test of the same claim |
| **[I]** | This reviewer's inference/arithmetic from cited numbers |
| **[U]** | Unverified here; do not cite externally |

One distinction dominates everything below: **speedup-to-baseline** vs **higher-ceiling**. Most
"data quality" papers show a curated subset reaches the *same* accuracy faster — a compute saving.
Only ceiling gains are accuracy claims, and they are rarer and smaller.

---

## 1. Executive summary

- **The largest reproducible effects are leakage and memorization reductions, not accuracy gains.**
  Deduplicating C4 makes models emit memorized text **10× less often** and removes train-test overlap
  affecting **>4%** of the validation set [P]; semantic dedup removes **50%** of image data with
  minimal loss [P]. Downstream accuracy from the same work is **≤2 points** at 6.7B (D4) [P].
- **Huge gains exist only in low-label regimes with enormous unlabeled pools.** Noisy Student:
  ImageNet top-1 **85.0% → 88.4%** using **300M** unlabeled JFT images [P]. FixMatch: **88.61%** on
  CIFAR-10 with **40 labels** [P]. Neither transfers to a curated 5k-row text dataset — Curlset's own
  live runs measured the ensemble *losing* to the best single model by 0.68 pts macro-F1 [internal].
- **Selection cleverness is weaker than its press.** Active learning at ImageNet scale performs
  **worse than random** [P]; pruning metrics "scale poorly to ImageNet" by the authors' own statement
  [P]; a "9k longest examples" baseline **beats AlpaGasus-9k on 5 evaluation sets** [R]. Assume a
  selector ties a dumb baseline until measured otherwise.
- **Pseudo-labelling and synthetic data fail silently and systematically.** Model collapse makes
  "tails of the original content distribution disappear" [P]; accumulating real data alongside
  synthetic avoids it, replacing real data does not [P].
- **For Curlset, measurement integrity beats dataset engineering.** The defensible claim is "we find
  the defects that invalidate your accuracy number and we can prove whether an intervention helped,"
  not "we raise accuracy by N points." The platform currently overclaims in at least two places (§5).

---

## 2. Intervention-by-intervention evidence

### 2.1 Label-error cleaning (confident learning / Cleanlab)

Northcutt, Athalye & Mueller (2021) estimated errors in the **test sets** of ten benchmarks using
confident learning, then human-verified the flags [P]: a mean of **at least 3.3% label errors across
the 10 datasets**, **at least 6%** in ImageNet validation, **0.54%** in CIFAR-10 test [P]. The
CIFAR-10 figure is usually omitted, and it matters: error rates vary by an order of magnitude.

The paper's own framing is benchmark *validity*, not training gain. Correcting test labels changes
accuracy only slightly but changes **rankings**: ResNet-18 overtakes ResNet-50 if ImageNet test
errors rise by **6%**; VGG-11 overtakes VGG-19 if CIFAR-10 errors rise by **5%** [P]. The real
finding is that ~5% label noise reorders models that are within a point of each other.

For **training-set** cleaning, the paper asserts accuracy improves but the magnitude is not its
headline [P]. I could not verify a transferable "clean X% of labels → +Y points" number from a
primary source [U]. The defensible statement: gain is proportional to base error rate, which is ~3%
on curated benchmarks and much higher on crowdsourced or LLM-generated labels. Any percentage in
marketing must come from Curlset's own A/B.

**Cost.** Model-assisted ranking is near-free; humans are the cost. ImageNet-val scale (50k images,
~6% flagged) at $0.10/item is ≈$300 for flagged items, ≈$5k for full re-annotation [I]. For 10k text
rows at 5% flagged, a few hundred review actions [I].

**Criticism.** Confident learning is only as good as the model producing out-of-sample
probabilities, and it flags genuinely ambiguous items (a husky labeled "wolf" is hard, not wrong).
Treat 3.3% as an **upper bound on correctable errors**.

**Curlset flag.** `NEW_COMPETITOR_KILLER_FEATURES.md` §1 claims "up to 10% of annotations... contain
label errors" (ImageNet, CoNLL). The source supports **3.3% mean** and **≥6% ImageNet** [P]; 10% is
not from that paper and the CoNLL figure is not in its ten-dataset set [U]. The section also calls a
K=7 neighbour-agreement heuristic "Confident Learning"; confident learning is a specific estimator
over out-of-sample predicted probabilities with a calibrated threshold [P]. Rename or implement it.

### 2.2 Deduplication

**Lee et al. (ACL 2022), C4/LM1B, GPT-2-scale.** Deduplication makes models "emit memorized text
**ten times less frequently**" and reduces train-test overlap that "affects **over 4%** of the
validation set" [P]. Reported training ran **152K → 146K steps**, about **4% fewer** [P for counts,
I for percentage]. The 10× memorization result is the durable one; the compute saving is small.

**D4 (Tirumala et al., 2023).** At **6.7B**, dedup + diversification gives "**20% efficiency gains**"
and improves "average downstream accuracy on **16 NLP tasks (up to 2%)**" [P]. This is the cleanest
statement of the real dedup accuracy effect: **≤2 points**.

**SemDeDup (Abbas et al., 2023).** Removes "**50%** of the data with minimal performance loss,
effectively **halving training time**," with "efficiency gains of **15%**" over prior methods [P].
50% removal is a compute claim; "minimal loss" is not a gain.

**Duplication tax (Muennighoff et al., 2023).** "**Up to 4 epochs**" of repeated data is
"negligible[ly]" different from fresh data; fitted decay constants **R\*D = 15.39** (repeated) and
**R\*N = 5.31** (new); beyond roughly **16 epochs** on C4 repetition adds almost nothing [P]. This is
one of the best-supported policy rules in the field.

**DataComp.** Best baseline trains CLIP ViT-L/14 to **79.2%** zero-shot ImageNet, beating OpenAI
CLIP by **3.7 points at equal compute** [P] — a billion-sample filtering result worth ~3.7 points,
not 20.

**Verdict.** High confidence in the leakage/memorization effect; moderate in a 1–2 point LLM-scale
accuracy effect; low for a small curated text dataset, where dedup mainly removes accidental
train/test leakage. That removal is still worth doing — it protects every other number reported.

### 2.3 Data pruning / coreset selection

**Sorscher et al. (2022).** With a self-supervised pruning metric, "fine-tuning on only **10%** of
CIFAR-10 can match or exceed" full-data fine-tuning, and "training on **80%** of ImageNet
approximates training on 100%" [P]. The asymmetry is the story: 10× on CIFAR-10, 1.25× on ImageNet.
The authors state that "most metrics developed for smaller datasets **scale poorly to ImageNet**"
[P] — the most important sentence in the paper for anyone productising pruning.

**EL2N (Paul et al., 2021).** "Prune **half** of the CIFAR10 training set while **slightly
improving** test accuracy" [P]. That is a tie, not a win.

**At LLM scale (Marion et al., 2023).** Perplexity pruning "outperforms the full dataset... at
**30% and 50%**" keep rates, while "**Memorization and EL2N... [show] similar performances to random
pruning**" [P]. One signal helps modestly; two widely-cited signals are no better than random.

**Counter-evidence.** The effect depends on a metric trained on the same distribution; the 80%
ImageNet number shows it shrinking with scale and difficulty. Pruning metrics rank "easy" examples
high, and easy examples are not evenly distributed across classes, so pruning **amplifies** bias in
the ranking signal. I did not verify a specific distribution-shift effect size here [U].

**Verdict.** A compute optimisation that works best on small vision benchmarks. The most over-claimed
intervention in this list; never sell it as an accuracy intervention.

### 2.4 Active learning

In low-label regimes the numbers look spectacular: **88.61%** CIFAR-10 with **40 labels**, **94.93%**
with **250** [P]. Those are semi-supervised results with a large unlabeled pool, not AL selection
gains.

At scale the result reverses. "Active Learning at the ImageNet Scale" reports AL methods "**even
perform worse than random sampling on ImageNet**" [P], attributed to class imbalance introduced by
the acquisition function. Prabhu et al. (EMNLP 2019) reached the same conclusion: deep AL suffers
sampling bias and stops beating random as datasets grow [P]. This is the mainstream finding, and it
is routinely omitted from vendor decks.

**Object detection.** Controlled studies report modest positive results: **20%** (PASCAL-VOC) and
**30%** (KITTI) labeling-cost reduction vs random selection [P, single source]. Detection papers with
sensational titles typically mean "match a *weak* baseline with very few labels," not "match full
supervision" — read the baseline before quoting a percentage [I].

**Publication bias.** AL papers compare against random on a benchmark where the acquisition function
was tuned, with no annotation-cost model, no retraining cost, and no label latency. The
benchmark-to-production gap is structural.

**Verdict.** Defensible claim: "20–30% label-cost reduction in controlled detection settings vs
random." Not "10× less labeling."

### 2.5 Synthetic data

**Where it helps.** Diffusion augmentation improves few-shot classification "by up to **+10
percentage points** on various datasets" in tested domains [P]. Azizi et al. report "significant
improvements" in ImageNet accuracy when augmenting real data with synthetic [P] — the specific point
gain could not be verified here [U] and must not be quoted. The best-documented synthetic
*pretraining* result is phi-1: **1.3B** parameters, **7B** curated tokens, **50.6% pass@1 HumanEval**
and **55.5% MBPP** [P] — a genuine ceiling result, single-lab, code-specific.

**Where it hurts.** Shumailov et al. (Nature 2024): recursive training causes collapse in which
"**tails of the original content distribution disappear**," requiring superlinear data scaling to
avoid [P]. Gerstgrasser et al. (2024): **replacing** real data with synthetic collapses; **accumulating**
synthetic alongside all previous real data "avoids collapse" with a finite test-error bound [P]. The
danger is the ratio and the replacement, not synthetic data per se.

**Ratio caps.** The literature supports "keep real data, add synthetic," not a universal percentage.
Curlset's ≤40%-per-class default is a policy choice, not an empirically derived optimum [I].

**Verdict.** Real but narrow gains in low-data domains; catastrophic and silent failure when the
real-data floor slips. The repo's gate correctly rejected its own fake generator (label preservation
52.1% < 90%) — that failure is the best argument for keeping the gate.

### 2.6 Pseudo-labelling / self-training

**Noisy Student (Xie et al., 2020).** EfficientNet-L2 with 300M unlabeled JFT images: **88.4%**
ImageNet top-1 vs **85.0%** baseline, **+3.4 points** [P]. The ablation matters: performance improves
with more unlabeled data and degrades when the pool is cut below about **1/16** of the full set [P].
The gain is a function of an unlabeled corpus ~three orders of magnitude larger than the labeled one.

**FixMatch (Sohn et al., 2020).** **94.93%** CIFAR-10 with 250 labels; **88.61%** with 40 [P] — again
with 50k unlabeled images behind 40 labels.

**Gain vs degeneration.** Oliver et al. (2018) showed SSL gains shrink or vanish under a realistic
protocol with a proper validation split and out-of-class unlabeled data [P]. Arazo et al. (2020)
named the mechanism — **confirmation bias**: the model reinforces its own confident mistakes [P].
Pseudo-labelling is safe when the teacher is much better than the student and the pool is
in-distribution; it degenerates when teacher and student errors are correlated.

**Teacher–student error correlation.** Stanton et al. (2021) show distillation improves students but
students do **not** match teachers, with the residual concentrated on the teacher's own errors [P].
Curlset's live data is a concrete instance: across three vendors on 300 hard records, pairwise error
correlation **φ = 0.776 / 0.785 / 0.799**, **10.4–11.7%** of records failed by *all three* models,
ensemble −0.68 pts macro-F1 vs best single [internal]. Vendor diversity did not create independent
evidence.

**Verdict.** The most powerful intervention here *when conditions hold* (tiny label budget, huge
in-domain pool, strong teacher). Curlset has already measured that they do not hold for its use case.
The honest product is disagreement-guided human routing plus audited precision — measured at ~96%
precision at ~50% coverage, Wilson LB 91.6%.

### 2.7 Data mixture, curriculum, difficulty

**DoReMi (Xie et al., 2023).** Domain weights on The Pile: **+6.5 points** average few-shot
downstream accuracy over default weights, and baseline accuracy with **2.6× fewer training steps**
[P]; a 280M proxy sets weights for an 8B model [P]. One of the largest credible mixture gains.

**RegMix (Liu et al., ICLR 2025).** Mixture selection as regression over proxy runs: "**50% acceleration**
on most benchmarks (e.g. HellaSwag) and **up to 75%** on some"; a 1B model trained 25B tokens on the
selected mixture performs best among 64 candidates [P]. Acceleration, not a higher ceiling.

**Data maps (Swayamdipta et al., 2020).** The **33%** "ambiguous" subset beats other 33% subsets,
but the paper reports "some degradation compared to the full training set" [P]. A better third, not
a replacement for all.

**Counter-evidence.** A 2025 study finds cartography **ineffective for extractive QA on SQuAD** [R].
Curriculum learning has the same profile: Hacohen & Weinshall (2019) show pacing effects are
reproducible by tuning optimisation hyperparameters — much of the gain is an implicit learning-rate
schedule, not the ordering [P].

**Verdict.** Mixture optimisation is real at pretraining scale and costs real proxy runs. Curriculum
and difficulty selection are weakly supported and often explained away by hyperparameters.

### 2.8 LLM SFT data quality

**LIMA (Zhou et al., 2023).** **1,000** curated examples into a **65B** LLaMA; GPT-4 prefers or ties
it over DaVinci003 in **43%** of cases; humans prefer or tie it over Alpaca 65B in **74%** [P; 74%
also in secondary summaries]. Striking — but **not a controlled selection experiment**: quantity,
length, style, and distribution all changed together, with no ablation.

**AlpaGasus (Chen et al., ICLR 2024).** Selects **9k** of 52k Alpaca by GPT-3.5 quality score and
outperforms the full-data model [P]. **Critical control:** Zhao et al. (ICML 2024) show selecting the
**9k longest** Alpaca examples "consistently outperforms AlpaGasus-9k in **5 evaluation sets**" [R].
The sophisticated score is matched by a length heuristic. Any quality-scoring feature must beat
longest-N or it adds nothing.

**DEITA (Liu et al., 2023).** **6K** SFT + **10K** DPO; Deita-Mistral-7B reaches **7.55** MT-Bench
and **90.06%** AlpacaEval [P]. Strong, but entangled with DPO and a strong base model.

**LESS (Xia et al., 2024).** Gradient-based influence selection: training on "**5%** of data often
outperforms training on the complete dataset," Mistral-7B at **61.8** MMLU [P]. The most credible
"small subset beats full" result because it is **target-task-aware** — a much narrower claim than
"this data is high quality."

**Verdict.** At fixed budget selection can beat random by a few percent on preference benchmarks —
sometimes. Controls (length, format, target leakage) explain much of the reported gain. The only
claim that survives is **target-aware selection with a held-out eval**.

---

## 3. THE MONEY CHART

Ranked by expected accuracy gain per unit cost/effort **for a text-dataset platform**, not by
headline size. "Gain" is the realistic effect on a curated 1k–100k-row dataset.

| # | Intervention | Reported gain (source) | Dataset / model / metric | Cost | Confidence |
|---|---|---|---|---|---|
| 1 | **Exact + near-dup removal** | 10× fewer memorized emissions; >4% val overlap removed; ≤2 pts downstream | C4, GPT-2-scale; 6.7B, avg 16 NLP tasks [P] | Low (hashes/MinHash) | **High** |
| 2 | **Leakage audit (train↔test)** | Reorders models at 5–6% label noise | 10 benchmarks [P] | Low | **High** |
| 3 | **Target-aware SFT selection (LESS)** | 5% ≥ full dataset | Mistral-7B, MMLU 61.8 [P] | Low–Med (gradients) | **Moderate** |
| 4 | **Semantic dedup** | 50% removed, minimal loss, ~2× train time | LAION/ImageNet/COCO [P] | Medium | **Moderate–High** |
| 5 | **Mixture optimisation (DoReMi)** | +6.5 pts; 2.6× fewer steps | The Pile, 280M→8B [P] | Med–High (proxy runs) | **Moderate** |
| 6 | **Label-error detection** | 3.3% mean / ≥6% ImageNet errors found | 10 benchmarks [P] | Low + review | **High** detection / **Low** uplift |
| 7 | **SFT curation (LIMA/DEITA)** | 1k examples competitive with far larger sets | 65B LLaMA / Mistral-7B [P] | Low | **Moderate** (confounded) |
| 8 | **Human cleaning of training labels** | ∝ base error rate; no verified transferable % | mixed [U] | Medium | **Low–Moderate** |
| 9 | **Pseudo-labelling, low-label** | +3.4 pts; 88.61% @ 40 labels | EfficientNet-L2 + 300M JFT; CIFAR-10 [P] | Very high | **High** but **narrow** |
| 10 | **Synthetic augmentation** | up to +10 pts few-shot | diffusion aug, tested domains [P] | Med–High | **Low–Moderate** |
| 11 | **Coreset / pruning** | 10% of CIFAR-10 ≈ full; 80% of ImageNet ≈ full | CIFAR-10 / ImageNet [P] | Medium | **Low at scale** |
| 12 | **Active learning (classification)** | Often ≤ random at scale | ImageNet [P] | High | **Low** |
| 13 | **Active learning (detection)** | 20% / 30% label-cost cut vs random | PASCAL-VOC / KITTI [P, single] | Med–High | **Low–Moderate** |
| 14 | **Curriculum / data maps** | 33% subset < full; SQuAD replication failed | EMNLP 2020 / SQuAD 2025 [P/R] | Low | **Low** |
| 15 | **Synthetic pretraining (phi-1)** | 50.6% HumanEval at 1.3B / 7B tokens | code, single lab [P] | High | **Moderate** |

Rows 1–2 are cheap, near-universally beneficial, and improve the *validity* of every other number.
Rows 3–5 are the only places a platform can credibly claim an accuracy or cost win at moderate
effort — each conditional on a held-out evaluation. Rows 6–8 reduce risk, not uplift. Rows 9–15 are
narrow, fragile, or single-source.

---

## 4. What failed to replicate / overhyped

1. **"Pruning gives 2–10× efficiency."** True on CIFAR-10 with a matched metric; the same paper
   reports only **80% retention** on ImageNet and says small-dataset metrics scale poorly [P]. At LLM
   scale, memorization and EL2N pruning are **no better than random** [P].
2. **"Active learning beats random."** At ImageNet scale it performs **worse** [P]; wins come from
   small datasets, tuned acquisition functions, and ignored retraining cost.
3. **"AlpaGasus proves quality filtering works."** A length-only baseline beats it on **5 evaluation
   sets** [R]. The most important negative control in the SFT literature, and almost never cited by
   data-quality vendors.
4. **"LIMA proves 1,000 examples beat 52,000."** It changed quantity, length, style and distribution
   at once, with no ablation. The result is real; the causal attribution to "quality" is not.
5. **"Curriculum learning improves accuracy."** Pacing effects are reproducible by tuning
   hyperparameters [P]; cartography failed on SQuAD [R].
6. **"Data maps let you train on a third of the data."** The original paper reports the 33% subset is
   *below* full-data performance [P].
7. **"Synthetic data boosts accuracy" (unconditional).** Collapse is real and silent [P]; the fix is
   architectural (accumulate real data), not parametric [P].
8. **"Up to 10% of labels are wrong."** Verified mean **3.3%**; ImageNet **≥6%**; CIFAR-10 **0.54%**
   [P]. "Up to" is illegitimate when applied to a typical dataset.

---

## 5. What claims this platform can honestly make

**Supportable now:**

- *"We find and rank likely label errors, including the ones that change your benchmark's winner."*
  Backed by 3.3% mean / ≥6% ImageNet and the 5–6% ranking-instability result [P]. Scope it to
  "likely, human-verified errors."
- *"We remove duplicate and leaked records so your accuracy number means what you think."* Backed by
  the 10× memorization reduction and >4% overlap findings [P]. The strongest available claim, and it
  is a **validity** claim, not an uplift claim.
- *"We cut SFT data to 5–10% with no measured loss — when selection is targeted at your eval and
  verified held-out."* Backed by LESS [P], with the caveat that untargeted scores tie a length
  baseline [R].
- *"We route human review to disagreement; that band is ~30 points less precise than the unanimous
  band."* Internal: unanimous 88.8% vs 2-of-1 59.1% precision [internal].
- *"We certify auto-accept precision with a Wilson bound and tell you the audit cost."* Internal: ~96%
  precision at ~50% coverage, Wilson LB 91.6%, 130/260/1,445 audits for 90/95/99% floors [internal].
  The most defensible differentiator, because it is a measurement claim, not an effect-size claim.
- *"We will tell you when an intervention did not help."* Already true in the ensemble work. That is a
  brand asset; do not dilute it.

**Overclaiming — do not ship:**

- *"Improves model accuracy by N%."* No universal N. Best replicated accuracy effect here is **≤2
  points** (D4, 6.7B, 16 tasks); the best low-label effect (**+3.4**) needed **300M** unlabeled images.
- *"Far beyond human label quality."* Measured and falsified in `ENSEMBLE_PSEUDO_LABELING.md` §5.
- *"Up to 10% label errors"* as typical. Use 3.3%/≥6%, or Curlset's own measured rate.
- *"Confident Learning"* for the K=7 neighbour heuristic. Implement the real estimator or rename.
- *"Pruning cuts cost 2–10×"* without the scale caveat.
- *"Active learning saves 90% of labels."* Replicated production number is 20–30% vs random in
  detection, and negative at ImageNet scale for classification.
- *"Synthetic data improves accuracy"* without a real-data floor and label-preservation gate.

**Positioning.** Curlset cannot out-claim the literature on effect size. It can out-claim competitors
on **evidence discipline**: every dataset ships with a measured error rate, a measured leakage rate,
an audited precision floor with a confidence interval, and an A/B result for any intervention applied.
That is a real differentiator in a market of unsourced "10× better data" claims, and it is the
standard §5 of the ensemble document already holds.

---

## 6. References

1. Northcutt, Athalye, Mueller. *Pervasive Label Errors in Test Sets Destabilize ML Benchmarks.*
   arXiv:2103.14749. https://arxiv.org/abs/2103.14749
2. Northcutt, Jiang, Chuang. *Confident Learning.* arXiv:1911.00068. https://arxiv.org/abs/1911.00068
3. Lee et al. *Deduplicating Training Data Makes Language Models Better.* ACL 2022.
   https://aclanthology.org/2022.acl-long.577/
4. Tirumala et al. *D4: Improving LLM Pretraining via Document De-Duplication and Diversification.*
   arXiv:2308.12284. https://arxiv.org/abs/2308.12284
5. Abbas et al. *SemDeDup.* arXiv:2303.09540. https://arxiv.org/abs/2303.09540
6. Muennighoff et al. *Scaling Data-Constrained Language Models.* arXiv:2305.16264.
   https://arxiv.org/abs/2305.16264
7. Sorscher et al. *Beyond neural scaling laws.* arXiv:2206.14486. https://arxiv.org/abs/2206.14486
8. Paul et al. *Deep Learning on a Data Diet (EL2N).* arXiv:2107.07075.
   https://arxiv.org/abs/2107.07075
9. Marion et al. *When Less is More: Investigating Data Pruning for Pretraining LLMs at Scale.*
   arXiv:2309.04564. https://arxiv.org/abs/2309.04564
10. Gadre et al. *DataComp.* arXiv:2304.14108. https://arxiv.org/abs/2304.14108
11. Coleman et al. *Active Learning at the ImageNet Scale.* arXiv:2111.12880.
    https://arxiv.org/abs/2111.12880
12. Prabhu et al. *Sampling Bias in Deep Active Classification.* EMNLP 2019.
    https://aclanthology.org/D19-1417/
13. Hekimoglu et al. *Active Learning for Object Detection with Non-Redundant Informative Sampling.*
    arXiv:2307.08414. https://arxiv.org/abs/2307.08414
14. Xie et al. *Self-training with Noisy Student.* arXiv:1911.04252. https://arxiv.org/abs/1911.04252
15. Sohn et al. *FixMatch.* arXiv:2001.07685. https://arxiv.org/abs/2001.07685
16. Oliver et al. *Realistic Evaluation of Deep Semi-Supervised Learning Algorithms.* arXiv:1804.09170.
    https://arxiv.org/abs/1804.09170
17. Arazo et al. *Pseudo-Labeling and Confirmation Bias.* arXiv:1906.02242.
    https://arxiv.org/abs/1906.02242
18. Zoph et al. *Rethinking Pre-training and Self-training.* arXiv:2006.06882.
    https://arxiv.org/abs/2006.06882
19. Stanton et al. *Does Knowledge Distillation Really Work?* NeurIPS 2021.
    https://arxiv.org/abs/2106.05945
20. Trabucco et al. *Effective Data Augmentation With Diffusion Models.* ICLR 2024.
    https://proceedings.iclr.cc/paper_files/paper/2024/file/3f1351a10a3f904e6f3845a94275a909-Paper-Conference.pdf
21. Azizi et al. *Synthetic Data from Diffusion Models Improves ImageNet Classification.*
    arXiv:2304.08466. https://arxiv.org/abs/2304.08466
22. Shumailov et al. *AI models collapse when trained on recursively generated data.* Nature 631,
    755–759 (2024). https://www.nature.com/articles/s41586-024-07566-y
23. Gerstgrasser et al. *Is Model Collapse Inevitable?* arXiv:2404.01413.
    https://arxiv.org/abs/2404.01413
24. Gunasekar et al. *Textbooks Are All You Need.* arXiv:2306.11644. https://arxiv.org/abs/2306.11644
25. Xie et al. *DoReMi.* arXiv:2305.10429. https://arxiv.org/abs/2305.10429
26. Liu et al. *RegMix.* arXiv:2407.01492. https://arxiv.org/abs/2407.01492
27. Swayamdipta et al. *Dataset Cartography.* EMNLP 2020.
    https://aclanthology.org/2020.emnlp-main.746.pdf
28. *When is dataset cartography ineffective?* arXiv:2503.18290. https://arxiv.org/abs/2503.18290
29. Hacohen & Weinshall. *On The Power of Curriculum Learning.* ICML 2019.
    https://proceedings.mlr.press/v97/hacohen19a.html
30. Zhou et al. *LIMA: Less Is More for Alignment.* arXiv:2305.11206.
    https://arxiv.org/abs/2305.11206
31. Chen et al. *AlpaGasus.* arXiv:2307.06290. https://arxiv.org/abs/2307.06290
32. Zhao et al. *Long Is More for Alignment.* ICML 2024. https://arxiv.org/abs/2402.04833
33. Liu et al. *What Makes Good Data for Alignment? (DEITA).* arXiv:2312.15685.
    https://arxiv.org/abs/2312.15685
34. Xia et al. *LESS.* ICML 2024. https://arxiv.org/abs/2402.04333
35. Internal: `docs/ENSEMBLE_PSEUDO_LABELING.md` §5b–5e and `experiments/` run reports (Curlset
    measurements; not peer-reviewed, reproducible in-repo).
