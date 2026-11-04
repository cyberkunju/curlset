# W4 — Vision-Language Models as Annotators (2026)

**Date:** 2026-11-04
**Scope:** Can multimodal models label images at near-human or beyond-human quality? Which visual tasks clear a 95% precision bar today, which do not, and what hybrid architecture actually works.
**Constraint context:** local-first, Python 3.12, CPU-first, core product must function without paid APIs.
**Non-duplication:** wave-1 `R3-autolabeling-modalities.md` already established the detector/open-vocab stack and the 46.7 / 52.5 COCO AP correction. This report starts where R3 stopped: the *labeling* behaviour of VLMs, measured.

**Evidence tags used throughout**

| Tag | Meaning |
|---|---|
| **[P]** | Peer-reviewed or archival (arXiv + venue), method and numbers inspectable |
| **[R]** | Reported by a vendor, model card, leaderboard or blog; not independently replicated here |
| **[I]** | Inference drawn by this author from cited evidence |
| **[U]** | Could not verify; treat as a claim, not a fact |

---

## 1. Executive summary

### 1.1 The answer to the question as asked

**No.** As of November 2026 there is no vision-language model — frontier or open — that labels arbitrary images at 95% precision across a realistic task mix. The single most useful number in this report is Roboflow's independent five-task Vision Evals leaderboard, where the strongest model on that board averages **87.5%** and Anthropic's flagship Claude Opus 4.7 scores **73.13%, 9th of 63** [R]. On the hardest independent detection benchmark, RF100-VL, a *detector* (Grounding DINO) reaches 15.7 mAP zero-shot while MLLMs fall below 2% on medical domains [P]. On SA-Co the best segmentation system reaches **54.1 cgF1 against a human baseline of 72.8** [R/P].

Those three numbers — 87.5, 54.1, 1.5 — are the honest state of the art. Nothing in the 2026 literature closes them.

### 1.2 The answer to the question that was actually being asked

The question behind the question is: *where can I stop paying humans?* Framed that way the answer is different and more useful.

Precision is not a property of a model. It is a property of a **policy**: a model, an ontology, a threshold, an abstention rule. A model that is 87% accurate can deliver 97% precision on the 55% of items it is most confident about. That is not a trick — it is the only honest way to read the literature, and it is what this codebase has half-built already (`Band.AUTO_ACCEPT` / `HUMAN_REVIEW` / `REJECT`, per-class thresholds in `packages/dataset_ensemble/selection.py`).

The decisive verdict:

- **≥95% precision at 100% coverage: achievable on no visual task in 2026.** Not classification, not detection, not OCR, not counting.
- **≥95% precision at *reduced coverage*, on a closed objective ontology, for image-level classification: achievable now, with measurable coverage.** Raw accuracy of 87.5–93.6% on five-task and Kinetics-400 benchmarks [R] implies a large high-confidence core that clears 95%; the abstained remainder does not.
- **Everything geometric — boxes, masks, counts, spatial relations, structured document fields — is not close**, and the gap is not a scaling gap. Counting has sat at 30–40% across three model generations while MMMU climbed past 83 [R].
- **The genuinely new capability is not a better labeller but a *certified* labeller** — one that outputs a precision floor with a finite-sample guarantee over a randomized audit, and refuses to publish otherwise. Nobody sells this (wave-1 R7), and the 2026 evidence makes it more valuable, because the failure modes are silent.

### 1.3 The three 2026 findings that change the design

1. **VLMs answer from priors, not pixels, when the two conflict.** On a counting benchmark that deliberately contradicts memorised facts, o4-mini scores **20.25% accuracy with a 73.66% bias rate** — it says "four legs" when the image shows five [P/R]. This is the most important result here: *VLM accuracy on familiar content systematically overstates accuracy on your data*. Any adoption decision based on a demo of dogs and cars is invalid.
2. **Contamination inflates vision scores by up to +45.68 points, and leakage is measurable in the pretraining corpus** — LAION contains 10.67% of OpenImages; ImageNet has 1.5% hard / 1.95% soft overlap [P]. Part of what looks like vision is retrieval.
3. **Self-consistency and prompt ensembling do not rescue weak VLM labeling.** The one 2026 study that tested directly found "gains are modest and inconsistent" and self-consistency failed to help [P]. This matches wave-1's effective-votes finding and should end any plan to ensemble prompts into accuracy.

### 1.4 What to build, in one sentence

A three-stage pipeline in which **geometry comes from specialised models, semantics from a small calibrated classifier, a VLM is used only to name and disambiguate, and conformal risk control gates what may be auto-accepted** — with the audit drawn from all auto-accepted items, never from the human-reviewed subset (§5.1).

---

## 2. Breakthrough candidates

Five things in the 2025–2026 literature are genuinely new rather than incremental.

### 2.1 Point-prediction VLMs as a second, structurally independent localiser

Classic VLM detection fails because boxes are emitted as text tokens with poor coordinate precision. Rex-Omni reformulates detection as *next-point prediction*: corner coordinates are emitted as discrete points rather than regressed inside a language head. A 3B MLLM reaches **53.8 COCO AP zero-shot and 49.7 LVIS AP**, "comparable to or exceeding regression-based models (e.g., DINO, Grounding DINO)" [P].

This breaks the clean "VLMs cannot do boxes" story — and more usefully, its errors are structurally different from a regression detector's. It fails on density and occlusion; a detector fails on rare vocabulary. That is exactly the independence an ensemble needs. Caveats: 3B, CUDA required, IDEA License 1.0 (not OSI) [R]. Molmo2 (4B/7B/8B, CC-BY-4.0) pursues the same pointing thesis and reportedly surpasses Gemini 3 Pro on pointing, with video pointing F1 38.4 vs 20.0 [P/R] — note the absolute number, which is the real story.

**Verdict: adopt as a GPU-optional second voter, never as the primary localiser.** [I]

### 2.2 Conformal risk control over a *selective* labeling policy

Replace "solve a threshold whose Wilson lower bound clears 0.95, then report that same bound" with split-conformal risk control: choose acceptance threshold λ on calibration data so the expected error rate of the accepted set is bounded by α with a finite-sample guarantee, then certify on disjoint audit data.

This converts the product claim from "our model is 92% accurate" to "of the N labels we auto-accepted, at most 5% are wrong with 95% confidence, and here is the audit." That is a different category of claim and it is the one buyers of annotation actually need.

It is now usable at this scale: full conformal prediction has been scaled to ImageNet-class problems using zero-shot VLMs as the scoring function; on 11 datasets at α = 0.1, empirical coverage was **90.7%** with a **mean prediction-set size of 2.3** (median 1.9) at ~30 ms/image [P]. Sets of size ~2 are operationally meaningful: size 1 is an auto-accept, size ≥2 is a human decision between named alternatives, empty or null-containing is an ontology gap.

**Verdict: adopt.** Highest-value item here, pure Python, no model changes. [I]

### 2.3 Detector-proposes / VLM-disambiguates / conformal-certifies

The inverse of the naive design. A detector or segmenter generates candidate regions; a small calibrated classifier scores them against the closed ontology; the VLM is invoked *only* when the top-2 are close and semantically confusable, and is asked a forced choice between exactly two named labels — never "what is this?"

Evidence: a frozen-detector + frozen-LM binding architecture (HKVLM) reaches 0.266 on RefCOCOg versus 0.003 for naive cosine matching — a 90× gain, but a low absolute number, telling you the *binding* is the hard part, not the proposal [P]. Pipeline-level, auto-labeled detection data trains downstream models to "70–80% of human-labeled mAP" [P], and Roboflow reports SAM3 auto-labeling at **88.1 mAP@50** on PPE classes — good, not 95 [R]. Pre-annotation as a *human accelerator* is well supported: a 2026 evaluation found a **median 35% reduction in annotation time with no accuracy loss** [P].

**Verdict: adopt the shape, with the forced-choice constraint.** [I]

### 2.4 Ontology stress test (paraphrase + null class) as a per-class admissibility gate

Before auto-labeling a class, paraphrase its name three ways, add an explicit `"none of these"`, and measure label stability and null-rate on positives. Classes that are unstable or null-happy are linguistically defined rather than visually grounded; they must be excluded from auto-accept *before* any threshold is solved.

Prompt sensitivity is documented and severe enough that a dedicated method (MVP) exists to decouple templates from class names; adding random characters to a class name can *improve* accuracy ("structured noise ensembling"), which is proof the decision boundary is partly lexical [P]. On the null side, VLMs collapse: on fine-grained negative queries accuracy drops **from ~80% to ~20%**, with InternVL3.5-14B worst at 20% [P].

Nobody ships this as a gate. It is cheap (3× prompt cost on ~20 images per class), deterministic, and yields a per-class boolean the pipeline can key on — attacking the 95% problem from the ontology side. **Verdict: adopt as a pre-flight.** [I]

### 2.5 Prior-override probing, and cross-view voting as evidence

*Prior-override probing* is a small per-ontology audit set of counterfactual images — five-legged dogs, three-wheeled cars — used to measure how often the model answers from memory. VLMBias reports a 73.66% bias rate for o4-mini; supplying explicit visual context raises accuracy **17.05% → 38.14%** and drops the bias rate **75.70% → 35.12%** [P/R]. Those effect sizes say that for many questions the model is doing retrieval, and that a prompt forcing attention to the image changes the answer more than a model upgrade would. **Adopt, small and cheap.** [I]

*Cross-view voting* (full frame, 2× upscale, centre crop, tile grid) is worth implementing but the evidence is mostly negative. Multi-scale tiling inference for dense-scene pseudo-labeling exists [P], and the direction is right for small objects — but the 2026 agricultural study found self-consistency gains "modest and inconsistent" and recommended retrieval grounding instead [P]. A trust predictor fusing geometric alignment, object separation, detection quality and VLM confidence reached only **0.674 AUROC** [P]. **Implement as an experiment with a kill criterion**: if wave-1's all-wrong mass `c` does not fall, delete it. [I]

---

## 3. Task-by-task evidence

### 3.1 Image classification (single-label, closed ontology)

The only visual task where VLMs are within striking distance.

| Setting | Result | Source |
|---|---|---|
| 5-task average, top of leaderboard | **87.5%** (Gemini 4 Argon); GPT-6.1 Terra 85.8; GPT-6 Astra 83.4 | [R] Vision Evals |
| Claude Opus 4.7, same eval | 73.13% overall, 9th of 63; object understanding 85.7% | [R] |
| 27 agricultural datasets, MCQA | Gemini 3 Pro **62%**; best open Qwen-VL-72B **42%**; supervised YOLO11 higher | [P] |
| ImageNet-ReaL zero-shot, GPT-4o | **81.4%** | [P] AURA |
| Food-101, Qwen3-VL | **90.8%** | [P] AURA |
| Kinetics-400 (video action) | Gemini **93.6%**, GPT-5-mini **93.3%** | [P] AURA |
| CUB-200 fine-grained, supervised Swin | 87.6% | [P] AURA |
| CUB-200 zero-shot CLIP / LiT | 51.55% / 63.96% | [P] |
| CelebA attributes, LLaVA-NeXT | 79.5% raw; **89.1% re-annotated**; cost <1% of manual | [R] |

Three regimes are visible and must not be conflated. *Generic, visually distinctive, well-represented* classes (Kinetics, common food) land at 90–94% — not 95. *Fine-grained or specialist* (species, materials, agricultural pests) collapse to 42–64% zero-shot, and fine-tuning closes most of it: the best CUB-200 entry in that table is a supervised Swin at 87.6%, not a VLM [P]. *Prior-saturated* classes have inflated and unstable accuracy (§3.10).

One correction to note: the AURA authors claim "VLMs excel at fine-grained tasks (CUB-200)" while their own table lists **Swin**, a supervised model, as the CUB-200 annotator [P]. That is the kind of claim/table mismatch that gets cited to justify VLM adoption on fine-grained work.

**Verdict: 95% precision is reachable only with abstention, only at the top of the confidence distribution, and the coverage is unmeasured publicly** — see §6.6.

### 3.2 Attribute tagging and multi-label

Worse than single-label by construction, because each additional label is an independent chance to hallucinate. Caption-level object hallucination for good 2026 models runs at **5.7–7.0%** (LLaVA-OneVision-2-8B 5.7%, Qwen2.5-VL-7B 6.6%, InternVL3-8B 7.0%), versus 28.2% for LLaVA-1.5 [P]. Attribute tags derived from captions inherit that as a **precision ceiling of ~93–94%** before any other error. Multi-image settings are worse — a fine-grained multi-image hallucination benchmark (MIOH) was introduced in 2026 precisely because single-image evaluation overstates performance [P].

**Verdict: no. Attribute tags are proposals for human review, always.**

### 3.3 Captioning

Not a precision-scored task, so "95%" is not well-defined. Florence-2-large reports 135.6 CIDEr on COCO [P, via R3], competitive for 0.77B. The practical value is **retrieval and dataset triage**, not labels: captions make a dataset searchable and near-duplicates findable. Treat caption text as an index, never an annotation.

### 3.4 OCR and document understanding

The most misunderstood task, because headline DocVQA numbers (GPT-5.4 at **96.2%** [R]) look like they clear the bar. They do not generalise.

| Benchmark | Result | Source |
|---|---|---|
| DocVQA, GPT-5.4 | 96.2% | [R] provider card |
| KITAB-Bench, best PDF→Markdown | **65%**; VLMs beat classic OCR by 60% on character error rate | [R] |
| JaWildText (Japanese scene text), best of 14 open VLMs | **0.64** across three tasks | [P] |
| Hard-OCR suite, 17 frontier models | best passes **30.7%**; losses on tables, charts, footnotes, spatial reasoning | [R] |
| Instrument/gauge reading | best **30.2%** real, 26.3% synthetic | [P] |
| VISTA-Bench (visualised text) | font size dominates: 9 pt degrades sharply, 32–48 pt improves | [P] |

Two different tasks hide under "OCR". *Transcription* of clean printed high-resolution text is solved — by a dedicated OCR model (PaddleOCR-VL, GLM-OCR, MinerU) at 0.9B parameters, not by a frontier VLM [R]. *Structured extraction* — field values, table cells, which footnote belongs to which column — is at 30–65%. The gap between 96% DocVQA and 30.7% on a hard suite is the gap between "answer a question about a document someone already read" and "read the document".

**Verdict: transcription yes, with a non-VLM OCR; field extraction no.**

### 3.5 Counting

The clearest failure in the literature, and the one most likely to be believed solved because a demo worked.

| Setting | Result | Source |
|---|---|---|
| Roboflow Vision Evals counting subtask, Claude Opus 4.7 | **30%** | [R] |
| GPT-5, 10 counting tests | **4/10 (40%)**, inconsistent across repeated prompts | [R] |
| Molmo2, best open model | **35.5** vs 29.6 for competitors | [P] |
| CountBench (≤10 objects, clean scenes), Qwen3.5-27B | 0.978 | [R] |
| Compositional counting, Qwen3-VL-8B | 79.3% vs 92.3% single-class | [P] |
| Counterfactual counting (VLMBias), o4-mini | **20.25%**, bias rate 73.66% | [P/R] |

CountBench at 0.978 and Roboflow at 30% are not contradictory — they measure different things. CountBench asks "how many cats" with ≤10 clearly visible cats in a clean image. Roboflow asks the model to count in a real photograph. The moment objects are dense, occluded or numerous, the number collapses; and on the VLMBias counterfactual set, where the expected count conflicts with the visible count, the model reports the expected count 74% of the time.

**Verdict: never auto-accept a count.** Use a counting model (CountGD; SAM3Count reports state of the art on five image benchmarks [P]) with a human.

### 3.6 Object detection (box output)

| Setting | Result | Source |
|---|---|---|
| GPT-5 on RF100-VL | **1.5 mAP@50:95** | [R] |
| Gemini 2.5 Pro on RF100-VL | **13.3 mAP** | [R] |
| Grounding DINO, RF100-VL zero-shot | **15.7 mAP**; MLLMs <2% on medical | [P] |
| Grounding DINO few-shot, RF100-VL | 33.3 mAP | [P] |
| Gemini 3 Pro, industrial defects, 300 tickets / 412 defects | **45% usable at IoU 0.5**; ~74% at a loose threshold | [R] practitioner |
| Qwen3-VL, wood-defect detection | precision **0.24** zero-shot; 0.56 few-shot | [R] practitioner |
| Rex-Omni 3B, point-prediction | **53.8 COCO / 49.7 LVIS** zero-shot | [P] |
| WeDetect, open-vocab retrieval | 41.6 COCO / 28.9 LVIS, 30 FPS | [P] |

Two regimes again. On COCO-like content a well-engineered point-prediction MLLM matches regression detectors (53.8 vs 52.5). On domain-shifted high-resolution small-object work — what a dataset platform actually receives — everything collapses: 1.5–15.7 mAP zero-shot, 45% usable boxes on defects at IoU 0.5, 0.24 precision on wood defects. Practitioner reports converge: VLMs can point at a region, they cannot measure it.

**Verdict: no. Boxes are not a VLM task.** Use a detector, use point-prediction models as a second opinion, let a human place the final box.

### 3.7 Segmentation

SAM 3 achieves **54.1 cgF1 on SA-Co/Gold against a human baseline of 72.8**, which Meta describes as "75–80% of human performance" and "2× the accuracy of existing systems" [R/P]. SA-Co covers 270K unique concepts, over 50× existing benchmarks, exhaustively annotated [P]. An extraordinary achievement — and still 19 points short of human on the benchmark built to measure exactly this. Hybrid approaches using a VLM box as a spatial prior for a lightweight mask decoder (Qwen3-VL-Seg, +17M parameters) are the right architecture [P] but do not change the ceiling, which is the segmenter's.

**Verdict: no for auto-accept; yes as an ~80%-of-the-work pre-annotation**, consistent with the 35% median time saving [P].

### 3.8 Spatial reasoning

The most damning numbers here, because they are near chance: "state-of-the-art VLMs achieve only **49–54%** accuracy on spatial relations — barely better than chance — frequently confusing basic directions" [P]; SPATIAL-DISE tested 32 models at an average **28.4%** against 25% random chance [P]; the best trust predictor for spatial claims reaches 0.674 AUROC and 61.9% coverage at a 60% target accuracy [P].

**Verdict: no, and do not build features that depend on it** — left/right, relative depth, orientation attributes.

### 3.9 Defect inspection

GPT-5 on 15 defect tests: **12/15 (80%)**, finding gross defects and cracks but missing small glass-edge cracks [R]. Gemini 3 Pro boxes on real tickets: 45% usable at IoU 0.5 [R]. Claude Opus 4.7 on Roboflow's defect subtask: **80%** [R].

**Verdict: no.** 80% on a 15-item test has a 95% interval of roughly [55, 93] — evidence of nothing at that sample size [I]. Defect work needs a domain detector plus human review; the VLM's real contribution is the *explanation* ("crack along the bezel, upper left"), not the decision.

### 3.10 Failure taxonomy, with numbers

| Failure mode | Magnitude | Source |
|---|---|---|
| Prior override (answers from memory, contradicting pixels) | 73.66% bias rate; 20.25% accuracy on counterfactual counts | [P/R] |
| Object hallucination in captions | 5.7–7.0% good models; 28.2% LLaVA-1.5 | [P] |
| Counting, real photographs | 30–40% correct | [R] |
| Compositional counting | 79.3% vs 92.3% single-class | [P] |
| Small objects / high resolution | RF100-VL 1.5–15.7 mAP; defect reports consistent with resolution loss dominating | [P/I] |
| Fine-grained classes | 51.6–64.0% zero-shot on CUB-200 | [P] |
| Text in images | 30.7% pass on hard suite; 9 pt fonts degrade sharply | [R/P] |
| "None of the above" / negative queries | ~80% → ~20% accuracy | [P] |
| Spatial relations | 49–54%; 28.4% across 32 models | [P] |
| Verbalized confidence calibration | ECE 0.27–0.40 | [P] |
| Cultural / geographic bias | VLMs infer location from visual cues, then answer from geographic priors | [P] |

The geographic line deserves emphasis: accuracy is systematically higher on images from well-represented regions [P]. For a dataset platform this is a **dataset-level** risk, not a per-image one — the auto-labeled subset will be demographically skewed toward whatever the model has seen.

---

## 4. Evidence table

| Model | Task | Reported figure | Benchmark | Class | Replicated? |
|---|---|---|---|---|---|
| Gemini 4 Argon | 5-task average | 87.5% | Roboflow Vision Evals | [R] | Independent eval, one vendor |
| GPT-6.1 Terra / GPT-6 Astra | 5-task average | 85.8% / 83.4% | Vision Evals | [R] | same |
| Claude Opus 4.7 | 5-task average | 73.13% (9/63) | Vision Evals | [R] | same |
| Claude Opus 4.7 | Counting / defects | 30% / 80% | Vision Evals | [R] | same |
| Gemini 3.1 Pro | MMMU | 83.8–85.1% (aggregators disagree) | pricepertoken / provider card | [R] | Partly |
| GPT-5.4 | DocVQA | 96.2% | provider card | [R] | Partly |
| Gemini 3 Pro / Qwen-VL-72B | 27 agri datasets, MCQA | 62% / 42% | AgML | [P] | No |
| Gemini / GPT-5-mini | Kinetics-400 | 93.6% / 93.3% acc | AURA | [P] | No |
| GPT-4o / Qwen3-VL / Swin | ImageNet-ReaL / Food-101 / CUB-200 | 81.4% / 90.8% / 87.6% | AURA | [P] | No |
| CLIP / LiT | CUB-200 zero-shot | 51.55% / 63.96% | CUB-200-2011 | [P] | Yes, widely |
| LLaVA-NeXT | CelebA attributes | 79.5% (89.1% re-annotated) | CelebA | [R] | No |
| GPT-5 | Counting / defects | 4/10 (40%) / 12/15 (80%) | Roboflow 80+ suite | [R] | No |
| GPT-5 / Gemini 2.5 Pro / Grounding DINO | RF100-VL detection | 1.5 / 13.3 / 15.7 mAP (33.3 few-shot) | RF100-VL | [R/P] | Yes, benchmark public |
| Rex-Omni 3B / WeDetect | COCO / LVIS zero-shot | 53.8 / 49.7 and 41.6 / 28.9 AP | COCO, LVIS | [P] | No |
| SAM 3 | Concept segmentation | 54.1 cgF1 (human 72.8) | SA-Co/Gold | [R/P] | Vendor-run; benchmark public |
| Molmo2 | Counting / video pointing | 35.5 (vs 29.6); F1 38.4 (vs 20.0) | authors' | [P] | No |
| Gemini 3 Pro | Defect box localisation | 45% usable @IoU 0.5 | 300 real tickets | [R] practitioner | No |
| Qwen3-VL | Wood-defect boxes | precision 0.24 → 0.56 few-shot | internal | [R] practitioner | No |
| Roboflow SAM3 auto-label | PPE segmentation | 88.1 mAP@50 | internal PPE | [R] vendor | No |
| Auto-label → detector / pre-annotation | Downstream mAP / annotation time | 70–80% of human mAP; −35% median time | VOC, COCO, video seg. | [P] | No |
| Qwen2.5-VL-7B / InternVL3-8B | Caption hallucination | 6.6% / 7.0% | authors' | [P] | No |
| 14 open VLMs / 17 frontier models | Japanese scene text / hard OCR | 0.64 avg / best 30.7% pass | JaWildText, hard-OCR | [P/R] | No |
| Best model | PDF→Markdown / instrument reading | 65% / 30.2% real | KITAB-Bench, gauge | [R/P] | No |
| 32 models / SOTA VLMs | Spatial reasoning | 28.4% (chance 25%) / 49–54% | SPATIAL-DISE et al. | [P] | No |
| o4-mini / InternVL3.5-14B | Counterfactual counting / fine-grained negatives | 20.25% acc, 73.66% bias / 20% (from ~80%) | VLMBias, authors' | [P/R] | No |
| CLIP ViT-B/16 + full conformal | Coverage / set size | 90.7% @α=0.1; mean 2.3 | 11 datasets | [P] | No |
| Contaminated VLMs / LAION | Score inflation / leakage | up to +45.68% / 10.67% of OpenImages; ImageNet 1.5–1.95% | various | [P] | No |
| VLM agentic labeling | Malaria cells | 95% vs SigLIP 49%, **n=100** | vendor blog | [R] | No — §5.1 |
| Grounded SAM materials | "98% label accuracy" | conditional on human-verified samples; headline 89/92/64% | CVPR 2026 | [P] | No — §5.1 |

---

## 5. Hype and dead ends

### 5.1 Two "98% / 95%" claims and why both are void

**The 98% materials claim.** A CVPR 2026 paper reports a Grounded-SAM auto-labeling pipeline at "98% label accuracy on human-verified samples" [P]. Read the conditional: the 98% is measured only on samples humans verified. Whatever the pipeline got wrong was removed from the denominator by the human — it measures *human* precision, not the pipeline's. The same paper's headline accuracies are **89% (FMD), 92% (Google-test), 64% (DMS-test)** [P]. The honest number is 64–92%, and the 98% will be quoted in sales decks for years.

**The 95% vendor claim.** A vendor blog reports VLM-based agentic labeling at 95% versus SigLIP at 49% on malaria cell classification, across **100 samples** [R]. Beyond the straw-man baseline, 95/100 has a 95% Wilson interval of roughly [88.8, 97.8] [I] — it is *statistically incapable* of supporting a 95% precision claim. This is wave-1's winner's-curse defect in the wild, and it is the most common form of misleading auto-labeling evidence in the market.

**Design consequence:** every precision number the platform reports must carry `{value, n, ci}`, be computed on a randomized audit drawn from *all* auto-accepted items, and record the audit's provenance. `packages/dataset_evaluation/metrics.py` currently returns bare floats (wave-1 R4), so this is a prerequisite, not a nicety.

### 5.2 Dead ends

- **VLM boxes as ground truth.** 1.5–15.7 mAP zero-shot, 45% usable boxes at IoU 0.5, 0.24 precision on wood defects. Wave-1's "never use VLM boxes as ground truth" stands, and 2026 practitioner evidence strengthens it.
- **Prompt ensembling / self-consistency as an accuracy lever.** "Gains are modest and inconsistent"; self-consistency failed to help [P]. This is the correlated-errors result in practice — the members are not independent, so averaging does not reduce the all-wrong mass. Keep ensembling only as disagreement routing.
- **Verbalized confidence as a gate.** ECE 0.27–0.40, high stated confidence on wrong answers, and "no explicit assessment of visual support" [P]. Temperature-scale on a gold set instead; `packages/dataset_ensemble/calibration.py` already does this.
- **"Bigger models will fix counting / spatial / boxes."** MMMU has climbed into the low-to-mid 80s (Gemini 3.1 Pro 83.8 on one aggregator, 85.1 on another; GPT-5 79.1) while counting sat at 30–40% and spatial reasoning at 28.4% against 25% chance [R/P]. These are architectural, not capacity, failures — no mechanism enumerates instances. Betting a roadmap on the next release bets against three consecutive generations.
- **VLM-as-judge for label quality.** **[U]** — no 2026 study was found validating it as a substitute for human audit on labeling tasks, and a judge sharing a backbone with the annotator shares its errors. Use it to prioritise the human queue, never to certify.
- **Florence-3.** No official release found; wave-1's finding stands [U]. Florence-2 remains the small-VLM workhorse (MIT, 0.23B/0.77B).
- **Zero-shot open-set rejection.** Accuracy falls from ~80% to ~20% on fine-grained negatives [P]. The fix is structural: explicit null class, conformal calibration, and empty/null sets treated as ontology gaps — converting an impossible model behaviour into a tractable pipeline behaviour.

---

## 6. Design for this codebase

### 6.1 Principles

1. **Geometry from geometry models, semantics from semantics models.** Detectors, segmenters and OCR produce coordinates; classifiers and VLMs produce names. Never ask one to do the other's job.
2. **The VLM is a namer, not a seer.** Highest-value uses: ontology mapping (free text → canonical class), forced-choice disambiguation between two named candidates, explanation text for reviewers.
3. **Every auto-accept is a statistical claim and must be certified** — conformal risk control, disjoint fit/certify splits, randomized audit.
4. **Measure `c`, not accuracy.** Wave-1's arithmetic applies to visual votes exactly as it applied to text votes.

### 6.2 Module layout

```
packages/
  vision_local/                 # NEW — optional extra: pip install curlset[vision]
    registry.py                 # hash-pinned manifest, lazy download, licence metadata
    classify.py                 # SigLIP 2 ONNX: zero-shot + linear probe on frozen features
    detect.py                   # Grounding DINO Swin-T ONNX; optional RF-DETR
    segment.py                  # SAM 2.1 box-prompted (ONNX)
    ocr.py                      # PaddleOCR PP-OCR ONNX, page → tokens + boxes
    embed.py                    # DINOv3 ViT-S/14 embeddings (shared with R5)
  dataset_ensemble/
    views.py                    # NEW — deterministic view fan-out (full / 2x / crop / tiles)
    prior_audit.py              # NEW — counterfactual probes, per-class bias rate
    ontology.py                 # NEW — paraphrase + null-class admissibility test
    selection.py                # EXTEND — conformal risk control replaces Wilson self-cert
  dataset_vision/
    tasks.py                    # NEW — task router: classification|detection|segmentation|ocr
    policy.py                   # NEW — per-task acceptance policy + coverage accounting
```

`pyproject.toml` gains one optional dependency group. Core install stays `fastapi/pillow/httpx` — no torch, no CUDA, no download at import time. `vision_local` is imported lazily and degrades to a structured "unavailable" error, preserving the local-first CPU guarantee.

### 6.3 The pipeline

**Stage 0 — ontology admissibility** (once per label schema). Per class: 20 images, 3 paraphrases, force a null option. Compute label stability and null-rate. Classes below a fitted floor are marked `not_auto_labelable` and routed permanently to humans. Costs a few dollars and prevents the most expensive error class — a class that is linguistically defined and visually undefined.

**Stage 1 — geometry.** Detection: Grounding DINO Swin-T (CPU, ONNX) prompted with class names; optionally Rex-Omni or a point-prediction model as a structurally independent second voter on GPU machines. Segmentation: SAM 2.1 box-prompted from those boxes. OCR: PaddleOCR tokens and boxes. Nothing here is a VLM.

**Stage 2 — semantics.** SigLIP 2 zero-shot over the closed ontology gives a probability vector per image or crop. After ~50–200 gold labels per class, replace with a logistic probe on frozen DINOv3/SigLIP embeddings — wave-1 R3's recommendation, and the AURA table's supervised rows are the evidence for where fine-grained accuracy comes from.

**Stage 3 — VLM, narrowly.** Invoke only when (a) top-2 probe probabilities are within a margin and (b) the candidates are a declared confusion pair. Ask a forced choice between exactly two named labels plus "neither". Cost is bounded by the margin — typically 5–15% of items. Frontier models go through the existing `provider_gateway`; the local option is Qwen3-VL (Apache-2.0) or InternVL3.5 (MIT) via Ollama, which `ollama_provider.py` already supports.

**Stage 4 — accept.** A conformal prediction set is built per class. Set size 1 and score below threshold → `AUTO_ACCEPT`. Set size 2–3 → `HUMAN_REVIEW` with the candidates shown. Empty set or null present → `REJECT` and flag the ontology. This maps onto the existing `Band` enum without changing its semantics.

### 6.4 What changes in `selection.py`

Current behaviour solves a per-class Wilson threshold and returns that same bound as the certificate (wave-1 L5, winner's curse). Replace with:

```
fit_threshold_crc(calibration_scores, losses, alpha) -> lambda
certify(audit_scores, lambda, alpha) -> Certificate(coverage, n, method, low, high, audit_ids)
```

Fit λ on half A by conformal risk control over the selective loss; certify on a **pre-registered randomized audit** from half B drawn from all auto-accepted items; persist `audit_ids` and bind the certificate to `dataset_version_id` and the manifest hash (wave-1 R8). The mathematics is already correct in wave-1 (Angelopoulos et al., arXiv 2208.02814); this only says where it plugs in for vision.

### 6.5 What changes in `types.py`

Add three fields to `ModelVote`: `view` (`full` / `up2x` / `crop` / `tile_r{row}c{col}` / `paraphrase_{n}`), `task` (routes aggregation; detection votes carry boxes in `raw`), and `predictor` (`llm` / `vlm` / `probe` / `detector` / `ocr`, for independence accounting). With `view` and `predictor` first-class, the existing φ estimator can compute co-error **within** and **across** view families — answering §2.5 empirically rather than by assertion.

### 6.6 The experiment that should be run first

**Measure the coverage–precision curve of VLM image classification at 95% precision.** Not found anywhere in the 2025–2026 literature at the time of writing [U] — every paper reports accuracy, not coverage at a precision floor. This is a genuine gap and a chance to publish the first number.

Protocol: 10 public datasets × 3 ontologies, 500 images each. Per dataset: SigLIP 2 zero-shot, a linear probe on frozen features with 100 labels/class, and one frontier VLM. Sweep the acceptance threshold; plot precision (Clopper–Pearson) against coverage; report the coverage at which the lower bound crosses 0.95. Pre-register the audit.

Expected outcome [I]: probe ≫ VLM on fine-grained, VLM competitive on generic, coverage@95% somewhere in 0.4–0.7 for generic classes and near 0 for fine-grained. If coverage@95% is under ~0.3 on the codebase's real ontologies, the honest product is pre-annotation, not auto-labeling — and it is far better to know that before building the UI.

### 6.7 Cost model

Per 1,000 images at 1024×1024, from published token accounting [R]: Gemini 3.1 Pro **$2.06**, GPT-5.5 **$5.12**, Claude Opus 4.7 **$6.99**; at 256×256 these fall to $0.52 / $0.32 / $0.44. A 5-view fan-out on 10,000 images with Gemini costs about $103. **Cost is not the constraint; precision is.** Local Qwen3-VL 8B on CPU costs only electricity but is slow enough that it belongs in overnight batch jobs, with the frontier path used interactively.

### 6.8 What not to build

A "VLM auto-label" button that writes labels without a `pending_review` state (wave-1 R3's mandate is correct and permanent, not scaffolding); a counting feature; a spatial-relation attribute; a prompted open-set "other" detector; or a benchmark score displayed next to a dataset as evidence of quality.

---

## 7. References

**Peer-reviewed / archival**

1. Popov et al., *Roboflow100-VL*, NeurIPS 2025 D&B. arXiv:2505.20612.
2. Carion et al., *SAM 3: Segment Anything with Concepts*, arXiv:2511.16719; repo github.com/facebookresearch/sam3.
3. Jiang et al., *Detect Anything via Next Point Prediction* (Rex-Omni), CVPR 2026. arXiv:2510.12798.
4. Fu et al., *WeDetect*, CVPR 2026.
5. Bai et al., *Qwen3-VL Technical Report*, arXiv:2511.21631.
6. Wang et al., *InternVL3.5*, arXiv:2508.18265.
7. Ai2, *Molmo2*, arXiv:2601.10611.
8. Xiao et al., *Florence-2*, CVPR 2024.
9. *Label Curation Using Agentic AI* (AURA), arXiv:2602.02564.
10. *Are VLMs ready to zero-shot replace supervised models?* (27 AgML datasets), arXiv:2512.15977.
11. *Vision Language Models are Biased*, ICLR 2026. vlmsarebiased.github.io.
12. *Your VLM Can't Even Count to 20*, arXiv:2510.04401; *Understanding and Correcting Counting Failures in VLMs*, arXiv:2607.09544.
13. *MLLMs Hallucinate under Fine-grained Negative Queries*, arXiv:2603.17662.
14. *Not Every Mention Is a Claim*, arXiv:2610.23610.
15. *Predicting When to Trust VLMs for Spatial Claims*, arXiv:2601.11644.
16. Huang et al., *SPATIAL-DISE*, ICLR 2026.
17. *A Behavioral Safety Audit of VLMs* (ECE 0.27–0.40), arXiv:2608.02790.
18. *Scaling Full Conformal Image Classifiers*, arXiv:2609.37298.
19. Park et al., *Contamination Detection for VLMs Using Multi-Modal Semantic Perturbation*, ICLR 2026. arXiv:2511.03774.
20. *Data Leakage in Visual Datasets*, arXiv:2508.17416.
21. *An Evaluation of Hybrid Annotation Workflows on High-Ambiguity Imagery*, arXiv:2510.21798.
22. *Leveraging VLMs as Weak Annotators*, arXiv:2605.00480.
23. *Harnessing the Power of Foundation Models for Accurate Material Classification*, CVPR 2026. arXiv:2603.17390.
24. *Auto-Labeling Data for Object Detection*, arXiv:2506.02359.
25. *Vision-language models see more about agriculture than...*, arXiv:2609.09417.
26. *Do VLMs Measure Up? Visual Measurement Reading*, CVPR 2026.
27. *VISTA-Bench*, arXiv:2602.04802; *JaWildText*, arXiv:2603.27942.
28. *Efficient Test-Time Scaling for Small VLMs* (TTAug), ICLR 2026. arXiv:2510.03574.
29. *HKVLM: Faithful Reasoning Grounding by Binding*, arXiv:2606.28862.
30. *Frontier VLMs: Architectural Evolution through 2026*, arXiv:2501.02189.
31. *Comparative Study of Zero-shot and Fine-tuned Models on CUB-200-2011*, doi:10.54254/2755-2721/2025.LD27853.
32. Via wave-1: Kim et al. arXiv:2506.07962; Angelopoulos et al. arXiv:2208.02814; Northcutt et al. arXiv:2103.14749.

**Vendor / leaderboard / practitioner (reported, not replicated)**

33. Roboflow, *Vision Evals* leaderboard, playground.roboflow.com/evals (accessed 2026-11-04; rate-limited during research, figures from indexed summary).
34. Roboflow, *Claude Opus 4.7: Vision Benchmarks*, 2026-05-06.
35. Roboflow, *GPT-5 for Vision: Results from 80+ Real-World Tests*, 2025-08-07.
36. Roboflow, *What does it cost to process an image with a vision model?*, 2026-05-04.
37. Roboflow, *Natural Language Image Annotation* (SAM3, 88.1 mAP@50 PPE), 2026-07-02.
38. Roboflow, *Gemini 3 Pro Sets New Vision Benchmarks*, 2025-12-31.
39. Roboflow, *Best Object Detection Models 2026*, 2026-05-04; *Best Computer Vision Models 2026*, 2026-07-15.
40. Voxel51, *Auto-Labeling with VLMs*, 2026-07-30.
41. A. Seth, *Can Gemini's Bounding Boxes Localize Product Defects?*, 2026.
42. JAMK Arena, *Qwen-VL VLMs for zero- and few-shot object detection*, 2026-01-23.
43. Moondream model cards, moondream.ai/models.
44. pricepertoken, *MMMU Leaderboard*, accessed 2026-11-03; railwail, *Claude vs GPT vs Gemini: The 2026 Vision Benchmark*, 2026-05-16.
45. invoicedataextraction, *OCR Benchmarks 2026* (KITAB-Bench), 2026-10-21; clh124, *Awesome-Hard-OCR-LMM*.
46. llm-stats, *CountBench leaderboard*, 2026-11.
47. discuss.roboflow.com, *Can't find Grounding-DINO model* (Grounding DINO retired from Auto Label for SAM 3), 2025-12-09.

---

## Appendix — Confidence in this report's own conclusions

| Conclusion | Confidence | What would change it |
|---|---|---|
| No VLM clears 95% precision across tasks at full coverage | **High** — five benchmark families agree | A model with a counting/spatial mechanism; would show first on SPATIAL-DISE and RF100-VL |
| 95% classification precision is reachable *with abstention* | **Medium** — implied by accuracy distributions, not measured | The §6.6 experiment; the key open question |
| Counting and spatial will not be fixed by scale | **High** — three generations flat | A paper reporting >70% on compositional counting |
| Boxes and masks are not VLM tasks | **High** | Point-prediction models closing the RF100-VL gap |
| Conformal risk control is the right certification mechanism | **High** | — (a theorem, conditional on exchangeability) |
| Cross-view agreement predicts correctness | **Low** — 0.674 AUROC and one null result | A study showing coverage@95% improves with view count |

Claims deliberately **not** made: that any specific model will be superseded, or by what; anything about audio or text annotation (out of scope); that Florence-3 exists (**[U]**); or that "beyond-human" labeling is achievable. The one task where models plausibly exceed non-expert humans — fine-grained species identification — exceeds them by recalling training data, which is precisely the contaminated capability this report argues against trusting.
