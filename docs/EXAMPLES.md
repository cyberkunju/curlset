# Worked Examples and Test Fixtures

This document defines expected platform behavior through concrete, end-to-end sample workflows. All names, IDs, labels, hashes, and metadata below are illustrative. Any sample media used by automated tests must be synthetically generated during test setup or carry an explicit permissive open-source license.

> **Execution reference:** Use [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) for sequencing and [`PHASE_BY_PHASE_PLAN.md`](./PHASE_BY_PHASE_PLAN.md) for implementation tasks and verification gates. Examples here illustrate expected system behavior; they complement—and do not replace—automated contract and acceptance tests.

## 1. Example A — Product damage classification (with perceptual deduplication & consensus)

### User goal

A student is building a computer-vision model that classifies product photographs into two categories: `normal` and `damaged`. The user has a raw folder of product photos—and wants to supplement it with a few web-researched samples—to produce a verified, deduplicated, training-ready dataset.

### Step 1: Create the project and dataset

Project: `Product Inspection Demo`  
Dataset: `Product Condition Images`  
Task: `image_classification`  
Labels:
- `normal`
- `damaged`

Annotation guidance (stored as versioned rubric `guideline_rev_1`):
- Use `damaged` only when visible physical defects (cracks, dents, missing parts) are present.
- If the image is severely blurred or the product is obstructed, do not guess; mark it `needs_correction` for manual triage.
- A model proposal or multi-model agreement score is never treated as verified ground truth until approved under project review rules.
- Record brief reviewer rationale for ambiguous edge cases.

The platform generates immutable IDs (`proj_...`, `ds_...`), initializes `schema_version = 1`, and locks the initial annotation rubric revision.

### Step 2: Import images and run deduplication

The user uploads a folder containing:
- `normal_001.jpg`
- `normal_002.jpg`
- `damaged_001.jpg`
- `damaged_002.jpg`
- `damaged_002_copy.jpg` (identical byte copy)
- `damaged_002_recompressed.jpg` (slightly re-encoded JPEG of `damaged_002.jpg`)
- `broken_file.jpg` (corrupted header)

The ingestion pipeline inspects magic bytes, enforces size/quota limits, computes both cryptographic (`sha256`) and perceptual (`phash`) digests, extracts image dimensions (`width`, `height`), and writes valid media to content-addressed storage keys. It never trusts the user-supplied filename as a storage path.

Illustrative import result:
- 4 unique primary images accepted without warnings.
- 1 exact byte duplicate (`damaged_002_copy.jpg`, identical `sha256`) flagged and handled per import deduplication policy.
- 1 perceptual near-duplicate (`damaged_002_recompressed.jpg`, `phash` Hamming distance $\le 4$) accepted with a `near_duplicate_warning` linking to `damaged_002.jpg`.
- 1 unreadable file (`broken_file.jpg`) rejected with diagnostic code `INVALID_IMAGE_BYTES`.
- No accepted record is silently discarded; exact and near-duplicate resolution is logged in the `ProcessingRun` report.

### Step 3: Generate multi-provider model proposals & consensus scores

The user selects a local open-source vision model (e.g., via Ollama/vLLM) as the **Primary Annotator** and an optional second model as the **Critic/Verifier** to compute cross-model agreement. The gateway verifies provider health, vision capability, privacy policy (`local_only`), and JSON schema adherence before dispatching work items.

Example normalized proposal with consensus metadata:

    {
      "id": "ann_demo_0001",
      "record_id": "rec_demo_0001",
      "task": "image_classification",
      "schema_version": 1,
      "revision_id": "rev_0001",
      "data": {
        "label": "damaged"
      },
      "origin": "model",
      "confidence": 0.94,
      "consensus_score": 0.92,
      "status": "pending_review",
      "processing_run_id": "run_demo_0001",
      "model": {
        "primary_provider": "local-ollama",
        "primary_model_id": "example-local-vlm-7b",
        "critic_provider": "local-ollama",
        "critic_model_id": "example-critic-vlm-8b",
        "prompt_template_version": "damage-classification-v1"
      }
    }

All provider/model identifiers are illustrative placeholders. If the Primary Annotator and Critic disagree (e.g., `consensus_score < 0.60`), the record is automatically badged as `disagreement_flagged` so it floats to the top of the human review queue.

### Step 4: Review and correct

The review workbench displays the image, proposed label, confidence and consensus badges, provenance metadata, and single-keystroke review controls.

When the user spots an incorrect proposal and changes `damaged` to `normal`:
1. The system preserves `rev_0001` (the original model proposal) in the append-only `AnnotationRevision` table.
2. Creates `rev_0002` with `origin = "human"` and the updated payload `{"label": "normal"}`.
3. Appends an immutable `ReviewEvent` recording the actor, timestamp, and optional correction note.
4. Transactionally updates the parent `Annotation` pointer to `rev_0002` and transitions `status` to `approved`.

The quality dashboard tracks model proposals, consensus disagreements, human-corrected annotations, and approved records as separate metrics.

### Step 5: Validate and assign stratified splits

The validation engine runs across the dataset:
- Verifies required labels exist and belong to the active schema enum (`normal`, `damaged`).
- Confirms every `primary_image` asset exists in storage and matches its recorded `sha256`.
- Checks exact (`sha256`) and perceptual (`phash`) duplicate groups to ensure two near-identical images are never split across `train` and `val`/`test` (**Split Leakage Prevention**).
- Audits review statuses and `SourceRecord` license flags.

Illustrative validation report summary:
- 5 readable records checked.
- 4 `approved`, 1 `pending_review`.
- 0 schema or broken-asset errors (**0 Hard Blockers**).
- 1 perceptual near-duplicate group warning (grouped into the same `train` split to prevent leakage).
- 1 import rejection logged in run history.

### Step 6: Publish an immutable version

Once hard blockers are resolved, the user publishes `v1.0.0`. The `DatasetVersion` manifest cryptographically pins the exact `DatasetRecord` IDs, `Asset` SHA-256 digests, split assignments (`train`/`val`/`test`), `AnnotationRevision` IDs (`rev_0002`, etc.), schema version, and quality report ID.

Subsequent edits or newly added synthetic images never mutate `v1.0.0`. They create new revisions in the mutable workspace, which can later be frozen as `v1.1.0` with `parent_version_id = "v1.0.0"`.

### Step 7: Export training package & automated Dataset Card

Exporting `v1.0.0` produces a deterministic archive containing:
- Media directory organized by split or manifest paths.
- `records.jsonl` / `records.csv` mapping stable record IDs, relative asset paths, splits, and verified labels.
- `README.md` (Automated **Dataset Card / Datasheet** generated strictly from `v1.0.0` database statistics: class balance table, resolution histogram, human-vs-AI annotation ratio, and known limitations).
- `schema.json` (Data dictionary and label ontology).
- `provenance_manifest.json` (Lineage and license states).
- `quality_report.json` and `export_manifest.json` (with file SHA-256 checksums).

## 2. Example B — Text classification & synthetic data augmentation

### User goal

A student wants to train a sentiment classifier (`positive`, `neutral`, `negative`) for electronics reviews, starting from 50 real reviews and expanding the dataset with synthetic edge-case reviews generated by a local LLM.

Schema:
- `text`: required non-empty string (min 3 characters, max 10,000 characters).
- `label`: required enum (`positive`, `neutral`, `negative`).
- `metadata.language`: optional ISO language code.
- `origin`: tracked relational attribute (`uploaded`, `web_retrieved`, `synthetic`).

Example seed record (`origin = "uploaded"`):

    {
      "external_id": "review-1001",
      "origin": "uploaded",
      "text": "The laptop cooling pad arrived quickly and keeps temperatures down during heavy builds.",
      "metadata": {
        "language": "en"
      }
    }

Example synthetic record generated by the **Synthesizer Agent** (`origin = "synthetic"`):

    {
      "external_id": "syn-review-2045",
      "origin": "synthetic",
      "text": "Packaging was completely crushed on arrival, though the charger inside somehow still functions.",
      "metadata": {
        "language": "en",
        "synthesis_run_id": "run_synth_0004",
        "seed_record_ids": ["rec_demo_0012"]
      }
    }

Model classification proposal:

    {
      "task": "text_classification",
      "data": {
        "label": "neutral"
      },
      "origin": "model",
      "confidence": 0.78,
      "consensus_score": 0.65,
      "status": "pending_review"
    }

Strict normalization & safety rules:
- **No silent label guessing:** If a model outputs `"mixed"` or `"happy"` instead of an allowed enum value (`positive`, `neutral`, `negative`), the normalizer must reject the output as `invalid` (or apply an explicitly configured, versioned label-mapping table)—never silently guess.
- **Synthetic collapse check:** The quality engine checks token n-gram overlap and embedding similarity on `synthetic` records so repetitive LLM phrasing is flagged before approval.
- **PII & hygiene check:** Empty/whitespace-only strings fail validation. If email addresses, phone numbers, or API keys are detected, the validator emits a `pii_warning` and any redaction creates a traceable new revision rather than overwriting source bytes silently.

## 3. Example C — Zero-shot object detection & spatial coordinate conversion

### User goal

A developer wants to label damaged regions (`surface_crack`, `dent`, `missing_screw`) across 500 hardware photos without drawing every bounding box from scratch. They use a zero-shot vision detector (e.g., local GroundingDINO / Florence-2 / YOLO adapter) to propose initial boxes, refine them in the UI canvas, and export to both **YOLO** and **COCO** formats.

Internal canonical coordinate convention:
- `x` and `y` represent the top-left corner in original image pixel coordinates (`0 <= x < image_width`, `0 <= y < image_height`).
- `width` and `height` are strictly positive pixel dimensions (`width > 0`, `height > 0`).
- `x + width <= image_width` and `y + height <= image_height`.
- `class_id` is a stable string identifier from the dataset schema (`surface_crack`), never a fragile UI array index.

Example internal annotation (`640 x 480` image):

    {
      "task": "object_detection",
      "data": {
        "objects": [
          {
            "object_id": "obj_01",
            "class_id": "surface_crack",
            "bbox": {
              "x": 100,
              "y": 80,
              "width": 120,
              "height": 90
            },
            "confidence": 0.89
          }
        ]
      },
      "origin": "human",
      "status": "approved"
    }

For this `640 x 480` image, the box spans horizontally from `100` to `220` and vertically from `80` to `170` (valid). Any negative coordinate, zero/negative dimension, or out-of-bounds box is rejected by the spatial validator. Overlapping duplicate proposals from the model (e.g., IoU $> 0.85$ for the same class) are flagged or merged during normalization.

### Deterministic YOLO export conversion

The YOLO exporter transforms canonical pixel coordinates into normalized center coordinates `[0.0, 1.0]`:
- $\text{center\_x} = \frac{x + \text{width} / 2}{\text{image\_width}}$
- $\text{center\_y} = \frac{y + \text{height} / 2}{\text{image\_height}}$
- $\text{norm\_width} = \frac{\text{width}}{\text{image\_width}}$
- $\text{norm\_height} = \frac{\text{height}}{\text{image\_height}}$

Using the `640 x 480` example above:
- $\text{center\_x} = \frac{100 + 120 / 2}{640} = \frac{160}{640} = 0.25$
- $\text{center\_y} = \frac{80 + 90 / 2}{480} = \frac{125}{480} \approx 0.260417$
- $\text{norm\_width} = \frac{120}{640} = 0.1875$
- $\text{norm\_height} = \frac{90}{480} = 0.1875$

The exporter generates a deterministic `classes.txt` / `data.yaml` mapping stable `class_id` strings to zero-based integer indices (sorted alphabetically or by explicit schema order) and records that exact mapping in `export_manifest.json`.

### Deterministic COCO JSON export conversion

The COCO exporter outputs a validated structure containing `images`, `categories`, and `annotations` arrays using top-left pixel coordinates `[x, y, width, height]`, explicit pixel `area` ($120 \times 90 = 10800$), and `iscrowd: 0`. Both exporters are verified via round-trip parser tests.

## 4. Example D — Multi-modal bundled dataset sample (Image + Text + Spatial + Auxiliary Media)

### User goal

A developer is preparing a multi-modal Vision-Language Model (VLM) fine-tuning dataset where every training sample bundles an image, spatial defect bounding boxes, a dense descriptive caption, structured OCR text, and optional auxiliary media (such as an audio inspection note).

Rather than scattering these across disconnected single-modality tables, a single `DatasetRecord` (`rec_multimodal_0042`) bundles all linked assets and multi-task annotations:

    {
      "id": "rec_multimodal_0042",
      "dataset_id": "ds_vlm_inspection_bundle",
      "schema_version": 1,
      "split": "train",
      "origin": "uploaded",
      "assets": [
        {
          "asset_id": "asset_img_0042",
          "role": "primary_image",
          "modality": "image",
          "mime_type": "image/png",
          "width": 1280,
          "height": 720,
          "sha256": "a1b2c3..."
        },
        {
          "asset_id": "asset_crop_0042",
          "role": "region_crop",
          "modality": "image",
          "mime_type": "image/png",
          "parent_asset_id": "asset_img_0042",
          "sha256": "d4e5f6..."
        },
        {
          "asset_id": "asset_txt_0042",
          "role": "ocr_transcript",
          "modality": "text",
          "mime_type": "text/plain",
          "sha256": "789abc..."
        },
        {
          "asset_id": "asset_aud_0042",
          "role": "inspector_voice_note",
          "modality": "audio",
          "mime_type": "audio/wav",
          "duration_ms": 4200,
          "sha256": "def012..."
        }
      ],
      "annotations": [
        {
          "id": "ann_box_0042",
          "task": "object_detection",
          "status": "approved",
          "data": {
            "objects": [
              {"class_id": "corrosion", "bbox": {"x": 310, "y": 200, "width": 180, "height": 140}}
            ]
          }
        },
        {
          "id": "ann_cap_0042",
          "task": "image_text_captioning",
          "status": "approved",
          "data": {
            "instruction": "Describe the physical condition and any localized defects in the valve assembly.",
            "response": "Heavy surface corrosion is visible along the lower flange between pixel coordinates (310, 200) and (490, 340)."
          }
        }
      ]
    }

**Cross-modal consistency checks:** The quality engine inspects bundled annotations together. For example, if `ann_box_0042` contains an approved `corrosion` bounding box, but `ann_cap_0042` claims `"No defects or corrosion present"`, the Critic/Validation engine raises a `cross_modal_contradiction` warning for human review.

## 5. Example E — Full provenance and audit chain

For any record (whether uploaded, web-researched, or synthetically generated), the platform maintains an unbroken, queryable lineage graph:

    SourceRecord (Web URL / Upload / Seed Prompt + License State)
      -> Asset Ingestion (SHA-256, pHash, MIME inspection)
      -> Preprocessing Run (e.g., region crop or audio transcription, if any)
      -> Primary Model Annotation Run (Provider, Model ID, Prompt Version, Confidence)
      -> Critic Verification Run (Consensus Score / Disagreement Flag)
      -> Human Review Revision (Append-Only Revision ID, Reviewer ID, Timestamp, Diff)
      -> Frozen DatasetVersion Manifest (Cryptographic Digest + Split Assignment)
      -> ExportArtifact (COCO / YOLO / JSONL / Parquet Archive + Generated Dataset Card)

The provenance record deterministically answers:
1. Where did the raw media or text originate, and what is its license review status?
2. Which exact file bytes (`sha256`) were inspected?
3. Which model(s), parameters, and prompt template versions proposed or critiqued the label?
4. Who modified or approved the final annotation revision, and when?
5. Which immutable `DatasetVersion` and exported training bundle contain that exact revision?

Any unrecorded external metadata is explicitly stored as `unknown`—never fabricated.

## 6. Example F — Web research & source rights review

When a user triggers a **Bounded Web Research Run** (e.g., retrieving public-domain or Creative Commons hardware defect photos and descriptions), the Researcher worker captures:
- Source page URL and direct asset URL.
- Retrieval timestamp (`retrieved_at`).
- Detected license metadata (e.g., `CC-BY-4.0`, `CC0-1.0`, or `unknown`).
- Required attribution string, if applicable.

Source rights follow an explicit state machine:
- `unknown` (Default when no machine-readable license is verifiable)
- `review_required` (Retrieved from external web source; awaits human verification)
- `approved_for_intended_use` (Verified against project scope, e.g., `academic_research` vs. `commercial_training`)
- `restricted` (Cannot be exported in public redistributable bundles)
- `rejected` (Quarantined and excluded from all versions)

**Export Gate Policy:** By default, publishing or exporting a dataset version with records in `unknown`, `review_required`, or `restricted` states either blocks public-redistribution exports or emits a prominent compliance warning in the export manifest and generated Dataset Card (`README.md`).

## 7. Synthetic fixtures required for automated test suites

Maintain a lightweight, self-contained fixture generator in `examples/` and `tests/fixtures/` (generated programmatically using Pillow/NumPy/JSON so no large binary blobs or copyrighted files pollute Git):

1. **Valid Image Classification Pair:** 2 synthetic RGB images (`64x64` PNG/JPEG) with distinct colors/patterns and valid labels (`normal`, `damaged`).
2. **Invalid Schema Label Fixture:** 1 record carrying an undeclared label (`"unknown_category"`).
3. **Exact Duplicate Byte Fixture:** 2 files with identical byte streams and matching `sha256`.
4. **Perceptual Near-Duplicate Fixture:** 1 image and a slightly brightness-shifted/recompressed variant with matching/near `phash` (Hamming distance $\le 2$).
5. **Corrupt Media Fixture:** 1 `.jpg` file containing truncated/invalid non-image bytes.
6. **Text & Synthetic Classification Fixtures:** 3 valid text records across `positive`, `neutral`, and `negative` labels (including 1 tagged `origin = "synthetic"`), plus 1 invalid whitespace-only record.
7. **Multi-Modal Paired Bundle Fixture:** 1 record bundling a synthetic image asset, a paired text asset, an instruction-caption annotation, and a spatial bounding box.
8. **Valid Object Detection Fixture:** 1 `640x480` synthetic image with a known canonical box (`x=100, y=80, width=120, height=90`) for verifying exact YOLO (`0.25, 0.260417, 0.1875, 0.1875`) and COCO coordinate math.
9. **Invalid Spatial Geometry Fixtures:** 1 box with negative coordinates (`x=-10`), 1 box with zero width (`width=0`), and 1 box exceeding image width (`x=600, width=100` on a `640px` image).
10. **Provider Gateway Fixtures:** 1 valid structured model response, 1 Critic disagreement response (`consensus_score = 0.35`), and 1 malformed/hallucinated provider payload.
11. **Source Rights Fixture:** 1 web-retrieved record with `license_status = "review_required"`.

All tests must assert deterministic domain error codes and structured JSON states rather than brittle UI strings.

## 8. End-to-end acceptance scenario (Offline Smoke Test)

A clean-install automated E2E smoke test must execute the following lifecycle from start to finish:

1. Boot the stack locally using documented configuration (`local_only` privacy mode enabled, fake/local deterministic provider active).
2. Create a project and a multi-modal dataset supporting `image_classification`, `object_detection`, and `image_text_captioning`.
3. Ingest the synthetic test fixture bundle (verifying that exact duplicates, near-duplicates, and corrupt files are accurately reported).
4. Execute a bounded synthetic generation / auto-annotation run using the deterministic local test provider.
5. Verify that generated labels and bounding boxes land in `pending_review` state with recorded `confidence` and `consensus_score` values.
6. Edit one bounding box and one classification label as a human reviewer; assert that revision `1` (model) is preserved and revision `2` (human) becomes active and `approved`.
7. Run the quality and split-assignment engine; verify zero split leakage between `train` and `val` and inspect the generated quality report.
8. Publish immutable version `v1.0.0`.
9. Mutate a working record in the dataset after publication and verify that `v1.0.0` remains completely unchanged.
10. Export `v1.0.0` to **JSONL**, **CSV**, **YOLO**, and **COCO** formats, plus the automated **Dataset Card (`README.md`)**.
11. Parse the exported files back in (round-trip verification) and assert that record IDs, labels, normalized YOLO coordinates, COCO bounding boxes, and Dataset Card statistics match `v1.0.0` exactly.
12. Restart the API and worker services and verify that all state, revisions, versions, and storage keys persist intact.

This smoke test must pass 100% offline with zero external network calls and zero paid API keys.