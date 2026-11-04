# Modality Roadmap — beyond text

> **Scope authority:** the 18-type taxonomy, the MVP (text + image) work packages and the
> acceptance gates live in `docs/DATASET_TYPES_PLAN.md`. This file documents modality mechanics.

Status of every modality the platform planned, what exists today, and the order in which the Simple
Mode (wizard) UX should expose it. Grounded in `docs/REQUIREMENTS.md` (FR-020), `docs/PHASE_BY_PHASE_PLAN.md`
(Phase 13), and verified against the current code.

## What already exists (verified)

| Modality / task | Ingestion | Annotation UI | Validation | Export | Auto-label |
|---|---|---|---|---|---|
| Text classification | ✅ CSV/JSONL/TXT/JSON | ✅ wizard + workbench | ✅ | ✅ 5 formats | ✅ engine (this session) |
| Image classification | ✅ single image **and** ZIP of images (`assets`, phash/dimensions) | ✅ **wizard + workbench** | ✅ label schema | ✅ JSONL/CSV/ShareGPT | ✅ **engine (M1)** |
| Object detection | ✅ images + COCO/YOLO annotations | ✅ bbox canvas (calibrated pixels) | ✅ geometry rules | ✅ YOLO/COCO | ❌ gap |
| Paired image-text / captioning | ✅ image+text bundles from ZIP | ✅ workbench | ✅ | ✅ | ❌ gap |
| Audio transcription | ✅ WAV sniffing (channels, sample rate, duration) | ✅ waveform player + cue timeline + 0.75–1.5× | ✅ `RULE_AUDIO_TIMESTAMPS` | ✅ WebVTT + JSONL | ❌ gap |
| Document OCR | ✅ PDF magic-byte sniffing, bounded parsing | ✅ page image + region spans | ✅ span bounds | ✅ structured JSONL | ❌ gap |
| Video | ❌ not implemented (planned: keyframes → child image assets) | — | — | — | ❌ |

So the *engine* for images, audio, OCR and image-text already passes acceptance tests
(`test_object_detection_pipeline.py`, `test_additional_modalities_pipeline.py`). The missing piece is the
**Simple Mode wizard**, plus **autonomous labelling for non-text inputs**, plus generation for non-text.

## Phased plan

### M1 — Image classification end-to-end in Simple Mode — **DONE**
* Label wizard accepts images/ZIP, creates an `image_classification` dataset, shows thumbnails, keyboard
  labels, and runs the autonomous engine (which must send **actual image bytes** to the model).
* Provider work: simulated provider answers deterministically from image bytes; the OpenAI-compatible
  adapter sends multimodal `image_url` content.
* Acceptance: import 3 images → auto-label → ≥1 auto-approved with `origin=ensemble`, queue settled,
  browser test green, no console errors.

### M2 — Object detection
* Guided import (images + optional COCO/YOLO), canvas drawing already exists; add bbox **proposals** from
  a detection-capable provider (simulated deterministic boxes first), geometry validation on accept.
* Acceptance: draw/accept boxes, rules pass, YOLO/COCO export round-trips.

### M3 — Paired image-text (captioning)
* Import image+text bundles; generate captions for unlabeled images (provider `asset_bytes`), human edits,
  paired export.

### M4 — Audio transcription
* Wrap the existing waveform/cue editor in the wizard; local Whisper adapter behind the gateway
  (optional, model files not bundled); simulated transcript provider for offline demos; WebVTT export.

### M5 — Document / OCR
* PDF/image pages → region spans; optional local OCR (Tesseract) adapter; structured JSONL export.

### M6 — Video
* Deterministic keyframe extraction into child image assets, then reuse M1/M2 pipelines; temporal clip
  labels with timestamp validation.

## Generation beyond text (parallel track)

| Capability | Approach | Honesty note |
|---|---|---|
| **Images (classification datasets)** | **DONE**: OpenAI `gpt-image-2` + Meta `muse-image-1.0`, ≤25/run, low/medium quality, cost reported | Price is configuration; Meta's price unknown in this build |
| **Images (classification datasets)** | **DONE**: OpenAI `gpt-image-2` + Meta `muse-image-1.0`, ≤25/run, low/medium quality, cost reported | Price is configuration; Meta's price unknown in this build |
| Image+text pairs | Caption generation for unlabeled images; pair augmentation | No pixel synthesis without an `image_generation` provider |
| Image augmentation | Deterministic crop/flip/rotate with lineage (`augmented` origin) | Not "AI-generated"; recorded as augmentation |
| Synthetic audio | TTS provider capability (optional) or transcript-conditioned pairing | Requires a TTS provider; not bundled |
| Synthetic documents | Template + text generation, rendered to PDF (later) | Rendered layout fidelity is limited |

## Cross-cutting requirements for every new modality
1. Provenance: `origin` stays truthful (`human`, `model`, `ensemble`, `synthetic`, `augmented`).
2. Validation before persistence; geometry/timestamp bounds enforced.
3. Immutable versioning + at least one round-trip exporter.
4. Browser E2E with a real file fixture; console/page errors fail the test.
5. UI: same simple-mode contract — one primary action per screen, examples, no jargon.
6. No advertisement of a modality until ingestion, editor, validator, exporter and E2E pass.
