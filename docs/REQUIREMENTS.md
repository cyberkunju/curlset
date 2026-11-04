# Product Requirements

Status: current. The single source of truth for product scope and acceptance criteria.
Implementation state is measured in [STATUS](STATUS.md); future work is in [ROADMAP](ROADMAP.md).

## 1. Problem

Turning raw data into a training dataset is mostly bookkeeping and judgement, not model training:

- data arrives in inconsistent formats and must be normalized without losing the original;
- labels come from people, models or scripts and must stay distinguishable forever;
- a dataset is only usable if it is deduplicated, split without leakage, reviewed, versioned and
  exportable in the format a trainer expects;
- every claim about a dataset ("92% accurate") needs a denominator, a provenance chain and a way to
  reproduce the export.

Curlset is a local-first workbench for exactly that: **generation and labeling are inputs; the dataset,
its provenance and its evidence are the product.**

## 2. Users

| User | Primary need |
|---|---|
| Solo developer / student | From a folder of files to a reviewed, exported dataset without building tooling |
| Small data team | Label, review, audit and version datasets with an honest evidence trail |
| Evaluation engineer | Reproduce a published version byte-for-byte and inspect why a record changed |

## 3. Scope

### 3.1 Supported today

| Capability | What works |
|---|---|
| Dataset types | 21-type catalogue: **2 available** (`text`, `image`), **4 beta** (`object_detection`, `image_text`, `audio`, `document_ocr`) — see [MODALITIES](MODALITIES.md) |
| Task types | `text_classification`, `image_classification`, `object_detection`, `paired_image_text`, `audio_transcription`, `document_ocr` |
| Ingestion | CSV, JSONL, JSON, TXT, images, audio where parseable, PDF text, ZIP; duplicate detection; MIME and path-traversal guards |
| Generation | Synthetic text datasets (class-aware, diversity-checked, background job with measured ETA); natural-language planning; sample-guided analysis; image datasets via OpenAI `gpt-image-2` or Meta `muse-image-1.0`, hard cap 25 images/run |
| Labeling | Manual annotation workspace, image review with hotkeys, object-detection canvas; auto-labeling; ensemble pseudo-labeling with routing; SAM 3.1 box proposals |
| Review | Explicit review state machine; machine output can never become `human`; bulk review; queue filters |
| Quality | Structural validation, duplicate/near-duplicate detection, split-leakage checks, label-distribution findings |
| Versioning | Immutable versions with canonical manifest, SHA-256 identity and dataset card |
| Export | 10 formats: CSV, JSONL, COCO, YOLO, WebVTT, Unsloth ShareGPT-VLM, Axolotl Alpaca-ChatML, LLaMA-Factory, Ultralytics YOLO v8/v11, `image_bundle` |
| Editing | Natural-language edits compiled to a previewable, reversible change set |
| UX | Beginner-first Home, Generate/Label wizards, dataset-type chooser, Advanced mode |

### 3.2 Deferred (do not claim as implemented)

- Audio **wizard** and transcription-provider workflow (audio is a beta ingestion path today).
- Video support.
- Hosted multi-tenant deployment, real SSO, billing, scale quotas.
- PostgreSQL/Redis/S3/Parquet production stack ([ARCHITECTURE](ARCHITECTURE.md) states the real
  deployment boundaries).
- Certification, label-noise modeling, rights ledger, content-addressed storage, specialist
  productisation — designed in [ROADMAP](ROADMAP.md), researched in [RESEARCH](RESEARCH.md).
- The 15 planned dataset types.

## 4. Functional requirements

### FR-1 Import and normalization

- Preserve source text/asset bytes and record a content hash.
- Map CSV/JSONL/JSON columns to the task schema; unknown columns stay as metadata.
- Detect duplicates by hash, not filename.
- Unpack archives with entry-count, size and timeout limits.
- A failed import must not leave partially registered records.

### FR-2 Annotation and provenance

- Every annotation has an origin (`human`, `model`, `ensemble`, `imported`, `synthetic`, `augmented`)
  and a review status (`pending_review`, `approved`, `rejected`, `needs_correction`).
- Origin and status are derived server-side; clients cannot claim `human` or self-approve.
- Every status change is a recorded transition with actor and reason.
- Detection boxes are pixel coordinates validated against image dimensions; empty boxes never save.

### FR-3 Labeling assistance

- Auto-labeling produces machine annotations at `pending_review`, never auto-approved.
- Auto-approval only through a recorded transition by the `auto-labeler` actor.
- Ensemble output exposes per-model votes, calibration and the routing band that decided each record.
- SAM proposals store `proposed_by`, model, image dimensions and confidence; box labels must exist in
  the dataset schema; re-runs update the pending proposal rather than duplicating it.

### FR-4 Quality

- Validation reports blocking vs warning findings with counts and denominators.
- Split leakage is reported across train/val/test.
- Quality output is attached to a version as warnings; publishing with warnings requires explicit
  user action.

### FR-5 Versioning and export

- A version pins exact record revisions and has a deterministic manifest.
- Re-exporting the same version and format produces byte-identical archives for deterministic formats;
  formats that embed a timestamp say so.
- `image_bundle` contains real images, a label mapping with provenance and a re-import note.
- Exports may not fabricate text, labels or placeholders.

### FR-6 Generation

- Runs are asynchronous jobs with progress, phase, measured ETA (never fabricated), cancel and restart
  recovery.
- Limits are contract: ≤25 images per run; ≤500 per category and ≤2,000 per run for text generation;
  validated server-side.
- Synthetic records are marked `synthetic` and keep provider, model, prompt hash and seed.

### FR-7 Editing

- Natural-language edits show a preview diff before applying.
- Every applied edit is reversible as a change set (undo).

### FR-8 UX

- A first-run user reaches a dataset through a guided path without reading docs.
- Advanced mode exposes every control; Simple mode stays honest about what it will do.
- No marketing puffery in the UI (repository rule, AGENTS §10).

## 5. Non-functional requirements

- **Local-first**: SQLite by default; no outbound calls unless a provider is explicitly configured.
- **Safety**: upload limits, SSRF protection, secret redaction in logs and errors.
- **Portability**: self-contained exports; dataset identity does not depend on a vendor.
- **Reproducibility**: deterministic manifests and deterministic exports.
- **Honesty**: every number has a denominator and provenance; unsupported claims are a defect.
- **Performance**: list endpoints paginate; large files are streamed or bounded.
- **Accessibility**: keyboard-operable annotation and visible focus.

## 6. Acceptance gates

A capability is DONE only when:

1. the happy path works through the public API and UI;
2. failure paths are handled (bad input, missing provider, timeout, cancellation);
3. automated tests cover it (integration for API, unit for math);
4. evidence is recorded in [STATUS](STATUS.md);
5. it does not contradict an ADR without recording a new one.

## 7. Explicit non-goals

- Training models or hosting inference endpoints.
- Being a general-purpose database or BI tool.
- Guaranteeing dataset correctness, legal clearance or "training safety".
- Autonomous labeling without human review on any high-risk path.
