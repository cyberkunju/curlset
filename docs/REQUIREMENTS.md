# Product Requirements — AI Dataset Engineering Platform

**Version:** 2.0 (Upgraded Multi-Modal & Multi-Agent Edition)  
**Status:** Baseline requirements for implementation  
**Primary audience:** Individual developers, AI builders and students  
**Product model:** Open source, local/self-hosted first, and future hosted service

> **Implementation mapping:** Requirements are implemented in dependency order using [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) and the detailed task-level [`PHASE_BY_PHASE_PLAN.md`](./PHASE_BY_PHASE_PLAN.md). Acceptance criteria in this file remain authoritative for observable product behavior.

## 1. Purpose

The platform turns raw files, bounded web-researched content, and synthetically generated samples into structured, multi-modal bundled, reviewed, validated, documented, and versioned datasets suitable for machine-learning training, fine-tuning, evaluation, and research.

It combines multi-modal data ingestion, hybrid acquisition (uploads + web discovery + synthetic generation), versioned schema definition, multi-provider AI-assisted annotation (including zero-shot visual labeling and cross-model consensus scoring), human review, quality/deduplication validation, provenance tracking, immutable dataset versioning, automated Dataset Card generation, and training-ready export. It must remain 100% functional offline when no external AI provider is configured.

## 2. Problem statement

Preparing training datasets—especially paired image-and-text datasets or labeled visual datasets—is fragmented across ad-hoc scraping scripts, spreadsheets, disconnected bounding-box tools, paid model APIs, validation notebooks, and hand-written READMEs. Developers struggle with manual photo labeling, lose track of where web or synthetic data originated, unknowingly train on duplicate or leaking splits, accept hallucinated single-model labels, fight format conversions (COCO, YOLO, ShareGPT/JSONL), and cannot reproduce the exact dataset snapshot used in a training run.

The platform provides one cohesive, local-first lifecycle that bundles multi-modal assets cleanly, automates labeling and quality checks using open-source local models or external providers, and keeps humans in full control of ground truth.

## 3. Goals and non-goals

### Goals

- Eliminate the manual bottleneck in dataset creation, photo/box labeling, and multi-modal captioning.
- Native multi-modal bundling: link images, text, captions, spatial coordinates, and auxiliary media under a single stable `DatasetRecord`.
- Make AI-assisted labels editable, reviewable, and auditable using confidence scores and multi-model consensus verification.
- Prioritize zero-cost local open-source model runtimes (Ollama, vLLM, local vision/audio models) alongside optional external APIs.
- Enable hybrid data acquisition through safe local imports, bounded web research, and diversity-checked synthetic data generation.
- Make dataset quality, exact/perceptual duplicates (`sha256` and `phash`), and split leakage visible before export.
- Make source provenance, synthetic lineage, and licensing uncertainty explicit.
- Produce portable, training-ready exports (CSV, JSONL/ShareGPT/Parquet, COCO, YOLO) and automated, evidence-backed Dataset Cards (`README.md`).
- Support turnkey local Docker Compose deployment and a future hosted deployment.
- Provide clean, extensible interfaces for providers, agent workflows, tasks, and exporters.

### Non-goals for MVP

- Train foundation models directly or operate a commercial GPU training cloud.
- Guarantee that web-researched or synthetically generated data is legally cleared without human review.
- Fully automate legal compliance decisions, demographic bias guarantees, or unreviewed ground-truth certification.
- Support every niche 3D/medical modality at initial launch before core image/text/detection slices are rock-solid.
- Provide an unconstrained autonomous agent with arbitrary shell, browser, or untrusted code execution.
- Require paid or rate-limited trial AI APIs for core dataset management, local inference, or manual annotation.
- Build heavy enterprise multi-tenant billing infrastructure before validating the local developer workflow.

## 4. Users and user stories

### Individual developer/student

- As a user, I can create a project and multi-modal dataset so I can organize data for an AI training or fine-tuning task.
- I can import a folder, ZIP bundle, CSV, JSON, or JSONL file—pairing images and text automatically—and see exactly which items were accepted, deduplicated, or rejected.
- I can define class labels, spatial schemas, and annotation instructions before labeling begins.
- I can run a local open-source model or configured cloud provider to auto-label images, draw initial bounding boxes, or generate paired captions, and see where two models agree or disagree.
- I can quickly review, tweak, or redraw wrong labels/boxes using keyboard shortcuts and retain the full revision history.
- I can run bounded web research or synthetic generation jobs to fill missing class gaps while keeping synthetic and web items clearly tagged.
- I can detect exact duplicate files, visual near-duplicates, invalid bounding boxes, and train/test split leakage before training.
- I can publish an immutable dataset version and recreate the exact same training package months later.
- I can export directly to YOLO, COCO, CSV, or HuggingFace/ShareGPT JSONL formats.
- I can auto-generate a professional Dataset Card (`README.md`) and quality report from verified version statistics without writing boilerplate docs by hand.
- I can run the entire platform locally with $0 cloud spend and use manual tools or local open-source models offline.

### ML researcher/engineer

- I can trace every annotation and synthetic sample to its exact model, prompt template version, seed record, source URL, and processing run.
- I can configure a Primary Annotator model and a Critic model to compute cross-model consensus scores and prioritize ambiguous samples for human review.
- I can compare two dataset versions (`v1` vs `v2`) and inspect exact record, split, and label diffs.
- I can inspect class balance histograms, synthetic-to-real ratios, and perceptual near-duplicate clusters across `train`/`val`/`test` splits.
- I can swap between local inference servers and cloud providers without altering my dataset schema.

### Maintainer/contributor

- I can add a new model provider adapter, task schema, research connector, or exporter through a typed, documented contract.
- I can run the entire automated test suite offline using the deterministic fake provider without paid credentials.
- I can boot the full local stack from documented commands and inspect phase status in repository docs.

## 5. Supported modalities and task scope

### MVP data types

- **Images:** JPEG, PNG, WebP (validated by magic-byte content signatures, with automatic dimension extraction and `sha256` + perceptual `phash` calculation).
- **Text:** UTF-8 text files and structured text fields.
- **Multi-Modal Pairs/Bundles:** Linked Image + Text assets, dense captions, and spatial annotations bound to a single logical `DatasetRecord`.
- **Tabular & Structured Records:** CSV, JSON, JSONL, and Parquet.
- **Archives:** Multi-modal ZIP bundles under strict compressed/decompressed byte limits, file-count caps, and path-traversal protections.
- **Auxiliary Attachments:** Audio, video, and PDF/document references supported at the `Asset`/`RecordAsset` storage schema level for phased task activation; never advertise a modality as fully annotatable until its editor, validator, and exporter pass acceptance tests.

### MVP tasks

1. **Image classification** (single-label and multi-label).
2. **Text classification** (sentiment, intent, category tagging).
3. **Paired Image-Text captioning / instruction tuning** (bundling visual assets with descriptive text or VQA pairs).
4. **Object detection** (spatial bounding boxes with zero-shot vision auto-labeling support and COCO/YOLO exports).

### Later expansion tasks (Phase 13+)

- Polygon/instance segmentation masks.
- Document layout / OCR region-to-text extraction.
- Audio transcription (via local Whisper adapters), speaker diarization, and sound-event classification.
- Video keyframe extraction, temporal clip labeling, and action descriptions.
- Preference / RLHF ranking pairs.

Do not expose any task as active in the UI until its schema, editor, validator, exporter, and round-trip tests pass.

## 6. Functional requirements

Priority definitions: **P0** required for core release; **P1** required for full multi-modal/detection/acquisition MVP; **P2** post-MVP expansion.

### FR-001 — Project management (P0)

Users can create, list, rename, configure privacy settings (`local_only` vs `allow_external`), and archive projects. Dataset operations are strictly scoped to a parent project. Server-side ownership and authorization checks are enforced on every request.

Acceptance:
- A project and its privacy configuration persist across application restarts.
- Blank or malformed names return structured validation errors.
- Cross-project resource access by ID guessing is deterministically rejected.

### FR-002 — Dataset setup & multi-modal schema configuration (P0)

Users can create a dataset with name, description, primary task type, supported modalities, schema version, split targets (`train`/`val`/`test`), and versioned annotation instructions. The UI clearly displays supported input modalities and export formats for each task.

Acceptance:
- Creating a dataset with an undeclared task type fails validation.
- Updating label ontologies or schema fields increments `schema_version` without mutating historical annotation revisions or published versions.
- Task schemas and annotation rubrics are accessible to both the human UI workbench and the AI Provider Gateway.

### FR-003 — Safe multi-modal ingestion & deduplication (P0)

Import standalone or paired images, text, CSV, JSON, JSONL, Parquet, and multi-modal ZIP archives. Automatically pair matching media/text files into bundled `DatasetRecord` entities, compute cryptographic (`sha256`) and perceptual (`phash`) hashes, preview inputs, and report accepted, deduplicated, skipped, and rejected items.

Acceptance:
- Every accepted logical sample receives a stable `DatasetRecord` ID and links its component files via `RecordAsset` roles (`primary_image`, `paired_text`, etc.).
- Exact byte duplicates (`sha256`) and visual near-duplicates (`phash`) are detected and reported without silently deleting user records.
- Invalid rows or corrupted media files report item-specific error codes and messages.
- Archive path traversal (`..`, absolute paths, symlinks), zip bombs, and spoofed MIME types are rejected safely.
- Failed or cancelled imports clean up all temporary staging files and never leave half-imported records marked ready.

### FR-004 — Content-addressed asset management (P0)

Store original and derived assets (`region_crop`, `thumbnail`, `keyframe`) in local filesystem or S3-compatible object storage outside relational database rows. Track MIME type, byte size, `sha256`, `phash`, modality, pixel dimensions (`width`, `height`), duration, and parent-asset lineage.

Acceptance:
- Assets are streamed only through authorized API endpoints or signed URLs.
- Storage keys are opaque and generated server-side—never derived from client-supplied paths.
- Derived assets explicitly reference their parent `asset_id` and transformation parameters.

### FR-005 — Versioned annotation schemas & ontologies (P0)

Users can define class label sets (with stable `class_id` strings), required fields, spatial geometry constraints, text length bounds, and annotation rubrics.

Acceptance:
- Unknown class labels, out-of-bounds coordinates, and missing required fields are rejected at the domain validation boundary.
- Schema updates never overwrite prior `AnnotationRevision` snapshots.
- Malformed schema definitions return actionable field-level diagnostics.

### FR-006 — Multi-provider AI-assisted annotation & consensus scoring (P0)

Users can select a configured local open-source model or external provider to propose classifications, captions, or spatial bounding boxes on selected records, and optionally enable a secondary **Critic/Verifier model** to compute a cross-model `consensus_score` (`0.0`–`1.0`).

Acceptance:
- With zero providers configured, all manual ingestion, annotation, validation, versioning, and export workflows remain 100% functional.
- All model outputs are schema-validated; malformed outputs are logged as invalid run diagnostics and never saved as approved annotations.
- Valid proposals store model `confidence`, optional `consensus_score`, and default to `pending_review` (with low-consensus items badged `disagreement_flagged`).
- Batch runs track per-item `RunItem` progress, support mid-run cancellation, and use deterministic idempotency keys so retries never duplicate annotations.
- Zero external network calls occur without explicit user initiation, configured credentials, and project privacy permission.

### FR-007 — Human-in-the-loop review & append-only revisions (P0)

Users can filter the review queue (by status, confidence, or consensus disagreement) and approve, reject, edit, or flag proposals for correction. Every change writes an append-only `AnnotationRevision` and an auditable `ReviewEvent`.

Acceptance:
- AI proposals remain visually and relationally distinct from human-approved annotations.
- Editing a model proposal preserves revision `1` (`origin = model`) and creates revision `2` (`origin = human`).
- Review state transitions are enforced centrally; illegal transitions are rejected.
- Pending, disagreement-flagged, approved, rejected, and invalid states have distinct, accessible UI badges and keyboard shortcuts.

### FR-008 — Text & paired caption editor (P0)

Users can inspect text records or paired image-text bundles, assign classification labels, write or refine instruction-caption pairs, and review AI proposals.

Acceptance:
- Full keyboard navigation and shortcut labeling (`1`–`9`, `Enter` to approve) work without mouse dependency.
- Empty, whitespace-only, or oversized text inputs are safely caught by validation.
- Unsaved edits trigger a confirmation guard before record navigation.

### FR-009 — Image & multi-modal bundle editor (P0)

Users can view the primary image alongside linked text/metadata assets, inspect image dimensions and hash status, select class labels, and review AI proposals.

Acceptance:
- Corrupted or missing image assets render a clear diagnostic placeholder.
- High-resolution images scale cleanly with zoom/pan controls inside bounded viewport containers.
- Review status, confidence/consensus badges, and save state are continuously visible.

### FR-010 — Dataset quality, deduplication & split-leakage engine (P0)

Provide deterministic validation covering schema compliance, missing/corrupt assets, invalid spatial geometry, exact (`sha256`) and perceptual (`phash`) duplicates, cross-modal completeness, basic PII pattern warnings, class distribution balance, and cross-split (`train`/`val`/`test`) leakage detection.

Acceptance:
- Validation runs are 100% deterministic for a given dataset state and rule version, and automatically mark themselves `stale` if records change.
- Findings are strictly separated into **Hard Blockers** (block version publication), **Warnings**, and **Informational Metrics**.
- Exact or perceptual duplicate assets spanning across `train` and `val`/`test` splits are flagged as split leakage.
- Every reported issue links directly to the affected `record_id`s for remediation.
- Quality reports never claim automated legal clearance or guaranteed model performance.

### FR-011 — Unbroken provenance & lineage tracking (P0)

Track end-to-end record and annotation lineage: `SourceRecord` origin (`uploaded`, `web_retrieved`, `synthetic`, `augmented`), license review state, ingestion runs, asset transformations, primary and critic model runs, prompt template versions, and human review events.

Acceptance:
- Every model-generated or consensus-verified revision links to an immutable `ProcessingRun` capturing provider ID, model ID, parameters, and prompt template version.
- Every record links to a `SourceRecord` with an explicit license status (`unknown`, `review_required`, `approved_for_intended_use`, `restricted`, `rejected`).
- Provenance logs are append-only and cannot be silently erased.

### FR-012 — Immutable dataset versioning & splits (P0)

Users can assign stratified `train`/`val`/`test` splits and publish immutable `DatasetVersion` snapshots that cryptographically pin exact `DatasetRecord` IDs, `Asset` SHA-256 hashes, split assignments, `AnnotationRevision` IDs, schema version, and quality report references.

Acceptance:
- Published versions are strictly read-only; subsequent edits in the workspace never alter a published version.
- Publishing after workspace edits creates a new version (`v2`) referencing its parent version (`v1`) and supports version-to-version diff inspection.
- Export jobs read exclusively from frozen `DatasetVersion` manifests.

### FR-013 — Multi-modal CSV and JSONL/bundle export (P0)

Export frozen dataset versions into portable CSV and structured JSONL (including ShareGPT / HuggingFace multi-modal paired archive bundles) with deterministic asset paths and an `export_manifest.json`.

Acceptance:
- Export packages include dataset/version IDs, manifest SHA-256 hashes, exporter version, split record counts, per-file checksums, and any active quality/license warnings.
- Automated round-trip tests reload exported CSV/JSONL packages and verify 100% preservation of record IDs, splits, media hashes, and annotations.
- Failed or cancelled exports clean up partial artifacts and are never marked complete.

### FR-014 — Automated evidence-based Dataset Cards & documentation (P0)

Automatically compile a comprehensive `README.md` (**Dataset Card / Datasheet**), `schema.json` data dictionary, annotation rubric snapshot, provenance/origin breakdown (Real vs. Synthetic vs. Web), split/class distribution tables, and known limitations from frozen version evidence.

Acceptance:
- Every statistic in the generated Dataset Card is computed directly from the frozen `DatasetVersion` snapshot—zero hallucinated numbers.
- Unresolved source licenses or missing metadata fields are explicitly rendered as `unknown` or `review_required`.
- Users can preview and include the generated documentation bundle inside every export archive.

### FR-015 — Turnkey local deployment (P0)

Provide a one-command Docker Compose setup orchestrating the Web UI, FastAPI backend, Background Worker, PostgreSQL, Redis, and local filesystem/MinIO object storage (with optional local Ollama/vision model bridging).

Acceptance:
- A developer on a clean machine can boot the stack from documented commands without any paid cloud API keys.
- Container health checks, startup migrations, and backup/restore commands are documented and verified.
- Secrets are loaded strictly via environment variables excluded from Git.

### FR-016 — Provider-neutral model gateway with local open-source priority (P0)

Isolate all model integrations behind a typed capability gateway supporting a deterministic `FakeProvider` (for tests), **Local Open-Source Model Adapters** (Ollama, vLLM, local vision/audio workers), and optional external cloud adapters.

Acceptance:
- Capability mismatches fail fast before dispatching network calls.
- Provider errors are normalized into actionable categories (`rate_limit`, `timeout`, `schema_violation`, `auth_error`, `connection_error`).
- API keys never appear in frontend bundles, error responses, or logs.
- When `privacy_mode = local_only` is enabled, external cloud adapters are blocked at the gateway boundary.

### FR-017 — Object detection, spatial canvas & COCO/YOLO export (P1)

Provide an interactive bounding-box annotation canvas, zero-shot vision auto-labeling support, spatial geometry validation, and deterministic **COCO JSON** and **YOLO** exporters.

Acceptance:
- Internal coordinates follow a documented canonical pixel convention (`x, y, width, height` top-left origin validated against image `width` and `height`) with tested conversion to normalized `[0.0, 1.0]` YOLO center coordinates and COCO formats.
- Negative coordinates, zero-area boxes, out-of-bounds boxes, and undeclared `class_id` values are rejected by validation.
- Users can draw, move, resize, and delete boxes or review/refine AI-proposed boxes with append-only revision tracking.
- COCO and YOLO exports include deterministic class-index mappings (`classes.txt` / `data.yaml`) and pass round-trip coordinate math tests.

### FR-018 — Bounded web research & source rights review (P1)

Allow users to run bounded **Researcher Agent** jobs that query permitted catalogs/APIs or fetch specified URLs to gather candidate text and images, capturing full source provenance and license review states.

Acceptance:
- Every discovered candidate records its query, source URL, retrieval timestamp, and content hash in `SourceRecord`.
- Discovery staging is kept separate from approved dataset records; web-retrieved items default to `license_status = review_required` unless a verified open license is confirmed.
- Server-side URL fetching enforces strict SSRF guards (blocking loopback, private network, and cloud metadata IPs), rate limits, and byte caps.
- Export policies warn or filter out records with unresolved or restricted source rights.

### FR-019 — Synthetic data generation & anti-collapse filtering (P1)

Allow users to run bounded **Synthesizer Agent** jobs that generate new text records, instruction-caption pairs, or image variations from seed samples or class targets.

Acceptance:
- Every generated asset and record is permanently tagged with `origin = "synthetic"` and linked to its generator `ProcessingRun`, model ID, seed record IDs, and prompt template version.
- Synthetic candidates undergo schema validation plus **Anti-Collapse Diversity Checks** (filtering out exact hash duplicates, high n-gram overlap, or perceptual `phash` clones) and land in `pending_review`.
- Quality reports and generated Dataset Cards (`README.md`) transparently report exact Real vs. Synthetic record proportions.

### FR-020 — Additional media modalities: Audio, Document/OCR & Video (P2)

Expand the `RecordAsset` multi-modal bundle workflow to support Audio transcription/classification (with waveform UI and local Whisper adapter), Document/PDF region OCR, and Video keyframe/temporal clip annotation. Each modality must pass full ingestion, editing, validation, versioning, and export gates before activation.

### FR-021 — Active learning prioritization & baseline evaluation (P2)

Rank unreviewed records in the review queue by lowest model confidence and lowest multi-model `consensus_score` (highest Critic disagreement), and support running reproducible baseline evaluations against frozen `DatasetVersion` splits with strict split-leakage guards.

### FR-022 — Hosted multi-tenant collaboration (P2)

Enforce workspace RBAC (`owner`, `reviewer`, `annotator`, `viewer`), strict cross-tenant database/storage/worker isolation, encrypted secret storage, per-tenant quotas, and audit logging before any public hosted deployment.

## 7. Quality requirements

### NFR-001 — Correctness

All persisted entities must satisfy relational foreign keys and versioned JSON schemas. Illegal review state transitions, out-of-bounds bounding boxes, and undeclared labels are rejected at the service boundary.

### NFR-002 — Reliability

Long-running jobs (imports, web research, synthetic generation, batch auto-labeling, exports) execute asynchronously via durable `ProcessingRun` and atomic `RunItem` checkpoints. Worker restarts resume cleanly without duplicating completed items.

### NFR-003 — Security

Enforce server-side project ownership on every route. Defend against archive path traversal, zip bombs, SSRF in web research connectors, XSS/HTML injection in scraped text, indirect prompt injection from untrusted data, SQL injection, and secret leakage.

### NFR-004 — Local-first privacy

Local mode (`privacy_mode = local_only`) must never transmit assets, prompts, or telemetry to external servers. External provider calls require explicit configuration and visible per-run user authorization.

### NFR-005 — Performance

Enforce cursor/offset pagination on all collection endpoints and stream large file uploads/exports in bounded memory chunks. Use database indexes on `dataset_id`, `status`, `sha256`, `phash`, and `consensus_score` for responsive filtering.

### NFR-006 — Portability

Users can export complete multi-modal datasets, media files, schemas, and Dataset Cards in standard open formats (`CSV`, `JSONL`, `COCO`, `YOLO`) with zero vendor lock-in.

### NFR-007 — Accessibility and usability

Provide keyboard-first annotation shortcuts, visible focus rings, WCAG-compliant contrast, undo/revision restore, and clear empty, loading, progress, and error states.

### NFR-008 — Maintainability

Maintain strict modular boundaries (`dataset_core`, `provider_gateway`, `workflow_agents`, `dataset_io`, `validation`, `documentation`), automated database migrations, and deterministic offline tests.

### NFR-009 — Reproducibility

Published `DatasetVersion` manifests cryptographically pin exact record, split, asset hash, and annotation revision IDs. Exporting the same version repeatedly produces semantically identical training packages.

### NFR-010 — Cost & compute transparency

Display item counts, estimated token/compute usage, and target provider/model before starting batch AI runs. Enforce user-configured count/budget ceilings and instant job cancellation.

## 8. Security, privacy and data rights requirements

- All uploaded files, extracted archive entries, web-researched pages, and model outputs are treated as untrusted input.
- Enforce strict ceilings on upload byte size, archive entry count, decompressed byte size, image dimensions, and parser timeouts.
- Never execute uploaded files, scraped scripts, or model-generated code.
- Enforce SSRF protections on all server-side URL fetches (denying private, loopback, link-local, and cloud metadata IP ranges).
- Sanitize all external/scraped text before rendering in the UI and isolate data payloads from LLM system instructions.
- Keep API keys strictly server-side and redact them from logs, crash dumps, and API responses.
- Maintain strict separation between source discovery, asset ingestion, and license approval.
- Never treat public web reachability as implicit permission for ML training or dataset redistribution.
- Persist source URLs, retrieval timestamps, generator model lineage, and license states (`unknown`, `review_required`, `approved_for_intended_use`, `restricted`, `rejected`) in `SourceRecord`.
- Flag or exclude unresolved/restricted records during version publication and export according to project policy.
- Keep copyrighted media, personal data, and live API keys out of Git and automated test fixtures.

## 9. Error behavior

All API and job errors must return a structured envelope containing a stable `error_code`, concise human-readable `message`, safe contextual details (`record_id`, `field`, `rule_id`), and a suggested remediation action. Never expose raw stack traces, database internals, or secret headers to the client.

Required error categories:
- `INVALID_INPUT`
- `UNSUPPORTED_FORMAT_OR_CAPABILITY`
- `PERMISSION_DENIED`
- `PRIVACY_POLICY_BLOCKED` (e.g., external call attempted while `local_only` is active)
- `QUOTA_OR_BUDGET_EXCEEDED`
- `SSRF_OR_SOURCE_BLOCKED`
- `TRANSIENT_PROVIDER_FAILURE`
- `PERMANENT_PROVIDER_FAILURE`
- `SCHEMA_OR_GEOMETRY_VALIDATION_FAILURE`
- `STORAGE_INTEGRITY_FAILURE`
- `JOB_CANCELLED`
- `INTERNAL_ERROR`

Partial batch failures must preserve all completed `RunItem` outputs and clearly list succeeded, failed, and remaining items for targeted retry.

## 10. Testing requirements

- **Unit tests:** Domain schemas, centralized state machine transitions, multi-modal `RecordAsset` bundling, YOLO/COCO coordinate math, `sha256`/`phash` duplicate logic, and quality validation rules.
- **API & integration tests:** Project/dataset CRUD, ownership authorization, multipart/ZIP import, annotation revision history, version immutability, and version diffing.
- **Provider & consensus contract tests:** `FakeProvider` and local adapter contracts, Critic consensus scoring, malformed JSON rejection, timeout/rate-limit retries, cancellation, and `local_only` network blocking.
- **Security tests:** ZIP path traversal (`../`), zip-bomb limits, corrupt/spoofed image headers, SSRF private-IP blocking in web research, and cross-project access rejection.
- **Round-trip export tests:** Export and re-parse verification for CSV, multi-modal JSONL, COCO JSON, and YOLO archives, plus statistical accuracy verification for generated Dataset Cards (`README.md`).
- **End-to-end offline smoke test:** Full lifecycle (`Create Project/Dataset` $\rightarrow$ `Import Multi-Modal Fixture` $\rightarrow$ `AI Auto-Label + Consensus` $\rightarrow$ `Human Review & Box Edit` $\rightarrow$ `Quality & Split Check` $\rightarrow$ `Publish Version` $\rightarrow$ `Export & Verify Round-Trip`) running 100% offline without paid API keys.

## 11. MVP release acceptance

The MVP is releasable only when all of the following are verified by automated tests:

1. A user can create a project and configure datasets for Image Classification, Text Classification, Paired Image-Text Captioning, and Object Detection.
2. A user can ingest single and multi-modal bundled files/ZIPs, detect exact (`sha256`) and perceptual (`phash`) duplicates, and inspect item-level rejection diagnostics.
3. A user can manually classify, caption, and draw/edit bounding boxes offline with zero AI providers configured.
4. A user can run bounded Web Research and Synthetic Generation jobs with full provenance, SSRF safety, and anti-collapse filtering.
5. A configured local open-source model or external provider can propose classifications, captions, and bounding boxes through the gateway, with optional Critic consensus scoring.
6. AI proposals, consensus scores, and human-approved annotations remain strictly distinct and append-only revisioned.
7. Quality validation catches schema errors, invalid box geometry, exact/near duplicates, and train/val/test split leakage.
8. An immutable `DatasetVersion` can be published and remains completely unchanged when working records are later edited.
9. CSV, JSONL, COCO, and YOLO training packages—along with an accurate, evidence-based **Dataset Card (`README.md`)**—are exported deterministically from the frozen version.
10. All unit, security, contract, round-trip, and E2E smoke tests pass offline.
11. One-command local Docker Compose deployment works cleanly from a fresh clone.
12. Zero secrets, private data, or critical security defects exist in the repository.
13. Generated documentation states dataset provenance, synthetic ratios, and known limitations truthfully.

## 12. Definition of done for any feature

A feature is `DONE` only when:
- Its user-visible behavior satisfies the corresponding requirement and acceptance criteria above.
- All boundary inputs, spatial coordinates, and state transitions are validated server-side.
- Loading, empty, live-progress, error, and success UI states are fully implemented.
- Unit, integration, security, and round-trip tests are written, executed, and passing.
- Local-first privacy, provenance, and compute/cost limits are enforced.
- Documentation and `docs/EXECUTION_PLAN.md` are updated with command evidence.
- It contains zero dead UI buttons, mock-only production screens, or unverified claims.