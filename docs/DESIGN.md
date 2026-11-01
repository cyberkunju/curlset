# System Design — AI Dataset Engineering Platform

**Status:** Architecture baseline (Upgraded Multi-Modal & Multi-Agent Edition)  
**Audience:** Contributors, AI coding agents and maintainers  
**Primary users:** Individual developers, AI builders and students  
**Deployment targets:** Local/self-hosted first, hosted service later  
**Architecture style:** Modular monolith with asynchronous background workers

> **Implementation sequencing:** Use [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) for the roadmap and current status, and [`PHASE_BY_PHASE_PLAN.md`](./PHASE_BY_PHASE_PLAN.md) for task-level implementation steps, tests and exit gates. The design describes intended boundaries; inspect the actual repository before applying it.

## 1. Product concept

The platform is an end-to-end multi-modal dataset engineering workbench. It helps a user define an AI training-data task, acquire data (via file uploads, bounded web research, or synthetic generation), bundle multi-modal assets (linking text, images, and auxiliary media), auto-label records using configurable multi-provider AI models, verify proposals through multi-agent consensus and human review, run automated quality/deduplication checks, publish an immutable dataset version, and export a training-ready package with full documentation.

The dataset is the product. Multi-provider models, specialized agents, synthetic generators, and web researchers are workflow engines used to construct, bundle, and label the dataset; they are not substitutes for quality control, provenance tracking, rights review, or reproducibility.

### Product principles

1. **Dataset-first:** All workflows produce, pair, label, or improve structured dataset records.
2. **Multimodal bundling by design:** One logical record (`DatasetRecord`) natively bundles multiple related assets (e.g., primary image + dense text caption + bounding boxes + metadata, with extensibility for audio/video).
3. **Human accountability & multi-agent consensus:** AI outputs are proposals scored by confidence and cross-model agreement until accepted under an explicit review policy.
4. **Provider-neutral & open-source friendly:** Provider SDKs are isolated behind a capability adapter contract, supporting zero-cost local open-source models (Ollama, vLLM, Whisper, YOLO, Florence-2, SAM 2) alongside external APIs.
5. **Reproducibility:** Web sources, synthetic prompts, transformations, annotations, and export versions are cryptographically traceable.
6. **Portability:** Training-ready open export formats (COCO, YOLO, HuggingFace Parquet/JSONL, ShareGPT, CSV) and documented schemas; zero data lock-in.
7. **Local-first privacy:** Core ingestion, local model inference, manual annotation, validation, and export work offline without a cloud account or paid API key.
8. **Safe automation:** Explicit rate/budget limits, durable resumable jobs, and strict human approval gates.
9. **Evidence-based quality:** Automated checks expose exact/perceptual duplicates, spatial errors, and class imbalances; they never fabricate quality claims.
10. **Incremental delivery:** Finish end-to-end vertical slices and prove them with automated tests.

## 2. Personas and core journey

### Primary persona: individual developer/student

Needs a practical, zero-to-low-cost way to build, bundle, and label a multi-modal dataset for a model training run, fine-tuning experiment, academic research project, or portfolio application. Often struggles with manual photo labeling and assembling clean image-text pairs. Values local open-source model support, automated visual labeling, clear error reporting, and ready-to-train exports.

### Secondary persona: ML researcher/engineer

Needs repeatable hybrid data acquisition (real + synthetic), multi-model consensus labeling, strict provenance, exact/near-duplicate removal, stratified splits, and deterministic version exports across multiple local and cloud inference servers.

### Core journey

1. Create a project and select a single-modal or multi-modal dataset task.
2. Define a versioned task schema, label ontology, and annotation instructions.
3. Acquire data: import local files/archives, run a bounded Web Research job, or run a Synthetic Generation job from seed examples.
4. Preview normalized multi-modal record bundles and resolve ingestion or rights warnings.
5. Configure an AI processing run (selecting local open-source or cloud providers for auto-labeling, captioning, or bounding-box detection, plus an optional Critic model for consensus verification) or annotate manually.
6. Filter the review queue by confidence/consensus score, inspect proposals in the keyboard-driven canvas, correct labels/geometry, and approve records.
7. Run the quality and deduplication engine (SHA-256 + perceptual hashing `pHash` + schema validation) and inspect the quality report.
8. Freeze an immutable dataset version with stratified `train`/`val`/`test` splits.
9. Export a framework-compatible training bundle alongside an auto-generated Datasheet/Dataset Card (`README.md`) and quality audit report.
10. Re-open any historical version to reproduce the exact export or compare dataset lineage across versions.

## 3. Scope boundaries

### MVP includes

- Projects and logical datasets with stratified split support (`train`, `val`, `test`).
- Multi-modal record bundling (pairing Image + Text assets, structured captions, and spatial annotations within a single logical sample).
- Safe import of images, text, CSV, JSON, JSONL, Parquet, and ZIP archives with strict security limits.
- Bounded Web Research ingestion (retrieving candidate text/media from approved queries/URLs with automatic source/license tracking) and Synthetic Data Generation (expanding seed records via local or hosted models).
- Versioned task schemas and label ontologies.
- Core workflows: Image Classification, Text Classification, Paired Image-Text Captioning/Instruction Tuning, and Object Detection (with zero-shot vision auto-labeling support).
- Multi-provider model gateway supporting local open-source runtimes and external APIs, including Critic/Verifier consensus scoring.
- Human review workbench, spatial bounding-box editor, and append-only annotation revision history.
- Exact (SHA-256) and perceptual (`pHash`) duplicate detection, geometry validation, and class distribution statistics.
- Full provenance tracking (`uploaded`, `web_retrieved`, `model_generated`, `augmented`) and processing-run records.
- Immutable dataset-version manifests.
- Exports for CSV, JSONL (ShareGPT/HuggingFace compatible), COCO JSON, and YOLO formats, bundled with auto-generated dataset documentation and quality reports.
- Docker Compose local deployment with local filesystem or S3-compatible (MinIO) object storage.

### Explicitly deferred

- Full non-linear audio/video timeline editing (basic audio/video asset linking is supported at the storage schema level for seamless future expansion).
- Unrestricted arbitrary agent-generated shell/code execution.
- Unbounded autonomous web crawling that ignores `robots.txt`, rate limits, or source tracking.
- Complex enterprise multi-tenant billing and organization hierarchy administration.
- Kubernetes/microservices orchestration.
- Training foundation models directly inside the dataset platform.
- Automated legal clearance guarantees or unverified claims of "bias-free" data.

## 4. Logical architecture

The backend is a modular monolith. Modules communicate through explicit typed service interfaces and domain contracts. Long-running ingestion, web research, synthetic generation, batch auto-labeling, and export tasks execute asynchronously through background workers. The web app calls the REST API; only backend services and workers may access secret provider credentials.

### Modules

- **Identity/workspace:** User identity and project ownership. Local mode runs seamlessly as a single-user workspace while preserving clean multi-user isolation boundaries for hosted deployments.
- **Project/dataset:** Project settings, dataset metadata, multi-modal task configuration, schema versions, split ratios, and lifecycle state.
- **Ingestion:** Safe file validation, archive extraction, asset normalization, multi-modal record bundling, and detailed import reports.
- **Research & synthesis:** Bounded web retrieval adapters (capturing source URLs, timestamps, and license states) and synthetic data generation pipelines (expanding seed prompts/images into diverse candidate records).
- **Asset storage:** Opaque content-addressed storage keys, SHA-256 and perceptual hashes (`pHash`), MIME types, byte sizes, media dimensions, and derived-asset lineage (e.g., image crops, thumbnails).
- **Annotation & consensus:** Task-specific annotation schemas, AI proposal generation, multi-model consensus/agreement scoring, manual edits, append-only revisions, and review events.
- **Provider gateway:** Capability discovery, local/cloud provider adapters, structured output normalization, token/compute usage tracking, error classification, and timeouts.
- **Workflow/jobs:** Durable state-machine runs, item-level progress checkpointing, bounded retries, rate control, cancellation, and idempotency.
- **Validation/quality:** Schema and spatial geometry validation, exact and perceptual duplicate detection, cross-modal completeness checks, split leakage detection, and quality reports.
- **Provenance:** Source lineage (`user_upload`, `web_research`, `synthetic_generation`), model IDs, prompt templates, transformation history, and rights-review states.
- **Versioning:** Immutable cryptographic manifests pinning exact record, asset, split, and annotation revision IDs.
- **Import/export:** Versioned format adapters (JSONL, CSV, COCO, YOLO, HuggingFace bundle) with deterministic serialization and export manifests.
- **Documentation:** Evidence-based dataset card (`README.md`), data dictionary, annotation rubric, provenance breakdown, quality summary, and known limitations.
- **Web UI:** Project dashboard, hybrid import/research/synthesis wizard, schema editor, keyboard-first annotation and bounding-box canvas, confidence-sorted review queue, quality analytics, version browser, and export portal.

### Request and job flow

- API requests validate input schemas, file boundaries, and project permissions before mutating state.
- Any batch operation (import, web research, synthesis, auto-labeling, consensus check, validation, export) creates a durable `ProcessingRun` and atomic `RunItem` work units.
- Background workers claim queued `RunItem` tasks, execute one bounded unit of work, persist normalized output, and update item progress.
- Retries use deterministic idempotency keys (`run_id + record_id + stage`) so partial failures resume cleanly without duplicating records or annotations.
- The UI tracks progress via status polling (with optional Server-Sent Events for live progress bars).
- Publishing a dataset version verifies that all referenced record, asset, and annotation revision IDs exist and are immutable.
- Export jobs read strictly from a frozen `DatasetVersion` manifest, never from mutable working records.

## 5. Suggested repository layout

Adapt to an existing repository rather than replacing it blindly.

    apps/
      web/                        React + TypeScript + Tailwind frontend (Annotation Canvas & Workbench)
    services/
      api/                        FastAPI REST API
      worker/                     Background job processor (ingestion, research, synthesis, labeling, export)
    packages/
      dataset_core/               Domain entities, state machines, and schema contracts
      provider_gateway/           Local (Ollama/vLLM/Vision) & cloud provider adapters
      workflow_agents/            Bounded Researcher, Synthesizer, Annotator, and Critic pipelines
      dataset_io/                 Importers and exporters (CSV, JSONL, COCO, YOLO, Archive bundles)
      validation/                 Quality, geometry, pHash deduplication, and split-leakage rules
      documentation/              Evidence-based Dataset Card and quality report generator
    migrations/                   Database schema migrations
    schemas/                      Versioned public JSON schemas
    tests/
      unit/
      integration/
      contracts/
      roundtrip/
      e2e/
    examples/                     Small synthetic multi-modal fixtures
    docs/                         Product and engineering documentation
    docker-compose.yml
    .env.example

Use the layout only as a target. If the repository already has a sound structure, keep it and document mapping decisions.

## 6. Domain model

### Project

A workspace boundary: ID, owner ID, name, description, default provider/privacy settings, and created/updated timestamps.

### Dataset

Belongs to a project. Has ID, name, description, primary task type, supported modalities, current schema version, lifecycle state, and optional parent dataset ID. A dataset is a logical mutable workspace; published versions are immutable snapshots.

### DatasetRecord

One logical training sample (capable of multi-modal bundling). Has stable ID, dataset ID, schema version, optional external/source key, assigned split (`unassigned`, `train`, `val`, `test`), origin category (`uploaded`, `web_retrieved`, `synthetic`, `augmented`), normalized metadata, record state, and timestamps. It links multiple assets and annotations rather than embedding raw media bytes.

### Asset

An immutable file or derived media artifact. Fields include asset ID, modality (`image`, `text`, `audio`, `video`, `document`), MIME type, byte size, SHA-256 hash, optional perceptual hash (`phash` for visual similarity), opaque storage key, original filename (treated as untrusted metadata), dimensions/duration/token count when applicable, parent asset/transform reference, and timestamps. Storage keys are always generated server-side.

### RecordAsset

Join entity bundling multiple modalities into a single `DatasetRecord`, with an explicit role such as `primary_image`, `paired_text`, `dense_caption`, `crop`, `source_document`, `audio_track`, `video_clip`, or `thumbnail`, plus deterministic ordering.

### Annotation

Task-specific structured label attached to a record (and optionally scoped to a specific `RecordAsset`). Includes ID, task type, schema version, structured JSONB payload (e.g., class label, bounding boxes `[x, y, width, height]`, polygon points, text spans, or instruction-response pairs), origin (`human`, `model`, `consensus`, `import`, `rule`), confidence score (`0.0`–`1.0`), consensus agreement score (`0.0`–`1.0`), review status, latest revision ID, and optional `ProcessingRun` reference.

### AnnotationRevision

Append-only revision record with revision ID, annotation ID, sequential revision number, payload snapshot, confidence/consensus metadata, actor/source identifier, change reason, timestamp, and optional linked `ProcessingRun`. Revision history is never overwritten; the parent `Annotation` updates its current revision pointer transactionally.

### SourceRecord

Tracks provenance, lineage, and usage rights: source type (`user_upload`, `web_url`, `search_query`, `synthetic_seed`), URL/identifier, retrieval timestamp, generator model/prompt reference (if synthetic), license identifier/URL, attribution requirements, intended-use review state (`unknown`, `review_required`, `approved`, `restricted`), and reviewer notes. `unknown` license is a valid tracked state; it is never treated as implicit legal clearance.

### ProcessingRun

Represents an asynchronous batch job: `import`, `web_research`, `synthetic_generation`, `auto_annotation`, `consensus_verification`, `validation`, `split_assignment`, or `export`. Includes ID, run type, status, frozen configuration snapshot, provider/model identifiers, prompt template version, actor, started/finished timestamps, item counters, error category, and token/compute usage metrics.

### RunItem

Tracks granular per-record progress inside a `ProcessingRun`: item ID, run ID, record ID, deterministic idempotency key, stage status, attempt count, output reference, normalized error details, and timestamps. Enables fine-grained pause, resume, and retry.

### DatasetVersion

Immutable published snapshot with version ID, semantic version tag, dataset ID, optional parent version ID, cryptographic manifest hash, schema version, split distribution summary, creation actor/time, quality report reference, and state. Published versions cannot be modified in place.

### VersionItem

Maps a `DatasetVersion` to exact immutable `DatasetRecord`, `Asset`, split assignment, and `AnnotationRevision` identifiers. The manifest is self-contained and sufficient to reconstruct the exact exported training dataset at any time.

### ExportArtifact

Tracks generated training packages: artifact ID, storage key, format (`jsonl`, `csv`, `coco_zip`, `yolo_zip`, `hf_parquet`), exporter version, dataset version ID, SHA-256 content hash, byte size, creation timestamp, and post-export validation status.

### ReviewEvent

Explicit audit log for human and critic review actions (`approve`, `reject`, `request_correction`, `override_consensus`), recording actor, previous/new status, rationale, and timestamp.

## 7. Data contracts and example

Use explicit public JSON schemas with an integer `schema_version`. Database JSONB is used for task-specific annotation geometry and flexible metadata, while identity, ownership, review status, confidence scores, foreign keys, and revision pointers remain explicit relational columns.

Illustrative multi-modal bundled record (Image + Paired Caption + Object Detection):

    {
      "id": "rec_demo_0001",
      "dataset_id": "ds_product_damage_multimodal",
      "schema_version": 1,
      "split": "train",
      "origin": "web_retrieved",
      "assets": [
        {
          "asset_id": "asset_img_0001",
          "role": "primary_image",
          "modality": "image",
          "mime_type": "image/jpeg",
          "width": 1024,
          "height": 768,
          "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "phash": "f0e1d2c3b4a59687",
          "storage_key": "assets/sha256/e3/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.jpg"
        },
        {
          "asset_id": "asset_txt_0001",
          "role": "paired_text",
          "modality": "text",
          "mime_type": "text/plain",
          "sha256": "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
          "storage_key": "assets/sha256/8f/8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4.txt"
        }
      ],
      "annotations": [
        {
          "id": "ann_det_0001",
          "task": "object_detection",
          "revision_id": "rev_0002",
          "data": {
            "boxes": [
              {
                "box_id": "bx_1",
                "label": "surface_crack",
                "bbox_xywh_norm": [0.24, 0.31, 0.45, 0.18]
              }
            ],
            "caption": "Close-up of a damaged enclosure showing a horizontal surface crack."
          },
          "origin": "model",
          "confidence": 0.91,
          "consensus_score": 0.88,
          "status": "pending_review",
          "processing_run_id": "run_autolabel_0001"
        }
      ],
      "source": {
        "type": "web_url",
        "origin_ref": "https://example.org/public-hardware-defects/item-42",
        "license_status": "review_required"
      }
    }

In production, compute SHA-256 and `pHash` values from actual file bytes, validate MIME types via magic-byte inspection, and store relational state in normalized tables rather than duplicating mutable state inside static JSON blobs.

### Annotation state machine

Supported states: `proposed`, `pending_review`, `approved`, `rejected`, `needs_correction`, `invalid`.
Centralized transition rules:
- `proposed` $\rightarrow$ `pending_review` (after automated schema/geometry validation and optional Critic consensus scoring).
- `pending_review` $\rightarrow$ `approved` | `rejected` | `needs_correction` (via human reviewer or explicit, user-configured high-consensus threshold policy).
- `needs_correction` $\rightarrow$ `pending_review` | `approved` (when a new `AnnotationRevision` is saved).
- Any state $\rightarrow$ `invalid` (if schema migration or asset corruption invalidates the payload).

## 8. Storage and versioning

- PostgreSQL stores relational metadata, asset pairings, workflow state, hash indexes (`sha256`, `phash`), and version manifests.
- Object storage stores raw source media, generated synthetic assets, thumbnails/crops, export bundles, and large reports.
- Local mode uses either a configured local data directory or a local MinIO container via an S3-compatible adapter.
- Storage keys are opaque and content-addressed where appropriate, never derived from untrusted client paths.
- Physical deduplication across records is reference-counted and scoped safely so deleting a draft record never breaks an immutable published `DatasetVersion` or another project's asset.
- `DatasetVersion` manifests pin exact `AnnotationRevision` IDs and `Asset` SHA-256 digests. Modifying labels, adding synthetic data, or changing train/val/test splits requires publishing a new version.

## 9. Ingestion & acquisition pipelines

### 9.1 Local file & archive ingestion
1. Accept bounded file uploads, structured tables (CSV/JSONL/Parquet), or multi-modal ZIP archives.
2. Verify project ownership and storage quotas.
3. Enforce strict archive guardrails: max file size, max archive entry count, max decompressed byte limit (zip-bomb protection), path traversal rejection (`..` or absolute paths), and magic-byte MIME verification.
4. Extract into an isolated temporary workspace without executing any file content.
5. Compute SHA-256 and perceptual hash (`pHash` for images), persist immutable `Asset` blobs, and bundle paired files (e.g., matching `image_01.jpg` with `image_01.txt` or CSV metadata columns) into `DatasetRecord` entities.
6. Create `SourceRecord` provenance entries and validate against the dataset schema.
7. Emit an actionable import report detailing created, deduplicated, skipped, and rejected items.
8. Clean up temporary staging files deterministically in a `finally` block.

### 9.2 Bounded web research & synthetic generation pipelines
1. **Web Research Run:** Executes user-approved search queries or fetches allowlisted URLs within strict rate, domain, and byte budgets. Extracts candidate text and media, strips scripts/HTML boilerplate, deduplicates via hashes, attaches `SourceRecord` provenance with `license_status = review_required` (unless a machine-readable open license is verified), and stages items as draft records.
2. **Synthetic Generation Run:** Takes seed records or structured topic prompts, invokes configured text/vision generation models to synthesize new instruction pairs, edge-case texts, or augmented image variations, tags every record with `origin = synthetic` and exact generator provenance, and routes outputs directly into the validation and review pipeline.

## 10. Provider gateway

### Internal request contract

A gateway request specifies the capability task (`text_classification`, `image_classification`, `object_detection`, `image_captioning`, `synthetic_generation`, `consensus_critique`), stored `Asset` references or text prompts, target JSON Schema, provider/model selection, temperature/seed parameters, privacy policy (`local_only` vs `allow_external`), budget ceiling, and idempotency key.

### Internal result contract

A normalized response returns provider ID, exact model ID/digest, structured validated output (including normalized `[0, 1]` coordinates for spatial tasks), model confidence score, token/compute metrics, latency, and normalized error codes.

### Capability matrix & zero-cost local priority

Providers register explicit capabilities:
- **Local Open-Source Adapters (First-Class, Zero API Cost):** Ollama, vLLM, and local Python vision/audio workers (supporting open-source models like Qwen-VL, Llama-Vision, Florence-2, GroundingDINO, SAM 2, YOLO, and Whisper).
- **External Cloud Adapters (Optional):** OpenAI-compatible endpoints, Anthropic, Gemini, HuggingFace Inference, and custom REST endpoints.
- **Deterministic Fake Provider:** Built-in mock adapter for offline CI/CD, contract tests, and UI development.

### Routing & multi-model consensus

Users can select a single model for fast proposal generation or configure a **Dual-Model Consensus Pipeline**:
1. **Primary Annotator Model:** Generates candidate labels, captions, or bounding boxes.
2. **Critic / Verifier Model:** Independently evaluates the asset and primary proposal (or generates an independent label for IoU/semantic comparison) to compute a `consensus_score` (`0.0`–`1.0`).
3. Disagreements below the configured consensus threshold are automatically flagged as high-priority items in the human review queue.

### Reliability, costs, and privacy

Enforce request timeouts, bounded exponential backoff with jitter, rate limiting, and per-run cancellation. When `privacy_mode = local_only` is active at the project or workspace level, the gateway blocks all outbound network requests to external model hosts at the transport boundary.

## 11. Workflow and agent orchestration

Orchestration is built on deterministic, resumable state machines rather than unconstrained chat loops. Specialized agent roles operate as bounded workflow stages:

- **Planner Agent:** Translates a user's natural-language dataset goal into a validated pipeline configuration (proposed schema, label classes, acquisition mix, and labeling rubric) requiring explicit user approval before execution.
- **Researcher Agent:** Executes bounded web queries/retrievals, normalizes multimodal candidates, and records source/license evidence.
- **Synthesizer Agent:** Generates diverse synthetic text/image records from seed samples while checking against existing hashes/embeddings to prevent repetitive mode collapse.
- **Annotator Agent:** Runs batch classification, dense captioning, or zero-shot object detection across unannotated records.
- **Critic / Verifier Agent:** Audits proposals against annotation instructions, checks spatial box tightness/text alignment, and computes cross-model agreement scores.
- **Documentation Assistant:** Compiles verified statistical aggregates from a frozen `DatasetVersion` into a structured Dataset Card (`README.md`).

All external web content and model outputs are treated as untrusted data (strict prompt-injection isolation; outputs are parsed against strict schemas and never executed as code or shell commands).

## 12. Quality engine

### Core automated checks

- **Schema & completeness:** Missing required fields, unlinked multi-modal pairs (e.g., image missing its paired caption), and malformed payloads.
- **Spatial & geometry checks:** Bounding boxes outside `[0.0, 1.0]` normalized bounds, zero-area or degenerate boxes (`width <= 0` or `height <= 0`), extreme aspect-ratio anomalies, and overlapping duplicate boxes (Non-Maximum Suppression / IoU checks).
- **Exact & perceptual deduplication:** Exact byte duplicates (`sha256`) and visual near-duplicates (`phash` Hamming distance thresholds) across the dataset.
- **Text hygiene:** Empty strings, broken character encodings, extreme token lengths, residual HTML/scraper artifacts, and basic PII pattern warnings (emails, phone numbers, API keys).
- **Distribution & split integrity:** Class imbalance ratios, underrepresented tail classes, and **Split Leakage Detection** (ensuring exact or near-duplicate assets never cross between `train`, `val`, and `test` splits).
- **Review & provenance audit:** Ratio of human-approved vs. unreviewed model proposals, synthetic-to-real data ratio, low-consensus outliers, and unresolved `SourceRecord` license states.

Quality reports categorize findings into **Hard Blockers** (prevent export/publication unless resolved), **Warnings** (highlighted in the Dataset Card), and **Informational Metrics**.

## 13. Annotation & review UI

Built on a responsive, keyboard-centric workbench architecture:

- **Unified Record Navigator:** Fast filtering by split, origin (`uploaded`, `web`, `synthetic`), review status, label class, confidence score, and consensus agreement score.
- **Multi-Modal Bundle Inspector:** Side-by-side view of paired images, text fields, dense captions, and source provenance metadata.
- **Image & Text Classification Views:** Single-keystroke class assignment (`1`–`9`), multi-label toggles, confidence/consensus badges, and instant approve/reject (`Space` / `Enter` / `Backspace`) actions.
- **Object Detection & Spatial Canvas:** Interactive HTML5/SVG canvas supporting normalized `[0, 1]` bounding boxes, drag-to-draw, corner resize handles, class color coding, zoom/pan, crosshairs, visibility toggles, and side-by-side comparison of AI proposal boxes vs. human edits.
- **Batch & Active Learning Triage:** Sort review queue by lowest confidence or lowest multi-model consensus so human effort focuses on ambiguous edge cases first.

Explicit UI states handle empty datasets, offline/local-only mode, live worker progress, partial run failures, unsaved canvas edits, and immutable historical version viewing (read-only lock).

## 14. API design conventions

Expose versioned REST endpoints (`/api/v1/...`) backed by strict Pydantic/OpenAPI schemas.

Core resource groups:
- `/projects` and `/datasets` (including schema versions and split configurations)
- `/records` and `/assets` (multi-modal bundle inspection and streaming)
- `/annotations` and `/revisions` (proposal review, manual edits, bulk policy actions)
- `/runs` (import, web-research, synthesis, auto-annotation, consensus, validation, export jobs)
- `/quality-reports` and `/duplicates`
- `/versions` and `/exports` (immutable publication, format adapters, dataset cards)
- `/providers` (local/cloud capability discovery and health checks)

Boundary rules:
- Validate all payloads and query parameters at the API boundary.
- Enforce project ownership and read-only version locks server-side.
- Paginate all collection endpoints via cursor or limit/offset.
- Return structured, machine-readable error envelopes without leaking stack traces or API keys.
- Never accept raw filesystem paths or arbitrary storage keys from client requests.

## 15. Local/cloud deployment

### Local-first deployment

`docker-compose.yml` launches the complete stack locally: Web UI, FastAPI backend, Background Worker, PostgreSQL, Redis, and local object storage (volume-backed filesystem or MinIO), with optional integration to a host/container Ollama or local vision inference server. Includes automated database migrations on startup, health checks, and `.env.example`. Users can ingest, auto-label with local open-source models, manually annotate, version, and export datasets with $0 cloud spend.

### Hosted deployment

Uses managed PostgreSQL, S3-compatible object storage, Redis, and horizontally scaled worker containers. Enforces tenant isolation, encrypted secret storage for external API keys, upload rate limits, and automated storage lifecycle policies.

## 16. Observability

Emit structured JSON logs correlated by `request_id`, `project_id`, `run_id`, and `record_id`. Never log secret credentials or raw media payloads. Track operational metrics including ingestion throughput, deduplication hit rate, per-provider inference latency, consensus agreement distribution, token/compute usage, and export generation time. Any telemetry in local mode is strictly opt-in and disabled by default.

## 17. Key architecture decisions

- Dataset-first product scope with first-class multi-modal record bundling (`ADR-001`, `ADR-010`).
- Modular monolith with asynchronous background workers (`ADR-002`).
- Local-first filesystem/S3-compatible object storage plus PostgreSQL metadata (`ADR-003`, `ADR-004`).
- Content-addressed SHA-256 and perceptual `pHash` deduplication (`ADR-004`).
- Immutable annotation revisions and cryptographic dataset-version manifests (`ADR-005`).
- Provider-neutral model gateway prioritizing zero-cost local open-source inference (`ADR-006`).
- Deterministic state-machine workflows orchestrating bounded Researcher, Synthesizer, Annotator, and Critic agents (`ADR-007`).
- Multi-model consensus scoring paired with explicit human-in-the-loop review (`ADR-008`).
- Versioned JSONB task payloads with strict relational identity (`ADR-009`).
- Automated Dataset Cards and quality reports compiled strictly from frozen version evidence (`ADR-011`).
- Strict local privacy with zero silent external network calls (`ADR-012`).
- Explicit provenance and source license state tracking across uploaded, web, and synthetic data (`ADR-013`).

Record any material changes in [`docs/DECISIONS.md`](./DECISIONS.md).

## 18. Architecture exit criteria

Architecture is adequately implemented when:
- Modules communicate through explicit interfaces and pass unit and contract tests.
- A `DatasetRecord` bundles multiple modalities (e.g., Image + Paired Text + Spatial Boxes) and links multiple assets and annotations.
- Local file import, bounded web research, and synthetic generation all record explicit `SourceRecord` provenance.
- AI proposals, multi-model consensus scores, and human-reviewed annotations are distinctly tracked and append-only revisioned.
- Background jobs checkpoint progress per item and resume cleanly after transient failures.
- Exact (`sha256`) and perceptual (`phash`) duplicate detection and split-leakage checks run before version publication.
- A published `DatasetVersion` pins exact immutable record, split, asset, and annotation revision IDs.
- Exports (CSV, JSONL, COCO, YOLO) and Dataset Cards are generated deterministically from a frozen version manifest.
- Full end-to-end workflows operate in local-only mode using local/mock models without external cloud credentials.