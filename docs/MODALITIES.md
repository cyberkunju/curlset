# Modalities — What Each Type Can Actually Do

Status: current. Dataset-type statuses are owned by `packages/dataset_core/dataset_types.py` and
exposed at `GET /api/v1/dataset-types`; this document explains the mechanics behind each status.
Future work is in [ROADMAP](ROADMAP.md).

Catalogue today: **21 types — 2 available, 4 beta, 15 planned**.

| Type | Status | Task type | Ingest | Label | Validate | Export |
|---|---|---|---|---|---|---|
| Text | available | `text_classification` | CSV/JSONL/JSON/TXT | workspace, auto-label, ensemble | schema, dupes, leakage, distribution | CSV, JSONL, Unsloth, Axolotl, LLaMA-Factory, WebVTT (transcripts) |
| Image | available | `image_classification` | PNG/JPG/WebP (+ZIP) | workspace, auto-label (vision), generation | dimensions/MIME, dupes, split | CSV, JSONL, COCO, YOLO, Unsloth, image_bundle |
| Object detection | beta | `object_detection` | images | canvas + SAM 3.1 proposals | box geometry, label space, dupes | COCO, YOLO, Ultralytics, image_bundle |
| Image + text | beta | `paired_image_text` | images + text | workspace | pairing, text schema | JSONL, Unsloth VLM, image_bundle |
| Audio | beta | `audio_transcription` | WAV and parseable audio | transcript workspace | duration/timestamp checks | WebVTT, JSONL |
| Document / OCR | beta | `document_ocr` | PDF text, images | text/canvas | text presence, extraction quality | JSONL, CSV |
| Video, multimodal, tabular, time series, geospatial, 3D, motion, graph, code, scientific, medical, sensor/IoT, neuro, robotics, transactional | planned | — | — | — | — | — |

## Text

- **Normalization**: text is normalized (whitespace/encoding) but the original remains in metadata;
  export never fabricates text.
- **Labeling**: manual keyboard review, auto-labeling (classification), ensemble with routing.
- **Generation**: synthetic text generation is class-aware and diversity-checked; sample-guided
  analysis infers classes and style from an upload. Research caps the defensible synthetic share at
  ~30% and warns that diversity filtering can hurt (`docs/research/R6-synthetic-data.md`).
- **Exports**: every tabular/LLM format maps real text + decided label; unfilled rows are not
  included.

## Image classification

- **Ingestion**: MIME-checked images with content hash; duplicates detected by hash.
- **Generation** (explicit, paid): `gpt-image-2` or `muse-image-1.0`, hard cap **25 images/run**,
  default quality low. Each image becomes an asset + record + `synthetic` annotation at
  `pending_review`, with provider/model/prompt lineage. Cost is configured in `IMAGE_PRICES`; unknown
  price is reported as `priced: false`.
- **Labeling**: manual review with thumbnails; auto-labeling forwards the real image bytes to a vision
  model (a text-only model fails at preflight); simulated models are hash-based and clearly marked.
- **Exports**: `image_bundle` is the self-contained format (pixels + labels + provenance + manifest).
- **Limit**: synthetic-only image datasets are the worst regime in the research (−7 mAP vs real);
  generation is an evidence source, not a replacement for real data (`docs/research/W2-synthetic-images.md`).

## Object detection

- **Canvas**: draw/edit/delete boxes, pixel-intrinsic coordinates, image-dimension validation, empty
  boxes never save, keyboard save guarded against stale state.
- **AI proposals**: SAM 3.1 (`meta-sam`) proposes boxes for a dataset class; ≤50 records and ≤3
  concepts per run; results are `origin=model`, `pending_review`, idempotent on re-run; masks are
  parsed but not stored.
- **Generation**: detection datasets can generate base images only (no boxes) and hand off to the
  workbench.
- **Exports**: COCO, YOLO, Ultralytics YOLO v8/v11, `image_bundle`.

## Image + text (beta)

- Ingestion supports paired image/text records; labeling workspace accepts captions/text.
- The full captioning pipeline (generation + review + export validation) is not shipped — the type is
  beta and the UI says so. Roadmap M3.

## Audio (beta)

- Audio ingestion and a transcript workspace exist; WebVTT export is supported.
- There is **no audio wizard** yet; transcription-provider integration and end-to-end acceptance are
  roadmap M1. Do not describe audio as a supported product workflow until that lands.

## Document / OCR (beta)

- PDF text extraction and image OCR paths exist for ingestion; labeling is text/canvas; export via
  JSONL/CSV.
- Quality scoring for OCR (character-level accuracy) is not shipped.

## Planned types

The remaining 15 types have no ingestion, editor or export contract. The catalogue exposes them as
`planned`, the UI disables them, and no documentation may imply support. Each graduates only when the
full gate passes: ingestion + editor + validation + immutable versioning + round-trip export + browser
acceptance.

## Cross-modality rules

1. Originals are immutable; derived files are separate assets with lineage.
2. Media never lives in the database; assets are referenced by storage key + hash.
3. Every export identifies the dataset version, exporter version and quality warnings.
4. A modality is "supported" only when it has all five lifecycle stages plus a browser acceptance test.
