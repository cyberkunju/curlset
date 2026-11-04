# Dataset-Type Scope Plan — 18 types, tiered

Authoritative scope plan for expanding the platform beyond text. Grounded in the current engine:
task types present today are **`text_classification`, `image_classification`, `object_detection`,
`paired_image_text`, `audio_transcription`, `document_ocr`**; export formats are **CSV, JSONL, COCO,
YOLO, WebVTT, Unsloth ShareGPT-VLM, Axolotl, LLaMA-Factory, Ultralytics YOLO**; asset roles cover
images, audio, paired text and source documents.

**Rule (from REQUIREMENTS.md):** a dataset type is only "supported" when ingestion, annotation editor,
validation, immutable versioning, at least one round-trip exporter **and** a browser E2E test pass. Until
then it is not advertised anywhere in the UI.

---

## 1. The 18 types, tiered

| # | Dataset type | Tier | What it maps to in this engine | Gap to close |
|---|---|---|---|---|
| 1 | **Text** | **MVP-1 (done)** | `text_classification` + CSV/JSONL/TXT import, wizard, auto-label, NL edit, 5 exports | polish only |
| 2 | **Image** | **MVP-2 (in progress)** | classification + **generation** done; `object_detection` canvas verified; asset storage + phash; COCO/YOLO exporters | export bundle I2, detection guidance I3, captioning I4, quality I5 |
| 3 | **Audio** | Next | `audio_transcription`; WAV metadata, waveform UI, WebVTT | wizard + local Whisper adapter + audio classification |
| 4 | **Video** | Next | none (needs keyframe extraction) | new asset lineage + temporal schema |
| 5 | **Multimodal** (text+image) | Near | `paired_image_text` bundles | caption generation + VLM export bundle |
| 6 | **Tabular** | Near | CSV rows already persist as `metadata`; schema/validation exists per task | typed column schema task type + table editor |
| 7 | **Time-series** | Near | numeric rows + timestamps | series task schema, window validator, plot UI |
| 8 | **Geospatial** | Later | tabular + image primitives exist | CRS/bbox validator, map preview, GeoJSON export |
| 9 | **3D / Spatial** | Later | asset storage only | point-cloud/mesh viewer, voxel schema |
| 10 | **Motion / Pose** | Later | image + keypoint primitives | skeleton schema, per-frame editor |
| 11 | **Graph** | Later | records + relations exist (assets/lineage) | node/edge schema + graph editor |
| 12 | **Code** | Near | text pipeline applies directly | code-aware normalization, test-based validation, language metadata |
| 13 | **Scientific** | Later | image/text pipeline partly applies | domain schemas (molecular, microscopy), units validation |
| 14 | **Medical** | Later (sensitive) | image + text pipelines apply | de-identification checks, consent/licence metadata, DICOM |
| 15 | **Sensor / IoT** | Later | time-series primitives | high-frequency ingestion + windowing |
| 16 | **Neurophysiological** | Later | time-series + signal formats | EDF/EEG readers, channel schema |
| 17 | **Robotics** | Later | video + sensor + pose combined | trajectory/action schema, episode format |
| 18 | **Transactional** | Near | tabular + text | event schema, PII redaction policy |

Tier meaning: **MVP** = this project's deliverable; **Next** = first post-MVP expansion; **Near** =
maps cleanly onto existing primitives, cheap to add once MVP is stable; **Later** = requires new
primitives (viewers/readers) and is explicitly out of scope for this MVP.

---

## 2. MVP-1 — Text (definition of done)

Already delivered and verified (see `docs/EXECUTION_PLAN.md`): import, wizard generation with live ETA,
sample-guided plans, manual labeling, **autonomous labeling engine**, natural-language editing with
undo, quality rules, immutable versions, deterministic exports, browser E2E.

Remaining polish (T1–T3), none of which blocks MVP:
* **T1** export parity check across all text formats on a 200-row dataset (golden files).
* **T2** quality-rule copy in plain language (Simple Mode) for every rule id.
* **T3** optional live-provider validation of the auto-label engine (requires keys; currently simulated).

## 3. MVP-2 — Image (work packages)

Image is the second MVP type. **I0 and I1 are done**; I2–I6 remain, ordered by dependency.

### I0 — Image generation via real providers ✅ DONE
*What:* bounded image dataset generation from a text description. Providers: **OpenAI `gpt-image-2`**
(PNG, priced) and **Meta `muse-image-1.0`** on `https://api.meta.ai/v1` (WEBP; public price not
configured → reported as unknown, never assumed free). Hard cap **25 images per run**, `low`/`medium`
quality (default `low`), per-image cost accounting and an optional `max_cost_usd` guard.
*Evidence:* a **25-image dataset** generated end-to-end — 25/25 accepted, **$0.275** exact, 250 s,
1024×1024 PNGs, labels distributed across the classes, records `origin=synthetic` at `pending_review`;
a browser test generates 2 images through the wizard and shows thumbnails + cost.
*Acceptance:* job progress/ETA/cancel; cap enforced server-side (26 → 422); no paid call without an
explicit provider and quality; full prompt/provider lineage per asset.

### I7 — Dataset-type chooser & natural-language detection ✅ DONE
*What:* Home exposes a **New dataset** chooser for the whole catalogue (available / beta / planned,
planned disabled); `GET /api/v1/dataset-types` is the single source of truth; plan drafting scores a
weighted lexicon over every type and **always asks** when the request is non-text or uncertain, with a
type switch in the wizard. Object-detection datasets can be generated as **base images** (no boxes),
then handed to the workbench.
*Evidence:* the reported prompt now detects **Object detection** and asks for confirmation; browser test
`e2e:ui:dataset-types` **20/20** (chooser lists all types with statuses, image type opens the wizard,
the bottle-labeling prompt asks, 2 base images generated, hand-off to boxing).

### I1 — Image classification in Simple Mode ✅ DONE
Acceptance (all verified): ZIP/single image upload → `image_classification` dataset → real thumbnails →
keyboard labels → **autonomous labeling with actual image bytes** → machine-labelled provenance copy →
browser E2E 9/9.

### I2 — Image export bundle ✅ DONE
*What:* image datasets must export **with their pixels**, not only labels. Add `include_media` to version
export: ZIP containing `images/<original or asset-id>.<ext>`, `labels.jsonl` / `labels.csv`, and a
`manifest.json` (record id, asset id, sha256, dimensions, split, label, provenance).
*Acceptance:* export → re-import the bundle reproduces the same records/labels; no placeholder paths;
media count equals record count; deterministic when source bytes are unchanged.
*Tests:* exporter unit test + round-trip integration test.
*Status:* implemented as the **`image_bundle`** export format — `images/00000_<stem>.<ext>` (collision-safe, stable order), `labels.jsonl`, `labels.csv`, `images/README.md`, `manifest.json`, `README.md`. Live proof on the 25 generated images: 24.4 MB archive, 25 images + 25 label rows, byte-deterministic, SHA-256 of each bundled image matches `asset_sha256`; round-trip integration test re-imports the bundle into a new dataset and reproduces the same labels and a publishable dataset. UI option shown in the export dialog.

### I3 — Object detection (guided)
*What:* import images (optionally with COCO/YOLO pre-labels) → draw/accept boxes in the guided flow
(existing `ObjectDetectionCanvas` is reused) → **bbox proposals** from an `object_detection`-capable
provider (simulated deterministic first) → validate geometry → export COCO/YOLO.
*Status:* the workbench canvas is **verified in a real browser** (draw → save → geometry persisted and
inside image bounds), and empty-box saves are blocked. Still missing: the wizard-guided detection flow and
provider box proposals.
*Acceptance:* imported pre-labels validated against image bounds; proposals are `model` origin; COCO/YOLO
round-trip; canvas keyboard shortcuts documented.

### I4 — Paired image-text / captioning
*What:* import image+caption bundles (ZIP pairing already exists) → generate captions for unlabeled
images (provider `asset_bytes`) → edit → export ShareGPT-VLM/Axolotl formats.
*Acceptance:* caption generation routed as `model` origin, human edits preserved as revisions, export
contains image reference + caption; browser E2E.

### I5 — Image quality and duplicate handling in Simple Mode
*What:* surface phash near-duplicate detection, corrupt-image rejection, class-balance summary and split
warnings in the guided flow; allow one-click "reject duplicates".
*Acceptance:* duplicates detected on a fixture set, removal reversible, rules integrated in validation
summary.

### I6 — Real vision provider validation (optional, needs user keys)
*What:* run the multimodal adapter against a real vision endpoint once, record cost/latency in
`experiments/`, document limits.
*Acceptance:* evidence file exists; no accuracy claims without it.

**Definition of done for MVP-2:** I2–I5 complete, browser E2E suites green
(`e2e:ui:image` + boxing + image-gen variants), backend suite green, docs updated, no placeholder controls.

---

## 4. Next after MVP — Audio & Video

### A1 Audio transcription in Simple Mode
Wrap the existing waveform/cue editor in the wizard; providers: local Whisper adapter (not bundled),
simulated transcript provider for offline tests. Export WebVTT/JSONL.
### A2 Audio classification / sound events
New task type `audio_classification` + segment labels; reuses the waveform.
### V1 Video keyframes
Deterministic frame extraction (ffmpeg-like, bounded) into **child image assets** with lineage, reusing
I1/I3 pipelines for labeling.
### V2 Temporal clip labels
Schema with validated start/end times; export clip windows.

---

## 5. Sequencing and gates

| Order | Slice | Gate to pass |
|---|---|---|
| 0 | I0 image generation (real providers) | **DONE** — 25-image dataset, cost capped/reported |
| 1 | I2 image export bundle | round-trip test (export → import) |
| 2 | I3 object detection guided | browser E2E + COCO/YOLO golden |
| 3 | I4 captioning/pairs | browser E2E + VLM export |
| 4 | I5 image quality in Simple Mode | rules surfaced + reversible cleanup |
| 5 | A1 audio wizard | WebVTT round-trip + browser E2E |
| 6 | V1/V2 video keyframes | keyframe lineage + temporal export |
| 7 | Near-tier types (tabular, time-series, code, transactional, multimodal) | one vertical slice each |
| 8 | Later-tier types | only after new primitives are designed (no code yet) |

**No time promises.** Each slice is "done" only with its gate; sequencing can be reordered on request.

## 6. Cross-cutting non-negotiables

1. Provenance truthful (`human`, `model`, `ensemble`, `imported`, `synthetic`, `augmented`) — the platform
   never presents machine labels as human work.
2. Model output validated against the dataset schema before persistence (label space, geometry, timestamps).
3. Immutable versions; corrections create a new version.
4. At least one round-trip exporter per type, with real media, no placeholders.
5. Browser E2E with real fixtures; console/page errors fail the build.
6. Honest limits printed in the UI: image **generation** cost and price availability; audio/OCR need local
   engines not bundled with the MVP; simulated image classifiers are hash-based, not semantic.
7. Cost guardrails: per-run caps (25 images), measured ETA, explicit provider selection.
