# Detailed Phase-by-Phase Implementation Plan

**Status:** Planning only. No phase is complete until implementation and verification evidence exist.  
**Authority:** Read `AGENTS.md`, `docs/DESIGN.md`, `docs/REQUIREMENTS.md`, `docs/EXAMPLES.md` and `docs/DECISIONS.md` first.  
**Companion roadmap:** `docs/EXECUTION_PLAN.md`.

This plan converts the 16-phase roadmap into implementable, verifiable work packages. Phase 0 must inspect the actual repository and preserve healthy existing code. The coding agent may split work into smaller atomic commits but must never skip acceptance gates.

## Operating rules for every phase

1. Re-check repository state, dependencies, and existing implementation before writing code; preserve all user changes.
2. Implement complete vertical slices—never ship dead UI buttons, mock-only screens, or hardcoded placeholder success responses.
3. Add comprehensive unit, API/integration, database migration, security, round-trip, and UI/E2E tests for every capability introduced.
4. Run available formatter, linter, type-check, test, and build commands. Record the exact commands executed and their outputs.
5. Audit all changes for leaked secrets, path-traversal vulnerabilities, SSRF risks, data-loss vectors, provenance/license gaps, and documentation drift.
6. Update `docs/EXECUTION_PLAN.md` with verification evidence. Mark a phase `DONE` only when its exit gate passes completely.
7. If blocked by external credentials or missing hardware, implement safe offline/local independent work and document the exact blocker. Never fabricate test results.

Status values: `NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `DONE`, `DEFERRED`. `DEFERRED` is not `DONE`. A running dev server or generated file scaffold is never acceptance evidence.

---

## Phase 0 — Repository reconnaissance and reproducible baseline

**Dependencies:** None. **Outcome:** The agent understands the real repository and can run all verification checks reliably.

### Tasks
- Read all governing architecture and product docs; inspect the directory tree, `git status`, active branch, commit history, package manifests, lockfiles, tests, CI workflows, Dockerfiles, `.env` examples, and `.gitignore` rules.
- Record existing behavior, missing modules, current architectural boundaries, and any known baseline failures. Do not rebuild healthy components merely to match a suggested folder layout.
- Identify exact runtime versions and package managers from the repository; preserve established codebase conventions.
- Establish or repair safe `.gitignore` rules, secret-free `.env.example` configurations (defaulting to offline/local-first operation), and contributor setup instructions.
- Document exact install, format, lint, type-check, unit-test, integration-test, and build commands; explicitly list any verification checks that need to be created.
- Audit all tracked files for accidentally committed API keys, private credentials, personal datasets, or binary build artifacts.
- Record consequential architectural choices in `docs/DECISIONS.md` and align this execution checklist with the actual codebase.

### Deliverables
Repository inventory, reproducible setup/verification commands, safe local-first configuration baseline, and an implementation checklist grounded in actual code.

### Tests / verification
Run existing test/lint suites to capture baseline metrics. Perform a clean-start environment check where possible. Scan tracked files and ignore rules for secrets and generated binary outputs.

### Exit gate
A contributor or coding agent can boot the repository and run its documented verification commands; baseline failures are cleanly distinguished from new regressions; existing user work is preserved intact.

---

## Phase 1 — Domain model, schemas and persistence foundation

**Dependencies:** Phase 0. **Outcome:** Stable, validated multi-modal dataset contracts and relational persistence.

### Tasks
- Define typed contracts and relational persistence models for `Project`, `Dataset`, `DatasetRecord` (supporting multi-modal bundling, `origin` tracking, and `train`/`val`/`test` split fields), `Asset` (with `sha256`, perceptual `phash`, dimensions/duration), `RecordAsset` (with explicit multi-modal roles like `primary_image`, `paired_text`, `dense_caption`, `crop`, `audio_track`, `video_clip`), `Annotation` (with `confidence` and `consensus_score`), `AnnotationRevision`, `SourceRecord`, `ProcessingRun`, `RunItem`, `DatasetVersion`, `VersionItem`, `ExportArtifact`, and `ReviewEvent`.
- Define collision-resistant stable IDs, content-addressed storage key patterns, UTC timestamp conventions, task identifiers (`image_classification`, `text_classification`, `image_text_captioning`, `object_detection`), schema versions, and safe archive/deletion semantics.
- Define record origins (`uploaded`, `web_retrieved`, `synthetic`, `augmented`), annotation origins (`human`, `model`, `consensus`, `import`, `rule`), and review states (`proposed`, `pending_review`, `approved`, `rejected`, `needs_correction`, `invalid`); enforce legal state transitions through a centralized state machine.
- Separate user-facing domain validation errors from internal system faults; validate all payloads at module and API trust boundaries.
- Implement database migrations and clean repository/service boundaries. Keep raw media bytes strictly in object/file storage outside relational rows.
- Add `/health` and `/ready` endpoints plus a validated configuration loader (including strict `privacy_mode = local_only` enforcement). Application startup must never require external AI credentials.
- Create programmatic synthetic seed fixtures (small generated RGB images, paired text records, sample bounding boxes) with zero personal or unlicensed data.
- Document database migration, backup, restore, and development-reset policies, keeping destructive reset operations behind explicit flags.

### Tests / verification
Clean migration from an empty database, migration rollback/status checks, multi-modal `DatasetRecord` + `RecordAsset` persistence round trips, illegal state transition and malformed schema rejection, stable ID and UTC timestamp tests, and offline startup verification without AI provider keys.

### Exit gate
Multi-modal dataset, record, asset, and annotation persistence works end-to-end; invalid domain states and malformed payloads are deterministically rejected; clean migrations and unit tests pass.

---

## Phase 2 — Application shell, projects and datasets

**Dependencies:** Phase 1. **Outcome:** Persisted projects and multi-modal datasets are manageable through an accessible, responsive UI.

### Tasks
- Build the responsive application shell, sidebar/header navigation, routing, workspace privacy/queue status indicators, and shared loading/error/empty states.
- Implement Project create, list, detail, rename, settings, and archive flows.
- Implement Dataset create, list, detail, and edit flows supporting task type selection (`image_classification`, `text_classification`, `image_text_captioning`, `object_detection`), supported modalities, label ontology definitions, annotation rubric instructions, split targets, and schema version display.
- Render all record counts, split summaries, and status badges strictly from real backend database queries—never from hardcoded mock arrays.
- Define structured API error envelopes and clear, actionable UI error banners.
- Scope all dataset operations to their parent project and enforce server-side ownership/authorization checks even in single-user local mode.
- Ensure full keyboard navigation, visible focus states, WCAG-compliant contrast, and responsive layouts across desktop and narrow screens.

### Tests / verification
API CRUD and input validation integration tests, UI component and navigation workflow tests, database persistence across server restarts, and cross-project unauthorized ID access rejection tests.

### Exit gate
Users can create, configure, and manage persisted projects, multi-modal datasets, label ontologies, and annotation rubrics through the UI; authorization and core flows pass automated tests.

---

## Phase 3 — Import pipeline, safe storage and record normalization

**Dependencies:** Phases 1–2. **Outcome:** Raw user files and multi-modal bundles become normalized records and content-addressed assets with exact/perceptual hash diagnostics.

### Tasks
- Implement bounded multipart uploads and safe local directory/archive import pipelines.
- Support UTF-8 text, JPEG/PNG/WebP images, CSV, JSON, JSONL, Parquet, and constrained multi-modal ZIP archives.
- Validate magic-byte content signatures alongside file extensions and MIME headers; enforce strict ceilings on file byte size, archive item count, row length, JSON nesting depth, and total decompressed byte size.
- Prevent ZIP path traversal (`..`, absolute paths), symlink escapes, decompression bombs, unsafe temporary staging paths, and filename collisions.
- Generate opaque server-side content-addressed storage keys; retain original filenames solely as untrusted display metadata. Compute cryptographic `SHA-256` for all files and perceptual hash (`pHash`) plus pixel `width`/`height` for all images.
- Support automatic multi-modal bundling during ingestion (e.g., linking `item_001.jpg` + `item_001.txt` or structured CSV/JSONL image+caption fields into a single logical `DatasetRecord` via `RecordAsset` roles `primary_image` and `paired_text`). Preserve original assets immutably and track any derived thumbnails/crops separately.
- Record every import job as a durable `ProcessingRun` with per-item `RunItem` outcomes (`accepted`, `rejected`, `skipped`, `deduplicated`) and actionable diagnostic codes.
- Define explicit duplicate handling: report exact `sha256` duplicates and `phash` perceptual near-duplicates clearly without silently deleting or corrupting existing records. Ensure import retries are idempotent.
- Build the Import Wizard UI with file/bundle preview, live progress tracking, job cancellation, per-item error inspector, and guaranteed temporary file cleanup on both success and failure.

### Tests / verification
Valid single-modal and paired image-text fixtures across all supported formats; malformed CSV/JSONL rows, invalid UTF-8 sequences, truncated/spoofed image headers, oversized files, exact `sha256` duplicates, `phash` near-duplicates, ZIP path-traversal attempts, and zip-bomb payloads. Verify failed imports leave zero orphan staging files or false completion states.

### Exit gate
Valid uploads and archives produce normalized, bundled `DatasetRecord` entities and content-addressed `Asset` objects; malicious or corrupt inputs fail safely with item-level diagnostics; temporary staging directories are deterministically cleaned up.

---

## Phase 4 — Annotation schemas and manual labeling

**Dependencies:** Phase 3. **Outcome:** Fast, keyboard-driven manual classification and image-text captioning workflows operating 100% offline without AI providers.

### Tasks
- Implement the versioned task schema registry, label ontology validators, required-field checks, and versioned annotation instruction rubrics.
- Build dedicated manual workspaces for **Text Classification**, **Image Classification**, and **Paired Image-Text Captioning / Instruction Tuning** (side-by-side multi-modal bundle inspector).
- Implement annotation CRUD endpoints, append-only `AnnotationRevision` creation on every save, and explicit `ReviewEvent` audit logging (`approve`, `reject`, `request_correction`).
- Centralize all review state transitions (`proposed` $\rightarrow$ `pending_review` $\rightarrow$ `approved` / `rejected` / `needs_correction`) and reject illegal transitions at the domain layer.
- Build fast workspace filters and queues for `unannotated`, `pending_review`, `approved`, `rejected`, `needs_correction`, `invalid`, split type, and record origin.
- Implement keyboard-first ergonomics (single-keystroke class assignment `1`–`9`, `J`/`K` or arrow record stepping, `Enter`/`Space` approval, undo/revision restore), save-state indicators, unsaved-change navigation guards, and network-error recovery.
- Keep raw ingested assets strictly immutable. Updating a dataset schema version must never silently mutate historical `AnnotationRevision` records or published versions.

### Tests / verification
Valid/invalid class label tests, missing required field tests, append-only revision preservation tests, illegal state-transition rejection tests, keyboard-driven UI editor tests, and full manual labeling workflow verification with zero AI provider credentials configured.

### Exit gate
Users can import text, images, and image-text bundles, label and caption them manually via keyboard or mouse, revise labels, and approve/reject annotations while preserving a complete, auditable revision history offline.

---

## Phase 5 — Provider gateway and AI-assisted annotation

**Dependencies:** Phase 4. **Outcome:** Safe, provider-neutral AI auto-labeling and multi-model consensus verification prioritizing zero-cost local open-source models alongside optional cloud APIs.

### Tasks
- Define the backend `ProviderGateway` interface, explicit capability declarations (`text_classification`, `image_classification`, `image_text_captioning`, `object_detection`, `synthetic_generation`, `consensus_critique`), normalized error taxonomy, and token/compute usage metadata.
- Implement a deterministic `FakeProvider` for offline test suites, plus a first-class **Local Open-Source Model Adapter** (e.g., Ollama / local vLLM / local vision worker) so users can run free local inference without paid API limits, alongside optional external cloud adapters.
- Isolate any external API keys strictly server-side, redact secrets from all logs and error payloads, and enforce `privacy_mode = local_only` transport blocks when local mode is enabled.
- Require explicit user initiation to launch any AI inference run. Clearly display which provider/model will process the selected records and whether data remains local or leaves the machine.
- Validate all model outputs against the active task JSON schema. Malformed or out-of-schema outputs are recorded as failed/invalid diagnostics—never silently mapped or auto-approved.
- Implement **Multi-Model Consensus / Critic Verification**: allow an optional secondary Critic model/agent to independently evaluate or re-label proposals, computing a `consensus_score` (`0.0`–`1.0`) and flagging low-agreement records (`disagreement_flagged`) for priority human review.
- Persist provider ID, model ID/digest, prompt template version, run parameters, timestamps, per-item `RunItem` statuses, `confidence` scores, `consensus_score` values, and compute usage.
- Enforce bounded worker concurrency, request timeouts, exponential backoff with jitter, mid-run cancellation, deterministic idempotency keys, and per-run budget/item ceilings.
- Build the AI Run Launcher and progress UI with failed-item retry controls while keeping all manual workflows 100% functional without provider setup.

### Tests / verification
`FakeProvider` and local-adapter contract tests; missing credentials, `local_only` network block, malformed LLM JSON output, Critic disagreement scoring, timeout, rate-limit backoff, mid-run cancellation, partial batch failure, idempotent retry, and secret-redaction tests. Verify app startup and dataset browsing trigger zero inference calls, and all valid AI proposals land in `pending_review`.

### Exit gate
Explicitly launched AI runs produce schema-validated, reviewable proposals with confidence and consensus scores and granular per-item telemetry; low-agreement proposals are flagged for triage; manual workflows remain completely usable offline.

---

## Phase 6 — Quality validation and diagnostics

**Dependencies:** Phases 3–5. **Outcome:** Deterministic, reproducible dataset quality, deduplication, and split-leakage diagnostics before version publication.

### Tasks
- Build a deterministic, versioned validation engine emitting stable rule IDs, severity levels (`hard_blocker`, `warning`, `info`), affected `record_id` lists, and concrete remediation steps.
- Validate required fields, allowed label enums, malformed payloads, missing/unreadable storage assets, empty or extreme-length texts, residual HTML/scraper noise, basic PII warning patterns, schema mismatches, and unreviewed annotation states.
- Perform exact duplicate detection (`sha256`) and perceptual visual near-duplicate clustering (`phash` Hamming distance thresholds).
- Implement deterministic `train`/`val`/`test` split management and **Split Leakage Detection** (raising a `hard_blocker` or high-severity warning if exact or perceptual duplicate assets span across `train` and `val`/`test` splits).
- Add cross-modal consistency checks (e.g., flagging missing paired captions or contradictions between classification tags and text descriptions) and class imbalance/distribution summaries.
- Persist validation runs against the exact dataset state and mark quality reports as `stale` whenever underlying records or annotations change.
- Build the Interactive Quality Dashboard UI allowing users to filter by issue rule, inspect duplicate clusters side-by-side, and jump directly to affected records to fix them.
- Never claim automated checks guarantee legal clearance, complete absence of bias, or production safety.

### Tests / verification
Dedicated unit and integration fixtures for every validation rule, exact `sha256` and `phash` near-duplicate detection, cross-split leakage detection, deterministic issue ordering, stale-report invalidation upon record edit, and performance benchmarks on synthetic datasets.

### Exit gate
Seeded data errors, perceptual duplicates, and split leaks are deterministically caught and linked to actionable record remediation; hard blockers prevent unsafe version publication.

---

## Phase 7 — Provenance, immutable versions and documentation

**Dependencies:** Phases 1–6. **Outcome:** Cryptographically pinned, immutable dataset versions with complete lineage and auto-generated Dataset Cards (`README.md`).

### Tasks
- Link `SourceRecord` provenance (`uploaded`, `web_retrieved`, `synthetic`, `augmented`), ingestion run, original/derived `Asset` hashes, `AnnotationRevision` history, model/consensus `ProcessingRun` metadata, and `ReviewEvent` logs into an unbroken lineage chain per record.
- Freeze exact `DatasetRecord` IDs, split assignments, `AnnotationRevision` IDs, schema version, and `Asset` SHA-256 digests when publishing a `DatasetVersion`.
- Define canonical JSON manifest serialization (deterministic key and array sorting) and compute an immutable SHA-256 manifest hash.
- Enforce strict read-only immutability on published versions at both API and service layers; any subsequent label edit, record addition, or split change occurs in the mutable workspace and requires publishing a new version (`v2` linking to parent `v1`).
- Build Version History and Diff views showing exact record additions/removals, split counts, quality summary, and modified annotation revisions between versions.
- Implement the **Automated Dataset Card & Documentation Compiler** (`packages/documentation`): generate a comprehensive `README.md` (Datasheet), `schema.json` data dictionary, annotation instructions snapshot, provenance/origin breakdown (Real vs. Synthetic vs. Web), class/split distribution tables, quality audit summary, and known limitations directly from frozen version evidence.
- Represent unknown source or license fields explicitly as `unknown`—never fabricate or infer training rights.
- Add storage and manifest cryptographic verification checks.

### Tests / verification
Snapshot immutability verification after live workspace edits, identical manifest SHA-256 digests for identical snapshots, accurate version-to-version diff calculations, statistical verification that generated Dataset Card (`README.md`) numbers match the frozen database snapshot 100%, and unbroken provenance queries.

### Exit gate
Published dataset versions are cryptographically pinned, immutable, diffable, and accompanied by truthful, evidence-generated Dataset Cards and provenance manifests.

---

## Phase 8 — Training-ready exports and reproducibility

**Dependencies:** Phase 7. **Outcome:** Portable, deterministic, version-bound multi-modal export packages.

### Tasks
- Implement deterministic **CSV** and **JSONL** (including ShareGPT / HuggingFace multi-modal paired record formats) exporters with strict field escaping and schema validation.
- Package linked media assets deterministically by split (`train/`, `val/`, `test/` or manifest paths) with safe normalized filenames, UTF-8 encoding, explicit null handling, and SHA-256 checksums.
- Bind every export job strictly to a frozen `DatasetVersion` manifest—never to mutable live queries. Bundle `export_manifest.json`, `README.md` (Dataset Card), `schema.json`, `provenance_manifest.json`, and `quality_report.json` inside the exported archive.
- Build the Export Portal UI with format configuration, pre-export quality/license warning summary, background progress tracking, and checksum verification.
- Persist `ExportArtifact` metadata (storage key, SHA-256 checksum, byte size, exporter version, status) and stream archive generation with bounded memory usage.
- Ensure failed or cancelled export runs clean up partial archive files and can be retried idempotently.
- Include copy-pasteable Python/PyTorch/HuggingFace dataset loading snippets inside the generated Dataset Card without overclaiming universal framework compatibility.

### Tests / verification
Golden export fixtures testing Unicode, embedded commas, newlines, quotes, nulls, and multi-modal asset paths; byte-equivalent/semantically identical repeat exports of the same version; round-trip parser tests reloading exported CSV/JSONL archives; checksum verification; failure cleanup; and hard-blocker export gating.

### Exit gate
Users can export valid, self-documented CSV and multi-modal JSONL training bundles from any frozen `DatasetVersion` and pass automated round-trip verification.

---

## Phase 9 — Object detection and COCO/YOLO

**Dependencies:** Phases 4, 6–8. **Outcome:** End-to-end spatial bounding-box annotation, zero-shot AI box proposals, geometry validation, and verified COCO/YOLO exports.

### Tasks
- Register the versioned `object_detection` schema, stable `class_id` ontology registry, and canonical internal bounding-box representation (top-left pixel coordinates `x, y, width, height` validated against exact image `width` and `height`, plus normalized `[0.0, 1.0]` conversion utilities).
- Document exact coordinate conventions, origin `(0, 0)` top-left rules, floating-point rounding tolerances, and aspect-ratio handling.
- Build the interactive **Object Detection Canvas UI**: drag-to-draw boxes, select/move/resize handles, delete boxes, assign/change `class_id` via keyboard shortcuts, zoom/pan, toggle layer visibility, and compare AI-proposed boxes against human revisions.
- Extend the Provider Gateway to support **Zero-Shot Vision Auto-Labeling** (enabling local open-source vision detectors such as GroundingDINO / Florence-2 / YOLO / VLM adapters to propose initial bounding boxes from class names/prompts, plus IoU-based Critic consensus scoring).
- Implement strict spatial validation rules: positive non-zero width/height, image boundary containment (`x + width <= img_w`, `y + height <= img_h`), valid `class_id` references, degenerate narrow-box warnings, and duplicate overlapping box (IoU) warnings.
- Implement deterministic **COCO JSON** and **YOLO** directory/text exporters (`.txt` normalized `class_idx center_x center_y width height` files + deterministic `classes.txt` / `data.yaml` mapping) bundled with export manifests and Dataset Cards.
- Support importing existing COCO/YOLO annotations with full coordinate validation and class mapping.

### Tests / verification
Mathematical coordinate conversion round trips (`640x480` pixel space $\leftrightarrow$ normalized YOLO center coordinates $\leftrightarrow$ COCO format); rejection of negative coordinates, zero-area boxes, out-of-bounds boxes, and undeclared classes; golden COCO and YOLO export verification; canvas save and append-only revision tests; and version geometry immutability tests.

### Exit gate
Object detection works seamlessly across manual canvas drawing, AI box proposals, spatial validation, human review, immutable versioning, and round-trip verified COCO and YOLO exports.

---

## Phase 10 — Local deployment and developer experience

**Dependencies:** Phases 0–9. **Outcome:** Turnkey, reproducible local-first MVP deployment.

### Tasks
- Finalize `docker-compose.yml` (or the repository's established container orchestration) for Web UI, FastAPI backend, Background Worker, PostgreSQL, Redis, and local filesystem/MinIO object storage (with seamless optional bridging to local Ollama/vision model runtimes).
- Configure container health checks, dependency startup ordering (`depends_on` health conditions), persistent named volumes, automated startup migrations, and graceful worker shutdown.
- Document one-command setup, upgrade, backup, restore, and troubleshooting workflows; provide a comprehensive, secret-free `.env.example`.
- Verify that the complete local platform operates offline without external cloud API keys; bind local ports safely and document network exposure settings.
- Implement and test metadata (PostgreSQL dump) and media (object storage) backup and restore scripts, including post-restore SHA-256 asset integrity verification.
- Configure deterministic CI pipelines running formatting, linting, static type-checking, unit/integration/round-trip tests, database migrations, and production builds without requiring paid API credentials.
- Separate destructive development-reset commands clearly from standard startup commands.

### Tests / verification
Clean container boot from zero, restart persistence verification, full backup and restore drill into a fresh instance, SHA-256 asset integrity audit, secret-free log inspection, and end-to-end offline smoke test execution.

### Exit gate
A developer or student can clone the repository, start the full stack locally with a single command and zero paid API keys, run the complete multi-modal workflow, and verify backup/restore integrity.

---

## Phase 11 — Source discovery, provenance and rights review

**Dependencies:** Phases 3, 7 and 10. **Outcome:** Bounded Researcher Agent web/catalog discovery with SSRF protections and explicit source-rights tracking.

### Tasks
- Define `ResearchSourceAdapter` contracts capturing query parameters, source page URL, direct asset URL, retrieval timestamp, retrieval method, author/publisher attribution, detected license evidence, terms notes, and content SHA-256 hash.
- Maintain a strict architectural separation between discovering candidate web references and importing assets into a dataset; public web visibility never implies training or redistribution permission.
- Require explicit user initiation before running any external web/catalog search or URL fetch; enforce strict rate limits, domain rules, and byte budgets.
- Enforce SSRF (Server-Side Request Forgery) network guards blocking loopback, private, link-local, and cloud-metadata IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`) and unsafe redirect chains.
- Enforce explicit `SourceRecord` rights states: `unknown`, `review_required`, `approved_for_intended_use`, `restricted`, and `rejected`. Record license evidence and human reviewer decisions.
- Never bypass authentication walls, paywalls, `robots.txt` restrictions, or anti-bot controls.
- Treat all retrieved web text, HTML metadata, and filenames as untrusted data: sanitize before UI rendering and isolate from LLM system prompts to block indirect prompt injection.
- Configure export policies to exclude or prominently flag `unknown`, `review_required`, or `restricted` records without silently deleting source metadata.

### Tests / verification
Research connector contract fixtures, SSRF private-IP rejection tests, untrusted HTML/prompt-injection sanitization tests, rate-limit and cancellation behavior, rights-based export gate tests, and provenance persistence checks. Confirm `unknown` or web-scraped items never become `approved_for_intended_use` automatically.

### Exit gate
Bounded web/catalog research captures candidate text and media with full provenance and explicit rights states; SSRF guards block internal network access; unresolved or restricted sources are never silently exported as cleared data.

---

## Phase 12 — Synthetic data generation

**Dependencies:** Phases 5–7 and 11. **Outcome:** Traceable, diversity-checked synthetic data generation via the Synthesizer Agent.

### Tasks
- Verify explicit provider generation capabilities (`synthetic_text`, `synthetic_image_text`, `image_variation`) before dispatching jobs; never assume a model supports generation.
- Version prompt templates and persist generation parameters (seed records, target class distribution, temperature, random seed, requested item count, and budget ceilings) in `ProcessingRun`.
- Require explicit user initiation, visible external-transfer disclosure (when using non-local models), and strict item/cost limits.
- Tag every generated record and asset with `origin = "synthetic"` and link its `SourceRecord` directly to the generator `ProcessingRun`, model ID, prompt version, and seed record IDs.
- Pass all synthetic candidates through standard schema validation plus **Anti-Collapse Diversity Checks** (rejecting exact hash duplicates, high token n-gram overlap, or perceptual `phash` clones) and route valid candidates to `pending_review` by default.
- Support bounded retries, partial batch recovery, and instant user cancellation.
- Allow users to filter, include, or exclude `synthetic` records when publishing a `DatasetVersion` or exporting, and automatically report exact Real-vs-Synthetic ratios in generated Dataset Cards (`README.md`).

### Tests / verification
Deterministic `FakeProvider` synthesis tests, malformed output rejection, duplicate/low-diversity rejection tests, partial batch failure, budget/count ceiling enforcement, job cancellation, and synthetic provenance tracking through version publication and Dataset Card export. Verify synthetic records are never silently marked `approved` or `uploaded`.

### Exit gate
Synthetic text and multi-modal records are generated within strict bounds, filtered for diversity, routed through review, and transparently distinguished from real data in versions and documentation.

---

## Phase 13 — Additional modalities and task plugins

**Dependencies:** Phases 4–8 and 10. **Outcome:** Seamless expansion of the `RecordAsset` multi-modal bundle architecture to audio, document/OCR, and video workflows.

### Tasks
- Define strict task and provider capability contracts before enabling each additional modality.
- Deliver complete vertical slices one modality at a time in priority order:
  1. **Paired Image-Text / Dense Captioning / VQA Bundles** (if not already completed in Phases 4–8).
  2. **Audio Transcription & Sound Event Classification** (safe WAV/MP3/FLAC ingestion, duration/sample-rate metadata, waveform playback UI, local Whisper-compatible transcription proposals, timestamped segment validation, and audio-text bundle export).
  3. **Document / PDF & OCR Extraction** (bounded page parsing, region bounding boxes linked to transcribed text spans, and structured JSONL export).
  4. **Video Keyframe & Temporal Clip Annotation** (safe codec/duration limits, deterministic frame extraction into linked child `Asset` images, timestamp validation, and frame/clip export).
- For every enabled modality, implement full support across ingestion, metadata extraction, schema validation, editing UI, AI proposal adapter, quality rules, provenance, immutable versioning, Dataset Card metrics, and at least one round-trip tested exporter.
- Do not advertise any modality as supported in the UI until its complete end-to-end slice and automated tests pass.

### Tests / verification
Programmatic fixture parsers and schema tests for each modality, audio/video timestamp and document coordinate bound checks, export golden files, parent-to-derived asset lineage tests, and resource-exhaustion guards for malformed media files.

### Exit gate
Every enabled modality has a complete, tested ingestion-to-export workflow and round-trip verified training export; unfinished modalities remain cleanly hidden or marked experimental.

---

## Phase 14 — Active learning, evaluation and advanced quality loops

**Dependencies:** Phases 5–9 and complete task-specific workflows. **Outcome:** Explainable active-learning review prioritization and reproducible baseline evaluation against frozen dataset versions.

### Tasks
- Implement pluggable review queue prioritization strategies, starting with transparent, explainable signals: unreviewed status, lowest primary model `confidence`, and lowest multi-model `consensus_score` (highest Critic disagreement).
- Surface uncertainty metrics only when a provider returns calibrated scores or cross-model agreement; never fabricate confidence numbers.
- Expand dataset diagnostics to highlight severe class imbalance, tail-class starvation, cross-modal contradictions, and potential split-leakage clusters.
- Implement a reproducible evaluation harness that compares model predictions or new annotation runs against a frozen, human-approved `val`/`test` split in a published `DatasetVersion`.
- Persist exact evaluation metric definitions (Accuracy, Macro-F1, confusion matrix, mAP@50, IoU), target `DatasetVersion` ID, evaluated split, model/provider configuration, and per-record high-error predictions (surfacing likely ground-truth label errors for human re-review).
- Automatically flag small-sample-size warnings and avoid unsubstantiated statistical significance or demographic fairness claims.
- Keep all active-learning queue rankings transparent and manually overridable by the user.

### Tests / verification
Deterministic priority queue ranking tests, evaluation metric calculations verified against hand-computed classification and IoU fixtures, version/split reproducibility tests, and small-sample/missing-confidence warning checks.

### Exit gate
Review queue prioritization and baseline evaluation runs are deterministic, explainable, and cryptographically tied to exact `DatasetVersion` splits with honest limitation disclosures.

---

## Phase 15 — Hosted deployment, collaboration and operational hardening

**Dependencies:** Phases 0–10. **Outcome:** Secure multi-tenant hosted deployment capability without compromising local-first offline guarantees.

### Tasks
- Threat-model multi-user workspace tenancy; implement authentication, workspace RBAC (`owner`, `reviewer`, `annotator`, `viewer`), and strict server-side ownership checks across every endpoint before enabling hosted mode.
- Verify strict tenant isolation across PostgreSQL queries, object storage keys/signed URLs, export downloads, background worker queues, and encrypted provider credentials.
- Configure KMS/encrypted secret storage, TLS transport security, secure session/cookie policies, CSRF protection, per-route rate limiting, and upload abuse controls.
- Define explicit data retention, workspace export, right-to-erasure deletion, automated backup/restore, and incident response procedures. All destructive operations must require explicit confirmation and write an immutable audit log entry.
- Configure structured operational observability (metrics, traces, queue depth, storage alerts) that redacts secrets and excludes raw user dataset contents by default.
- Enforce per-tenant quotas on storage bytes, concurrent background jobs, web research calls, and external provider token spend, including dead-letter queue handling.
- Perform a full security audit covering dependency vulnerabilities, archive parser limits, authorization boundaries, SSRF guards in web connectors, path traversal, and data exfiltration vectors.
- Keep hosted multi-tenant features cleanly modular so single-user `docker-compose` local mode remains lightweight and friction-free.

### Tests / verification
Automated cross-tenant isolation tests across API, DB, storage, workers, and exports; rate-limit, session-security, upload-ceiling, and provider-budget enforcement tests; live backup/restore and migration rollback drills; and security scan verification.

### Exit gate
Hosted mode passes all cross-tenant isolation, security, quota, and disaster-recovery tests while local self-hosted mode continues to pass its offline smoke test suite.

---

## Cross-phase release gates

### Gate A — Useful local alpha (after Phase 4)
Project and multi-modal dataset persistence; hardened ingestion with `sha256`/`phash` duplicate detection; manual text, image, and paired image-text labeling and review with append-only revision history; automated tests pass; local setup documented.

### Gate B — AI-assisted dataset workflow (after Phase 8)
Provider gateway (with local open-source + fake adapters) and multi-model consensus scoring; human review workbench; quality and split-leakage validation; full provenance; immutable `DatasetVersion` snapshots; auto-generated **Dataset Cards (`README.md`)**; and reproducible CSV/JSONL multi-modal exports working end-to-end.

### Gate C — Object-detection release (after Phase 9)
Interactive spatial bounding-box canvas, zero-shot vision auto-labeling integration, spatial geometry validation, revision history, versioning, and round-trip verified **COCO** and **YOLO** exports pass end-to-end tests.

### Gate D — Local MVP (after Phase 10)
One-command clean local setup/startup, offline E2E smoke test, restart persistence, backup/restore verification, and deterministic CI pipeline pass.

### Gate E — Extended multi-agent & multimodal platform (after applicable Phases 11–14)
Bounded Web Research discovery, Synthetic Data Generation with anti-collapse checks, additional modalities (Audio/OCR/Video), and Active Learning prioritization are individually verified end-to-end with explicit provenance, license, and synthetic lineage tracking.

### Gate F — Hosted production readiness (after Phase 15)
Multi-tenant isolation, RBAC, quotas, secret encryption, recovery drills, and operational monitoring are proven by automated tests. Never claim a hosted service is production-ready until verified.

## Required completion report for every phase

At the conclusion of each phase, produce a structured completion report containing:
1. **Phase ID & Status** (`DONE` / `BLOCKED` / `IN PROGRESS`).
2. **User-Visible Capabilities Delivered** (concrete vertical slices completed).
3. **Key Files & Modules Added/Modified**.
4. **Database Migrations & API/Schema Contracts Updated**.
5. **Exact Verification Commands Executed & Actual Pass/Fail Counts** (lint, type-check, unit, integration, round-trip, E2E).
6. **Manual / End-to-End Smoke Verification Performed**.
7. **Known Limitations, Deferred Items, or External Blockers**.
8. **Exit-Gate Evidence Summary**.
9. **Next Phase & Satisfied Dependencies**.

**A checklist tick, git commit, generated scaffold, or compiling build is never a substitute for verified, tested product behavior.**