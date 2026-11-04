# R6 — Synthetic Data That Actually Improves Accuracy

**Date:** 2026-11-04 · **Scope:** text/label synthesis first, vision second · **Status:** research + design, no new experiments executed here.

**Number convention.** **(paper)** = reported by the cited source; **(internal)** = this repository's executed experiments; **(inference)** = my estimate/derivation; **(unverified)** = primary source inaccessible. Untagged numbers are definitions or proposed thresholds, not evidence.

---

## 1. Executive summary

- **Collapse is a property of the loop, not of one augmentation round.** Shumailov et al. show recursive replacement destroys tails then variance; Gerstgrasser et al. and Kazdan et al. show accumulation alongside real data avoids divergence; Dohmatob et al. show even ~1% synthetic can cap scaling in a scaling-law regime (paper). The repository is single-round and real-anchored, so its realistic failure is silent narrowing and label drift, not dramatic collapse.
- **The reproducible text win is grounded rewriting at a minority share.** Kang et al. (EMNLP 2025): 1/3 rephrased synthetic + 2/3 natural text reaches the same validation loss 5–10x faster at larger budgets, optimum ~30%; synthetic alone is not faster (paper). EntiGraph lifts closed-book QA 39.49% → 56.22% by generating from source documents (paper). Genie reaches human parity only after NLI + reward-model filtering (paper).
- **Vision gains are small and conditional: +0.9 to +1.5 mAP/AP in annotation-scarce detection (GeoDiffusion, DetDiffusion, copy-paste), negative for synthetic-only classifiers (69.24% vs 76.39%), and reversing beyond ~4–5x synthetic (paper).**
- **The load-bearing gate is independent verification plus downstream delta on frozen human gold — not lexical diversity.** Label preservation is necessary but gameable: a same-family verifier inflates it, and a perfect paraphraser can preserve labels while adding zero information. The repository's 52.1% preservation result is from a fake generator and simulated verifiers (internal), so it calibrates the gate but says nothing about real LLM generation.
- **Build order.** G1 grounded paraphrase first (local Qwen2.5-3B/7B, NLI + independent verifier, ≤30% per class), measured on the 300-row hard fixture with McNemar; G3 counterfactual pairs second (higher ceiling, needs human adjudication); G2 gap-filling last. CPU-only text generation is viable at roughly 100–500 short candidates/hour (inference).

---

## 2. Findings with evidence

### 2.1 Model collapse: causes and conditions

Shumailov et al. (Nature 631:755–759, 2024) define collapse as generated data polluting the next training set. In **early collapse** the tails disappear; in **late collapse** the model converges to a distribution unlike the original, often with reduced variance (paper). Three compounding error sources: statistical approximation (finite samples), functional expressivity, functional approximation (paper). Alemohammad et al. (ICLR 2024) show autophagous loops lose quality or diversity without fresh real data; Dohmatob et al. (2024) frame collapse as a change in scaling laws, with tail decay and "unlearning" (paper). Practical result: with **10% of the original data retained at every generation**, the paper reports "only minor degradation"; without retention it reports "losing some performance, from 20 to 28 perplexity points" (verbatim; the baseline is not stated in that sentence, so treat the magnitude as directional).

Three follow-up camps. (1) **Accumulation prevents divergence:** Gerstgrasser et al. (ICML 2024) confirm replacement collapses and show accumulating synthetic data alongside real data avoids it across model sizes and architectures (paper); Kazdan et al. (2024) show fixed-size mixed subsets degrade slowly rather than explosively (paper). (2) **Real data must dominate:** Seddik et al. (2024) prove synthetic-only always collapses and that a mixture has a maximal synthetic amount below which collapse is avoided, with generated data "considerably smaller" than real (paper); no universal ratio (inference). (3) **Small fractions can still cap scaling:** Dohmatob et al. ("Strong Model Collapse", ICLR 2025) show ~1% synthetic can make larger training sets stop helping, and larger models can amplify collapse (paper). Borji (2024) argues collapse is a statistical consequence of repeated fitting/sampling and may be unavoidable, disputing the interpretation, not the experiment (paper).

**Synthesis.** Collapse is driven by recursive training on a tail-depleted distribution, variance shrinkage from finite sampling, and compounding approximation error. It is not caused by using synthetic data once. Two risks remain: **mode narrowing** (one model, one prompt, one temperature) and **label drift** on subjective intents.

**When synthetic helps.** Consistent conditions: distillation from a stronger teacher; grounding in real documents or labels; verifier/reward filtering; a real anchor and minority synthetic share; labels objective enough for a verifier. Remove one and the evidence weakens sharply.

### 2.2 Text and label generation: what is actually SOTA

**Instruction synthesis.** Self-Instruct bootstraps instructions, filters invalid/similar ones, and reports +33% absolute over GPT-3 on Super-NaturalInstructions (paper). Evol-Instruct/WizardLM add complexity (>90% of ChatGPT on 17/29 skills, GPT-4 eval; paper). Magpie extracts 4M instructions from Llama-3-Instruct, selects 300K, and matches the official 10M-SFT model on some tasks (paper). All are distillation/self-synthesis, not evidence that weak-model free generation works.

**Grounded generation.** Genie generates QA/summaries from source content, filters with an NLI model (`t5_xxl_true_nli_mixture`) for faithfulness and a DeBERTa reward model for quality; trained models are on par with or better than human-data models and consistently more faithful (paper). EntiGraph extracts entities from a small corpus and generates text connecting them; 455M synthetic tokens raise closed-book QA 39.49% → 56.22% for Llama 3 8B Base, providing 80% of the gain of having source documents at inference (paper). This is the closest analogue: generate *from* approved examples, not a bare class name.

**Quality beats quantity.** AlpaGasus filters 52K Alpaca examples to 9K and beats the full-data model, 5.7x faster; its 13B variant matches >90% of the teacher (paper).

**How much is safe.** Kang et al.: ~30% rephrased synthetic is the empirical optimum; 1/3 synthetic + 2/3 real gives 5–10x speedup; synthetic alone is not faster (paper). Zhu et al. (2025): fine-tuning improves with more generated data until the synthetic proportion is high; at 80% synthetic a 1B model declines (paper). Azizi et al. (2023): classifier gains peak around 2x data and reverse beyond ~4–5x; at 12M total (10x synthetic), top-1 is 1.35 points below real-only (paper). Shumailov: 10% real retained per generation → minor degradation; none → substantial loss (paper). Seddik: synthetic must be considerably smaller (paper). No universal cap; for this classifier, **20–30% synthetic per class** is the defensible start (inference); cap 40% until a swept experiment says otherwise.

**Backtranslation and "LLM-switch".** Backtranslation helps MT (+2.8–3.7 BLEU on WMT15 EN↔DE; paper) but is not label-preserving for classification: round-trip translation can drop negation, entities, or intent. Use it as a semantic-consistency check, not a generator. I found no verified method named "LLM-switch" (unverified); treat it as generator-family switching — generate with model A, verify with model B.

**NLI instead of lexical filters.** Use bidirectional entailment for paraphrase (source ↔ candidate) plus a label-conditioned check (candidate entails the class definition, or an independent classifier agrees). Genie demonstrates this at scale (paper). Caution: Ma et al. (ACL 2021) show entailment-based zero-shot classification is brittle to template and label wording (paper). NLI is a useful filter when fine-tuned/calibrated in-domain and combined with an independent classifier; it is not a replacement.

**Project-specific warning.** Li et al. (2023) find synthetic-data effectiveness is negatively associated with task- and instance-level subjectivity (paper). The hard fixture is explicitly implicit-intent, no giveaway keywords — i.e., subjective. Expect lower preservation and smaller gains.

### 2.3 Vision: which pipeline actually moved mAP

**Copy-paste (real objects).** Ghiasi et al. (CVPR 2021) paste real instances onto real images: 49.1 mask AP / 57.3 box AP on COCO, +0.6 mask AP and +1.5 box AP over prior SOTA, +3.6 mask AP on LVIS rare (paper).

**Diffusion classifiers.** Azizi et al. (2023) fine-tune Imagen class-conditionally on ImageNet and add 1.2M generated to 1.2M real: ResNet-50 76.39 → 78.17 (+1.78), ResNet-101 +1.59, ViT-S/16 +1.11 (paper). Synthetic-only is 69.24 vs 76.39 (paper). Beyond ~4–5x synthetic the delta goes negative: −0.30 at 6.0M total, −1.35 at 12.0M (paper).

**Off-the-shelf T2I.** Fan et al. (CVPR 2024) find synthetic images scale similarly to but slightly worse than real for CLIP, and significantly underperform for supervised classifiers; a main cause is inability to generate certain concepts (paper). They also report only a negligible correlation between diversity and scaling ability across ImageNet classes (paper) — a warning against using diversity as a proxy for value.

**Detection layout-to-image.** GeoDiffusion (ICLR 2024): NuImages 36.9 → 38.3 mAP (+1.4), COCO 37.3 → 38.4 (+1.1) with limited real data; full-real oracle is 48.2 on NuImages (paper). DetDiffusion (CVPR 2024): +0.9 mAP on COCO-Stuff (paper). SDXL/FLUX + ControlNet can condition on boxes/depth and IP-Adapter can inject object appearance (paper), but the adapters alone have no detection mAP evidence; the gains come from training on generated data. 

**3D render pipelines.** BlenderProc (CVPR-W 2019) and Kubric (CVPR 2022) are open-source scene generators with rich annotations; Kubric demonstrates 13 datasets (paper). Neither reports a detection mAP delta; they are data engines, not detector benchmarks (inference). Domain randomization has detection evidence: Tremblay et al. (CVPR-W 2018) report AP 83.7 on KITTI cars with COCO-initialized weights + synthetic DR, vs 79.7 with COCO + Virtual KITTI and 56.1 with COCO alone (+5% over the photorealistic synthetic baseline) (paper). Caveat: COCO pretraining, not from-scratch sim2real. Isaac Sim is proprietary; I found no peer-reviewed mAP number, only vendor material (unverified; do not cite as evidence).

**GANs and domain gap.** SimGAN (CVPR 2017) and DatasetGAN (CVPR 2021) help gaze/hand pose and segmentation, not detection (paper); GANs add mode-collapse risk (inference). He et al. (ICLR 2023) find synthetic data helps zero/few-shot but can harm a pretrained encoder under end-to-end fine-tuning; domain gap is the cause (paper). "Is Synthetic Data all We Need?" (2024) finds synthetic clones less robust to adversarial/real-world noise, while real+synthetic improves robustness (paper). Rule: synthetic pretraining or mixed training, not synthetic-only deployment.

**Answer:** layout-to-image diffusion (GeoDiffusion +1.1 to +1.4 mAP; DetDiffusion +0.9), copy-paste (+1.5 box AP), and domain-randomized rendering with real pretraining (KITTI AP 83.7 vs 79.7). Gains are 1–2 points, mostly annotation-scarce. No reviewed pipeline delivers a large general mAP jump from SDXL/Flux + ControlNet/IP-Adapter alone; those are controllability tools whose detection value depends on the downstream experiment (paper for tools; inference for detection).

### 2.4 Gates: which one is load-bearing?

**Semantic dedup.** SemDeDup removes 50% of LAION with minimal loss and improves OOD (paper). Deduplication cuts verbatim memorization ~10x and needs fewer train steps for same/better accuracy (paper). The repository's trigram Jaccard at 0.75 is a lexical proxy; it misses paraphrases and semantic duplicates.

**Diversity metrics.** Trigram ratio is cheap and length-sensitive but semantics-blind; it caught the template collapse (0.196 < 0.35; internal) but would not catch 48 semantically identical paraphrases. Self-BLEU, Vendi, and density/coverage measure different things (paper); their predictive validity is contested — Chen et al. (2024) find positive correlation with downstream performance, Fan et al. (2023) find negligible correlation with scaling (both paper). Use diversity as a reject gate for mode collapse, not a select score.

**Label preservation.** Feng et al. (2024) show theoretically and on two tasks that verifiers, even imperfect, prevent collapse and a proxy correlates with performance (paper). Genie's NLI + reward filters are the production version (paper). The repository's E6 — 48/48 accepted by lexical filters, unique-trigram ratio 0.196, label preservation 52.1%, batch rejected (internal) — correctly shows that per-item lexical filters are insufficient and batch admission matters. But 52.1% comes from a deterministic fake generator (five templates per class plus a salt) and `SimulatedEnsembleProvider` verifiers (internal). It is a gate unit test, not a measurement of real generation; literature confirms the principle, not the number.

**Verifier/reward filtering.** Two failure modes: reward-model overoptimization follows Goodhart's law (paper); LLM evaluators recognize and favor their own generations, and self-recognition correlates with self-preference (paper). Use a different family, calibrate on human labels, cap and audit rejections.

**Adversarial filtering and audits.** AFLite (ICML 2020) removes examples a weak model learns easily, retaining hard ones (paper); good for G3, but can amplify label noise (inference). The repository already has Wilson-bound threshold solving and `audit_sample_size()` in `packages/dataset_ensemble/selection.py`; use stratified samples per batch, 100% audit of gap-filled rows, and a 95% Wilson interval.

**Verdict.** For the current failure (template generator, semantic mismatch), independent label-preservation verification is the decisive intrinsic gate — confirming the project's conclusion. It is not sufficient in general: for a strong paraphraser, novelty/dedup is co-load-bearing, because a perfect copy passes preservation while adding nothing. The only gate the generator cannot game is the downstream delta on frozen human gold. That is load-bearing; intrinsic gates only decide what is worth measuring.

### 2.5 Architecture and cost

The repository already has `ProcessingRunModel` (`run_type=synthesis`), `RunItemModel` (idempotency), `DatasetVersionModel` (manifest hash, parent), `SourceRecordModel`, and `AnnotationModel` (`origin=synthetic`, `pending_review`). Gaps: lineage is a JSON blob on `dataset_records.extra_metadata`, there is no batch entity, no per-item filter scores, no dataset-wide cap, no impact measurement, and no rollback by batch. Two code gaps: `_generate_candidates` passes `prompt_template=spec.prompt_version` but providers ignore it, and `OpenAICompatibleProvider.generate()` delegates to classification `annotate()`, so a real local model would be asked to classify, not generate. A real path needs explicit prompt rendering + a `generate_text` contract.

**Cost.** The base install has no ML stack (`pyproject.toml`), so deterministic gates run dependency-free; ML is an extra. CPU: 3B Q4 via llama.cpp/Ollama ~8–20 output tok/s on 8 cores (inference); 1,000 40-token candidates ~35–80 min (inference); small NLI ~10–30 pairs/s; MiniLM embeddings ~1–5 min per 10K texts (inference); no paid API. GPU: 7B fp16 ~14 GB weights + KV cache (~16–24 GB GPU); 4-bit fits 8 GB (inference); vLLM 2–4x throughput over prior serving at equal latency (paper); 1K–10K short candidates/hour on one modern GPU (inference). Vision: SDXL 3B, FLUX.1 12B (`schnell` Apache 2.0, `dev` non-commercial); seconds/image on 24 GB GPU, tens of seconds on CPU/offload (inference); detector fine-tuning dominates cost. Models: Qwen2.5-7B or Mistral-7B (Apache 2.0) for generation, DeBERTa-v3 (MIT) for NLI, MiniLM (Apache 2.0) or BGE-small (MIT) for embeddings; verify licenses at pin time.

---

## 3. Evidence table

| Method | Venue / year | Claimed gain | Dataset / setting | Caveats |
|---|---|---|---|---|
| Recursive training | Nature 2024 | Tails then variance disappear; 10% real retained → "only minor degradation" (paper) | GMM, VAE, Llama-2 | Replacement loop, not one round |
| Accumulate real + synthetic | ICML 2024 | Avoids collapse where replacement collapses (paper) | LMs, molecules, VAE images | Stable loss ≠ preserved tails |
| Strong Model Collapse | ICLR 2025 | ~1% synthetic can cap scaling; larger models amplify (paper) | Regression, LMs, images | Theory/scaling-law regime |
| Rephrased pretraining | EMNLP 2025 | 1/3 synthetic + 2/3 real → 5–10x faster to same loss; ~30% optimum (paper) | >1000 LMs, >100k GPU h | Pre-training, not 4-class fine-tuning |
| EntiGraph | arXiv 2024 | Closed-book QA 39.49 → 56.22 (paper) | QuALITY, Llama 3 8B | Requires source corpus |
| Genie | ICLR 2024 | Human parity / better faithfulness after NLI + reward filters (paper) | LFQA, summarization | Grounded; filters essential |
| Self-Instruct | ACL 2023 | +33% absolute on Super-NaturalInstructions (paper) | GPT-3, 33K instructions | Self-bootstrapping; lexical filter |
| AlpaGasus | ICLR 2024 | 9K beats 52K; 5.7x faster (paper) | Alpaca | LLM-judge filter |
| Counterfactual augmentation | ICLR 2020 | Combined data reduces spurious-feature reliance (paper) | Sentiment, NLI | Human-edited; intentional flips |
| Copy-paste | CVPR 2021 | +1.5 box AP, +0.6 mask AP COCO; +3.6 mask AP LVIS rare (paper) | COCO, LVIS | Real objects; needs masks |
| Diffusion classifier | arXiv 2023 | +1.78 top-1 at 2x; negative beyond ~4–5x (paper) | ImageNet, Imagen | Target-specific fine-tuning |
| GeoDiffusion | ICLR 2024 | +1.4 mAP NuImages; +1.1 mAP COCO (paper) | Scarce real data | Small; full-real oracle 48.2 |
| DetDiffusion | CVPR 2024 | +0.9 mAP COCO-Stuff (paper) | COCO-Stuff | Small |
| Domain randomization | CVPR-W 2018 | AP 83.7 vs 79.7; +49% vs COCO (paper) | KITTI cars | COCO pretraining |

---

## 4. Concrete design for this codebase

### 4.1 Generation strategies

**G1 — Grounded label-preserving paraphrase (primary).** Input: approved human records only, labels, one-sentence class definition. Per seed, generate 2–3 paraphrases with the same intent. Generator: local Qwen2.5-3B/7B or Mistral-7B via `OpenAICompatibleProvider` at a local vLLM/llama.cpp server, or `OllamaProvider` after adding a generation method. Gates: bidirectional NLI entailment; independent classifier agreement (different family); embedding similarity band 0.55–0.95 to seed; dedup at cosine >0.95 to any record; batch Vendi + trigram. Cap ≤30% per class, ≤25% dataset-wide. Expected high preservation (>90% pass bar) and a modest 1–3 macro-F1 gain (inference).

**G2 — Gap-filling grounded generation (secondary, strict).** Only classes with ≥5 real seeds and <20 rows. Include definition, seeds, and adjacent-class negatives. No parent per row → 100% human audit; cap at 50%; never synthetic-only. Expected rare-class recall gain; high drift risk; do not run before G1.

**G3 — Counterfactual / boundary pairs (highest ceiling).** Select real records where the model/ensemble is wrong or low-agreement (hard fixture has ~10–12% both-wrong; internal). Generate a pair: label-preserving paraphrase plus a minimal edit that changes intent (add/remove a constraint, change the request object). Counterfactual label = adjacent class; human adjudicates one decision per pair. Gate: NLI contradiction/negation change; original label preserved; counterfactual label intended. Cap 100–300 pairs. Evidence: human counterfactuals reduce spurious-feature reliance (Kaushik et al., ICLR 2020, paper); AFLite is the automated cousin (paper). Best bet for the measured hard-set failure, but needs human time.

### 4.2 Gate stack (cheapest first)

1. **Hard filters:** empty/length, exact normalized duplicate, language, PII/secrets, label in schema, watermark/metadata if available.
2. **Semantic dedup/novelty:** embedding cosine to nearest existing ≤0.95; to parent in [0.55, 0.95]; batch near-duplicate clustering. Pluggable embedder: pure-Python hashing embedder (char n-grams → 256 dims, L2) as default; sentence-transformers optional.
3. **Batch diversity:** trigram ratio (keep 0.35 floor), Self-BLEU, Vendi, effective rank of embedding covariance. Gate: Vendi ≥0.8x real-data Vendi per class; effective rank ≥0.5x real; else reject.
4. **Label preservation:** independent verifier (different family), 3-vote majority, per-item entropy; batch ≥0.90. G1 adds bidirectional NLI; G3 adds the flip check. Calibrate the verifier on 100 human pairs and report its accuracy.
5. **Optional reward filter:** cap rejection at 50%, audit 20 rejections, never same-family generate+judge.
6. **Human audit:** stratified 20–30 rows/batch, 100% of G2; Wilson lower bound on precision ≥0.90, else reject.
7. **Downstream delta:** train TF-IDF + logistic regression (or linear probe) on real-only vs real+admitted; evaluate on frozen human gold; require +1.0 macro-F1 point with 95% bootstrap CI excluding zero and no class recall drop >2 points; McNemar for paired predictions. This is the admission gate that matters.

### 4.3 Lineage schema

```
synthesis_batches(id PK, dataset_id FK, run_id FK,
  strategy CHECK IN ('G1','G2','G3'),
  generator_provider, generator_model, model_revision, quantization,
  prompt_id, prompt_hash, decoding_json, seed,
  parent_policy_json, gate_policy_json, gate_results_json, metrics_json,
  n_generated, n_accepted, cost_usd,
  verdict CHECK IN ('admit','reject'), verdict_hash,
  created_by, created_at, software_version)

synthesis_items(id PK, batch_id FK, record_id FK NULL,
  parent_record_ids_json, intended_label, source_hash, output_hash, seed,
  filter_scores_json,   -- similarity_to_parent, max_similarity_existing,
                        -- nli_forward, nli_backward, verifier_votes
  status, rejection_reason)

synthesis_impact(id PK, batch_id FK, baseline_eval_run_id, treatment_eval_run_id,
  metric, baseline_value, treatment_value, delta, ci_low, ci_high, p_value,
  verdict CHECK IN ('improved','neutral','regressed'))

dataset_records.synthetic_batch_id  -- nullable, indexed
```

Export lineage in W3C PROV-O/OpenLineage form and dataset metadata as Croissant; the Data Provenance Initiative documents why lineage and license tracing matter (paper). Persist inputs (prompt hash, model revision, quantization, seed, temperature/top_p) and per-gate/per-item scores, not just the verdict. `verdict_hash = sha256(canonical(gate_policy) + canonical(gate_results) + sorted(item_hashes))` prevents silent post-admission edits. `source_records.source_type='synthetic'`, `source_uri='synthesis://batch/{id}/item/{id}'`; license fields inherit from generator model and parents.

### 4.4 Lifecycle, caps, rollback

`planned → generated → gated → audited → admitted | rejected → measured → rolled_back`. Admission writes a new `DatasetVersionModel` (manifest hash, parent) and sets `synthetic_batch_id`. Rejection writes zero records. Rollback: delete by `synthetic_batch_id` with an audit event, or re-point the active version to the parent. Ratio caps at admission: `generated/(real+generated) ≤0.30` per class, `≤0.25` dataset-wide, G2 exception with 100% audit. These are stricter than the current `DiversityPolicy.max_class_share=0.5` and should become the text default.

### 4.5 Experiments (E6 ladder)

| ID | Question | Design | Pass bar |
|---|---|---|---|
| E6a | Does a real local generator pass? | Qwen2.5-3B/7B, 12/class, 300-row hard fixture, G1 | Preservation ≥0.90; novelty ≥0.95; Vendi ≥0.8x real |
| E6b | Grounding vs free-form? | Free-form vs seed-grounded vs +NLI, same budget | Grounded +10 pts preservation (hypothesis) |
| E6c | What share helps? | 0/10/25/40/60%, 5 seeds, frozen gold | +≥1.0 macro-F1, CI excludes 0; no class recall drop >2 |
| E6d | Which gate is load-bearing? | Known-bad fake vs known-good real; ablate gates | False-admit on known-bad = 0; yield ≥30% on known-good |
| E6e | Round 2 self-consumption? | Retrain, regenerate, repeat | No degradation vs round 1; real anchor retained |
| E6f | Counterfactuals move hard set? | 100–300 human-verified G3 pairs | +≥2 pts hard-set macro-F1 |

Code changes: `packages/dataset_synthesis/` gains `embeddings.py`, `gates.py`, `verification.py`, `lineage.py`, `impact.py`; `generation_pipeline.py` gains batch/item persistence and the new gate stack; `services/api/routes/generation.py` gains batch endpoints (`POST /synthesis/batches`, `POST /synthesis/batches/{id}/run`, `POST /synthesis/batches/{id}/admit`, `POST /synthesis/batches/{id}/rollback`, `GET /synthesis/batches/{id}/impact`). Keep `generate-gated` as the simple path.

---

## 5. Dead ends

- **Free-form generation from a bare class name.** The fake generator is the extreme: five templates plus a salt, 0.196 trigram ratio, 52.1% simulated preservation (internal). Real models do better, but without grounding the label is a hope.
- **Lexical filters as the only gate.** 48/48 passed per-item filters; batch trigram caught collapse (internal). Trigram Jaccard cannot see semantic duplication or label drift.
- **Same-family verifier / self-grading.** LLM judges prefer their own outputs (paper); reward models are overoptimized (paper). Use a different family and calibrate.
- **Synthetic-only training.** 69.24 vs 76.39 (paper); collapse theory (paper); clones less robust (paper). Keep the real anchor.
- **High ratios.** 80% degrades a 1B model (paper); gains reverse beyond ~4–5x in vision (paper); ~30% is the pretraining optimum (paper). The 50% class cap is too high for a first text deployment.
- **Synthetic data for subjective labels.** Effectiveness is negatively associated with subjectivity (paper); the hard implicit-intent fixture is that case.

---

## 6. References

1. Shumailov et al. Nature 631:755–759, 2024. https://www.nature.com/articles/s41586-024-07566-y
2. Gerstgrasser et al. ICML 2024, arXiv:2404.01413. https://arxiv.org/abs/2404.01413
3. Alemohammad et al. ICLR 2024, arXiv:2307.01850. https://arxiv.org/abs/2307.01850
4. Dohmatob et al. arXiv:2402.07043, 2024. https://arxiv.org/abs/2402.07043
5. Dohmatob et al. ICLR 2025, arXiv:2410.04840. https://arxiv.org/abs/2410.04840
6. Seddik et al. arXiv:2404.05090, 2024. https://arxiv.org/abs/2404.05090
7. Kazdan et al. arXiv:2410.16713, 2024. https://arxiv.org/abs/2410.16713
8. Borji. arXiv:2410.12954. https://arxiv.org/abs/2410.12954
9. Feng et al. arXiv:2406.07515, 2024. https://arxiv.org/abs/2406.07515
10. Kang et al. EMNLP 2025. https://aclanthology.org/2025.emnlp-main.544/
11. Chen et al. arXiv:2410.15226, 2024. https://arxiv.org/abs/2410.15226
12. Zhu et al. arXiv:2506.19262, 2025. https://arxiv.org/abs/2506.19262
13. Wang et al. ACL 2023, arXiv:2212.10560. https://arxiv.org/abs/2212.10560
14. Xu et al. ICLR 2024, arXiv:2304.12244. https://arxiv.org/abs/2304.12244
15. Xu et al. ICLR 2025, arXiv:2406.08464. https://arxiv.org/abs/2406.08464
16. Geng et al. ICLR 2024, arXiv:2401.14367. https://arxiv.org/abs/2401.14367
17. Chen et al. ICLR 2024, arXiv:2307.08701. https://arxiv.org/abs/2307.08701
18. Geng et al. arXiv:2409.07431. https://arxiv.org/abs/2409.07431
19. Li et al. EMNLP 2023, arXiv:2310.07849. https://arxiv.org/abs/2310.07849
20. Kaushik et al. ICLR 2020, arXiv:1909.12434. https://arxiv.org/abs/1909.12434
21. Sennrich et al. ACL 2016, arXiv:1511.06709. https://arxiv.org/abs/1511.06709
22. Ma et al. ACL 2021. https://aclanthology.org/2021.acl-short.99/
23. Abbas et al. arXiv:2303.09540. https://arxiv.org/abs/2303.09540
24. Lee et al. ACL 2022, arXiv:2107.06499. https://arxiv.org/abs/2107.06499
25. Zhu et al. SIGIR 2018, arXiv:1802.01886. https://arxiv.org/abs/1802.01886
26. Friedman, Dieng. TMLR 2023, arXiv:2210.02410. https://arxiv.org/abs/2210.02410
27. Naeem et al. ICML 2020, arXiv:2002.09797. https://arxiv.org/abs/2002.09797
28. Gao et al. ICML 2023, arXiv:2210.10760. https://arxiv.org/abs/2210.10760
29. Panickssery et al. arXiv:2404.13076. https://arxiv.org/abs/2404.13076
30. Le Bras et al. ICML 2020, arXiv:2002.04108. https://arxiv.org/abs/2002.04108
31. Ghiasi et al. CVPR 2021, arXiv:2012.07177. https://arxiv.org/abs/2012.07177
32. Azizi et al. arXiv:2304.08466. https://arxiv.org/abs/2304.08466
33. He et al. ICLR 2023, arXiv:2210.07574. https://arxiv.org/abs/2210.07574
34. Fan et al. CVPR 2024, arXiv:2312.04567. https://arxiv.org/abs/2312.04567
35. Chen et al. ICLR 2024, arXiv:2306.04607. https://arxiv.org/abs/2306.04607
36. Wang et al. CVPR 2024. https://openaccess.thecvf.com/content/CVPR2024/papers/Wang_DetDiffusion_Synergizing_Generative_and_Perceptive_Models_for_Enhanced_Data_Generation_CVPR_2024_paper.pdf
37. Tremblay et al. CVPR-W 2018, arXiv:1804.06516. https://arxiv.org/abs/1804.06516
38. Denninger et al. CVPR-W 2019, arXiv:1911.01911. https://arxiv.org/abs/1911.01911
39. Greff et al. CVPR 2022, arXiv:2203.03570. https://arxiv.org/abs/2203.03570
40. Singh et al. CVPR 2024, arXiv:2405.20469. https://arxiv.org/abs/2405.20469
41. Zhang et al. ICCV 2023, arXiv:2302.05543. https://arxiv.org/abs/2302.05543
42. Ye et al. arXiv:2308.06721. https://arxiv.org/abs/2308.06721
43. Kwon et al. SOSP 2023, arXiv:2309.06180. https://arxiv.org/abs/2309.06180
44. Qwen Team. arXiv:2412.15115. https://arxiv.org/abs/2412.15115
45. Grattafiori et al. arXiv:2407.21783. https://arxiv.org/abs/2407.21783
46. Podell et al. arXiv:2307.01952; model card https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
47. Black Forest Labs. FLUX. https://github.com/black-forest-labs/flux
48. Longpre et al. arXiv:2310.16787. https://arxiv.org/abs/2310.16787
49. Akhtar et al. NeurIPS 2024 D&B, arXiv:2403.19546. https://arxiv.org/abs/2403.19546
50. W3C PROV-O https://www.w3.org/TR/prov-o/ · OpenLineage https://openlineage.io/
