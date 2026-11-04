# W8 — The 2025–2026 Data-Centric Frontier

**Date:** 2026-11-04
**Scope:** selection and curation at scale; attribution and influence; pruning and coresets; synthetic/real mixtures and data-constrained scaling; data agents and self-improving pipelines; contamination; dataset-level quality predictors; published lab practice; skepticism.
**Relationship to wave 1:** R10 established the quantified-gains table through 2024 and R5 reviewed active learning; **neither is re-reviewed here**. This is the delta — what changed in 2025–2026, what of the older canon has been contradicted, and what a local-first platform can own.

| Tag | Meaning |
|---|---|
| **[P]** | Primary result, verified in this review |
| **[R]** | Independent replication, benchmark, or later test |
| **[I]** | This reviewer's inference or arithmetic |
| **[U]** | Unverified here; supports no claim |

---

## 1. Executive summary

The frontier moved twice in eighteen months, and both moves favour a small platform.

**From scoring documents to searching curation programs.** Through 2024 the field asked "which documents are good?" and answered with a classifier. In 2026 the strongest result is that the filter itself can be evolved per dataset: DataEvolve, which produces the Darwin-CC recipe, beats raw data by **3.96 points**, DCLM's curated data by **1.71**, and **human-designed filters by 2.93** [P]. The commercially decisive detail is that **evolved strategies do not transfer across domains** — each of eight domains needed its own evolution [P]. Curation policy is a per-dataset artifact, not a product SKU.

**From "selection works" to "selection ties random unless target-aware and controlled."** LESS **fails at scale** when the pool grows to 5.8M examples, while a redundancy-aware baseline (RDS+) reaches 50.5 average and beats random [P]. At million scale, most self-scoring techniques **do not significantly outperform random** across six-plus benchmarks [P]. The `9k-longest` baseline still beats a sophisticated quality selector (R10) [R].

**Attribution is practical, but not as sold.** DATE-LM (NeurIPS 2025) benchmarked eight methods on three tasks: **no method dominates, simple representation-similarity is competitive**, and performance collapses in heterogeneous safety settings [P]. Much of the apparent failure is an *aggregation* bug — averaging over all tokens — and switching to negative log-odds with top-k aggregation **raises recall 35–72 points** [P]. Good news for CPU: the cheap method plus the right aggregation is the strong method.

**Synthetic data got a ratio law and a counter-law in the same year.** Good synthetic ratios converge to **~30%**; 1/3 rephrased + 2/3 natural is a **5–10× training-speed equivalent** on loss [P]. And **1 synthetic document per 1,000** can still collapse a fixed real pool [P]. Both hold in their regimes; the design rule is accumulate-never-replace plus a cap.

**Data agents do not automate curation.** CurationBench: base 28.8, full-data 37.1, best general agent 33.7, method-scaffolded agent 34.9 [P]. Agents reach the baseline, then **tune locally instead of exploring new policies** — the "execution–research gap" [P]. Scaffolding, not autonomy, produced the gain.

**Is there a validated dataset-level predictor?** In 2024, no. In 2026, **two narrow yeses and no general one**: response ratio (instruction tuning, two model families, two datasets) [P], and a neighbour-consistency/effective-rank composite at 0.891 Pearson on face-recognition variants only [P]. No cross-domain, calibrated, pre-registered predictor exists. **The honest product is a measured delta, not a predicted score.**

For Curlset: build (1) a **judge-distilled local quality scorer**, (2) a **fixed-budget A/B harness** with random and longest-N as mandatory baselines, and (3) **evolved curation policies stored in the manifest**. The unexplored idea (§6.2) is **error-diversity accounting** — measuring the marginal *independent evidence* a data source contributes, using the φ identity that R1 used to kill vendor ensembles.

---

## 2. Breakthrough candidates

Ranked by expected gain × confidence ÷ effort, for CPU-first datasets of 1k–1M rows.

**B1 — Per-dataset curation-policy evolution.** Observe → propose → execute → score, using sample-based scoring instead of full training per candidate. DataEvolve/Darwin-CC: 44.13 average; +3.96 raw, +1.71 DCLM, +2.93 human filters; 30 generations over 8 categories, 672B tokens, evaluated on 3B Qwen2.5 across 18 benchmarks; proposers included small models [P]. Non-transfer makes it dataset-specific and therefore defensible. *Falsifier:* one universal policy matching evolved ones on your data — a cheap experiment.

**B2 — Judge-distilled quality scoring.** QuRating: 250k pairwise judgments per criterion (~1M GPT-3.5 queries, **$2,820**), distilled to a 1.3B QuRater at >93% agreement, selecting 30B of 260B tokens for **+1.8 average ICL** and equivalence to **+50% steps** [P]. One-off judge cost, free inference forever. ProX shows **0.3B** refiners suffice [P].

**B3 — Response ratio.** One arithmetic pass. Most robust predictor in a controlled four-metric comparison; ablation shows causality in the claimed direction [P]. Fifty lines of code that beat most commercial "quality scores" on evidence.

**B4 — Small-reference-model perplexity pruning.** 125M scorer → 3B target: **+2.04** average downstream, up to **1.45×** fewer steps (ICLR 2025) [P]. The only pruning result in the window that both beats random and reports downstream effects.

**B5 — Rep-Sim attribution.** Competitive with gradient/influence methods; cost is one embedding pass [P]. Aggregation choice alone is worth 35–72 recall points [P].

**B6 — Synthetic ratio controller.** ~30% cap, 5–10× speed equivalent, accumulate-only guardrail [P].

**B7 — Error-diversity accounting.** No prior art in the selection literature; see §6.2.

---

## 3. Findings with numbers

### 3.1 Selection and curation at scale

**DCLM is the reference, and its headline is a compute number.** A 7B model on 2.6T tokens reaches **64% MMLU** with **40% less compute than MAP-Neo** and **6.6× less than Llama 3 8B** [P]. Mechanism: fastText on ~400k LLM-labelled documents; at 1B/28B the filtered data scores **30.2 Core** vs AskLLM 28.6 and PageRank 26.1 — model-based filtering beats heuristics by **1.6–4.1 points** at small scale and buys compute at large scale [P]. Not a 20-point intervention.

**FineWeb-Edu is the clearest quality-classifier datapoint.** A Llama-3-70B-annotated educational scorer, thresholded, **removes 92%** of FineWeb leaving **1.3T tokens**, and reaches **33.6% MMLU at only 38B tokens**, ahead of the next-best open dataset (Matrix) at that budget [P]. You delete 12× more than you keep to move MMLU a few points at small budgets.

**QuRating is the cleanest quality-vs-diversity evidence.** Educational value **+1.8** average ICL, facts & trivia +1.3, expertise +1.1, **writing style +0.1** — while writing style produced the *lowest perplexity* [P]. Perplexity and downstream utility diverge; that is the most useful measurement in the paper for anyone shipping a score. Sampling with quality as logits beat top-k: balance quality with diversity [P]. Curriculum by expertise: **+0.6%**, no data change [P].

**Mixture optimisation is the best-validated quantitative tool.** Data Mixing Laws' predicted optimum matched a run with **48% more steps** on the default mixture [P]. RegMix: **50% acceleration on most benchmarks, up to 75%** (R10) [P]. DoReMi: **+6.5 average, 2.6× fewer steps** (R10) [P]. DeMix (ICML 2026) derives weights from merged component models instead of per-candidate proxies [P for existence; no effect size verified — U].

**DSIR remains the cheapest principled selector:** 100M Pile documents in **4.5 hours**, **+2–2.5% GLUE** [P]. Hash n-grams, no training — the closest thing to a CPU-first selector.

**Nemotron-CC reframed quantity vs quality:** 6.3T tokens **match DCLM on MMLU with 4× more unique real tokens**, via classifier ensembling plus synthetic rephrasing [P].

**ProX makes refinement a small-model job:** **0.3B** refiners are viable and refined data beats baselines on **10** benchmarks [P]. The local path is the published method, not a compromise.

**SmolLM2 publishes the ablation a small platform needs:** 1.7B, ~11T tokens, **60% FineWeb-Edu + 40% DCLM** "works well" and nearly matches the best single source [P].

**Target-aware selection broke at scale.** On a **5.8M** pool with a **10k** budget (Llama 2 7B), **RDS+ averages 50.5** and beats random while **LESS fails** and many methods fall below random [P]. A Feb 2026 follow-up shows cheap dimensionality-reduction selection can match or beat the full-dataset baseline by exploiting representation redundancy [P]. The pattern: *cheap diversity/redundancy methods survive scale; expensive gradient methods do not.*

### 3.2 Attribution and influence

**For 10k–1M examples: use representation similarity, not influence functions, and fix aggregation.**

TRAK (ICML 2023) projects gradients into low dimension; DataInf (ICLR 2024) makes LoRA-tuned influence cheap [P]. DATE-LM then benchmarked **Rep-Sim, BM25, Grad-Dot, Grad-Sim, MATES, LESS, EKFAC, DataInf** on selection, toxicity filtering and factual attribution: **no method dominates**, simple baselines are competitive (Rep-Sim beat Grad-Sim in fine-tuning), and performance **collapses in heterogeneous safety settings** where safe refusals are confused with toxic content [P]. The influence-function review (arXiv 2508.07297) finds them useful for mislabel discovery — **~80%** of top-20 mislabels — but **"fragile" in non-convex settings**, with LDS **0.43–0.50** [P]; Rescaled IFs add that they **underestimate magnitude** [P]. The 2026 design-space paper localises much of the failure to token averaging and recovers **35–72 points of recall** with negative log-odds + top-k [P].

**Cost [I].** Rep-Sim is one embedding pass — minutes on CPU for 100k rows. Gradient-dot attribution needs a forward+backward per example per checkpoint; at 1M rows that is accelerator work a local-first product cannot assume.

**What attribution is good for, per the evidence:** mislabel discovery, debugging a prediction, auditing a selection after the fact. Not for a global importance ranking that beats a diversity baseline.

### 3.3 Pruning and coresets — what survives

**Survives:** small-reference-model perplexity pruning — 125M scoring for a 3B target, **+2.04** average, **1.45×** fewer steps [P]. Note the 24× size ratio: exactly the CPU regime.

**Survives with caveats:** perplexity pruning at 30–50% keep beats full data, while **memorization and EL2N are similar to random** (R10, Marion) [P]; Sorscher's 10%-of-CIFAR holds but ImageNet retention is only **80%**, and the authors say small-dataset metrics **scale poorly** [P].

**Dies:** self-scoring at million scale — most self-scoring techniques do not significantly outperform random on Llama3-8B/Qwen2-7B across six-plus benchmarks [P]; EL2N and memorization at LLM scale are random-equivalent [P].

**Why both are true.** Pruning works when the scorer matches the target distribution, the keep rate is 30–70%, and the eval is same-distribution. It fails on large heterogeneous pools — which is what a dataset platform actually holds [I].

### 3.4 Synthetic mixtures, repetition, data wall

**Ratio law.** Good synthetic ratios **converge to ~30%**, and **1/3 rephrased + 2/3 natural** gives a **5–10× training-speed equivalent** on loss (EMNLP 2025) [P]; scaling fits project most synthetic mixtures to lower irreducible loss than natural-only [P]. This lands almost exactly on Curlset's 30–40% policy, which R10 correctly called unvalidated at the time.

**Counter-law.** With a fixed real corpus and unbounded generation, **as little as 1 synthetic per 1,000** causes collapse — larger training sets stop helping and eventually degrade [P]. Accumulating synthetic alongside all real data avoids collapse with a finite bound [P]. Compatible: accumulate-and-cap is safe; replace-and-recur is not; a fixed real pool with unbounded synthetic volume diverges at any ratio [I].

**Repetition.** Up to **4 epochs** ≈ fresh; **R\*D = 15.39**, **R\*N = 5.31**; beyond ~**16 epochs** on C4 repetition adds almost nothing [P, via R10]. Nothing in 2025–2026 overturns this.

**Data wall.** Public human text is fully utilised between **2026 and 2032** under continued trends [P]. Two 2025–2026 developments soften it: Nemotron-CC's 4× more real tokens at equal MMLU [P], and The Common Pile — **8TB** from **30** openly licensed sources — training **Comma v0.1 (7B)** on 1T/2T tokens to performance **competitive with unlicensed-web models** [P]. The wall is on *scraped* text, not licensed or synthesised text.

### 3.5 New frontiers

**Data agents, measured.** CurationBench: 10k of 665k (~1.5%) budget; base 28.8, full 37.1, Claude Code 33.7, ICONS 33.3, ARDS 33.2, Adapt-Papers scaffold **34.9** [P]. Diagnosis: agents **tune locally rather than explore new policies** [P]. A parallel taxonomy paper formalises "data agents" [P for existence]. Anyone shipping an autonomous curator should read the first paper before the second.

**Self-improving pipelines.** DataEvolve (above) and Webscale-RL (ICLR 2026), converting pretraining text into RL data with **+3.4 average over the strongest baseline** [P]. RL-guided selection for fine-tuning reports gains with ~**one extra GPU-hour**, "up to 2×" [P, workshop — provisional].

**Contamination: the panic is better calibrated than the detection.** The effect **depends strongly on training setup** and **vanishes above ~5× Chinchilla-scale data even with 144 repetitions**, driven by **AdamW weight decay** (ICML 2025) [P]. Detection remains 13-gram/MinHash matching [P] plus quiz estimation [P]; the 2026 turn is *prevention* via contamination-resistant benchmarks [P]. For small fine-tuning datasets, near-duplicate leakage into your own eval matters far more than pretraining exposure [I].

**Collapse mitigation is now a design pattern:** accumulate, cap the ratio, keep an immutable real floor, verify with a downstream delta. Curlset's gate (reject at label preservation < 90%) is aligned, and R10 already recorded the repo's own generator failing it — the gate working is the strongest evidence in the tree.

**Not yet real:** "data ecology" (CACM 2026 is framing plus an allocation model, no benchmarks) [P]; dataset search/retrieval as a curation method — no credible effect size located [U].

### 3.6 Dataset-level quality metrics that predict downstream performance

**Validated, narrowly:**

1. **Response ratio** (answer tokens ÷ total) is the most robust of four simple metrics at fixed budget across **Qwen3.5-9B-Base** and **Llama-3.1-8B** on Natural Instructions and FLAN; removing high-response-ratio examples **degrades** performance while removing high-alignment examples has **minimal impact** (arXiv 2610.33969) [P]. Causal-flavoured, not merely correlational.
2. **IQ = 0.2·neighbour-consistency + 0.8·normalised effective rank** correlates **0.891 Pearson** with downstream accuracy across WebFace4M/12M/42M variants; Spearman 1.000 ranking vs **0.418** for RankMe (arXiv 2605.29720) [P]. Caveat that must travel with it: ranking *degradations of one dataset family*, easier than ranking unrelated datasets.
3. **Quality enters scaling laws** as a parameter shrinking *effective* data sublinearly (ICLR 2026) [P]; no transferable constant published [U].

**Not validated:** any single scalar "dataset quality score" predicting gain across domains. No cross-domain, pre-registered, calibrated predictor exists in the reviewed record. The ACL 2025 short "Call for Rigor in Reporting Quality of Instruction Tuning Data" documents the practices that make the literature look more conclusive than it is [P]. Perplexity is explicitly dissociated from ICL gain in QuRating [P].

**Consequence:** ship measured deltas with intervals, and at most two *predictive* scores (response ratio; a diversity/effective-rank composite), each labelled "correlational, validated on X, not cross-domain."

### 3.7 What the strongest labs publish

- **Anthropic:** the only frontier lab with a quantified pretraining-filter result — a fine-tuned constitutional classifier cut harmful CBRN capability **33% relative** with **no significant drop** in harmless capabilities (Aug 2025) [P]. Filtering is framed as safety with a capability budget, not an accuracy lever.
- **Allen AI:** the only lab publishing a complete re-runnable pipeline. OLMo 3: Dolma 3 **pool 9T**, mix **5.9T**; **suffix-array + MinHash-fuzzy** dedup; **quality-aware upsampling**; **token-constrained mixing**; **805B** tokens of science PDFs via olmOCR [P]. Every component is implementable locally.
- **Meta:** Llama 3 **>15T** tokens with deliberate code/multilingual inclusion [P]; Llama 4 **200** languages, **100** with >1B tokens, plus synthetic **mid-training** [P]. Components, no ablations.
- **Google DeepMind:** Gemma 3 **27B** on **14T** tokens with "considerable safety filtering" [P]. Components, no effect sizes.
- **OpenAI and Mistral:** no data-curation ablations in the reviewed record; GPT-4's report explicitly withholds architecture and training-method detail [P]. Claims about their internals are speculation [U].
- **The asymmetry is the finding:** the most-copied recipes come from AI2, HuggingFace, NVIDIA and academia — not the frontier labs.
- **Rights-first counter-example:** The Common Pile shows licensing constraints cost less capability than assumed [P], directly relevant to R9.

### 3.8 Forums and skepticism

Forum skepticism is real but shallow; the substantive critiques are in review and OpenReview.

- **Hacker News** converges on a defensible position: synthesis is standard where verification is automatic (code, math) and unreliable elsewhere (HN 45121359, Sept 2025; HN 44206198, June 2025) [P for existence]. The recurring "you would be better off extracting the model from the generator" argument (HN 22377092) is the distillation critique in plain language [P].
- **OpenReview** carries the sharpest critique of the curation literature: a Common Pile reviewer notes FineWeb's pipeline was **"specifically designed to maximize performance on the benchmarks on which we measure"** [P]. That is the benchmark-overfitting objection to the entire quality-filter literature, and it is correct in direction.
- **ACL 2025** institutionalised the skepticism with the rigor paper [P].
- **Reddit** (r/LocalLLaMA, r/vibecoding) is anecdotal — repetitive synthetic SFT data, filters selecting long formatted answers [P for existence, U for claims].
- **LessWrong** discussion is downstream of the primary papers, with the correct reading that synthetic data already delivers large gains in verifiable domains [P for existence].

Pattern: **loudest claims are marketing, sharpest criticisms are in review, reproducible numbers live in five papers** (DATE-LM, 2410.09335, 2503.01807, 2610.33969, 2603.14420). A platform citing only those five is already more rigorous than most of the market.

---

## 4. Evidence table

★ = new since R10. Unmarked rows appear only where a 2025–2026 result changed their status.

| # | Method | Venue / year | Effect | Scale | Replication |
|---|---|---|---|---|---|
| 1 | ★ Curation-policy evolution (Darwin-CC) | arXiv 2603.14420, 2026 | **+3.96** raw, **+1.71** DCLM, **+2.93** human filters; no cross-domain transfer | 672B tokens, 8 domains; 3B, 18 benchmarks | None; single group [P] |
| 2 | ★ Response ratio predictor | arXiv 2610.33969, 2026 | Best of 4 metrics; removal degrades, alignment removal does not | Qwen3.5-9B, Llama-3.1-8B | Controlled ablation only [P] |
| 3 | ★ IQ (neighbour consistency + effective rank) | arXiv 2605.29720, 2026 | **0.891 Pearson**; Spearman 1.000 vs RankMe 0.418 | WebFace4M/12M/42M | Single domain, variant ranking [P] |
| 4 | ★ RDS+ vs LESS at scale | arXiv 2503.01807, 2025 | RDS+ **50.5**; **LESS fails**; many below random | 5.8M pool, 10k budget, Llama 2 7B | Contradicts LESS-2024 regime [P/R] |
| 5 | ★ Self-scoring vs random | arXiv 2410.09335, 2024 | Most self-scoring methods not significantly better than random | Llama3-8B, Qwen2-7B, 6+ benchmarks | Consistent with #4 [P] |
| 6 | ★ Small-reference perplexity pruning | ICLR 2025, arXiv 2405.20541 | **+2.04**, **1.45×** fewer steps | 125M → 3B | Best-replicated pruning [P] |
| 7 | ★ DATE-LM | NeurIPS 2025 D&B | No dominant method; Rep-Sim competitive; safety collapse | 8 methods, 3 tasks | Benchmark itself [P] |
| 8 | ★ Attribution aggregation fix | arXiv 2610.40655, 2026 | **+35–72 pp** recall vs token averaging | Controlled fact tracing | Mechanism plausible [P] |
| 9 | ★ Influence fragility | arXiv 2508.07297, 2025 | LDS 0.43–0.50; ~80% top-20 mislabels | Review + experiments | Corroborated by #7 [P] |
| 10 | ★ Synthetic ratio law | EMNLP 2025, arXiv 2510.01631 | **~30%** ratio; **5–10×** speed equivalent | Scaling-law fits | Loss-based, single group [P] |
| 11 | ★ Strong collapse | OpenReview 2025 | **1 per 1,000** synthetic can collapse | Theory + synthetic | Regime-dependent vs #12 [P] |
| 12 | Accumulate avoids collapse (R10 covers) | NeurIPS 2024, arXiv 2404.01413 | Finite error bound when accumulating | Gaussian, GMM, LM | Reconciled §3.4 [P] |
| 13 | ★ Data agents on curation | arXiv 2606.04261, 2026 | 28.8 base / 33.7 agent / 34.9 scaffold / 37.1 full | 10k of 665k budget | "Execution–research gap" [P] |
| 14 | ★ Automated RL-data pipeline | ICLR 2026, arXiv 2510.06499 | **+3.4** over strongest baseline | Continual pretrain → RL | Single group [P] |
| 15 | ★ Contamination vanishes at scale | ICML 2025, arXiv 2410.03249 | No effect >**5× Chinchilla**, even 144 reps | 774M+, 15.5B tokens | Anti-panic negative [P] |
| 16 | DCLM-Baseline | NeurIPS 2024 D&B | **64% MMLU**; **6.6×** vs Llama 3 8B compute | 7B, 2.6T | Widely reproduced [P/R] |
| 17 | FineWeb-Edu | NeurIPS 2024 D&B | **92%** removed; **33.6% MMLU @ 38B** | 1.71B ablations | Standard baseline [P] |
| 18 | QuRating | ICML 2024 | **+1.8** ICL; 33% tokens; $2,820 judge | 1.3B, 30B of 260B | Widely re-analysed [P] |
| 19 | DSIR | NeurIPS 2023 | **+2–2.5%** GLUE; 100M docs in **4.5h** | Pile | Durable, cheap [P] |
| 20 | Data Mixing Laws | arXiv 2403.16952 | Optimum = **+48% steps** | Proxy → large | Best-validated mixing [P] |
| 21 | Nemotron-CC | ACL 2025 | 6.3T matches DCLM at **4×** real tokens | 8B-class | Open data [P] |
| 22 | ProX | ICML 2025 | **0.3B** refiners viable; wins on **10** benchmarks | 0.3B–7B | Consistent with #18 [P] |
| 23 | SmolLM2 mixture | arXiv 2502.02737 | **60% FineWeb-Edu + 40% DCLM** | 1.7B, 11T | Documented ablations [P] |
| 24 | Anthropic filter | Anthropic, Aug 2025 | CBRN **−33%** relative, no capability loss | Constitutional classifier | Single lab [P] |
| 25 | OLMo 3 / Dolma 3 | arXiv 2512.13961 | 9T pool → **5.9T** mix; olmOCR **805B** | 7B/32B | Fully re-runnable [P] |
| 26 | Common Pile / Comma | arXiv 2506.05209 | **8TB**, 30 sources; 7B competitive | 1T/2T tokens | Rights-first replication [P] |

---

## 5. Hype and dead ends

1. **"Influence functions tell you which data matters" — not reliably at 10k–1M.** No dominant method, simple baselines competitive, task-sensitive collapse [P]. Ship Rep-Sim plus top-k.
2. **"LESS cuts SFT data 20×" — outside its regime, no.** At 5.8M pool it fails and many selectors fall below random [P]. The 2024 result was target-aware selection on small pools with a matched eval.
3. **"Data agents will curate your dataset."** 33.7 agent vs 28.8 base vs 37.1 full; scaffolding 34.9 [P]. The gap is research, not execution.
4. **"Quality scores predict accuracy."** Two narrow predictors; no general one. Perplexity is dissociated from ICL gain [P]. A single scalar is a marketing artifact in 2026.
5. **"Contamination explains benchmark gains."** Effect vanishes above ~5× Chinchilla-scale data even at 144 reps [P]. Your own train/eval leakage is a different, larger problem (R10: >4% overlap).
6. **"Synthetic data is free augmentation."** 1/1,000 can collapse a fixed pool [P]; value comes from ratio and accumulation discipline [P].
7. **"Pruning gives 2–10×."** Survives as 1.45× steps with a 24×-smaller scorer [P]; EL2N/memorization are random-equivalent at LLM scale [P]; self-scoring dies at 1M [P].
8. **"Quality filters are neutral."** FineWeb's pipeline was tuned against the benchmarks used to evaluate it [P]. Validate every filter on an eval it never saw — Curlset's paired-test-on-frozen-gold rule already encodes this.
9. **"Bigger token counts mean better data."** Nemotron-CC's framing (same MMLU, 4× real tokens) is the exception; token-count marketing is the norm [P for existence of the critique].
10. **"Data mixing is solved."** Laws predict within a corpus (48% step equivalent) [P] but need proxy runs; no universal recipe [P].

---

## 6. What to build for this codebase

Constraints: local-first, Python 3.12, CPU-first, no paid API requirement, measurable. Surfaces: `packages/dataset_quality/`, `dataset_evaluation/`, `dataset_ensemble/`, `dataset_versioning/`, `dataset_synthesis/`, `provider_gateway/ollama_provider.py`.

### 6.1 Ranked by gain per unit of engineering effort

| # | Intervention | Effort | Expected gain | Confidence | Why |
|---|---|---|---|---|---|
| 1 | **Response-ratio + length + diversity panel** with CIs per split | 1–2 d | Predictive, not causal: flags slices that will not train | High (2610.33969) | Arithmetic over existing rows; comparable across versions |
| 2 | **Fixed-budget selection A/B** with random, longest-N, response-ratio-top-N, Rep-Sim-diverse-N | 3–4 d | 0 to +2 pts; often a *tie* — which is the finding | High | Reuses eval/ensemble code; makes later claims falsifiable |
| 3 | **Judge-distilled quality scorer** (Ollama pairwise → embedding+ridge → score all rows) | 4–6 d | +0.5 to +2 pts at fixed budget; large token savings | Moderate (QuRating, ProX) | One-off judge cost, free inference; CPU via small embeddings |
| 4 | **Rep-Sim attribution** ("which examples matter for this eval item") | 3 d | Diagnostic; targeted curation, mislabel discovery | Moderate–High (DATE-LM) | One embedding pass; replaces an influence subsystem |
| 5 | **Curation-policy evolution loop** (evolve filter *programs*, score on a 200-example probe, store policy in manifest) | 2 wk | +1 to +4 pts vs hand-written rules | Moderate (single 2026 paper) | Highest novelty; non-transfer makes it per-dataset |
| 6 | **Small-reference perplexity pruning** (125M ONNX, capped length, 30–70% keep) | 1 wk | Up to +2 at 3B; likely ~0 at 10k rows | Moderate (ICLR 2025) | Needs honest local measurement first |
| 7 | **Synthetic ratio controller** + accumulate-only guardrail | 3 d | Prevents silent loss; no positive claim | High (mechanism) | Turns the ≤40% rule into a measured policy with drift alarm |
| 8 | **Mixture optimisation** (only with ≥3 pools and a proxy model) | 3 wk | +1–2 pts, mostly compute savings | Moderate | Expensive locally; do last |

**Not on the list:** TRAK/DataInf at scale (no CPU path, no advantage over #4); autonomous agents (CurationBench); contamination scanners as a headline (internal leakage already covered).

### 6.2 The one genuinely unexplored idea: error-diversity accounting

**Claim.** Every curation method measures *content* diversity — dedup, SemDeDup, coverage, coresets, DPP, mixture weights. None measures what actually determines accuracy in R1's arithmetic: whether the **errors** of one source are independent of another's.

R1's identity `accuracy = 1 − 3p̄ + 2c` is a statement about labels, but it transfers to data sources by analogy [I]: a dataset from k sources has effective independent votes `n_eff = k / (1 + (k−1)φ̄)`, and a new source is worth exactly what its φ allows. Curlset already computes φ for model ensembles (`dataset_ensemble/weights.py::_phi`). Nobody computes it for data sources.

**Why unexplored.** Selection assumes more *diverse* data is better; collapse work assumes more *self-generated* data is worse; attribution measures influence *per example*. The three never meet at "marginal independent evidence per source." Nearest artefacts are data-diversity metrics (RankMe, effective rank — which IQ beats) and influence-based redundancy: both content-side [I].

**Measurement, locally:**

1. Split by provenance (vendor, crawl, synthetic generator, human batch).
2. Train one small probe per source on frozen embeddings (logistic regression / SetFit; seconds for 10k rows).
3. On a shared held-out audit set, compute pairwise error-correlation `Φ` and `n_eff`.
4. Report per source: marginal φ, marginal `n_eff`, and projected change in `c` if added or removed.
5. Gate: accept a new source only if it lowers projected `c` on the audit set. Measured, not modelled.

**What it lets Curlset say that nobody else can:** *"Of your four sources, two are redundant — they fail on the same 11% of items — and one adds 0.9 effective votes; a fifth LLM-generated source would add 0.1."* Dataset-level, dollar-relevant, with a confidence interval, from a formula already holding to four decimals on this project's data. It also gives the synthetic controller a stopping rule: stop when marginal `n_eff` approaches zero.

**How it fails.** If per-source probes are uniformly weak and correlated (same embedding space, same base model), φ may be flat and the metric degenerate; provenance may be unknown for mixed corpora. Both are detectable in a day on the existing 900 votes: if φ does not vary across sources, the idea is dead at a cost of one day.

### 6.3 Minimal ordered changes

1. `dataset_evaluation/metrics.py` — return `{value, n, ci}` (R4's defect, still present).
2. `dataset_quality/engine.py` — add the response-ratio/length/diversity panel as first-class columns; do not label it "quality score" in the UI.
3. `dataset_versioning/manifest.py` — add a `curation_policy` block: filter program, parameters, probe-set hash, measured delta. This turns B1 into a product.
4. New `dataset_quality/source_diversity.py` — φ matrix and `n_eff` over provenance groups.
5. `dataset_synthesis/diversity.py` — ratio controller enforcing the accumulate-only invariant.

---

## 7. References

1. Li et al. *DataComp-LM.* arXiv:2406.11794.
2. Penedo et al. *The FineWeb Datasets.* arXiv:2406.17557 (NeurIPS 2024 D&B).
3. Wettig et al. *QuRating.* arXiv:2402.09739 (ICML 2024).
4. Xie et al. *DSIR.* arXiv:2302.03169 (NeurIPS 2023).
5. Xie et al. *DoReMi.* arXiv:2305.10429.
6. Ye et al. *Data Mixing Laws.* arXiv:2403.16952.
7. Liu et al. *RegMix.* arXiv:2407.01492 (ICLR 2025).
8. Su et al. *Nemotron-CC.* arXiv:2412.02595 (ACL 2025).
9. Zhou et al. *ProX.* arXiv:2409.17115 (ICML 2025).
10. Allal et al. *SmolLM2.* arXiv:2502.02737.
11. *AI can Autonomously Evolve Pretraining Data Curation (Darwin-CC).* arXiv:2603.14420.
12. *Large-Scale Data Selection for Instruction Tuning.* arXiv:2503.01807.
13. *On Representation Redundancy in Instruction Tuning Data Selection.* arXiv:2602.13773.
14. Cen et al. *Webscale-RL.* arXiv:2510.06499 (ICLR 2026).
15. Jha et al. *RL-Guided Data Selection.* arXiv:2509.25850 (NeurIPS 2025 workshop).
16. Park et al. *TRAK.* arXiv:2303.14186 (ICML 2023).
17. Kwon et al. *DataInf.* arXiv:2310.00902 (ICLR 2024).
18. Jiao et al. *DATE-LM.* arXiv:2507.09424 (NeurIPS 2025 D&B).
19. *Revisiting Data Attribution for Influence Functions.* arXiv:2508.07297.
20. *Rescaled Influence Functions.* NeurIPS 2025.
21. *How Faithful Is Trajectory-Based Data Attribution?* 2026.
22. *Elucidating the Design Space of LM Data Attribution.* arXiv:2610.40655.
23. Sorscher et al. *Beyond neural scaling laws.* arXiv:2206.14486.
24. Paul et al. *EL2N.* arXiv:2107.07075.
25. Marion et al. *When Less is More.* arXiv:2309.04564.
26. Ankner et al. *Perplexed by Perplexity.* arXiv:2405.20541 (ICLR 2025).
27. *Rethinking Data Selection at Scale.* arXiv:2410.09335.
28. Kang et al. *Demystifying Synthetic Data in LLM Pre-training.* arXiv:2510.01631 (EMNLP 2025).
29. Dohmatob et al. *Strong Model Collapse.* OpenReview `et5l9qPUhm`.
30. Gerstgrasser et al. *Is Model Collapse Inevitable?* arXiv:2404.01413.
31. Muennighoff et al. *Scaling Data-Constrained Language Models.* arXiv:2305.16264.
32. Shumailov et al. *AI models collapse…* Nature 631, 755–759 (2024).
33. Kang et al. *Can Generalist Agents Automate Data Curation?* arXiv:2606.04261.
34. *Data Agents: Levels, State of the Art, Open Problems.* arXiv:2602.04261.
35. Bordt et al. *How Much Can We Forget about Data Contamination?* arXiv:2410.03249 (ICML 2025).
36. Deng et al. *Investigating Data Contamination in Modern Benchmarks.* NAACL 2024.
37. *LLM Benchmark Datasets Should Be Contamination-Resistant.* arXiv:2605.19999.
38. *"High-Quality" Data for Early-Stage Instruction Tuning.* arXiv:2610.33969.
39. *Efficient, Validation-Free Intrinsic Quality Estimation.* arXiv:2605.29720.
40. Moon et al. *Call for Rigor in Reporting Quality of Instruction Tuning Data.* ACL 2025.
41. Subramanyam et al. *Scaling Laws Revisited.* arXiv:2510.03313 (ICLR 2026).
42. Zhao et al. *Long Is More for Alignment.* arXiv:2402.04833 (ICML 2024).
43. Anthropic. *Enhancing Model Safety through Pretraining Data Filtering.* 2025-08-19.
44. OLMo Team. *Olmo 3.* arXiv:2512.13961; allenai.org/blog/olmo3.
45. Meta AI. *The Llama 4 herd.* 2025-04-05.
46. Gemma Team. *Gemma 3 Technical Report.* arXiv:2503.19786; model card (27B/14T).
47. *The Common Pile v0.1.* arXiv:2506.05209.
48. Lee et al. *Deduplicating Training Data Makes Language Models Better.* ACL 2022.
49. Northcutt et al. *Pervasive Label Errors.* arXiv:2103.14749.
50. Epoch AI. *Will we run out of data…?* 2024.
51. *Toward a Theory of Data Ecology.* CACM 2026 (framing only).
52. *Data Mixing for LLM Pretraining* (review). arXiv:2604.16380.
53. Internal: `docs/ENSEMBLE_PSEUDO_LABELING.md`; `packages/dataset_ensemble/weights.py`; `00-SYNTHESIS.md` §2 for the φ identity and 900-vote measurements.

**Verification note.** Every number was read from the cited source during this review except items tagged [U] or [I]. Two 2026 claims could be checked only at abstract level (DeMix; the mixing review's effect sizes) and are reported as existence-only.
