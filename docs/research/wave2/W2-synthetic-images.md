# W2 — Synthetic Image Data: 2026 State of the Art

**Date:** 2026-11-04 · **Scope:** synthetic *image* generation for detection/segmentation/classification, local-first, CPU-first, measurable on gold.
**Relationship to wave 1:** R6 covered collapse, text synthesis, Azizi/Ghiasi/GeoDiffusion/DetDiffusion, BlenderProc/Kubric and the gate stack. This report does **not** re-derive those. It covers what changed in 2025–2026: layout- and mask-conditioned generation with construction-time labels, 3D-asset generation as a label-exact primitive, world models with downstream numbers, dataset distillation at its 2026 frontier, licence drift, and the measurement literature that says most of the field's metrics are decorative.

**Marker convention.** **[P]** primary source read (paper HTML/PDF, official licence page, court filing). **[R]** independently replicated — a *different* group reproduced the number. **[I]** my inference or derivation, not stated by a source. **[U]** unverified: secondary reporting, vendor blog, or a primary source I could not open. Numbers without a marker are definitions or arithmetic.

---

## 1. Executive summary

**The one-sentence verdict.** Synthetic image data helps when the binding constraint is *missing supervision for a label space*, not when it is *model capacity or generic diversity*: expect **+0 to +2 mAP** on an established benchmark with ample real data, **+4 to +10 AP** when teaching a generalist detector a taxonomy it has no real labels for, and **+13 to +21 mAP** in the narrow regime of a few hundred real images plus a large domain gap — and **−7 points** if you train on synthetic alone.

That ordering is the most important finding of this wave, and it inverts how the field markets synthetic data. Almost every paper reports the small regime (+0.9 to +2.5) because that is what publishes. Almost every *customer* of a dataset platform is in the large regime — a new taxonomy, rare classes, a site with no labelled data — where the numbers are 5–10× bigger and the experiments are 5× rarer.

**Five findings that are new relative to R6.**

1. **Labels can now be exact by construction, and there are only three honest ways to get them**: geometry-derived (3D render, or layout→image with the layout retained), mask-derived (mask→image reusing the mask), and compositing (label = paste transform). Everything prompt-only is post-hoc labelling wearing a costume. The 2026 state of the art makes the first two work: MatchMask reports **67.5 → 74.3 mIoU** on PASCAL VOC (venue abstract; PDF body unread — see §7) [P], SENSE reports **+1.34 to +2.54 mIoU** with "dense scene composition and fine instance fidelity" as the governing factors [P], and SceneP2F reports count error (mTCE) **0.817 vs 2.744** for a prior method — the generated image contains the objects the layout asked for [P].
2. **The biggest legitimate 2026 numbers are taxonomy induction, not accuracy.** SOC lifts LVIS AP **20.1 → 29.8 (+9.7)** by fine-tuning a grounded detector on 50 K synthetic images with no LVIS training data [P]; TMI reports **+4.0 overall / +9.5 rare AP** [P]. Not "synthetic is better" — "synthetic is the only supervision available for these labels".
3. **Copy-paste still wins at zero cost, and the honest comparison is embarrassing for diffusion.** SOC: 12.79 vs **9.32 AP** for Copy-Paste from scratch on COCO [P]; SceneP2F: 31.0 vs **26.8 mAP** on UAVDT buses [P]; Ghiasi et al. remains the reference at **+1.5 box AP / +3.6 mask AP on LVIS rare** [P]. Any synthetic pipeline that cannot beat copy-paste on the customer's own gold is not worth the GPU.
4. **FID and CLIPScore do not predict downstream value, and 2026 gives a clean demonstration.** Across **275,472** synthetic skin-lesion images and 11 metrics, FID-based selection beat random by **+0.036 macro-F2** for one lesion type and gave "no measurable advantage over random sampling" for another; no metric worked across classes [P]. A 2026 segmentation study agrees from the other direction: no fidelity metric predicted mIoU gain — scene density and instance fidelity did [P].
5. **Licence drift is now the dominant deployment risk, not quality.** The best open weights moved *backwards*: FLUX.2 (15 Jan 2026) ships a 4 B **Apache-2.0** "Klein" model but its 9 B sibling is non-commercial, and Qwen-Image 2.1 (20 Sep 2026, 7 B) is reported as "FOR NON-COMMERCIAL PURPOSES ONLY" [P/U]. The commercial-safe set is *smaller* in 2026 than in 2024.

**The single most promising unexplored combination** (§6): **certificate-carrying insertion** — take real, licensed objects, composite them into real backgrounds at sampled layouts, harmonize *only the seam* with a mask-constrained diffusion pass, inherit the label from the paste geometry, verify it by re-segmenting the label back out, and attach a conformal/Wilson certificate of label precision measured on gold plus an admission gate on downstream delta. Every component exists and is individually published; the *combination* — exact labels + a measured, certified precision floor + a version-bound downstream delta — appears in no paper I could find and in no vendor product. It is also the only synthetic method that inherits the platform's existing moat (certificates, provenance, byte-reproducible versions) instead of competing with NVIDIA on rendering.

---

## 2. Breakthrough candidates

Ranked by expected value per unit of engineering for a CPU-first, local, open-source platform.

### B1. Certificate-carrying insertion (CCI) — *the recommendation*

**What it is.** A four-stage pipeline whose labels are correct by construction and whose residual label error is *measured and bounded* rather than assumed:

1. **Object bank** from real, licensed images: SAM 3 (text-prompted concept segmentation) → masks; optionally SAM 3D or TRELLIS.2 to lift the object to a 3D asset for novel viewpoints. Both are open (SAM 3 under Meta's custom SAM License, SAM 3D open-source as of 19 Nov 2025, TRELLIS.2 MIT/4 B) [P].
2. **Layout sampling** from the *target* distribution, not the source: class co-occurrence, scale, truncation and occlusion priors estimated from the customer's real (possibly unlabelled) images.
3. **Composite + seam harmonization**: alpha-paste with the exact mask; run a diffusion inpaint restricted to a dilated ring around the mask. Interior pixels stay real. The label never changes because the geometry never changed.
4. **Certificate**: re-segment the claimed object with a *different* model family; require IoU ≥ τ else reject; then audit a random sample against human boxes and publish a one-sided lower bound on label precision, bound to the dataset version hash.

**Why this is the breakthrough and not a rehash.** The literature validates each stage separately — SceneP2F for layout fidelity, MatchMask for mask reuse, SOC for composition at scale, Ghiasi for paste — but every one of them reports downstream mAP and *assumes* its labels. None reports a label-precision interval, none gates on a paired downstream delta, and none binds the synthetic batch to a manifest hash. That is precisely the whitespace R7 identified for auto-labels, transposed to pixels.

**What is missing to claim it.** No published head-to-head of "composite + seam-only harmonization" vs "full diffusion generation" at equal label budget. That experiment is cheap on CPU (compositing is milliseconds) and is the platform's first real contribution, not a reimplementation.

### B2. Taxonomy bootstrapping from synthetic data

**What it is.** Use generation to *create the label space*, not to enlarge it: define a new taxonomy, generate/fine-tune with construction-exact labels, and ship the detector. Evidence: SOC **+9.7 LVIS AP** over its O365+GoldG baseline using 50 K synthetic images [P]; TMI **+4.0 AP / +9.5 rare AP** on LVIS [P]; FLORA **41.0 → 62.3 mAP** on a Roboflow-100 traffic dataset from 200 real + 500 synthetic images [P].

**Why it matters commercially.** This is the only synthetic story whose effect size survives contact with a buyer ("we have no labels for these 40 classes; you made a working detector in a week"). It is also measurable on gold by construction: hold out real images of the new classes.

**Risk.** Fine-tuning a *grounded* detector on synthetic data can degrade its original vocabulary (catastrophic forgetting). None of the papers above reports the backward-transfer number. That is a measurement the platform should own.

### B3. Targeted, not uniform, augmentation (TADA pattern)

**What it is.** Augment the examples the model has *not* learned early (forgetting-score / EL2N ranking), rather than a random 30–40 %. ICLR 2026: augmenting 30–40 % of data this way gives "up to **2.8 %**" accuracy gains across architectures on CIFAR-10/100 and ImageNet [P].

**Why it is a candidate.** It converts "how much synthetic data?" into "which 30 %?" — a question a dataset platform is uniquely positioned to answer because it already computes per-item model outcomes. Combined with CCI it yields *targeted exact-label* augmentation, which no paper reports.

### B4. 3D asset → render → real-domain refiner

**What it is.** SAM 3D / TRELLIS.2 turn a handful of real photos into textured assets; a renderer produces exact boxes, masks, depth and normals; a diffusion refiner trained on the customer's real images closes the appearance gap. This is the only route to *novel viewpoints* with exact labels — a capability CCI alone lacks.

**Evidence.** Cosmos-Drive-Dreams (world-model video, but the same "simulate then refine" logic): 3D lane F1 **+10.4 % rainy / +9.4 % foggy** on Waymo, **+6.4 %** on RDS-HQ, 3D detection LET-AP **0.625 → 0.634** [P]. Tremblay-style domain randomization: KITTI car AP **83.7 vs 79.7** with COCO-initialised weights [P, R6].

**Why it is ranked below CCI.** Rendering is a heavy dependency (Blender), asset licensing is murky, and the detector gain in the one careful 2026 study was **+0.9 LET-AP** — the same order as layout-to-image, at 10× the engineering.

### B5. Distillation as an *evaluation* product, not a training product

2026 SOTA is **60.4 % at 50 IPC on ImageNet-1K** (CoDA, ICLR 2026) [P] against ~70 % for full data — a 9–10 point deficit at 20 % of the data — and a June 2026 re-evaluation puts distilled sets *below* a simple coreset (**17.3 % vs 12.8 %**, 10 IPC) [P]. Not a data-generation breakthrough; a legitimate platform feature ("freeze a 500-image CI proxy") only if sold with a measured fidelity gap and never as a substitute.

---

## 3. Methods with numbers

### 3.1 Generative backbones: what is usable locally in 2026, and what it costs at 1024 px

| Model | Params | Licence (2026-11) | 1024 px cost | Usable in a commercial OSS product? |
|---|---|---|---|---|
| SDXL 1.0 | 3.5 B | CreativeML OpenRAIL++-M | 2–6 s on RTX 4090, 30 steps [U]; 600–800 img/h [U] | Yes, with use-restriction pass-through |
| SD 3.5 Medium / Large | 2.5 B / 8 B | Stability AI Community Licence; free commercial **under $1 M revenue**, registration required [P] | Large, 28 steps, 22 s on 4090 [U] | Yes below threshold; above → enterprise licence |
| FLUX.1 [schnell] | 12 B | Apache-2.0 [P] | 15–17 s, 20 steps, Q8 on 4090 [U] | Yes |
| FLUX.1 [dev] | 12 B | Non-commercial [P] | ~20 s on 4090 [U] | **No** |
| FLUX.2 Klein 4 B | 4 B | **Apache-2.0** [P] | ~8 GB VRAM class [P] | Yes — best current default |
| FLUX.2 [dev] 9 B / 32 B | 9 B / 32 B | FLUX.2-dev non-commercial [P] | 32 B "requires H100" [P] | **No** |
| Qwen-Image 1.0 | 20 B (MMDiT) | Apache-2.0 [P] | Heavy; 20 B class | Yes, but not CPU-realistic |
| Qwen-Image 2.1 | 7 B | reported **non-commercial** (Sep 2026) [U] | — | **No**, pending licence confirmation |
| SANA / SDXS / SDXL-Lightning (few-step) | 0.6–3 B | per-checkpoint | **~90 s per 1024 px, 4 steps, Core i7-12700 + OpenVINO** [U]; SDXS-512 0.82 s at 512 [U] | Yes (verify per checkpoint) |

**What this means for a CPU-first platform.** Full 1024 px diffusion is **not** a CPU feature — 90 s/image means 1,000 images per 25 CPU-hours, before any verification. The viable CPU geometry is: *composite deterministically (milliseconds), then run a small few-step model at 512 px on the seam band only*. A 128×128 seam patch is ~1/64 of a 1024² canvas, so even a 512 px model operates far below its cost ceiling. This is the single most important architectural consequence of the cost table, and it is what makes CCI economically sane on the hardware the project actually targets.

**Licence traps worth naming.** DINOv2 weights are Apache-2.0, but **DINOv3 is under a custom Meta licence** (Aug 2025), not Apache [P]. **SAM 3 uses a custom "SAM License"** dated 19 Nov 2025, not Apache-2.0 [P]. If the platform's verifier stack is DINOv3 + SAM 3, the *product* acquires two non-Apache dependencies that R9's rights ledger must record. Choose DINOv2 + SAM 2.1 for the permissive path, SAM 3 for the quality path, and make the choice explicit per install.

### 3.2 Label-aware generation: which labels are trustworthy *by construction*

The field conflates three very different things. Sorted by trustworthiness:

**(a) Geometry-derived — the only class that is exact.** The label is computed from the thing that generated the pixels.
- **Mask→image** (MatchMask, CVPR 2026): a mask is the condition and is reused as the label; **67.5 → 74.3 mIoU** on PASCAL VOC, also evaluated on COCO/ADE20K, "over 4.6 % mIoU in the data-limited setting" [P].
- **Layout→image with layout retained** (SceneP2F, Oct 2026): a two-stage plan-then-fill pipeline; labels preserved "by construction at the layout-representation level"; count error mTCE **0.817 vs 2.744** for Add-SD; UAVDT bus AP **31.0 vs 26.8** for Copy-Paste [P].
- **3D render**: boxes/masks/depth from the camera transform. Exact by definition; the failure mode is *appearance*, not geometry.

**(b) Post-hoc but verified — usable, must be measured.** Text/image-conditioned generation followed by a detector or segmenter that *re-derives* the label. This is what the papers calling themselves "label-aware" mostly do. The honest metric is not mAP but **label fidelity**: does the generated image contain the requested objects, in the requested count, at the requested place? mTCE is the right instrument and almost nobody reports it [I].

**(c) Prompt-only — not label-aware at all.** "A photo of a forklift" + a class label. Fine for classification, indefensible for detection, and the source of the −7 point synthetic-only classifier result.

**The uncomfortable finding.** Even in class (a) the label can be wrong in ways geometry does not capture: an object fully occluded by a pasted foreground object still carries a box; harmonization can hallucinate a duplicate; truncation changes what "the object" means under COCO rules. So "by construction" is a spectrum, and the residual is a *measurable* quantity — which is exactly why the certificate in B1 is the contribution, not the generator.

**Numbers that bound the achievable.** SENSE (May 2026) is the cleanest analysis: across Cityscapes, COCO and ADE20K, synthetic images help in proportion to **dense scene composition and fine instance fidelity**, giving **+1.34** (DPT, ADE20K) to **+2.54 mIoU** and **+1.59** for Mask2Former, with synthetic:real ratios tested from 2:1 to 6:1 [P]. That is the realistic envelope for *established* segmentation benchmarks: ~1–2.5 mIoU, not 20.

### 3.3 3D, rendering and world models

- **Objaverse-XL**: 10 M+ objects, **100 M+ multi-view rendered images**, and Zero123-XL's zero-shot novel-view gains — the strongest evidence that rendering at scale transfers [P]. The paper reports "strong zero-shot generalization" without a single downstream detector number, which is the field's characteristic gap.
- **Kubric** (CVPR 2022) and **BlenderProc** (CVPR-W 2019) remain the open engines [P, R6]. Neither ships a detection mAP delta; they are data engines.
- **Isaac Sim / Omniverse, carefully.** The one 2025 study I found that measures it (arXiv 2510.12208) uses Faster R-CNN, **160 real vs 500 synthetic** images, and reports mAP@0.5:0.95 **0.795 in-distribution / 0.585 out-of-distribution**, with "bridged transfer" (mixed) best [P]. That is a *small* study on a narrow task, not a validation of the vendor claim. NVIDIA's own materials assert long-tail mitigation without a peer-reviewed mAP number [U].
- **CAD→render in manufacturing**: 1,043 synthetic vs 60 real images, mAP@0.5 **0.993 synthetic-only vs 0.995 real-only** [P]. This is a *saturated* task (fixed camera, few objects). It is the single best illustration of why vendor "99 % mAP" claims are uninformative: on a trivial task everything scores 0.99, and the experiment has no power to distinguish methods.
- **World models.** Cosmos-Drive-Dreams is the only one with downstream numbers I could verify: **+10.4 % / +9.4 %** 3D-lane F1 in rain/fog on Waymo, **+6.4 %** on RDS-HQ, LET-AP **0.625 → 0.634**, over 7× synthetic clips [P]. Cosmos weights are under the NVIDIA Open Model Licence (commercial with attribution) [P]. **GAIA-2** is a controllable multi-view world model with no published downstream detector delta [P]; GAIA-3's "fivefold reduction in synthetic test rejection" is a vendor claim [U].
- **New primitives that change the calculus.** SAM 3D (19 Nov 2025): single-image → posed 3D object with geometry, texture and layout, released as open models [P]. TRELLIS.2 (Dec 2025): 4 B image-to-3D, MIT, up to 1536³ PBR assets [P]. Together they mean a *customer's own product photos* can become a renderable asset bank — which is the missing input for B4 and an optional amplifier for B1.

### 3.4 Compositional methods: the cheap, strong baseline

- **Copy-paste (real objects, real backgrounds)**: **+1.5 box AP, +0.6 mask AP** on COCO, **+3.6 mask AP on LVIS rare** (Ghiasi et al., CVPR 2021) [P]. Zero GPU, exact labels, licence inherited from source images.
- **SOC (CVPR 2026)**: diffusion-generated *segments* composed by 3D layout, trained from scratch on 10 K COCO images: **12.79 AP vs 9.32** (Copy-Paste) and **9.41** (X-Paste) — a **+36.1 % relative** gain, data released CC BY 4.0 [P]. Note the absolute numbers are low because the regime is from-scratch/low-data; this is a *relative* claim.
- **SceneP2F**: **31.0 vs 26.8** mAP on UAVDT buses [P] — insertion wins where object *count* fidelity matters (crowded aerial scenes).
- **Retrieval beats generation for plain augmentation.** Burg et al. (TMLR) find that retrieving nearest real images from a pool outperforms diffusion-generated images as augmentation [P for the claim; the paper's PDF was not machine-readable to me, so no numbers — flagged in §8].
- **Synthesis**: copy-paste is free and wins whenever masks exist and appearance need not change. Diffusion insertion wins when (i) the object's appearance must change to match a new domain, (ii) masks do not exist (SAM 3 now makes this cheap), or (iii) the *scene* must be novel (count, occlusion, co-occurrence). A platform should ship copy-paste first and treat generative insertion as the upgrade, not the default.

### 3.5 Dataset distillation and coreset synthesis, 2025–2026

- **CoDA (ICLR 2026)**: text-to-image initialisation for distilled sets; **60.4 % at 50 IPC on ImageNet-1K**, SOTA [P]. 50 IPC = 250 K images ≈ 20 % of ImageNet-1K for ~9 points less accuracy.
- **Re-evaluation (arXiv 2606.18209, Jun 2026)**: under a standardised protocol, distilled sets lose to a simple AUM coreset (**17.3 % vs 12.8 %**, ImageNet-1K/ResNet-50/10 IPC) and "fail to outperform even simple random subsets" [P]. This is the classic protocol-fragility story: DD results depend on ZCA whitening, learning-rate schedules, and evaluation-on-distilled-data. Treat every DD SOTA as provisional.
- **Detection/segmentation DD**: exists (task-driven diffusion DD, CVPR 2025, 512 px for detection/segmentation) but at small scale and without convincing transfer [P abstract].
- **Scale limit.** No method at any IPC beats full data; the gap is 9–10 points at 20 % of data and grows as IPC falls. Distillation compresses; it does not synthesise new information.

### 3.6 Evidence discipline: the metrics that do not work, and the ones that do

**Do not work as selection criteria.**
- **FID.** 275,472-image skin-lesion study (arXiv 2611.02437, Oct 2026): selecting synthetic images by FID beat random by **+0.036 macro-F2** on one lesion type and had "no measurable advantage over random sampling" on another; of 11 metrics, none predicted downstream across classes [P].
- **CLIPScore.** Used as the *only* quality evidence in at least one 2026 synthetic-dataset paper (BlendFusion/FineBLEND: CLIPScore 25.91, aesthetic 4.52, no downstream number at all) [P]. That is a metric reported because it is computable.
- **Diversity.** R6's Fan et al. finding stands: negligible correlation between generated-set diversity and scaling ability [P].
- **FID as a *ranking* device between generators.** "Rethinking FID" (CVPR 2024) shows FID's Gaussian assumption is violated and proposes CMMD, which correlates better with human judgement [P]. Human judgement is still not downstream accuracy.

**Do work.**
1. **ΔAP/ΔmIoU on frozen human gold, paired, with a CI** — the only metric the generator cannot game. Same instrument R4 already specifies.
2. **Count fidelity (mTCE)** — requested vs detected objects per class; catches the dominant detection-specific failure (missing/duplicated instances) that mAP averages away [P metric, I recommendation].
3. **Instance fidelity + scene density** — SENSE's two governing factors; operationalise as mask-area distribution match and objects/image vs real [P + I].
4. **Re-segmentation agreement** (claimed mask vs independent segmenter) — a label check needing no human labels; a reject gate, never a certificate.
5. **Classification Accuracy Score** (train on synthetic, test on real) — the oldest correct idea (Ravuri & Vinyals, 2019) and still the best cheap proxy [P].

### 3.7 Failure modes, 2025–2026 evidence

- **Domain gap.** Still the dominant error term; the reason CCI keeps interior pixels real.
- **Synthetic-only collapse.** −7 points (69.24 vs 76.39) on ImageNet classifiers [P, R6]; unchanged by 2026.
- **Spurious correlation.** Fairness Feedback Loops (FAccT 2024): chains of generative models "converge to the majority and amplify model mistakes" [P]. Synthetic data inherits the generator's web-data bias and can sharpen it.
- **Long-tail distortion.** Two-sided: generation *can* fix the tail (TMI **+9.5 rare AP**) but only if the layout distribution is *specified* long-tailed; sampling "natural" prompts reproduces the head.
- **Poisoning through the conditioning channel.** The sharpest 2025 result for this platform: a **10 % logo patch in the ControlNet control map** yields **90–100 % attack success with 1–5 % poisoned samples**, and clean fine-tuning only reduces ASR to **25 %** [P]. Control-conditioned pipelines are attackable *through the control map*, which most provenance schemes do not record. Hash and audit control/mask inputs, not just output pixels.
- **Poison persistence.** "Your Poisoning Can Spread VIA Synthetic Data" (NeurIPS 2025): poisoned content survives into synthetic data generated from a poisoned corpus [P]. A synthetic pipeline is a laundering machine for poisoned sources.
- **Copyright.** *Getty v Stability* (UK High Court, 4 Nov 2025): secondary copyright claim **rejected**; limited trademark infringement found [P]. US Copyright Office Part 2 (Jan 2025): purely AI-generated outputs are not copyrightable; Part 3 (May 2025): training is "often transformative" but not categorically fair use [P]. A generated image can therefore be *uncopyrightable* and *encumbered by model-licence terms* simultaneously. Export metadata must carry both facts; R9's ledger needs `model_licence` distinct from `image_copyright`.
- **Attribution laundering.** A CC BY 4.0 synthetic dataset (SOC) can contain objects derived from unlicensed sources. Provenance must point at the *parents*, not the batch.

---

## 4. Evidence table

| Method | Venue / year | Effect (as reported) | Dataset / setting | Replication |
|---|---|---|---|---|
| Copy-Paste (real objects) | CVPR 2021 | +1.5 box AP, +0.6 mask AP; +3.6 mask AP LVIS rare | COCO/LVIS | Widely used as baseline; effectively replicated [R] |
| GeoDiffusion | ICLR 2024 | +1.4 mAP NuImages, +1.1 mAP COCO | annotation-scarce detection | none found [P] |
| DetDiffusion | CVPR 2024 | +0.9 mAP | COCO-Stuff | none found [P] |
| SENSE (dense composition) | arXiv 2605.19289, May 2026 | +1.34 to +2.54 mIoU (DPT), +1.59 (Mask2Former) | Cityscapes/COCO/ADE20K; 2:1–6:1 synth:real | none found [P] |
| MatchMask (mask-centric) | CVPR 2026 | 67.5 → **74.3 mIoU**; >4.6 mIoU data-limited | PASCAL VOC, COCO, ADE20K | none found [P] |
| SceneP2F (layout plan+fill) | arXiv 2610.26922, Oct 2026 | bus AP **31.0 vs 26.8** copy-paste; mTCE **0.817 vs 2.744** | UAVDT, VisDrone, BDD100K | none found [P] |
| SOC (3D-layout composition) | CVPR 2026 | **12.79 vs 9.32 AP** (from scratch, 10 K COCO); **LVIS 20.1→29.8** with 50 K synth | COCO, LVIS, gRefCOCO | none found; data CC BY 4.0 [P] |
| TMI (T2I + I2I + verifier) | arXiv 2607.08201, Jul 2026 | **+4.0 AP / +9.5 rare AP** LVIS; 38.1/33.9 AP | LVIS | none found [P] |
| FLORA (LoRA + inpaint) | arXiv 2508.21712, Aug 2025 | **41.0 → 62.3 mAP** from 200 real + 500 synth | Roboflow-100, 6 datasets | none found [P] |
| GenAI domain editing | arXiv 2609.02299, Sep 2026 | 56.8 → **69.9** (zero-shot) / **79.8** (LoRA) mAP at 25 % synth; +20.1 foliage | 15 vehicle classes, 360 train / 432 test | none; tiny custom set [P] |
| TADA (targeted diffusion aug) | ICLR 2026 | up to **+2.8 %** accuracy, augmenting 30–40 % | CIFAR-10/100, ImageNet | none found [P] |
| DataDream (few-shot guided) | ECCV 2024 | **92.4 %** 16-shot vs 88.5 (IsSynth), 87.9 (DISEF) | FGVC-Aircraft | none found [P] |
| Cosmos-Drive-Dreams | arXiv 2506.09042, 2025 | lane F1 **+10.4 % rain / +9.4 % fog**; LET-AP **0.625→0.634** | Waymo, RDS-HQ, 7× clips | vendor (NVIDIA) [P] |
| Domain randomisation | CVPR-W 2018 | AP **83.7 vs 79.7** | KITTI cars, COCO-init | partially replicated in later sim2real work [P/R6] |
| Omniverse Replicator study | arXiv 2510.12208, Oct 2025 | mAP@.5:.95 0.795 ID / 0.585 OOD; 160 real vs 500 synth | small custom set | single small study [P] |
| CAD→BlenderProc | arXiv 2509.13089, Sep 2025 | mAP@0.5 **0.993 synth-only vs 0.995 real-only** | 60 real / 1,043 synth, assembly | saturated task, no power [P] |
| Diffusion classifier aug | arXiv 2023 (Azizi) | +1.78 top-1 at 2×; negative beyond 4–5×; **69.24 synth-only vs 76.39** | ImageNet/Imagen | partially (Fan et al.) [P/R6] |
| CoDA (distillation) | ICLR 2026 | **60.4 %** @ 50 IPC | ImageNet-1K | re-evaluations dispute DD protocols [P] |
| DD vs coresets | arXiv 2606.18209, Jun 2026 | coreset **17.3 %** vs best DD **12.8 %** @ 10 IPC | ImageNet-1K, R50 | direct replication attempt [R] |
| FID selection for synthetic | arXiv 2611.02437, Oct 2026 | +0.036 macro-F2 vs random (one class), none (another) | ISIC-2018, 275 K synthetic | single study [P] |
| Control-map backdoor | arXiv 2507.04726, 2025 | **90–100 % ASR** with 1–5 % poisoned; 25 % after clean FT | ControlNet pipelines | single study [P] |

---

## 5. Hype and dead ends

**Dead ends for this platform.**
1. **"Generate a class from a prompt and label it."** −7 points synthetic-only, no localisation guarantee, and the label is a hope. Retired in R6; still the default in vendor demos.
2. **FID/CLIPScore leaderboards as the product.** FID-selected data beat random by 0.036 points on one class and nothing on another [P]. Selling "high-fidelity synthetic data" on FID is selling a number that does not survive the customer's gold set.
3. **Dataset distillation as a training-data substitute.** 60.4 % vs ~70 % at 20 % of the data (best case), below a coreset in a 2026 replication [P/R]. Fine as a CI proxy, fatal as a claim.
4. **Full-scene diffusion for detection on CPU.** 90 s/image at 1024 px, plus verification, plus rejects. A demo, not a product.
5. **World-model video for a dataset platform.** Cosmos is serious and has real numbers, but needs multi-GPU post-training and video-scale data. Borrow the *idea* (condition on a 3D/HD-map layout so geometry is exact), not the model.
6. **Synthetic-only training of anything.** 2023 result, 2026 confirmation, no counterexample at scale.

**Claims to check before repeating.**
- **"60 % of AI training data will be synthetic"** (Gartner, 2023, predicting 2024) [U]. No public audit ever confirmed it; vendors still quote it.
- **"The synthetic data market is $791 M and the proof is missing"** (2026 blog) [U] — directionally consistent with what I found, but a blog is not a measurement.
- **Vendor mAP on private data.** The 0.993 result shows why: on easy tasks every method saturates, so the number says nothing about method quality. Ask for the *real-only* baseline and the test-set size; without both, it is marketing.
- **"GAIA-3 reduces synthetic test rejection fivefold"** [U] — no method, no denominator.
- **"Retrieval beats diffusion"** — the TMLR paper's PDF was not readable to me; the direction is credible, the magnitude unverified [U].

**Where the field is genuinely better than in 2024.** Layout/mask-conditioned generation with retained geometry (MatchMask, SceneP2F), verifier-filtered editing (TMI uses InternVL3-14B to verify edits), single-image 3D lifting (SAM 3D, TRELLIS.2), and honest negative results about metrics. Those four are real. Everything else is a bigger model.

---

## 6. Design for this codebase

### 6.1 What already exists (so the design is additive)

- `TaskType.OBJECT_DETECTION` and `IMAGE_CLASSIFICATION` with a `boxes` payload schema (`packages/dataset_core/task_schemas.py`).
- `AnnotationOrigin.SYNTHETIC` / `AUGMENTED` / `RULE_GENERATED`, and `ReviewStatus.PENDING_REVIEW` (`packages/dataset_core/constants.py`) — the provenance vocabulary already fits.
- `AssetModel.parent_asset_id` + `transformation_metadata` (`packages/dataset_core/db/models.py:79-94`) — a ready-made derivation DAG for synthetic assets. This is the single most important existing affordance: a synthetic image is an *asset with parents*, not a new entity.
- `spatial_augment.py` already does geometry-aware transforms on boxes with normalised/pixel handling and degenerate-box purging — the same math CCI needs.
- COCO and YOLO exporters with deterministic primary-image selection (`packages/dataset_export/`).
- The synthesis service with batch lineage, idempotency and `pending_review` routing (`packages/dataset_synthesis/service.py`), currently text-only and provider-gated.

### 6.2 The pipeline to build (E7 ladder)

**Stage 0 — object bank.** Per class, collect N masked instances from *licensed* records. SAM 2.1 (Apache-2.0) box-prompted is the permissive default; SAM 3 (custom licence) the quality path behind a flag. Stored as `AssetRole.CROP` with `parent_asset_id` → source image and `transformation_metadata` = {model, revision, prompt, box, mask_sha256}.

**Stage 1 — layout sampler.** Estimate from the customer's real data: class co-occurrence, objects/image, relative area, vertical position, truncation rate. Sample layouts that match the target distribution and oversample the tail. Pure statistics, no GPU — this is what converts "synthetic data" into "synthetic data for *your* gap".

**Stage 2 — deterministic compositor.** Alpha-composite crops onto backgrounds with PIL/numpy; boxes derived from the paste transform (the `spatial_augment` convention); `recipe.json` records every parameter. **Shippable on its own**: Ghiasi-style copy-paste with a distribution-aware sampler and full provenance, ~10 ms/image on CPU, byte-reproducible.

**Stage 3 — seam harmonizer (optional).** Inpaint only a dilated ring around each mask; never the interior. Two invariants enforced in code:
- `SSIM(original, harmonized)` outside the dilated mask ≥ 0.999, else the model altered the object and the label is no longer exact.
- No objects gained: run the platform's detector and compare counts to the layout (mTCE).

**Stage 4 — label verification.** Re-segment each claimed instance with a *different* family from the one that cut it out; require IoU ≥ 0.75; record the score. A reject gate, not a certificate.

**Stage 5 — certificate and admission.** Audit a class-stratified random sample with human boxes; compute a one-sided Clopper-Pearson lower bound on the fraction of labels with IoU ≥ 0.75; admit only if the bound clears a pre-registered floor *and* ΔAP on frozen gold has a paired 95 % CI excluding zero; bind both to the manifest hash (R4/R8).

### 6.3 Schema additions

```
synthesis_batches.strategy  CHECK IN ('G1','G2','G3','I1')   -- I1 = image insertion
synthesis_batches.recipe_hash, generator_model, generator_revision,
                   harmonizer_used, mask_model, verifier_model
synthesis_items.layout_json      -- boxes, class ids, z-order, source object ids
synthesis_items.mask_sha256, reseg_iou, ssim_outside_mask, count_error
synthesis_items.dropped_reason   CHECK IN ('ssim_violation','count_mismatch',
                                           'reseg_low_iou','dup','licence')
synthesis_certificates(batch_id, metric, n, lower, upper, method, gold_version_id)
```

Note the deliberate split: `origin='augmented'` when the object pixels are real and only the seam is synthetic; `origin='synthetic'` when any object pixel is generated. That distinction is what lets the rights gate (R9) reason correctly, and it is currently collapsed in most pipelines.

### 6.4 Gates, cheapest first

1. **Geometry invariants** (free): box inside image, area ≥ 0.001, no two boxes with IoU > 0.9 of the *same* instance, mask area consistent with box area within 15 %.
2. **Seam invariant** (free): SSIM outside dilated mask ≥ 0.999.
3. **Count fidelity** (one detector pass): |detected − requested| per class; reject batch if mTCE > 0.5.
4. **Re-segmentation IoU** (one segmenter pass): per-item, reject < 0.75.
5. **Duplicate/novelty** (existing phash + DINOv2 embedding): reject cosine > 0.95 to any existing record; require the batch's embedding distribution to *not* collapse onto the source objects (effective rank ≥ 0.5× real, per R5/R6).
6. **Licence** (existing ledger): every parent asset must be `approved_for_intended_use`; inherited model licence recorded on the batch.
7. **Audit + certificate** (human, sampled): Wilson/Clopper-Pearson bound.
8. **Downstream delta** (frozen gold, paired): the only admission gate that matters.

### 6.5 Cost model (CPU-first)

| Path | Per image | 1,000 images | Notes |
|---|---|---|---|
| Composite only (Stage 2) | ~10 ms | ~10 s | byte-reproducible, exact labels |
| + seam inpaint, 512 px patch, 4-step | ~8–20 s | 2–6 h | 8-core CPU; GPU optional |
| Full 1024 px generation | ~90 s | ~25 h | not recommended on CPU |

The composite-only path is the one that makes the feature viable on the hardware the project targets. It is also, per §3.4, the one with the best evidence per unit cost.

### 6.6 Experiments (E7 ladder)

| ID | Question | Design | Pass bar |
|---|---|---|---|
| E7a | Does CCI beat copy-paste at equal label budget? | Same object bank, same layouts; composite vs composite+seam; 500 images/class | ΔAP ≥ +1.0 with CI excluding 0, else ship copy-paste |
| E7b | Is the label actually exact? | 200 audited images; IoU ≥ 0.75 rate | ≥ 0.95 with lower bound ≥ 0.90 |
| E7c | Does seam harmonization help or hurt? | Ablate Stage 3 | If ΔAP ≤ 0, delete Stage 3 (saves all GPU) |
| E7d | Taxonomy bootstrap | New 10-class taxonomy, zero real labels, generalist detector | Beat zero-shot by ≥ +5 AP; measure backward forgetting on the original vocabulary |
| E7e | Synthetic share sweep | 0/10/25/50/75 % | Locate the reversal point on *this* data, do not assume 30 % |
| E7f | Does the certificate predict? | Correlate audited label precision with ΔAP across 6 batches | Report the correlation; if none, the certificate is theatre and must be withdrawn |

E7f is the honesty test of the whole design. If a batch's certified label precision does not predict its downstream delta, then the platform should say so and fall back to the delta gate alone.

### 6.7 What *not* to build

- A Blender/TRELLIS asset pipeline in v1: the right v2 answer for novel viewpoints, but it multiplies dependencies and licence surface before the cheap path is validated.
- Any dependence on FLUX.1 [dev], FLUX.2 9 B/32 B, or Qwen-Image 2.1 — their licences prohibit the commercial use the platform exists to certify.
- A FID/CLIP "quality score" in the UI. It would be the most-read number in the product and the least predictive one.

---

## 7. References

1. Lin et al. MatchMask: Mask-Centric Generative Data Augmentation for Label-Scarce Semantic Segmentation. CVPR 2026. https://openaccess.thecvf.com/content/CVPR2026/papers/Lin_MatchMask_Mask-Centric_Generative_Data_Augmentation_for_Label-Scarce_Semantic_Segmentation_CVPR_2026_paper.pdf
2. Zhang, Guo, Jin, Zhou, Huang. What Makes Synthetic Data Effective in Image Segmentation (SENSE). arXiv:2605.19289, May 2026. https://arxiv.org/html/2605.19289v1
3. SceneP2F: Controllable Multi-Object Insertion for Detection Data Augmentation. arXiv:2610.26922, Oct 2026. https://arxiv.org/html/2610.26922v1
4. Huang et al. Synthetic Object Compositions for Scalable and Accurate Learning in Detection (SOC). CVPR 2026; arXiv:2510.09110. https://arxiv.org/html/2510.09110v4
5. TMI: Text-to-Image Meets Image-to-Image. arXiv:2607.08201, Jul 2026. https://arxiv.org/html/2607.08201v1
6. FLORA: Efficient Synthetic Data Generation for Object Detection. arXiv:2508.21712, Aug 2025. https://arxiv.org/html/2508.21712v1
7. Domain shift-robust object detection with GenAI image editing. arXiv:2609.02299, Sep 2026. https://arxiv.org/html/2609.02299v1
8. Nguyen et al. Do We Need All the Synthetic Data? Targeted Image Augmentation via Diffusion Models (TADA). ICLR 2026. https://proceedings.iclr.cc/paper_files/paper/2026/hash/98bf3b8505c611ac21055dd9d355c66e-Abstract-Conference.html
9. Zhou et al. CoDA: From Text-to-Image Diffusion Models to Training-Free Dataset Distillation. ICLR 2026. https://proceedings.iclr.cc/paper_files/paper/2026/hash/84a5e12638504e3256e5b6ebaca7a456-Abstract-Conference.html
10. Do Distilled Sets Outperform Coresets? arXiv:2606.18209, Jun 2026. https://arxiv.org/html/2606.18209v1
11. Evaluating Synthetic Skin Lesion Images for Classifier Performance. arXiv:2611.02437, Oct 2026. https://arxiv.org/html/2611.02437v1
12. Cosmos-Drive-Dreams: Scalable Synthetic Driving Data Generation with World Foundation Models. arXiv:2506.09042. https://arxiv.org/html/2506.09042v3
13. GAIA-2: A Controllable Multi-View Generative World Model for Autonomous Driving. arXiv:2503.20523. https://arxiv.org/html/2503.20523v1
14. The Impact of Synthetic Data on Object Detection Model Performance (Omniverse Replicator). arXiv:2510.12208, Oct 2025. https://arxiv.org/html/2510.12208v1
15. A Synthetic Data Pipeline for Manufacturing SMEs (BlenderProc). arXiv:2509.13089, Sep 2025. https://arxiv.org/html/2509.13089v1
16. Deitke et al. Objaverse-XL: A Universe of 10M+ 3D Objects. NeurIPS 2023. https://arxiv.org/abs/2307.05663
17. Greff et al. Kubric: A Scalable Dataset Generator. CVPR 2022. https://arxiv.org/abs/2203.03570
18. Denninger et al. BlenderProc. CVPR-W 2019. https://arxiv.org/abs/1911.01911
19. Chen et al. SAM 3D: 3Dfy Anything in Images. arXiv:2511.16624. https://arxiv.org/abs/2511.16624
20. Carion et al. SAM 3: Segment Anything with Concepts. arXiv:2511.16719. https://arxiv.org/abs/2511.16719
21. Microsoft TRELLIS.2 (4B, MIT). https://microsoft.github.io/TRELLIS.2/ · https://huggingface.co/microsoft/TRELLIS.2-4B
22. Black Forest Labs, FLUX.2 repository and licensing. https://github.com/black-forest-labs/flux2
23. Stability AI Community Licence. https://stability.ai/license · https://huggingface.co/stabilityai/stable-diffusion-3.5-large/blob/main/LICENSE.md
24. Qwen-Image (Apache-2.0). https://github.com/QwenLM/Qwen-Image · Qwen-Image 2.1 licence reporting (secondary): https://cellcog.ai/blog/qwen-image-2-1/
25. NVIDIA Cosmos-Transfer2.5 (NVIDIA Open Model Licence). https://github.com/nvidia-cosmos/cosmos-transfer2.5
26. fastsdcpu CPU benchmarks (SDXL-Lightning ≈90 s @1024, SDXS-512 0.82 s). https://github.com/rupeshs/fastsdcpu
27. RTX 4090 SDXL benchmark (vendor). https://gigagpu.com/rtx-4090-24gb-sdxl-benchmark/
28. Getty Images v Stability AI, England & Wales High Court judgment, 4 Nov 2025. https://www.judiciary.uk/wp-content/uploads/2025/11/Getty-Images-v-Stability-AI.pdf
29. US Copyright Office, Copyright and AI Part 2 (Jan 2025) and Part 3 (May 2025). https://www.copyright.gov/ai/
30. Threats to Responsible Synthetic Data Pipelines (control-map backdoor). arXiv:2507.04726. https://arxiv.org/html/2507.04726v2
31. Your Poisoning Can Spread "VIA" Synthetic Data. NeurIPS 2025. https://neurips.cc/virtual/2025/poster/118122
32. Fairness Feedback Loops: Training on Synthetic Data Amplifies Bias. FAccT 2024. https://facctconference.org/static/papers24/facct24-144.pdf
33. Burg et al. Image retrieval outperforms diffusion models on data augmentation. TMLR. https://arxiv.org/abs/2304.10253
34. Ravuri & Vinyals. Classification Accuracy Score for Conditional Generative Models. NeurIPS 2019. https://arxiv.org/abs/1905.10887
35. Jayasumana et al. Rethinking FID: Towards a Better Evaluation Metric for Image Generation. CVPR 2024.
36. DataDream: Few-shot Guided Dataset Generation. ECCV 2024. https://arxiv.org/html/2407.10910v2
37. BlendFusion (CLIPScore-only synthetic dataset paper). arXiv:2604.09022, Apr 2026. https://arxiv.org/html/2604.09022v1
38. Roboflow Magic Scissors (SAM-based copy-paste). https://github.com/roboflow/magic-scissors
39. DINOv3 licence (custom, not Apache). https://ai.meta.com/resources/models-and-libraries/dinov3-license/
40. Ghiasi et al. Simple Copy-Paste is a Strong Data Augmentation Method for Instance Segmentation. CVPR 2021.
41. Azizi et al. Synthetic Data from Diffusion Models Improves ImageNet Classification. arXiv:2304.08466.

### What I could not verify

- **Burg et al. (TMLR)**: claim verified from the abstract, magnitudes not — the PDF was not machine-readable. Treated as direction-only in §3.4.
- **MatchMask full paper**: numbers come from the CVF abstract page via a venue index, not the PDF body (binary extraction failed). Reliable for the headline, not for ablations.
- **Qwen-Image 2.1 non-commercial licence**: reported by a third-party blog quoting the licence; the Hugging Face card was not opened. Marked [U] and flagged in §3.1.
- **GAIA-3 fivefold rejection claim**: vendor only, no denominator [U].
- **"$791 M synthetic-data market, 4 of 17 surveys reproducible"**: single blog, no primary source [U].
- **No paper found** that measures label precision of synthetic detection data against human annotation at scale with a confidence interval. That absence is the basis for B1, and it is a claim about my search, not about the world.
