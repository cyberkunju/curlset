# W11 — Practitioner and Patent Knowledge: what actually ships

**Date:** 2026-11-04
**Scope:** non-academic evidence only — patents, production source code, vendor documentation, forum war stories, cost data.
**Deliberately not repeated from wave-1:** R1 (correlated-error ceiling), R2 (dedup/leakage theory), R3 (model AP tables), R4 (statistics), R5 (AL), R6 (synthetic), R7 (market/pricing survey), R8–R10.

**Evidence marks:** `[P]` published primary source (patent text, vendor page, repository); `[R]` replicated — I independently confirmed it by reading the code or recomputing from the source; `[I]` inference of mine; `[U]` unverified claim by a third party (forum anecdote, self-reported benchmark).

**How the evidence was obtained:** patent full text was pulled from Google Patents on 2026-11-04 and claims are quoted verbatim; patents are legal documents, not peer review, and nothing here is a legal opinion on validity or infringement. Reddit content was retrieved through the Arctic Shift archive API (`arctic-shift.photon-reddit.com`) because reddit.com returned login walls to automated fetches. Hacker News via the Algolia API. Source code was cloned and read at these commits: cleanlab `7506257`, snorkel `45824f9`, CVAT `fe6312e`, label-studio-ml-backend `a13c5fb`, fiftyone-brain `ba978a1`, autodistill `838e1c3`, supervision `8dc5eed`, ultralytics `c4e0ba9`, distilabel `313fac8`.

---

## 1. Executive summary

**1. The patent record says the industry solved the wrong problem.** Every granted claim I could find in this space covers *measuring and routing annotators* — benchmark construction (Scale AI), adaptive redundancy (Amazon), live consensus display to the worker (Labelbox), periodic re-scoring against expert gold (Enlitic). Not one claim I read covers *certifying the precision of an auto-labeled dataset with an error bound*. That is consistent with wave-1's market finding, and it is stronger evidence: patents are where companies put what they consider defensible, and nobody has claimed the certificate. [R]

**2. The most valuable technique I found outside academia is a benchmark-selection rule, not an algorithm.** Scale AI's US12189719B1 claims constructing a benchmark item by requiring **high consensus among labelers above a performance threshold and low consensus among labelers below it**, then scoring new labels by distance to that benchmark. That is a discriminative-item selection criterion: pick audit items that separate good from bad labelers, not items that are merely confident. It is directly portable to Curlset's audit design and appears in no paper in the wave-1 set. [P]

**3. Production "quality" code is far more modest than vendor marketing.** CVAT's consensus merge is Datumaro's `IntersectMerge` with IoU clustering and a `quorum` parameter, and its own code disables the merged-annotation distance check with the comment *"disabled, need to clarify how to compare merged instances correctly"*. CVAT's QA report is a per-class confusion matrix with precision/recall/accuracy and no interval anywhere. FiftyOne Brain's uniqueness is a 3-nearest-neighbour mean with hand-set weights `[0.6, 0.3, 0.1]`, normalised by the dataset max, carrying the comment *"@todo experiment on which method for assessing uniqueness is best"*. Ultralytics' `auto_annotate` writes YOLO text files at `conf=0.25`, `iou=0.45` and never records the confidence it used. [R]

**4. The dominant production failure is not bad models — it is a contaminated validation set.** The recurring story is: auto-label or human-label, review only where the model is unsure, evaluate on a random split, ship, then discover the evaluation was measuring the labeling process rather than the world. [U]

**5. Costs are knowable and unflattering to auto-labeling at small scale.** Roboflow publishes human annotation at **$0.10/bbox**, **$0.20/polygon**, **$0.05/classification or keypoint**; its Core plan is **$39/month for 20 credits, "enough to … run 160,000 inferences"** — roughly **$0.24 per 1,000 inferences** [P/R]. A Reddit practitioner reports a frontier-VLM `label → SAM3 polygon` run over ~500 images that *"would've cost about $1k"*, about **$2/image**, versus roughly $0.50/image for human boxes at five boxes per image [U/I]. Auto-labeling is cheap per inference and expensive per *usable* label.

---

## 2. Patent findings

Ten documents, all read at claim level. "What it claims" paraphrases the actual claim language; where I quote, it is verbatim from the granted/published text.

| # | Number | Assignee (as listed) | What the claims actually cover | Relevance to Curlset |
|---|---|---|---|---|
| 1 | **US11048979B1** (granted 2021-06-29) | Amazon Technologies | An iterative active-learning loop inside a *labeling service*: auto-label a first subset, select a second subset for humans, **consolidate multiple annotations**, retrain, repeat. Claim 2: compute a quality score, and if below threshold send the subset back **"by a number of annotators determined based on a difference between the quality score and the quality threshold."** | Adaptive redundancy: annotator count as a function of the measured quality gap, not a fixed k. Curlset can adopt the policy while keeping its own statistics; the claim is on the service loop, not the arithmetic. |
| 2 | **US11636602B1** (2023-04-25) | Scale AI | Segmentation prelabeling by **multi-scale inference and aggregation**: predict on the original plus downscaled plus upscaled copies, map to a common resolution, aggregate. Claim 7 fixes the downscale set as **0.5 and 0.25**; claim 8 the upscale set as **1.25, 1.5, 1.75, 2**. Claims 2–3: **remove regions below a size threshold**, and replace a small region's label with the surrounding region's label. Claim 4: a loss with **"a second weight that is higher than the first weight for a second pixel in a boundary."** | The most concrete auto-label recipe in the corpus: 6-scale TTA + min-region suppression + boundary-weighted fine-tuning. All cheap, all testable on Curlset's gold. That the numbers are claimed tells you they were load-bearing. |
| 3 | **US12189719B1** (2025-01-07) | Scale AI | **Automatic benchmarking of labeling tasks.** Select ≥2 non-outlier labels per item **"based on high consensus among a first group of users with labeling performance that exceeds a threshold and low consensus among a second group of users with labeling performance that falls below the threshold"**; benchmark = that subset; score a new label by **distance to the benchmark**; use scores to **modulate which tasks that user receives**. Claims 7–9: labels between a lower and upper quantile, or nearest a cluster centre. | The single most portable idea here. It turns "gold set" from an expert artefact into a *selected* set with a stated discrimination criterion, and scores by distance rather than match — correct for boxes and spans. |
| 4 | **US12271443B1** (2025-04-08) | Scale AI | **Data curation conditioned on a sampling objective.** Several candidate objectives, each scored on a separate compute instance for relevance to retraining; pick one, derive sampling criteria, select unlabeled items, label, retrain. | Formalises wave-1 R5's "coverage": sampling is a *chosen objective*, not one heuristic. Argues for objective-conditioned queues over a single BADGE-like ranking. |
| 5 | **US12525013B1** (2026-01-13) | Scale AI | **Prelabeling by fusing geometry with a detector.** Project 3D cuboid points into the image using camera parameters (position, orientation, skew, radial and tangential distortion); when a model proposal **matches** a geometric proposal by IoU, output the model proposal; when a geometric proposal has **no match**, output the geometric one. Claim 8: annotator metrics from the difference between user annotations and model proposals. | The generalisable pattern: two independent evidence sources, accept the learned one where they agree, fall back to the deterministic one where they do not, treat disagreement as a measurement — the synthesis's L2 argument, already shipping in 3D. |
| 6 | **US11361152B2** (2022-06-14) | Labelbox | Automated content labeling platform whose claim 1 includes generating **"an auto consensus score … displayed to the particular labeler."** | Consensus shown *to the annotator in real time*, not only to the reviewer. Cheap, behaviour-changing, and claimed — worth knowing before copying. The claim is narrow: score-to-labeler inside a labeling platform with a segmentation tool. |
| 7 | **US20240160900A1** (published 2024-05-16) | Snorkel AI | Programmatic labeling: embed datapoints, cluster, **train one classifier per cluster to answer "inside or outside this cluster"**, label a new point by the cluster whose classifier is **most certain**, train on the result. | Prelabeling with no per-class trained model, and confidence comparable across clusters. A plausible cheap non-LLM third voter for Curlset's text tasks. |
| 8 | **US11211153B2** (2021-12-28) | Enlitic | Medical QA by **periodic re-benchmarking**: on a schedule, collect ordinary-user labels, then send the scans *plus those labels* to an **expert** for "golden labeling data"; compute per-user performance scores; collect corrections. | Time-based audit cadence as a product feature: a *drift* audit, not only a per-release certificate. The novelty claimed is the workflow, not the metric. |
| 9 | **US12432230B2** (2025-09-30) | Entanglement Inc | Closed loop: unsupervised labels → supervised training → inference clusters → **label audit relabels clusters** (claim 3 human, claim 4 **weighted combination of human and automatic labels**) → retrain. Claim 5: stratified sampling to balance labels. | "Audit, don't annotate", and the weighted human+auto label as a first-class stored object with provenance. |
| 10 | **US20190251397A1** (published 2019-08-22) | NVIDIA | **Domain-randomised synthetic data with automatic labels**: render a 3D object into a background image and compute task labels; adds light position/colour/intensity, rendered distractor geometry **omitted from labels** (claim 6), and — claim 9 — **above an occlusion threshold, modify the training data**. | Two lessons: distractors must be excluded from labels, and heavy occlusion changes the correct label (to "don't care"). Curlset's synthetic path has no "don't care" notion; that is a concrete gap. |

### What the patent record shows structurally

- **The IP moat is in annotator management and prelabel mechanics, not in label certification.** None of the ten claims a precision guarantee, an interval, or a refusal-to-publish rule. [R]
- **Small specialists, not the giants, hold the QA-loop patents.** Enlitic (medical) and Entanglement (threat detection) own the "audit and relabel" loops; the platform vendors own the mechanics. Meta, Microsoft and Google did not surface. **Caveat:** assignee-restricted queries for those three were rate-limited from this network on 2026-11-04; I make **no claim of absence** — only that none of the ten documents above is assigned to them. [R/U]
- **Roboflow appears to hold no patents on this.** An assignee-restricted search for `labeling` returned **0** documents for Roboflow (2026-11-04), versus 13 for Scale AI and 3 for Labelbox, so their published methods are effectively all of their disclosed IP. [R]
- **Claim language reveals what broke in production.** Scale's claim 7 spelling out `0.5, 0.25` means those exact scales were the working configuration; Amazon's claim 2 tying annotator count to the quality gap means fixed-k redundancy was what they were replacing. Patents are post-hoc rationalisations of engineering fights. [I]

---

## 3. Production code archaeology

Read from source, not from documentation. Line numbers are for the commits listed at the top.

### 3.1 Label Studio ML backend — a linear model and a prompt box

`label_studio_ml/examples/sklearn_text_classifier/model.py:49-50` is the entire "AI pre-labeling" for text: a `TfidfVectorizer(ngram_range=(1, 3), token_pattern=…)` piped into `LogisticRegression`. Probabilities come from `predict_proba` (line 103) and are used to pre-select labels.

`examples/llm_interactive/model.py` is a prompt-management harness: the prompt is a *task field* the annotator edits in the UI (`PROMPT_TEMPLATE` default `**Source Text**: "{text}" **Task Directive**: "{prompt}"`, line 103), and the answer becomes a `choices`/`textarea` annotation (lines 241-264). No self-consistency, no calibration, no persisted raw response.

**Finding:** the most widely deployed open-source labeling stack ships *pre-fill*, not *quality control*. The ML backend contract has no concept of a label's confidence or provenance — an auto-label and a human label are the same object once written. [R] For Curlset this is the design gap worth owning: `pending_review` must be a first-class state in the data model, not a UI filter.

### 3.2 CVAT — consensus is a merge, quality is a confusion matrix

`cvat/apps/consensus/intersect_merge.py` subclasses Datumaro's `IntersectMerge`:
- `__init__` parameters (lines 30-45): `pairwise_dist` (defaults to the IoU threshold), `quorum: int = 0`, `close_distance: float = 0  # disabled`.
- `_check_annotation_distance` (line 102) is **overridden to `return` with the comment `# disabled, need to clarify how to compare merged instances correctly`**.
- `_merge_clusters` (line 105) merges per annotation type through `BboxMerger`, `MaskMerger`, `PolygonMerger`, `SkeletonMerger`, etc., voting on attributes and stamping `attributes["source"] = "consensus"`.

`cvat/apps/quality_control/comparison_report.py:329-359` computes, per class: `precision = matched / dataset_annotations`, `recall = matched / gt_annotations`, `accuracy` from the confusion matrix diagonal, with unmatched classes set to `NaN`.

**Findings.** (a) Consensus is IoU-cluster + quorum + attribute vote; there is no weighting by annotator skill and no uncertainty. (b) The maintainers explicitly could not define when two *merged* annotations disagree — the exact object Curlset must define. (c) The QA report gives point estimates only; sampling 5–15% for QA is the documented practice and no interval is reported, which corroborates wave-1 R7 and now has a code citation. [R]

### 3.3 FiftyOne Brain — three heuristics with an honest TODO

`fiftyone/brain/internal/core/uniqueness.py:159-192`:
```
K = 3
dists = similarity_index._kneighbors(k=K+1, return_dists=True)
weights = [0.6, 0.3, 0.1]
sample_dists = np.mean(dists[:, 1:] * weights, axis=1)
sample_dists /= sample_dists.max()
```
with the comment `# @todo experiment on which method for assessing uniqueness is best`. So "uniqueness" is: weighted mean distance to the 3 nearest neighbours, normalised by the dataset maximum. It is relative to the dataset, not absolute, and the weights are hand-set.

`mistakenness.py:529-550` is more interesting — label-error scoring that fuses class and localisation evidence:
- classification: `mistakenness = (m * exp(c) + 1) / 2` where `c = -entropy(softmax(logits))` and `m ∈ {-1, +1}` is correctness.
- detection: `i = (1/(1 - IOU_0.5)) * (1 - iou)`, `c = exp(-entropy(softmax(logits)))`, `mistakenness = (c * (2i - 1) + 1) / 2`.

Requires `label.logits` on every sample (`hardness.py:142-155` raises `ValueError` if absent). Per-frame hardness is aggregated with `np.max` over detections (`hardness.py:70`).

`leaky_splits.py` and `duplicates.py` are the parts worth stealing: exact duplicates by **file hash**, near-duplicates by **embedding index with a threshold**, and a `find_leaks(thresh)` that scans the index for cross-split neighbours.

**Findings.** (a) The famous "Brain" metrics are heuristics with acknowledged TODOs, not estimators; treat their scores as *ranking signals*, never as probabilities. (b) Mistakenness is model-relative — it needs logits, so it cannot audit the model that produced them. (c) The leakage tool is the most defensible thing in the package and is purely mechanical. [R]

### 3.4 Ultralytics `auto_annotate` — six lines of policy, no provenance

`ultralytics/data/annotator.py:10-50`: `auto_annotate(data, det_model="yolo26x.pt", sam_model="sam_b.pt", conf=0.25, iou=0.45, max_det=300, classes=None)`. Detector proposes boxes, SAM refines masks, results written as YOLO `.txt`.

Two deliberate choices: `iou=0.45` is documented as **"lower than the predict default `iou=0.7`"** — tighter NMS for auto-labels, because duplicate boxes are worse than merged ones when a human will clean up later; and `max_det=300` caps per-image output. Confidence is used for filtering and then **discarded** — nothing records that a label was machine-generated at 0.31 confidence.

**Finding:** the de-facto standard auto-labeler for YOLO datasets produces labels indistinguishable from human ones downstream. Any platform that persists per-label confidence and model identity has a real, verifiable advantage over this baseline. [R]

### 3.5 Autodistill — teacher-to-target distillation without a verifier

`autodistill/core/base_model.py`: `BaseModel` has exactly `predict()`, `label(input_folder)` and ontology plumbing (`ontology.py`, `embedding_ontology.py`). `label()` returns a `sv.BaseDataset`. There is no confidence gate, no cross-teacher agreement, no human spot-check hook in the base contract.

**Finding:** the popular "distill a foundation model into a small model" pattern is a pure relabeling pass. Any quality claim about it is a claim about the teacher, unverified. [R]

### 3.6 supervision — the tiling that makes small objects work

`src/supervision/detection/tools/inference_slicer.py`: `InferenceSlicer(callback, slice_wh=(640,…), overlap_wh=(100,…), overlap_filter=…, iou_threshold=…)`. SAHI-style: run the model on overlapping tiles, merge with NMS/IoU filtering.

**Finding:** for thin or small structures — exactly where VLM auto-labeling fails in the forum reports below — slicing at inference is a bigger lever than a better model. It is 40 lines and free. [R]

### 3.7 cleanlab, snorkel — the assumptions, in the code

- `cleanlab/filter.py`: `find_label_issues(..., frac_noise: float = 1.0, num_to_remove_per_class=None, min_examples_per_class=1, confident_joint=None)`. Docstring: *"Returned label issues are most accurate when they are computed based on out-of-sample `pred_probs`"*. `frac_noise=1.0` means "return everything you estimate is an issue" — recall-oriented, precision-uncontrolled.
- `snorkel/labeling/model/label_model.py:105`: *"are assumed to be conditionally independent given `Y`"* — the conditional-independence assumption is stated in the source, and `fit(L_train, Y_dev=None, class_balance=None)` degrades to an unidentifiable problem without `Y_dev` or a class balance.

**Findings.** Both tools are honest about their assumptions in code, and both are routinely oversold in blog posts. Cleanlab's default behaviour — return everything you estimate is an issue — is a *ranking*, not a gate; using it as a gate without a precision estimate is exactly the misuse Curlset must avoid. [R]

### 3.8 distilabel — synthetic pipelines are plumbing plus scorers

`src/distilabel/steps/` ships `deita.py` (complexity and quality scorers), `filtering/`, `clustering/`, `embeddings/`, `reward_model.py`, plus dedup covered by `tests/integration/test_deduplication.py` and `test_embedding_dedup.py`. The library supplies the pieces; every quality property is a *step you choose*, not a guarantee. No production synthetic-data framework I read ships a downstream-effect gate. The gate has to be yours. [R]

---

## 4. Forum war stories

Scores are as archived at retrieval. All are third-party claims: `[U]`.

### 4.1 The economics of a real labeling programme (r/MachineLearning)

Thread: *"Why Is Data Processing, Especially Labeling, So Expensive? So Many Contractors Seem Like Scammers"* (`/r/MachineLearning/comments/1ldaof1/`), 43 points, 30 comments.

Top comment (u/SirPitchalot, score 56), near-verbatim:

> "At my current role we have a fairly large labeling effort, by SME standards, at roughly **$2.6M/year** … roughly $2M to field teams who collect domain specific data, themselves split **10:1 into contractors:experts** for training and validation data respectively. … Then we pay about **$500k to an overseas labeler** and finally about **$50–100k for the platform**. Our small jobs are labeling ~10k carefully selected images and our larger ones are **~200–300k, where we expect only about 30% of those to be actually usable**. … Lately, our models have improved to the point where we can now use our models to distinguish between highly confident true positives/negatives and highly confident false positives and negatives. The latter we send back for more QA and relabeling."

Three things here that matter more than the number: (a) **70% of purchased labels are discarded**, so the nominal per-label price understates cost by ~3.3×; (b) the productive use of the model is **triage of the human labels**, not generation of new ones; (c) platform cost is 2–4% of total — tooling is not where the money goes.

The same thread contains the sharpest statement of the circularity objection (u/idwiw_wiw, score 38):

> "Automated labeling is like asking a kindergartner to grade their own homework."

and its correct rebuttal (u/shumpitostick, score 8): *"There is programmatic labeling, generating data from scratch using scripts, using models to label data, and various forms of label propagation … Some of these work and some don't. The devil is in the details."* The distinction is the whole argument: programmatic labeling from **independent** signals is weak supervision; model-relabeling is self-grading.

### 4.2 "85% test accuracy looked fine. Real PCB inspection exposed the actual problem." (r/computervision)

Thread `1t5clou`. The top-voted reply is a critique of the post's genre (score 24, "Always the same format: describing some problem and lessons learned, and then asking us what challenges we face") — a real signal about how much vendor-content is now posted as personal experience, and a reason to weight this thread's *comments* over its body.

The substantive reply (u/ikkiho) is the most useful single paragraph I found anywhere in this wave:

> "85% on a defect detection task where prevalence is 1 to 3% means a model can hit 97%+ by always predicting pass. … The 'test data too close to training' was almost certainly a methodology bug, not a labeling bug. **Random splits on board images leak heavily** because adjacent crops, same-batch boards, same-shift lighting, and same SKU all look way more similar than a held-out line would. Cleaner labels don't fix that. **Block your holdout by date, camera, SKU, or factory line** and the train-test gap usually collapses to something honest."

And from u/sudo-mksndwch: *"We could only train in the summer but the application was really only used in the winter."* — a distribution-shift story no benchmark captures.
### 4.3 Auto-labeling with foundation models: what breaks (r/computervision)

Thread `1xanzke` ("How can I accurately annotate 500 images … without labeling every image manually?"). The OP reports testing OWLv2 on building facades: *"it can help with glass-pane proposals, but it **struggles with thin metal members and produces false positives** for some window/door classifications."*

Practical replies with numbers:
- u/SeveralAd4533: *"label **10 to 15 images of each object type** … fine-tune a model and then use the model to label the image for me. Then I'll spend the next hour fixing the auto labelled bbox'es."*
- u/HawtVelociraptor: *"Astra label then SAM3 draw polys, minimal human correction was required … to get through about 500 images I needed to use 2 weekly resets … **Otherwise I estimate it would've cost about $1k to do**."*
- u/Candid-Fudge-4015 (the best QC advice in the thread): *"once you have a first model, **run it back over your own training set and only review images where predictions and labels disagree**. A confident prediction with no matching label is usually a box someone missed."*

That last one is a one-line implementation of disagreement-based audit that costs nothing and is not in any of the wave-1 papers.

### 4.4 The self-reported pipeline with real ablations (r/MachineLearning `1u4jnzx`)

A post titled *"ADB: automated YOLO dataset annotation (YOLOv11 → SAM2 → CLIP-verify) reaching 95.6% of manual-label mAP, plus a learned dataset-quality predictor"*. Numbers from the post body `[U]`:

- COCO2017 motorcycle subset, YOLOv11n, 50 epochs × 3 seeds: manual `mAP@0.5 = 0.551 ± 0.028`; fully automatic `0.527 ± 0.017` (**95.6% of manual, zero human labels**); one active-learning round closes most of the gap.
- Ablation: **removing the CLIP zero-shot verification costs ~3 pp mAP@0.5; removing SAM2 costs ~2 pp.** A cheap independent verifier contributes more than a better segmenter.
- "Neural DQS" predicts post-training mAP@0.5 from six dataset-level features: cross-validated Pearson **r = 0.929** on 96 degradation variants, **r = 0.714** when expanded to 144 variants, **r = 0.617** out-of-domain.

I treat the mAP numbers as unverified self-report (the thread's comments are largely about the post being AI-drafted). The **collapse of the quality predictor, 0.929 → 0.617 out-of-domain**, is the transferable lesson and matches everything else here: dataset-quality scores are in-distribution artefacts.

### 4.5 The cheapest intervention nobody sells (r/datasets `1vx6re4`)

Post title: *"Before labeling 10,000 images, label the same 100 twice."*

> "Give two annotators the same 50–100 representative images — including occlusions, cropped objects, unusual angles, blur, and borderline classes — and compare where they disagree. The disagreements usually reveal that **the problem isn't the annotators. The task itself is underspecified**: should they label the visible or full object? When is an object too occluded? What should happen when two class definitions overlap? Fix those decisions in the guidelines, repeat the pilot, and only then start labeling thousands of images."

This is a *pilot protocol*, not a metric. It is the human analogue of measuring `c` before buying models, and it is cheap enough to mandate.

### 4.6 What practitioners actually believe about QA tooling (r/datasets `1u31y00`)

> u/Any-Information-9691: "dataset management becomes a nightmare the second you pass 10k samples from mixed sources. Annotation quality is slippery — **majority voting fails constantly on edge cases**. You really need an independent QA layer calculating inter-annotator agreement metrics …"

> u/fineset-io: "the biggest bottleneck in practice is almost always the feedback loop; **you don't know your annotations are broken until the model ships and fails on a specific slice**. Running a held-out 'canary' eval set that mirrors your hardest real-world cases, labeled by your best annotators, catches this earlier than any IAA metric will."

The canary-set idea is a routing rule Curlset can implement: reserve a small, hard, SME-labeled canary set that is *never* used for training, and gate releases on it.

### 4.7 Hacker News: the demand side

- *"I've personally tested Scale's labeling service and it was much higher quality than this dataset"* (HN 22308557, 2020). Quality is only ever judged **relative to another dataset** — the problem the certificate solves.
- *"All the startups were selling generic fine tuning and labeling services … and they didn't even work on our unique super high quality super high resolution 40TB dataset"* (HN 40863937, 2024). Domain specificity again.

---

## 5. Techniques that are not in the literature (or are buried in claims and code)

1. **Discriminative audit-item selection** (patent 3). Construct the benchmark from items where above-threshold labelers *agree* and below-threshold labelers *disagree*. Equivalent to item-response-theory item selection, but stated as a selection rule anyone can implement. [P]
2. **Adaptive redundancy driven by the quality gap** (patent 1). Third annotator only where the measured gap is large. Replaces fixed k and is compatible with Curlset's `c`-first framing. [P]
3. **Multi-scale TTA prelabels + min-region suppression** (patent 2). Scales `0.5, 0.25, 1, 1.25, 1.5, 1.75, 2`, aggregate at common resolution, delete components below a size threshold, relabel island regions. Cheap, deterministic, testable. [P]
4. **Geometry-versus-model cross-check** (patent 5). Where an independent physical model agrees with the learned model, accept; where it does not, keep the geometric answer and *count the disagreement*. The 2D analogue for Curlset: OCR/document geometry, rule sets, lexicons. [P]
5. **One-vs-cluster classifiers over embeddings** (patent 7). A cheap non-LLM voter whose confidence is comparable across clusters. [P]
6. **Live consensus display at labeling time** (patent 6). Show the annotator their agreement with peers before submission. Changes behaviour; claimed by Labelbox. [P]
7. **Disagreement-only review of the *training* set** (§4.3). Run the current model over its own labels; review only where the prediction contradicts the stored label. A confident prediction with no label is usually a miss. [U]
8. **Canary eval set** (§4.6). A small hard SME-labeled set that never trains anything, used to gate releases. [U]
9. **Two-pass pilot before scale** (§4.5). 50–100 items, two annotators, adjudicate disagreements into guidelines, repeat. [U]
10. **Objective-conditioned sampling** (patent 4). Name the sampling objective explicitly and score items against it, instead of one universal "uncertainty" ranking. [P]
11. **File-hash exact dedup + embedding-threshold near-dup + cross-split leak scan** (§3.3) — the mechanical part of FiftyOne Brain that is actually correct — and **sliced inference** for thin objects (§3.6), which addresses the exact OWLv2 failure reported below. [R]
12. **Tighter NMS for auto-labels** (§3.4): `iou=0.45` instead of `0.7`; duplicate boxes cost more to fix than merged ones. [R]
13. **Occlusion → "don't care"** (patent 10). Above an occlusion threshold the correct label changes; NVIDIA claims modifying the label accordingly, and excluding distractor geometry. Synthetic pipelines usually get both wrong. [P]

---

## 6. What to adopt, what to avoid

### Adopt (ranked by value per unit of work)

1. **Audit-set selection by discrimination, not confidence** (patent 3). Curlset already needs an audit set for its certificate; choosing items that separate the ensemble from human-alone changes what the certificate *means*. Cost: one pass over existing votes. [P]
2. **Record provenance and confidence on every label** (§3.1, §3.4). The largest structural gap versus the open-source baseline: Label Studio and Ultralytics throw away the fact that a label was machine-made. One schema change, permanent value, and a precondition for any auditable certificate. [R]
3. **Disagreement-only review over the training set** (§4.3) plus a **canary set** (§4.6). Cheap, no new models, and both attack the contaminated-validation failure directly. [U]
4. **Cross-split leak scan** (§3.3) as a release gate: exact hash + embedding threshold. Deterministic and it blocks the most common way a good metric turns out to be fake. [R]
5. **Multi-scale TTA + min-region suppression** for segmentation (patent 2) and **sliced inference** for thin objects (§3.6). Inference-time only, no retraining, immediately measurable against gold. [P/R]
6. **Objective-conditioned queues** (patent 4). Even two named objectives beats one undifferentiated ranking, and it fits R5's collapse finding. [P]
7. **Pilot protocol before scale** (§4.5) as a product feature with a report: agreement pilot, adjudication log, guideline diff. The cheapest defence against a dataset becoming "consistently inconsistent". [U]

### Avoid

1. **Confidence-only review routing.** Already retired statistically by the synthesis; the field evidence is the ADB predictor collapsing out-of-domain and the PCB case where a clean validation set hid the problem. Confidence is a property of the model, not the label. [R/U]
2. **Consensus score presented as quality.** Labelbox claims live consensus display, CVAT computes it, and majority voting "fails constantly on edge cases" (§4.6). Show it as a routing signal, with the same honesty as the disagreement band. [R/U]
3. **Treating vendor auto-label numbers as transferable.** 95.6% of manual mAP on COCO motorcycles (§4.4) and $2/image on 500 facade images (§4.3) are the same technology at a 100× cost difference depending on domain. Benchmark on the customer's gold or say nothing. [U/I]
4. **Claiming a "dataset quality score".** Every implementation read here (FiftyOne uniqueness, ADB's DQS, CVAT accuracy) is relative to a dataset and a model. A number that moves with dataset composition is not a certificate. [R]5. **Copying Labelbox's claimed UI behaviour verbatim.** Auto-consensus-to-labeler is claimed (patent 6). Implement the idea with your own surface. [P]

### Cost reality (section 6 of the brief)

| Quantity | Value | Status |
|---|---|---|
| Human bbox, vendor list price | **$0.10/bbox**; polygon $0.20; classification/keypoint $0.05 (Roboflow labeling services) | [P] |
| Human image at ~5 boxes | **~$0.50/image → ~$500/1k images** | [I] (derived from the above) |
| Effective human cost after discards | Programme reported **~30% of 200–300k images usable**, $2.6M/yr total, platform 2–4% of spend | [U] (single practitioner) |
| Open-source inference | Core plan **$39 for 20 credits ≈ 160,000 inferences → ~$0.24/1k inferences** | [P] page text, [I] arithmetic |
| Frontier-VLM auto-label (label → SAM3 polygons) | **~$1,000 for ~500 images ≈ $2/image** | [U] (one practitioner estimate) |
| Self-hosted open-vocab + SAM | Not published anywhere I could verify; hardware-bound | [U] — deliberately not estimated |

The shape of the answer: **auto-labeling is 100–1,000× cheaper per item than human labeling at the inference layer, and roughly 2–4× cheaper end-to-end once review is counted** — but only where a verifier exists. Where the verifier is another LLM call (the $2/image case), the advantage largely disappears at small scale. Curlset should publish its own measured per-1k cost with review time included; nobody else does. [I]

---

## 7. References and URLs

**Patents** (claims read at Google Patents, 2026-11-04)
1. US11048979B1 — Amazon Technologies — *Active learning loop-based data labeling service* — https://patents.google.com/patent/US11048979B1/en
2. US11636602B1 — Scale AI — *Prelabeling for semantic segmentation tasks* — https://patents.google.com/patent/US11636602B1/en
3. US12189719B1 — Scale AI — *Automatic benchmarking of labeling tasks* — https://patents.google.com/patent/US12189719B1/en
4. US12271443B1 — Scale AI — *Automatic data curation* — https://patents.google.com/patent/US12271443B1/en
5. US12525013B1 — Scale AI — *Prelabeling of bounding boxes in video frames* — https://patents.google.com/patent/US12525013B1/en
6. US11361152B2 — Labelbox — *System and method for automated content labeling* — https://patents.google.com/patent/US11361152B2/en
7. US20240160900A1 — Snorkel AI — *Systems and Methods for Programmatic Labeling of Training Data* — https://patents.google.com/patent/US20240160900A1/en
8. US11211153B2 — Enlitic — *Medical scan labeling quality assurance system* — https://patents.google.com/patent/US11211153B2/en
9. US12432230B2 — Entanglement Inc — *Retraining supervised learning through label audit* — https://patents.google.com/patent/US12432230B2/en
10. US20190251397A1 — NVIDIA — *Generation of Synthetic Images For Training a Neural Network* — https://patents.google.com/patent/US20190251397A1/en

Also located but not claim-read: US11704482B2 (Labelbox), US11625892B1 (Scale AI), US20220374449A1 (Labelbox). Roboflow: zero.

**Code** (paths cited inline)
- HumanSignal/label-studio-ml-backend @ `a13c5fb` — https://github.com/HumanSignal/label-studio-ml-backend
- cvat-ai/cvat @ `fe6312e` — https://github.com/cvat-ai/cvat (`cvat/apps/consensus/`, `cvat/apps/quality_control/`)
- voxel51/fiftyone-brain @ `ba978a1` — https://github.com/voxel51/fiftyone-brain
- ultralytics/ultralytics @ `c4e0ba9` — https://github.com/ultralytics/ultralytics (`ultralytics/data/annotator.py`)
- autodistill/autodistill @ `838e1c3` — https://github.com/autodistill/autodistill
- roboflow/supervision @ `8dc5eed` — https://github.com/roboflow/supervision
- cleanlab/cleanlab @ `7506257` — https://github.com/cleanlab/cleanlab
- snorkel-team/snorkel @ `45824f9` — https://github.com/snorkel-team/snorkel
- argilla-io/distilabel @ `313fac8` — https://github.com/argilla-io/distilabel

**Forum threads**
- r/MachineLearning, *Why Is Data Processing, Especially Labeling, So Expensive?* — https://www.reddit.com/r/MachineLearning/comments/1ldaof1/
- r/computervision, *85% test accuracy looked fine. Real PCB inspection exposed the actual problem.* — https://www.reddit.com/r/computervision/comments/1t5clou/
- r/computervision, *How can I accurately annotate 500 images…* — https://www.reddit.com/r/computervision/comments/1xanzke/
- r/computervision, *ADB: automated YOLO dataset annotation (YOLOv11 → SAM2 → CLIP-verify)…* — https://www.reddit.com/r/computervision/comments/1u4jnzx/
- r/datasets, *Before labeling 10,000 images, label the same 100 twice* — https://www.reddit.com/r/datasets/comments/1vx6re4/
- r/datasets, *How do teams handle dataset quality at scale…* — https://www.reddit.com/r/datasets/comments/1u31y00/
- r/MachineLearning, *I applied an open-vocabulary VLM auto-labeling approach to satellite imagery — what worked and what broke* — https://www.reddit.com/r/MachineLearning/comments/1ro11cz/
- r/computervision, *How are you speeding up video dataset labelling?* — https://www.reddit.com/r/computervision/comments/1x0iwzy/
- HN 22308557, 40863937, 21441926, 29459385, 25065038 — https://news.ycombinator.com/item?id=22308557 (and ids likewise)

**Vendor pricing**
- Roboflow pricing (labeling services $0.10/bbox; Core $39/mo, 20 credits, 160,000 inferences) — https://roboflow.com/pricing
- Label Studio ($99/user/mo Starter Cloud) — https://labelstud.io/pricing
- CVAT (Solo $33/mo, Team $23/user/mo yearly) — https://www.cvat.ai/pricing
- Labelbox docs index (AI critic, Consensus, Benchmark pages exist; contents not verified) — https://labelbox.com/docs/

**Limits, stated plainly.** (a) Assignee-restricted patent queries for Google, Meta and Microsoft failed on rate limits; no absence is claimed. (b) Reddit numbers are self-reported and unaudited — used as cost and failure-mode evidence, never as accuracy evidence. (c) JS-rendered vendor blogs (Encord, much of Roboflow and Labelbox) could not be read reliably from this network, so vendor claims come from patents, code and static pages only — the right priority order anyway. (d) No vendor benchmark was reproduced; the only replicated items are the code behaviours marked `[R]`.
