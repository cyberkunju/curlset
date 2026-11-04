# Auto-labeling / pre-annotation: 2026 state of the art per modality

**Prepared:** 2026-11-04. **Scope:** local-first, Python 3.12/FastAPI, laptop CPU with optional consumer GPU, no required paid APIs. **Evidence tags:** **[authors]** = the model authors' own evaluation; **[vendor]** = vendor-reported; **[inference]** = my estimate; **[unverified]** = no primary source found. Numbers are not comparable across rows unless dataset and protocol match.

## 1. Executive summary

- **Best local-first default: a two-stage pipeline, not one model.** Grounding DINO (Apache-2.0) for open-vocabulary boxes, then SAM 2.1 (Apache-2.0) with box prompts for masks. It is permissive, CPU-capable and covers detection plus segmentation. SAM 3/3.1 is better at concept segmentation but is gated, CUDA-oriented and custom-licensed, so it belongs on an optional GPU tier.
- **Zero-shot detection tops out around 52-56 COCO AP** (Grounding DINO 52.5, Grounding DINO 1.5 Pro 54.3, 1.6 Pro 55.4, DINO-X Pro 56.0); the local permissive ceiling is lower (Grounding DINO 52.5, OWLv2 44.6 LVIS-rare). Expect a large drop on a new domain.
- **Licensing is the biggest trap.** Ultralytics YOLO11/YOLO26, YOLOE and YOLO-World are AGPL-3.0/GPL-3.0; network use can force source disclosure. RF-DETR is Apache-2.0 only through Large; XL/2XL are PML-1.0. SAM 3 and DINOv3 are custom Meta licences, not OSI.
- **Human-in-the-loop gains are real but task-dependent.** SAM 2 reports 3x fewer video interactions and 6x faster image segmentation [authors]; SAM 3.1 reports ~7x faster 128-object tracking on an H100 [authors]; one vendor reports 9.7 s to 1.6-2.1 s per mask [vendor]; clinical text pre-annotation saved 13.85-21.5% per entity without reducing agreement [authors]. Measure your own acceptance and edit rates.
- **Auto-labels stay `pending_review`.** Raw confidence is not a probability. Use per-class temperature/isotonic calibration, conformal risk control for thresholds, energy-based "unknown" rejection, and a human audit sample sized with the binomial formula. No model output becomes approved without a human review event.

## 2. Per-modality findings

### 2.1 Object detection and segmentation

**SAM 2 / SAM 2.1 (Meta, Apache-2.0).** SAM 2 unified image and video promptable segmentation with streaming memory; authors report 3x fewer interactions than prior video methods and 6x faster image segmentation than SAM [R5]. SAM 2.1 is a checkpoint refresh; checkpoints range from 38.9M (tiny) to 224.4M (large) [R6]. It outputs class-agnostic masks for point, box or mask prompts, so pair it with a detector or a human click. Code and weights are Apache-2.0 [R7]; this is the default local segmentation engine. SAM 2.1 tiny/base is usable on a laptop CPU for interactive clicks (~0.3-1 s per prompt [inference]).

**SAM 3 / SAM 3.1 (Meta, custom SAM License).** SAM 3 (19 Nov 2025) adds concept prompts: a short phrase makes it exhaustively segment all instances, with a presence token that separates hard negatives such as "player in white" vs. "player in red" [R1][R2]. It tracks concepts in video with a decoupled detector-tracker. The model is 848M parameters, requires Python 3.12+, PyTorch 2.7+ and CUDA 12.6+ in the official repo, and is gated on Hugging Face [R2]. Authors report 54.1 cgF1 on SA-Co images, 30.3 on SA-V video, 50.8 on YT-Temporal-1B, and 75-80% of human performance on the 270K-concept SA-Co benchmark [R1][R2]. SAM 3.1 (27 Mar 2026) adds Object Multiplex and reports ~7x speedup at 128 objects on one H100 [R4].

The SAM License is custom: royalty-free use, reproduction, distribution and modification, but not OSI-approved; it is gated, must travel with redistributed materials, and restricts ITAR/military/nuclear/espionage/weapons uses [R3]. Commercial use is not prohibited, but legal review is needed.

**Grounding DINO, 1.5/1.6, DINO-X (IDEA Research).** Original Grounding DINO (Swin-T/B) is Apache-2.0, runs locally, and reports 52.5 COCO AP zero-shot and 63.0 after COCO fine-tuning [R8][R9]. Grounding DINO 1.5 Pro reports 54.3 COCO AP and 1.6 Pro 55.4, with strong LVIS-rare gains [R10][R11][R62]. **But 1.5/1.6 weights are API-only** via IDEA's DeepDataSpace; the repo is code/examples, not checkpoints [R10]. DINO-X Pro reports 56.0 COCO AP and 59.8 LVIS-minival, and outputs boxes, masks, keypoints and captions, but is also API-only [R12][R13]. There is **no verified Grounding DINO 2**: IDEA's line is 1.5/1.6, and a 2026 practitioner guide states no Grounding DINO 2 existed as of October 2026 [R60].

**YOLO-World and YOLOE (real-time open-vocabulary).** YOLO-World reports 35.4 LVIS AP at 52 FPS; the AILab-CVC repo is GPL-3.0 and the Ultralytics implementation is AGPL-3.0 [R14][R15][R18]. YOLOE adds text, visual and prompt-free modes plus segmentation; YOLOE-v8-L reports 35.9 LVIS AP at 102.5 FPS on a T4, and the repo is AGPL-3.0 [R16][R17]. They are fast but copyleft.

**OWLv2 (Google, Apache-2.0).** A CLIP-based open-vocabulary detector. The paper reports 44.6 LVIS-rare AP for ViT-L/14 and 47.2 for ViT-G/14 [R19]. Older and weaker than Grounding DINO, but Apache-2.0 and CPU-friendly [R20].

**Florence-2 (Microsoft, MIT).** A 0.23B/0.77B task-prompted VLM for captioning, detection, dense region captioning, phrase grounding and referring-expression segmentation; large reports 135.6 CIDEr on COCO captioning [R21][R22]. MIT-licensed, CPU-feasible, good for captions/region semantics. I found **no official Florence-3** on Hugging Face as of 2026-11-04; treat that name as unverified [R61].

**RF-DETR, D-FINE, LW-DETR (closed-set fine-tune layer).** RF-DETR is a lightweight detection transformer with a DINOv2 backbone and NAS. RF-DETR-L reports 56.5 COCO AP at 6.8 ms on a T4; 2XL reports 60.1; RF-DETR-Seg covers segmentation [R23][R24][R25]. Licence is split: Nano/Small/Medium/Large detection and all RF-DETR-Seg sizes are Apache-2.0; XL/2XL detection and Atto/Femto/Pico are PML-1.0, where commercial self-hosting needs an Enterprise add-on [R23]. With 500-2,000 human boxes, fine-tuning RF-DETR-L or D-FINE-L beats zero-shot on your domain [inference].

**DINOv3 linear probing (Meta, custom DINOv3 License).** A self-supervised backbone family (ViT-S/B/L/H+/7B, ConvNeXt). ViT-7B/16 reaches 88.4% ImageNet-1k linear-probe accuracy and 55.9 mIoU ADE20K with a linear head on frozen features [R26]. It is not a detector, but an excellent backbone for classification, retrieval and near-duplicates. The licence is custom: royalty-free, redistributable under the same agreement, attribution, and ITAR/military/nuclear/espionage/weapons restrictions [R27]. ViT-7B is GPU-only in practice; ViT-S/B are CPU-feasible [inference].

**Gemini and GPT vision (proprietary, API-only).** They output text/JSON, including normalized boxes, labels, captions and rationales. Strong at open-ended semantics, captioning, OCR and "what is this?"; weak at precise localization. Roboflow measured GPT-5 at **1.5 mAP50:95** on RF100-VL versus Gemini 2.5 Pro at **13.3**, both far below dedicated detectors [R31]. Gemini 3 Pro (Nov 2025) improves reasoning benchmarks, but published vision results are mostly reasoning, not box mAP [R32]. Paid API, not local; optional semantic escalation only [R32]. Rough cost at 1024 px, batch 1 [inference]: Grounding DINO 1-3 s CPU/30-80 ms GPU; OWLv2 0.3-1 s/20-60 ms; SAM 2.1 0.3-1 s/20-50 ms; SAM 3 GPU-only.

### 2.2 Image classification

**CLIP and SigLIP 2 zero-shot.** CLIP ViT-L/14@336 reports 76.2% ImageNet zero-shot [R28]. SigLIP 2 g/16 reports 85.0% at 384px and is Apache-2.0 [R29][R30]. SigLIP 2 is the default zero-shot classifier: better accuracy, permissive licence, Transformers support, sigmoid objective for multi-label. Use class descriptions and several prompt templates; domain accuracy is usually lower than ImageNet.

**DINOv3 linear probe vs. fine-tune.** A linear probe on frozen DINOv3 features reaches 88.4% ImageNet with the 7B backbone [R26]. It needs labels, but a few per class can beat zero-shot VLMs in-domain. Full fine-tuning usually adds a few points on in-domain accuracy but costs GPU time and risks overfitting; linear probing is the default until roughly 50-100 labels per class, after which fine-tuning/LoRA is worthwhile [inference]. DINOv3 embeddings also power kNN, clustering and active learning.

**VLM zero-shot/few-shot.** Local VLMs (Florence-2, small Qwen3-VL) can classify with natural-language definitions and rationales, helping ambiguous taxonomies. Slower and less accurate than SigLIP 2 for single-label tasks, and poorly calibrated; use for captioning, attributes and "other" triage [inference].

| Labels/class | Best method | Expected ImageNet-like accuracy | Evidence |
|---|---|---|---|
| 0 | SigLIP 2 g/16 zero-shot | 85.0% | [R29] |
| 0 | CLIP ViT-L/14@336 | 76.2% | [R28] |
| 1-4 | Linear probe on frozen DINOv3/SigLIP | ~zero-shot to +3 points | CLIP zero-shot matches a 4-shot linear classifier on the same features [R28] |
| 8-16 | Linear probe / SetFit-style head | +2-6 points over zero-shot in-domain | extrapolated from [R26][R28] **[inference]** |
| 50-100+ | Full fine-tune or LoRA | +1-3 points over linear probe | **[inference]** |

Rule: zero-shot to bootstrap, linear probe at 4-16 labels, fine-tune at 100+.

### 2.3 Text

**LLM zero-shot labeling.** A local instruct model (Qwen3 4B/8B, Apache-2.0) with strict JSON, the allowed label list, definitions, 2-5 examples and an explicit `"abstain"` option is a strong cold-start labeller. Clear taxonomies work well; subjective tasks are worse and verbalized confidence is overconfident. Use two prompts/models and route disagreements to humans.

**Weak supervision.** Snorkel's label model combines noisy heuristics, dictionaries, regexes and model votes into probabilistic labels without labelling every example; Apache-2.0 [R48]. It is the best way to encode domain rules and bootstrap. Audit the result; combine LFs with LLM votes and embedding-kNN scores.

**Embedding + kNN.** Embed with bge-m3 (MIT) or Qwen3-Embedding-0.6B (Apache-2.0), classify by cosine kNN or class centroids. With 1-5 labels/class this is a strong, near-zero-training baseline; it degrades under shift/imbalance and powers active learning and near-duplicate retrieval.

**When fine-tuning beats prompting.** Fine-tuning wins when the ontology is stable, the task has subtle jargon or policy rules, you have ~100+ labels/class, and latency/cost matter. A 2024 study of 4-bit LoRA fine-tunes across 10 base models and 31 tasks found fine-tuned models beat their base models by 34 points and GPT-4 by 10 points on average [R50]. Prompting wins when labels are scarce, the ontology changes often, or world knowledge/explanation is needed. SetFit is the middle ground: 8 examples/class is comparable to PEFT/PET with orders of magnitude fewer parameters and much faster training [R49].

| Labels/class | Best method | Expected accuracy | Evidence |
|---|---|---|---|
| 0 | LLM zero-shot + abstain | 70-90% clear tasks; lower on nuance | **[inference]** |
| 1-5 | Embedding kNN / centroid | 60-80% | **[inference]** |
| 8-64 | SetFit / linear head | 80-90% | comparable to PEFT/PET [R49] |
| 100+ | Fine-tuned encoder or 4-bit LoRA | best; +10 over GPT-4 average | [R50] |

### 2.4 Audio and video

**ASR with timestamps.** Whisper large-v3-turbo is the default: 809M, ~8x faster than large-v3 with minimal degradation, MIT [R33][R34]. Run it via faster-whisper/CTranslate2 int8 on CPU, which is faster and preserves word timestamps [R35]. Whisper timestamps are segment-level and can drift; WhisperX adds VAD segmentation and phoneme-based forced alignment for word-level timestamps [R36]. Qwen3-ASR (Jan 2026) is Apache-2.0, 0.6B/1.7B, 52 languages/dialects, with Qwen3-ForcedAligner-0.6B for timestamps in 11 languages [R37][R38]. Parakeet TDT 0.6B v3 (CC-BY-4.0) reports 1.93% WER on LibriSpeech clean [R39]; Canary 1B v2 is CC-BY-4.0 for 25 European languages [R40], while v1 is CC-BY-NC-4.0 [R41].

**Audio event tagging.** PANNs CNN14 (MIT) reports 0.439 AudioSet mAP [R42]; AST 0.485 [R43]; LAION-CLAP (Apache-2.0) supports zero-shot tags, weaker in-domain [R44]. AudioSet audio is CC-BY-4.0 but its ontology is CC-BY-SA-4.0 [R47]. Add Silero VAD (MIT) before ASR/tagging to skip silence/music [R45]; pyannote 3.1 (MIT) for diarization [R46].

**Video sampling and temporal consistency.** Decode with PyAV/FFmpeg; sample 1-2 fps plus scene-change keyframes; deduplicate near-identical frames with perceptual hashes before annotation. Detect on keyframes, propagate with SAM 2.1 video or ByteTrack (MIT), and require human confirmation on keyframes and tracks that change shape, leave the frame or re-enter. SAM 2's streaming memory is built for this; authors report 3x fewer interactions than prior video segmentation [R5]. Guard with IoU continuity, track-length filters, and re-prompt on low IoU. One 2025 study reports unsupervised segmentation can cut video semantic-segmentation annotation need by about one third with similar performance [R58]; task-specific, not universal.

### 2.5 Human-in-the-loop UX that speeds annotation

**Interactive segmentation.** Detector proposes a box, human clicks 1-5 times to correct the mask, then accepts. Acuna et al. showed >80% mIoU with ~5 clicks/object, a >50% reduction versus the prior tool [R56]. SAM 2.1 makes this local; SAM 3/3.1 improves concepts but needs a GPU. Cache image embeddings, support positive/negative clicks, and convert mask to box/polygon.

**Label propagation.** Cluster frames by perceptual hash + embedding cosine; annotate one representative, propagate to the cluster, mark `pending_review` with `propagated_from`. For video, propagate along tracks, not across unrelated frames. Review the representative and a random sample, not every frame. It is the largest video/burst speedup, but also amplifies one mistake; require per-cluster audit.

**Box correction and keyboard-first.** Pre-fill boxes; nudge/resize with arrows; snap to proposals at high IoU; "accept all above threshold" as a batch action. Show model label/confidence, but offer "blind review" to reduce anchoring. Suggested keys: `1-9` class, `Enter` accept, `X` reject, `Tab` next, `B` new box, `S` segment, `Z` undo, arrows nudge, `Shift+arrows` resize, `Space` pan, `+/-` zoom. Auto-advance to the next low-confidence item. Keep UI actions under 100 ms; run inference async.

**Acceptance statistics.** Per model/class/day log proposals, accepted, rejected, edited, straight-through, time-to-accept and edit magnitude. Compute precision with a Wilson interval. Use these to set per-class thresholds and decide batch readiness. Reuse `packages/dataset_ensemble/selection.py::audit_sample_size`.

| Intervention | Reported speedup | Source |
|---|---|---|
| SAM 2 vs. SAM, image | 6x faster | authors [R5] |
| SAM 2 vs. prior video | 3x fewer interactions | authors [R5] |
| SAM 3.1 Object Multiplex, 128 objects, H100 | ~7x vs. SAM 3 | authors [R4] |
| SAM 2 pre-labeling per mask | 9.7 s → 1.6-2.1 s (5-6x; ~370 → ~1,700-2,250 masks/h) | vendor [R57]; derivation **[inference]** |
| Interactive segmentation | >80% mIoU, ~5 clicks/object | peer-reviewed [R56] |
| Clinical NER pre-annotation | 13.85-21.5% time saved/entity, no IAA loss | peer-reviewed [R55] |
| Active semi-supervised annotation | 3.2x vs. manual polygons; 1.9x vs. active learning | 2026 study, abstract/paywalled [R58] |

Realistic: **2-6x for assisted image/video, 10-20% for text pre-annotation.** A "90% fewer hours" claim from one agricultural SAM-YOLOv8 study [R59] is domain-specific; do not generalize.

### 2.6 Quality control for auto-labels

**Confidence thresholding is necessary but insufficient.** Detector scores are ranking scores, not calibrated probabilities; detectors are miscalibrated in- and out-of-domain [R52]. A global 0.5 over-accepts easy classes and under-accepts rare ones; use per-class thresholds selected on a calibration split and report precision/coverage.

**Per-class calibration.** Fit temperature scaling (or isotonic regression with enough data) per class/class group on held-out data [R51]. For detectors, calibrate classification and localization separately: a box can have the right class and bad geometry. Track ECE/reliability per class; recalibrate after any model, prompt or data-source change.

**Open-set rejection.** When an object is not in the ontology, output "unknown", not the nearest class. Use an energy score (`-T logsumexp(logits/T)`) or max-logit/Mahalanobis score [R54], plus a no-object/presence score (SAM 3's presence token [R1]). Route low-score/high-energy items to a human "new class?" queue; cluster embeddings to propose ontology additions.

**Thresholds with a guarantee.** Use conformal risk control: choose the acceptance threshold on a calibration set so expected error on accepted items is below target with a distribution-free bound [R53]. This answers "how many auto-labels can we ship at 99% precision?" and should be combined with a human audit.

**Audit size.** For zero observed errors, `n ≥ ln(δ)/ln(p)`; for p=0.99, δ=0.05, n=299. With allowed errors, use exact binomial/PAC. This is a statistical calculation, not a benchmark.

| Failure mode | Guardrail |
|---|---|
| Domain shift collapses zero-shot mAP | 200-500 image pilot; per-site eval; fine-tune before scale |
| Small/occluded objects missed | Tiling/upscale; per-size buckets; lower threshold + review |
| Class imbalance / rare-class forcing | Per-class thresholds; balanced calibration; open-set rejection |
| Prompt/ontology mismatch (synonyms, hierarchy) | Versioned prompts; ontology mapping; label-schema validation |
| Near-duplicate leakage | pHash/embedding dedupe before split; cluster-level splits |
| VLM hallucination | Never use VLM boxes as ground truth; detector/human confirmation |
| ASR hallucination on silence/music | VAD; no-speech probability; review low-confidence segments |
| Video drift/ID switch | IoU continuity; re-prompt; keyframe audit |
| False confidence (correlated models, human anchoring) | Diverse families; blind review; seeded gold; straight-through error audit |
| Calibration drift | Weekly acceptance/precision monitoring; recalibrate on fresh data |

## 3. Model comparison table

| Model | Task | Licence | Reported quality | Hardware | Notes |
|---|---|---|---|---|---|
| SAM 3 / 3.1 | Concept seg + video tracking | SAM License (custom) [R3] | 54.1 cgF1 SA-Co image; 30.3 SA-V; 75-80% human [R1][R2] | CUDA GPU, 848M; gated | Best open-vocab concepts; not laptop CPU; 3.1 ~7x at 128 objects/H100 [R4] |
| SAM 2.1 | Promptable image/video seg | Apache-2.0 [R7] | 6x faster than SAM; 3x fewer video interactions [R5] | CPU/GPU; 39-224M | Default local segmentation; class-agnostic |
| Grounding DINO Swin-T/B | Open-vocab detection | Apache-2.0 [R8] | 52.5 COCO zero-shot; 63.0 fine-tuned [R9] | CPU/GPU | Default local detector |
| Grounding DINO 1.5/1.6 Pro | Open-vocab detection | Code Apache; weights API-only [R10] | 54.3 / 55.4 COCO [R10][R62] | API only | No local weights |
| DINO-X Pro | Open-world det/seg/caption | API only [R12] | 56.0 COCO; 59.8 LVIS-mini [R12] | API only | Quality ceiling reference |
| OWLv2 | Open-vocab detection | Apache-2.0 [R20] | 44.6 LVIS-rare (L/14); 47.2 (G/14) [R19] | CPU/GPU | Permissive fallback |
| YOLO-World | Open-vocab detection | GPL-3.0 / AGPL-3.0 [R15][R18] | 35.4 LVIS at 52 FPS [R14] | CPU/GPU | Copyleft; not for closed SaaS |
| YOLOE | Open-vocab det + seg | AGPL-3.0 [R17] | 35.9 LVIS at 102.5 FPS (v8-L) [R16] | CPU/GPU | Copyleft; speed play |
| RF-DETR-L | Closed-set detection | Apache-2.0 [R23] | 56.5 COCO; 6.8 ms T4 [R23] | CPU/GPU | Fine-tune layer |
| RF-DETR-2XL | Closed-set detection | PML-1.0 [R23] | 60.1 COCO [R23] | GPU | Self-host needs Enterprise |
| Florence-2 | Caption/OD/grounding | MIT [R21] | 135.6 CIDEr COCO caption [R22] | CPU/GPU | Semantics, not precise boxes |
| DINOv3 | Backbone/linear probe | DINOv3 License (custom) [R27] | 88.4% ImageNet linear (7B) [R26] | CPU S/B; GPU 7B | Embeddings/classification |
| CLIP | Zero-shot classification | MIT [R28] | 76.2% ImageNet [R28] | CPU/GPU | Baseline |
| SigLIP 2 | Zero-shot classification | Apache-2.0 [R30] | 85.0% ImageNet (g/16) [R29] | CPU/GPU | Default classifier |
| Gemini/GPT VLMs | VLM | Proprietary | Gemini 2.5 Pro 13.3, GPT-5 1.5 mAP RF100-VL [R31] | API only | Paid; weak boxes |
| Whisper large-v3-turbo | ASR | MIT [R33] | 809M; ~8x faster [R33] | CPU/GPU | Default ASR |
| Qwen3-ASR 0.6B/1.7B | ASR + LID | Apache-2.0 [R37] | SOTA open-source per authors; 52 langs [R38] | CPU/GPU | Multilingual |
| Parakeet TDT 0.6B v3 | ASR | CC-BY-4.0 [R39] | 1.93% WER LibriSpeech clean [R39] | CPU/GPU | English/EU |
| PANNs CNN14 | Audio tagging | MIT [R42] | 0.439 AudioSet mAP [R42] | CPU | Baseline |
| CLAP | Zero-shot audio | Apache-2.0 [R44] | No single mAP [R44] | CPU/GPU | Flexible tags |

## 4. Recommended default stack + integration design

### 4.1 Stack

| Layer | Default | Fallback | Why |
|---|---|---|---|
| Open-vocab detection | Grounding DINO Swin-T | OWLv2 base | Permissive, local, 52.5 COCO |
| Segmentation | SAM 2.1 tiny/base, box-prompted | SAM 3/3.1 GPU | Apache, CPU-capable |
| Closed-set detection | RF-DETR-L / D-FINE-L | RF-DETR-S/M | Fine-tune at 500+ boxes |
| Image classification | SigLIP 2 base/so400m | CLIP; DINOv3 probe | Best permissive zero-shot |
| Caption/OCR | Florence-2 | Small Qwen3-VL | Local, small |
| Text embeddings | bge-m3 / Qwen3-Embedding-0.6B | MiniLM-L6 | Multilingual kNN |
| Text few-shot | SetFit | Logistic regression | 8-64 labels/class |
| Text zero-shot | Qwen3 4B/8B via Ollama | Other local LLM | Apache, JSON |
| ASR | faster-whisper turbo | Qwen3-ASR 0.6B; Parakeet v3 | CPU int8, permissive |
| Audio events | PANNs CNN14 | AST; CLAP | MIT, local |
| Video | PyAV + pHash + SAM 2.1 + ByteTrack | SAM 3/3.1 GPU | Propagation with audit |
| QC | Per-class calibration + conformal + energy OOD | Human-only | Auditable |

Do **not** use Ultralytics YOLO/YOLOE/YOLO-World by default unless AGPL-compatible or commercially licensed. The accuracy gain does not justify the legal risk.

### 4.2 Integration for this codebase

The existing `BaseProvider`, `ProviderGateway`, `AIAnnotationOrchestrator` and `pending_review` semantics fit (`packages/provider_gateway/*`, `services/api/routes/inference.py`). Minimal path:

1. **Local package with lazy imports.** Add `packages/local_inference/` (`registry`, `vision`, `audio`, `video`, `calibration`). Put heavy deps in optional extras; core must start without them and return `503 LOCAL_MODEL_UNAVAILABLE`.
2. **Model registry with licence metadata.** Each entry: id, revision, SHA-256, tasks, params, licence, commercial/redistribution/gated flags, hardware, prompt version. Refuse incompatible licences unless `CURLSET_ALLOW_COPYLEFT_MODELS=1`.
3. **`LocalVisionProvider`/`LocalAudioProvider`.** Capabilities `OBJECT_DETECTION`, `IMAGE_CLASSIFICATION`, new `INSTANCE_SEGMENTATION`, `AUDIO_TRANSCRIPTION`, `AUDIO_EVENT_TAGGING`. Normalize payloads: detection `{"boxes":[{label,confidence,x,y,w,h,mask_rle|polygon,track_id}]}`; classification `{label,confidence,scores}`; ASR `{text,language,segments:[{start,end,text,words}]}`; events `{tags:[{label,confidence,start,end}]}`. Store model id/revision/prompt hash/threshold profile/device/latency as provenance.
4. **New pre-annotation route.** `POST /api/v1/datasets/{dataset_id}/preannotate` with `strategy` (`open_vocab_detect`, `classify_zero_shot`, `asr`, `embed_knn`, `video_track`), `model_bundle`, `class_prompts`, `threshold_profile`, `limit`, `split`, `device`, `dry_run`, `materialize=false`. Reuse `verify_dataset_access(..., "editor")`, rate limiter and `AuditService`; return `202` with a `ProcessingRun`.
5. **Extend orchestrator, not semantics.** Add an optional `proposal_mapper` and provenance. Keep **no model output ever `approved`**; acceptance is a separate human `ReviewEvent`, which also fixes the dossier's C1 forgery risk at product level.
6. **Segmentation schema.** There is no segmentation task and boxes are not bounds-checked (dossier C4). Add `TaskType.INSTANCE_SEGMENTATION` with masks (COCO RLE or polygon) + boxes. Validate finite coords, `0<=x,y`, `x+w<=1`, `y+h<=1`, mask size matches asset, polygon closed/non-self-intersecting. Store image width/height in provenance.
7. **Interactive endpoint.** `POST /api/v1/assets/{asset_id}/interactive-segment` with `{points:[{x,y,label}],box,session_id}` returns mask/score. Cache the SAM 2.1 image embedding per session; evict after idle. Keep it separate from batch.
8. **Front-end.** In `AnnotationWorkspace.tsx`/`ObjectDetectionCanvas.tsx`: model layer (dashed outline, badge), accept/reject/accept-all-above-threshold, mask overlay with positive/negative clicks, keyboard shortcuts, blind-review toggle, and a pre-annotation summary. Keep `origin` visible.
9. **Calibration tables.** Add `ModelProfile` and `CalibrationProfile` (per-class temperature/isotonic, thresholds, target precision, calibration hash, created_at). Store active profile on the run. Add a `QualityReport` section: coverage, acceptance, straight-through, edit rate, per-class precision/Wilson CI, drift. Reuse `audit_sample_size`.
10. **Exports and worker.** Extend `coco_exporter.py`/`yolo_exporter.py` for COCO/YOLO-seg masks and manifest provenance. Fix the `assets[0]` thumbnail bug before masks (dossier C5). Use `services/api/worker.py` with a device lock, memory watchdog, model unload, and idempotency key `asset.sha256+model_id+revision+prompt_hash+threshold_profile`.
11. **Privacy/security.** Download only pinned official weights with checksums; `trust_remote_code=False`; never auto-accept gated licences; never send assets to cloud unless the project privacy mode allows; audit model downloads/licence acceptance.

## 5. Licence and quality traps

### 5.1 Licence traps

1. **AGPL is the default trap.** Ultralytics YOLO11/YOLO26, YOLOE and its YOLO-World implementation are AGPL-3.0; network use can require releasing the service source [R18][R17]. YOLO-World's original repo is GPL-3.0 [R15]. For a commercial platform this is the most expensive mistake.
2. **RF-DETR is split-licensed.** L and below plus all RF-DETR-Seg are Apache-2.0; XL/2XL and Atto/Femto/Pico are PML-1.0, with commercial self-hosting needing an Enterprise add-on [R23]. Teams benchmark 2XL (60.1 AP) then ship it assuming "RF-DETR is Apache".
3. **Apache code ≠ Apache weights.** Grounding DINO 1.5/1.6 and DINO-X repos are code/examples; the strong weights are API-only [R10][R12]. You cannot self-host the 54-56 AP models, and API terms may restrict commercial use.
4. **SAM 3 and DINOv3 are custom, not OSI.** Both allow commercial use in principle, but impose gated access, redistribution, attribution and military/ITAR restrictions [R3][R27]. SAM 2 is Apache-2.0; SAM 3 is not.
5. **Audio versions change licence.** Canary v1 is CC-BY-NC-4.0, v2 is CC-BY-4.0 [R40][R41]; pyannote 3.1 is MIT, community-1 is CC-BY-4.0 [R46]. Pin versions and record licences.
6. **Ontology licences are separate.** AudioSet audio is CC-BY-4.0 but its ontology is CC-BY-SA-4.0 [R47]; a derived hierarchy may inherit share-alike.
7. **"Open weights" ≠ open source.** DINOv3, SAM 3, Llama and Gemma have custom terms; "downloadable" is not a licence. Store a licence id and commercial flag, not a URL.
8. **Training-data provenance.** A permissively licensed model may have non-commercial training data; the weight licence usually governs, but high-risk uses need legal review.

### 5.2 Quality traps

1. **Zero-shot benchmarks do not transfer.** COCO/LVIS are web imagery; run a domain pilot.
2. **Confidence is not precision.** A 0.9 score can be 70% precise on a rare class; calibrate per class and audit.
3. **VLM boxes are not detection.** GPT-5 1.5 and Gemini 2.5 13.3 mAP on RF100-VL are far below detectors [R31]; use VLMs for semantics.
4. **SAM is class-agnostic.** A good mask can be the wrong object; the detector's label is the semantic weak point.
5. **Open-vocab models are weak on rare/small objects.** LVIS-rare AP is much lower; global thresholds hide it.
6. **Pre-annotation anchors humans.** Blind review, seeded gold items, straight-through error measurement.
7. **Near-duplicate leakage inflates everything.** Deduplicate before splitting and clustering.
8. **Consensus is not independence.** Same-family models share errors; use diverse families + human audit.
9. **ASR hallucination is real.** VAD + no-speech probability + review low-confidence segments.
10. **Video propagation drifts.** Keyframe audits + IoU continuity catch it.

## 6. References

[R1] Carion et al., SAM 3, arXiv:2511.16719. https://arxiv.org/abs/2511.16719

[R2] Meta, facebookresearch/sam3. https://github.com/facebookresearch/sam3

[R3] Meta, SAM License. https://github.com/facebookresearch/sam3/blob/main/LICENSE

[R4] Meta, SAM 3.1 release notes. https://github.com/facebookresearch/sam3/blob/main/RELEASE_SAM3p1.md

[R5] Ravi et al., SAM 2, arXiv:2408.00714. https://arxiv.org/abs/2408.00714

[R6] Meta, facebookresearch/sam2. https://github.com/facebookresearch/sam2

[R7] Meta, SAM 2 Apache-2.0 license. https://github.com/facebookresearch/sam2/blob/main/LICENSE

[R8] IDEA Research, GroundingDINO. https://github.com/IDEA-Research/GroundingDINO

[R9] Liu et al., Grounding DINO, arXiv:2303.05499. https://arxiv.org/abs/2303.05499

[R10] IDEA Research, Grounding-DINO-1.5-API. https://github.com/IDEA-Research/Grounding-DINO-1.5-API

[R11] Ren et al., Grounding DINO 1.5, arXiv:2405.10300. https://arxiv.org/abs/2405.10300

[R12] IDEA Research, DINO-X-API. https://github.com/IDEA-Research/DINO-X-API

[R13] Ren et al., DINO-X, arXiv:2411.14347. https://arxiv.org/abs/2411.14347

[R14] Cheng et al., YOLO-World, arXiv:2401.17270. https://arxiv.org/abs/2401.17270

[R15] AILab-CVC, YOLO-World (GPL-3.0). https://github.com/AILab-CVC/YOLO-World

[R16] Wang et al., YOLOE, arXiv:2503.07465. https://arxiv.org/abs/2503.07465

[R17] THU-MIG, YOLOE (AGPL-3.0). https://github.com/THU-MIG/yoloe

[R18] Ultralytics (AGPL-3.0). https://github.com/ultralytics/ultralytics

[R19] Minderer et al., OWLv2, arXiv:2306.09683. https://arxiv.org/abs/2306.09683

[R20] HF, OWLv2 docs. https://huggingface.co/docs/transformers/model_doc/owlv2

[R21] Microsoft, Florence-2-large (MIT). https://huggingface.co/microsoft/Florence-2-large

[R22] Xiao et al., Florence-2, CVPR 2024. https://openaccess.thecvf.com/content/CVPR2024/papers/Xiao_Florence-2_Advancing_a_Unified_Representation_for_a_Variety_of_Vision_CVPR_2024_paper.pdf

[R23] Roboflow, rf-detr. https://github.com/roboflow/rf-detr

[R24] Robinson et al., RF-DETR, arXiv:2511.09554. https://arxiv.org/abs/2511.09554

[R25] Roboflow, RF-DETR benchmarks. https://github.com/roboflow/rf-detr/blob/develop/docs/learn/benchmarks.md

[R26] Siméoni et al., DINOv3, arXiv:2508.10104. https://arxiv.org/abs/2508.10104

[R27] Meta, DINOv3 License. https://github.com/facebookresearch/dinov3/blob/main/LICENSE.md

[R28] Radford et al., CLIP, arXiv:2103.00020. https://arxiv.org/abs/2103.00020

[R29] Tschannen et al., SigLIP 2, arXiv:2502.14786. https://arxiv.org/abs/2502.14786

[R30] Google, SigLIP 2 So400m (Apache-2.0). https://huggingface.co/google/siglip2-so400m-patch14-384

[R31] Roboflow, GPT-5 vision evaluation. https://roboflow.com/blog/gpt-5-vision-multimodal-evaluation

[R32] Google, Gemini 3 blog. https://blog.google/products-and-platforms/products/gemini/gemini-3/

[R33] OpenAI, whisper. https://github.com/openai/whisper

[R34] OpenAI, whisper-large-v3-turbo. https://huggingface.co/openai/whisper-large-v3-turbo

[R35] SYSTRAN, faster-whisper. https://github.com/SYSTRAN/faster-whisper

[R36] Bain et al., WhisperX, arXiv:2303.00747. https://arxiv.org/abs/2303.00747

[R37] Qwen, Qwen3-ASR (Apache-2.0). https://github.com/QwenLM/Qwen3-ASR

[R38] Qwen3-ASR report, arXiv:2601.21337. https://arxiv.org/abs/2601.21337

[R39] NVIDIA, parakeet-tdt-0.6b-v3 (CC-BY-4.0). https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3

[R40] NVIDIA, canary-1b-v2 (CC-BY-4.0). https://huggingface.co/nvidia/canary-1b-v2

[R41] NVIDIA, Canary v1 blog (CC-BY-NC-4.0). https://developer.nvidia.com/blog/new-standard-for-speech-recognition-and-translation-from-the-nvidia-nemo-canary-model/

[R42] Kong et al., PANNs, arXiv:1912.10211. https://arxiv.org/abs/1912.10211

[R43] Gong et al., AST, arXiv:2104.01778. https://arxiv.org/abs/2104.01778

[R44] LAION, clap-htsat-fused (Apache-2.0). https://huggingface.co/laion/clap-htsat-fused

[R45] Silero VAD (MIT). https://github.com/snakers4/silero-vad

[R46] pyannote (MIT). https://github.com/pyannote/pyannote-audio

[R47] Google, AudioSet download. https://research.google.com/audioset/download.html

[R48] Ratner et al., Snorkel, arXiv:1715.05761. https://arxiv.org/abs/1715.05761

[R49] Tunstall et al., SetFit, arXiv:2209.11055. https://arxiv.org/abs/2209.11055

[R50] LoRA Land, arXiv:2405.00732. https://arxiv.org/abs/2405.00732

[R51] Guo et al., Calibration, arXiv:1706.04599. https://arxiv.org/abs/1706.04599

[R52] Kuzucu et al., Detector calibration, ECCV 2024. https://www.ecva.net/papers/eccv_2024/papers_ECCV/papers/03148.pdf

[R53] Mossina et al., Conformal object detection, arXiv:2505.24038. https://arxiv.org/abs/2505.24038

[R54] Liu et al., Energy OOD, NeurIPS 2020. https://proceedings.neurips.cc/paper_files/paper/2020/file/f5496252609c43eb8a3d147ab9b9c006-Paper.pdf

[R55] Pre-annotation speed/bias, PubMed 24001514. https://pubmed.ncbi.nlm.nih.gov/24001514/

[R56] Acuna et al., Polygon-RNN++, CVPR 2018. https://openaccess.thecvf.com/content_cvpr_2018/papers/Acuna_Efficient_Interactive_Annotation_CVPR_2018_paper.pdf

[R57] Voxel51, SAM annotation blog (vendor). https://voxel51.com/blog/what-sam-3-means-for-annotation

[R58] Kim et al., Human-efficient annotation, 2026. https://www.sciencedirect.com/science/article/pii/S266730532600075X

[R59] Zhao et al., MDPI Agriculture 15(5):1081, 2025. https://www.mdpi.com/2073-4395/15/5/1081

[R60] Forasoft, 2026 open-vocabulary guide. https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/open-vocabulary-detection-grounding-dino-florence-2-rtdetr-rfdetr

[R61] HF search, Florence-3. https://huggingface.co/models?search=Florence-3

[R62] IDEA Research, DINO-X README comparison table. https://github.com/IDEA-Research/DINO-X-API
