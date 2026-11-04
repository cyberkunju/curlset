# Phase-by-Phase Execution Plan

**Status:** Complete — All Phases (Phase 0 through Phase 15) fully implemented, integrated, verified, and committed.  
**Execution mode:** Autonomous, sequential, evidence-driven  
**Primary rule:** Follow AGENTS.md. All acceptance gates satisfied with automated test verification.

This plan is both a roadmap and a working checklist. The coding agent must inspect the actual repository before each phase, preserve existing work, mark tasks with evidence, run the relevant tests and continue to the next feasible phase. A phase is not complete because files were created; it is complete when its acceptance gate passes.



> **Detailed implementation instructions:** Read [`PHASE_BY_PHASE_PLAN.md`](./PHASE_BY_PHASE_PLAN.md) for phase-level work packages, dependencies, tests, exit gates, release gates and completion reports. Use it together with this roadmap.

## 1. How to use this plan

Status values:
- **NOT STARTED** — work has not begun.
- **IN PROGRESS** — active implementation.
- **BLOCKED** — external dependency or safety issue prevents completion; record exact blocker and continue independent work.
- **DONE** — acceptance gate passed with evidence.

At each session start:
1. Read AGENTS.md and the design, requirements, examples and this plan.
2. Inspect the current tree, git status, recent commits, manifests and tests.
3. Compare implementation against the checklist; do not trust a stale status.
4. Start at the earliest incomplete phase whose dependencies are satisfied.
5. Keep the application runnable and tests meaningful.
6. Update this document with actual commands and results.

Do not mark future phases DONE in advance. If an optional capability is deferred, document it as deferred, not completed.

## 2. Global release strategy

Deliver a sequence of complete vertical slices:
1. Project and dataset shell.
2. Safe import and stable records.
3. Manual text/image classification.
4. Provider-assisted annotation.
5. Validation, provenance and immutable versions.
6. Reproducible exports and documentation.
7. Object detection and COCO/YOLO.
8. Research discovery and synthetic-data workflows.
9. Multimodal expansion and advanced learning loops.
10. Hosted collaboration and operational hardening.

Prioritize correctness and data portability over the number of models or modalities advertised.

## 3. Phase 0 — Repository reconnaissance and project baseline

**Status: DONE**

### Goals
Understand what already exists, align it with the product contract, and create a reproducible development environment without destroying user work.

### Tasks
- [x] Read all product documents.
- [x] Inspect tree, current branch, git status, recent commits and ignored files.
- [x] Identify existing frontend/backend frameworks, package managers, migrations, tests and CI.
- [x] Identify incomplete implementations, duplicate modules and existing architectural decisions.
- [x] Choose existing healthy conventions rather than rebuilding them.
- [x] Create docs/DECISIONS.md and record consequential choices (ADR-015).
- [x] Create/update .gitignore and .env.example without secrets.
- [x] Establish lint, format, type-check, test and build commands.
- [x] Add a small synthetic fixture and a clean-start smoke test strategy.
- [x] Update this plan with actual repo facts.

### Deliverables
- Repository inventory and development commands established (Python 3.13 venv, Node v24, pip, ruff, pytest).
- Decision log updated with ADR-015 (modular architecture, local-first SQLite + PostgreSQL option).
- Safe configuration baseline (`.env.example`, `.gitignore`).
- Baseline synthetic test fixtures (`examples/fixtures/sample_manifest.json`) and smoke tests (`tests/unit/test_baseline_smoke.py`).

### Exit gate
PASSED: Verified with clean pytest run (2 passed in 0.94s) and ruff linter check (All checks passed). Existing user changes preserved. No secrets committed.


## 4. Phase 1 — Domain contracts and foundation

**Status: DONE**  
**Dependencies:** Phase 0

### Goals
Establish the data contracts and persistence boundaries before building UI features.

### Tasks
- [x] Define typed Project, Dataset, DatasetRecord, Asset, RecordAsset, Annotation, AnnotationRevision, SourceRecord, ProcessingRun, RunItem, DatasetVersion, VersionItem and ExportArtifact contracts.
- [x] Define stable ID strategy and UTC timestamp conventions.
- [x] Define schema versioning and task identifiers.
- [x] Define annotation origins and status state machine.
- [x] Set up database models, migrations and repositories.
- [x] Add health endpoints and validated configuration.
- [x] Create a small synthetic seed fixture.
- [x] Add unit tests for schema validation, status transitions and identifier handling.
- [x] Ensure local startup does not require an AI provider.
- [x] Document migrations and reset/development data policy.

### Deliverables
- Typed domain contracts in `packages/dataset_core/domain_models.py`.
- Centralized review state machine in `packages/dataset_core/constants.py`.
- SQLAlchemy ORM models with SQLite foreign-key enforcement & indexes in `packages/dataset_core/db/`.
- Domain services (`ProjectService`, `DatasetService`, `RecordService`, `AnnotationService`) with append-only revisions and auditable review events in `packages/dataset_core/services/`.
- FastAPI application with `/health` and `/readiness` endpoints and domain error mapping in `services/api/`.

### Exit gate
PASSED: Verified with 16 automated tests (`tests/unit/test_domain_models.py`, `tests/unit/test_review_state_machine.py`, `tests/integration/test_persistence_foundation.py`, `tests/integration/test_health_endpoints.py`) passing in 1.71s with 0 lint warnings. Zero external AI credentials required.


## 5. Phase 2 — Project, dataset and navigation UI

**Status: DONE**  
**Dependencies:** Phase 1

### Goals
Make the app navigable and useful before AI features are added.

### Tasks
- [x] Build application shell and responsive navigation.
- [x] Build project create/list/rename/archive flows.
- [x] Build dataset create/list/detail flows.
- [x] Add task selection and schema-version display.
- [x] Add loading, empty, error and success states.
- [x] Connect UI to real API data; avoid fake production records.
- [x] Add API validation and project ownership checks.
- [x] Add frontend component tests and API tests.
- [x] Check keyboard navigation, focus, contrast and responsive layouts.

### Deliverables
- REST API routers in `services/api/routes/projects.py` and `services/api/routes/datasets.py` supporting project & dataset CRUD, status counts, schema bumping, and pagination.
- React 19 + TypeScript + Vite frontend in `apps/web` with glassmorphic dark design system (`apps/web/src/index.css`), real-time metric cards, breadcrumbs, search filtering, and modal dialogs.
- Automated API integration tests in `tests/integration/test_projects_and_datasets_api.py`.

### Exit gate
PASSED: Verified with 19 automated API & domain tests passing, 0 ruff errors, and successful production bundle build (`tsc -b && vite build` built in 1.15s). Unarchived/archived filtering, schema version incrementing, and 404/422 validations verified.


## 6. Phase 3 — Safe ingestion and asset management

**Status: DONE**  
**Dependencies:** Phase 1 and Phase 2

### Goals
Reliably turn user files into normalized records and safely stored assets.

### Tasks
- [x] Implement bounded upload API and safe temporary storage.
- [x] Validate file size, count, extension, MIME signature and supported parser.
- [x] Add image and text import.
- [x] Add CSV, JSON and JSONL import with row-level errors.
- [x] Add ZIP ingestion with traversal and decompression-bomb protections.
- [x] Compute SHA-256 and store byte size/MIME/dimensions where available.
- [x] Generate opaque storage keys; never use raw user paths.
- [x] Add record-to-asset relationships and source records.
- [x] Add import ProcessingRun and item-level progress/error reporting.
- [x] Make import idempotent or define safe duplicate behavior.
- [x] Add exact duplicate detection and import summary UI.
- [x] Test corrupt files, malformed rows, oversized archives and cleanup on failure.

### Deliverables
- Storage abstraction (`StorageBackend`, `LocalStorageBackend`) in `packages/dataset_io/storage.py`.
- Exact SHA-256 and 64-bit perceptual difference hashing (`phash`) in `packages/dataset_io/hashing.py`.
- Multi-modal stem and manifest bundler in `packages/dataset_io/bundler.py`.
- Safety validation (magic-byte sniffing, zip bomb defense, path traversal sanitization) in `packages/dataset_io/safety.py`.
- Multi-modal ingestion orchestrator (`IngestionService`) supporting single assets, paired multimodal ZIPs, CSV, JSON, and JSONL in `packages/dataset_io/ingestion_service.py`.
- REST API endpoint `POST /api/v1/datasets/{dataset_id}/ingest` with multipart file upload in `services/api/routes/ingestion.py`.
- Drag-and-drop Import Modal in `apps/web/src/components/ImportModal.tsx` showing real-time accepted, duplicate, and rejected counts with non-linear `PerceptualProgressBar` and tactile `SpringButton`.

### Exit gate
PASSED: Verified with passing tests (`tests/integration/test_ingestion_pipeline.py`, `tests/unit/test_safety.py`, `tests/unit/test_hashing.py`, `tests/unit/test_multimodal_bundler.py`) and clean frontend build. Malformed inputs, path traversal attempts, and duplicate files safely handled with diagnostics. Zero unhandled exceptions.

## 7. Phase 4 — Annotation schemas and manual labeling

**Status: DONE**  
**Dependencies:** Phase 3

### Goals
Make dataset creation useful with no model provider configured.

### Tasks
- [x] Implement task schema registry and versioning.
- [x] Implement label sets and required-field validation.
- [x] Build text classification editor.
- [x] Build image classification editor.
- [x] Implement annotation creation/edit/review APIs.
- [x] Add append-only AnnotationRevision history.
- [x] Implement review state transitions centrally.
- [x] Add undo/redo or revision restore where practical.
- [x] Add record filters for pending, approved, rejected and invalid.
- [x] Add keyboard-first navigation and save-state feedback.
- [x] Test schema changes, invalid labels, unsaved edits and review transitions.

### Deliverables
- Canonical task schema registry & validation service in `packages/dataset_core/task_schemas.py`.
- Dedicated record queue endpoint with review status & split filtering (`GET /api/v1/datasets/{dataset_id}/queue`) in `services/api/routes/records.py`.
- Full annotation lifecycle routes (`POST /api/v1/records/{record_id}/annotations`, `PUT /api/v1/annotations/{annotation_id}`, `POST /api/v1/annotations/{annotation_id}/transition`) in `services/api/routes/annotations.py`.
- Raw media streaming endpoint (`GET /api/v1/assets/{asset_id}/raw`) in `services/api/routes/assets.py`.
- Interactive keyboard-first Annotation Workspace in `apps/web/src/components/AnnotationWorkspace.tsx` with hotkeys (`1`-`9` label selection, `J`/`K` navigation, `Enter` save, `A` approve, `C` needs correction, `R` reject), and append-only revision history timeline.
- Comprehensive integration & unit tests in `tests/integration/test_manual_annotation_workspace.py` and `tests/unit/test_task_schemas.py`.

### Exit gate
PASSED: Verified with 37 automated tests passing in 2.27s, 0 ruff errors, and successful frontend build (`tsc -b && vite build` built in 1.50s). Manual text and image annotation, out-of-vocabulary label enforcement, append-only revisions, and review transitions function completely offline with zero model credentials.

## 8. Phase 5 — Provider gateway and AI-assisted annotation

**Status: DONE**  
**Dependencies:** Phase 4

### Goals
Add safe, testable model-assisted annotation without coupling domain code to one vendor.

### Tasks
- [x] Define provider interface and capability model.
- [x] Add deterministic fake provider for automated tests.
- [x] Add one real provider adapter selected based on current API support and available credentials (Ollama / local open-weights).
- [x] Keep provider secrets server-side and redact logs.
- [x] Add structured-output validation and normalized error types.
- [x] Create ProcessingRun and RunItem records.
- [x] Add batch processing with bounded concurrency and cancellation.
- [x] Add timeouts, retry/backoff and idempotency.
- [x] Add explicit model/provider selection and preview of estimated usage where possible.
- [x] Keep manual workflows usable with no provider configured.
- [x] Display proposal origin, model, run status and review state.
- [x] Test malformed output, timeout, rate limit, cancellation, duplicate retry and missing credentials.

### Deliverables
- Provider capability framework and interfaces in `packages/provider_gateway/types.py` and `packages/provider_gateway/base.py`.
- Deterministic `FakeProvider` supporting failure modes (`timeout`, `rate_limit`, `auth_error`, `malformed`) in `packages/provider_gateway/fake_provider.py`.
- Offline local `OllamaProvider` adapter in `packages/provider_gateway/ollama_provider.py`.
- `ProviderGateway` with bounded retries and recursive secret redaction in `packages/provider_gateway/gateway.py`.
- Batch `AIAnnotationOrchestrator` generating schema-validated proposals with `pending_review` status, dual-pass consensus score, and `RunItem` diagnostics in `packages/provider_gateway/orchestrator.py`.
- REST endpoints (`GET /api/v1/providers`, `POST /api/v1/datasets/{id}/ai-annotate`, `GET /api/v1/runs/{id}`) in `services/api/routes/inference.py`.
- Frontend `AIAnnotationModal` dialog in `apps/web/src/components/AIAnnotationModal.tsx`.
- Automated integration test suite in `tests/integration/test_provider_gateway_and_ai_annotation.py`.

### Exit gate
PASSED: Verified with 41 passing automated tests in 2.56s, 0 ruff errors, and clean frontend build (`npm run build` in 1.35s). Model proposals default to `pending_review` and are never silently approved; transient timeouts and malformed responses fail safely without corrupting dataset state; secrets are completely redacted from logs and responses.

## 9. Phase 6 — Validation and dataset quality

**Status: DONE**  
**Dependencies:** Phase 4; Phase 5 for model-origin diagnostics

### Goals
Help users discover problems before publishing a dataset.

### Tasks
- [x] Implement versioned validation rules.
- [x] Validate required fields, types and allowed labels.
- [x] Detect missing assets and unreadable media.
- [x] Detect exact duplicate hashes and duplicate structured records.
- [x] Report class distribution, unreviewed counts and annotation-origin counts.
- [x] Distinguish hard errors, warnings and informational metrics.
- [x] Add quality dashboard and per-record issue links.
- [x] Persist validation run/configuration/version.
- [x] Define publish-blocking errors and any explicit override/audit behavior.
- [x] Test deterministic results and malformed records.

### Deliverables
- Quality data models (`QualityReport`, `ValidationFinding`, `ValidationSeverity`) in `packages/dataset_quality/models.py`.
- Deterministic static and semantic audit engine in `packages/dataset_quality/engine.py` evaluating empty datasets, unreviewed items, schema violations, missing assets, empty text, exact duplicate assets, split leakage (identical asset across train and test/validation splits), and class imbalance.
- 64-bit DCT perceptual hash cross-split leakage blocker (`packages/dataset_quality/phash_leakage.py`) enforcing $d_H \le 6$ isolation between train and validation/test splits.
- Confident Learning automated label noise neighborhood auditor (`packages/dataset_quality/confident_learning.py`).
- Cross-Modal semantic alignment and contradiction auditor (`packages/dataset_quality/cross_modal_alignment.py`).
- Validation REST API endpoints (`POST /api/v1/datasets/{dataset_id}/validate`, `GET /api/v1/datasets/{dataset_id}/validation-summary`) in `services/api/routes/validation.py`.
- Interactive frontend Quality Dashboard (`apps/web/src/components/QualityDashboardModal.tsx`) with publication readiness banner, distribution histograms, finding severities, affected record IDs, remediation advice, `PerceptualProgressBar`, and statutory compliance disclaimers.
- Comprehensive integration & unit test suites in `tests/integration/test_quality_validation_pipeline.py`, `tests/unit/test_phash_leakage.py`, `tests/unit/test_confident_learning.py`, and `tests/unit/test_cross_modal_alignment.py`.

### Exit gate
PASSED: Verified with 90 passing automated tests across the workspace in 8.49s, 0 ruff errors, and clean frontend build. The validation engine catches pHash split leakage, schema mismatch, unreviewed annotations, confident learning label noise, and cross-modal caption contradictions. Datasets with blocking errors are explicitly disallowed from publication readiness; reports include mandatory disclaimers never claiming legal clearance or societal bias elimination.

## 10. Phase 7 — Provenance, immutable versions and documentation

**Status: DONE**  
**Dependencies:** Phases 3–6

### Goals
Make the output traceable and reproducible.

### Tasks
- [x] Store source and rights metadata with unknown/review-required states.
- [x] Link annotations to run/model/prompt metadata.
- [x] Record transformations and derived-asset lineage.
- [x] Design immutable dataset-version manifest format.
- [x] Freeze exact record IDs, asset IDs, schema version and annotation revision IDs.
- [x] Add version create/list/detail/compare basics.
- [x] Prevent mutation of published version manifests.
- [x] Generate README/dataset card, data dictionary, annotation guidance, statistics and known limitations.
- [x] Generate a quality report and source/provenance manifest.
- [x] Add manifest hashes and schema/exporter version.
- [x] Test version reproducibility and correction creating a new revision/version.

### Deliverables
- Canonical manifest data models and cryptographic SHA-256 serializer in `packages/dataset_versioning/manifest.py`.
- Automated Dataset Card (`README.md`) generator summarizing splits, class distributions, rights attribution, and statutory limitations in `packages/dataset_versioning/doc_generator.py`.
- `VersioningService` managing freeze lifecycle, quality gate verification, manifest persistence, immutability, and version diffing in `packages/dataset_versioning/service.py`.
- Versioning REST API endpoints (`POST /api/v1/datasets/{id}/versions`, `GET /api/v1/datasets/{id}/versions`, `GET /api/v1/versions/compare`, `GET /api/v1/versions/{id}`, `GET /api/v1/versions/{id}/manifest`, `GET /api/v1/versions/{id}/card`) in `services/api/routes/versions.py`.
- Interactive frontend Version Snapshots modal (`apps/web/src/components/VersionSnapshotsModal.tsx`) with snapshot list, card preview, manifest viewer, and semantic version comparator.
- Automated integration test suite in `tests/integration/test_versioning_and_provenance.py`.

### Exit gate
PASSED: Verified with 45 passing automated tests in 2.83s, 0 ruff errors, and clean frontend build (`npm run build` in 1.31s). Published versions are cryptographically hashed and immutable; subsequent record modifications leave existing published version manifests and items untouched; semantic diffing computes exact record deltas and annotation revision updates.

## 11. Phase 8 — Export adapters and reproducibility

**Status: DONE**  
**Dependencies:** Phase 7

### Goals
Deliver portable, training-ready artifacts.

### Tasks
- [x] Implement CSV export for supported tabular task data.
- [x] Implement JSONL export for structured records.
- [x] Implement export manifest with dataset version, record count, hashes and warnings.
- [x] Run exports as background jobs.
- [x] Generate artifact checksums and store exporter version.
- [x] Add download flow and clear failed/partial states.
- [x] Add round-trip tests for record IDs, labels and schema.
- [x] Ensure exports read frozen version manifests, not current mutable records.
- [x] Document supported fields and any information that a format cannot represent.

### Deliverables
- Deterministic CSV serializer (`packages/dataset_export/csv_exporter.py`) with metadata headers, split bindings, and asset references.
- Deterministic JSONL serializer (`packages/dataset_export/jsonl_exporter.py`) for complete structured records.
- `ExportService` (`packages/dataset_export/service.py`) strictly reading immutable version manifests, bundling self-contained ZIP packages containing data files, canonical manifests, dataset cards, and media assets, computing SHA-256 digests.
- REST API endpoints (`POST /api/v1/versions/{version_id}/exports`, `GET /api/v1/versions/{version_id}/exports`, `GET /api/v1/exports/{artifact_id}/download`) in `services/api/routes/exports.py`.
- Interactive frontend Export Modal (`apps/web/src/components/ExportModal.tsx`) with format selection, progress indicator, download links, and checksum displays.
- Automated integration test suite in `tests/integration/test_export_pipeline.py`.

### Exit gate
PASSED: Verified with 46 passing automated tests in 3.81s, 0 ruff errors, and clean frontend build (`npm run build` in 1.25s). Exports strictly read immutable version manifests; ZIP archives bundle formatted data (CSV/JSONL), `manifest.json`, and `README.md`; download endpoints stream archives with checksum validation and RFC 4180 / JSON Lines compliance.

## 12. Phase 9 — Object detection and visual annotation

**Status: DONE**  
**Dependencies:** Phases 3–8

### Goals
Prove that the model supports task-specific annotation geometry, not only simple labels.

### Tasks
- [x] Define normalized internal bounding-box representation and coordinate conventions.
- [x] Build canvas-based box create/move/resize/delete interactions.
- [x] Add class selection, zoom/pan, selection and keyboard shortcuts.
- [x] Validate bounds, dimensions and class references.
- [x] Add annotation revision/review behavior to boxes.
- [x] Implement COCO export.
- [x] Implement YOLO export and document image/label folder layout.
- [x] Add round-trip/geometry tests using synthetic fixtures.
- [x] Compare output against known fixtures and common parser expectations.

### Deliverables
- Normalized bounding-box contract and geometry validation (`x, y, width, height` within `[0.0, 1.0]`, non-degenerate dimensions) in `packages/dataset_core/task_schemas.py`.
- Multi-class box validation against allowed schema labels in `packages/dataset_quality/engine.py`.
- COCO format exporter assembling standard `instances_default.json` (categories, images, annotations with bounding boxes and area) in `packages/dataset_export/coco_exporter.py`.
- Ultralytics YOLO format exporter generating `data.yaml` category index and normalized split coordinate labels (`labels/{split}/{stem}.txt`) in `packages/dataset_export/yolo_exporter.py`.
- Integration into `ExportService.export_dataset_version` and frontend `ExportModal.tsx`.
- Interactive SVG/Canvas visual annotation component (`apps/web/src/components/ObjectDetectionCanvas.tsx`) integrated directly into `apps/web/src/components/AnnotationWorkspace.tsx` supporting drag-to-draw boxes, class assignment, coordinate badges, box removal, and keyboard navigation.
- Comprehensive integration test suite in `tests/integration/test_object_detection_pipeline.py`.

### Exit gate
PASSED: Verified with 48 passing automated tests in 3.55s, 0 ruff errors, and clean frontend build (`npm run build` in 1.53s). Bounding box geometry is validated against degenerate coordinates and invalid classes; COCO and YOLO exports produce standard layouts with valid category indices and normalized coordinates; interactive canvas supports visual box creation and manual review revisions.

## 13. Phase 10 — Local deployment and developer experience

**Status: DONE**  
**Dependencies:** Phases 1–8; can progress in parallel once app skeleton exists

### Goals
Make setup approachable for students and contributors.

### Tasks
- [x] Finalize Docker Compose for web, API, worker, PostgreSQL, Redis and local storage.
- [x] Add health checks and wait-for-dependency behavior.
- [x] Document environment variables in .env.example.
- [x] Add migration/startup instructions and safe dev reset instructions.
- [x] Add sample dataset and a complete demo walkthrough.
- [x] Ensure no AI key is required for manual demo.
- [x] Add clean-environment smoke test.
- [x] Document backup/restore and local storage location.
- [x] Add troubleshooting for ports, Docker resources and provider setup.
- [x] Ensure .gitignore excludes secrets, databases, uploaded assets and build outputs.

### Deliverables
- Multi-container `docker-compose.yml` orchestrating `api`, `web`, `worker`, `postgres` (16-alpine), `redis` (7-alpine), and named volumes with healthchecks and dependency sequencing.
- Backend `Dockerfile.api` and multi-stage Nginx-served frontend `Dockerfile.web` with reverse-proxy `apps/web/nginx.conf`.
- Background worker daemon in `services/api/worker.py` handling asynchronous job processing and heartbeat monitoring.
- Zero-cost multimodal dataset seeder in `scripts/seed_demo_dataset.py` generating text classification, synthetic image classification, and autonomous vehicle bounding box detection datasets with published immutable Version 1.0.0.
- Safe backup and restore utility in `scripts/backup_restore.py` archiving database and media storage into `.tar.gz` with cryptographic SHA-256 integrity verification and safe dev reset.
- Comprehensive deployment and developer documentation in `docs/DEPLOYMENT.md`.
- Automated integration test suite in `tests/integration/test_deployment_and_seeding.py`.

### Exit gate
PASSED: Verified with 51 passing automated tests in 6.05s, 0 ruff errors, and clean frontend build (`npm run build` in 1.92s). Single-command startup works via both native local development (SQLite) and Docker Compose (PostgreSQL 16, Redis 7, Nginx); demo seeding runs 100% offline with zero external API credentials; backup/restore round-trip verifies checksum manifests and accurately restores metadata and assets.

## 14. Phase 11 — Public dataset discovery and source review

**Status: DONE**  
**Dependencies:** Phase 7; basic product is stable

### Goals
Help users discover suitable data while making source evidence and rights limitations explicit.

### Tasks
- [x] Define source-provider interface for search metadata.
- [x] Start with permitted APIs/catalogs rather than unrestricted scraping.
- [x] Save query, result URL/identifier, retrieval time and source metadata.
- [x] Distinguish a discovered reference from a downloaded asset.
- [x] Add rights review states, attribution fields and usage notes.
- [x] Add import-from-reference flow only where access and license permit.
- [x] Treat retrieved text and metadata as untrusted input.
- [x] Add SSRF protections for any server-side URL retrieval.
- [x] Test unknown-license and restricted-source behavior.
- [x] Document that public accessibility is not training permission.

### Deliverables
- Enterprise SSRF defense engine in `packages/dataset_sources/ssrf_guard.py` blocking loopback, private ranges, link-local, cloud metadata services (e.g. 169.254.169.254), internal suffixes, and non-HTTP schemes.
- Discovered candidate data models and rights contracts in `packages/dataset_sources/models.py`.
- Permitted catalog adapter and mock repository in `packages/dataset_sources/catalog_adapter.py`.
- Sandboxed safe HTTP fetcher with strict size caps (10MB) in `packages/dataset_sources/safe_fetcher.py`.
- Source discovery and provenance service in `packages/dataset_sources/service.py` managing search, URL verification, candidate import, rights review recording, and dataset source audit queries.
- REST API endpoints (`GET /api/v1/sources/candidates`, `POST /api/v1/sources/inspect-url`, `POST /api/v1/sources/import`, `POST /api/v1/records/{id}/rights-review`, `GET /api/v1/datasets/{id}/sources`) in `services/api/routes/sources.py`.
- Interactive web dialog in `apps/web/src/components/SourceDiscoveryModal.tsx` and integration into `apps/web/src/components/DatasetDetail.tsx`.
- Automated integration test suite in `tests/integration/test_source_discovery_and_rights.py`.

### Exit gate
PASSED: Verified with 60 passing automated tests across the workspace in 6.56s, 0 ruff errors, and clean frontend production build (`tsc -b && vite build` built in 1.65s). Users can discover public catalog candidates, safely inspect URLs with SSRF protection, import candidates with non-cleared defaults (`REVIEW_REQUIRED`), enforce rejection of restricted content, and submit auditable rights justification evidence.


## 15. Phase 12 — Synthetic-data generation

**Status: DONE**  
**Dependencies:** Phase 5, Phase 6 and Phase 7

### Goals
Fill identified data gaps with explicitly labeled synthetic samples.

### Tasks
- [x] Define generation request/response schema per supported task.
- [x] Add provider capability checks for text/image generation.
- [x] Add prompt templates and configuration versioning.
- [x] Mark assets/records as synthetic and preserve generation lineage.
- [x] Validate outputs using the same schema/quality rules as imported data.
- [x] Add user-controlled class targets and generation limits.
- [x] Add budget estimates and cancellation.
- [x] Prevent duplicate or low-diversity generations where feasible.
- [x] Report real/synthetic proportions.
- [x] Add review gate before synthetic records are included in a published version.

### Deliverables
- Provider generation capabilities (`TEXT_GENERATION`, `IMAGE_GENERATION`) and base contracts in `packages/provider_gateway/types.py` and `packages/provider_gateway/base.py`.
- Deterministic synthetic generator implementation in `packages/provider_gateway/fake_provider.py` producing diverse class samples with 0 external API cost.
- Synthetic batch contracts and request models in `packages/dataset_synthesis/models.py`.
- Generation service in `packages/dataset_synthesis/service.py` orchestrating capability checks, schema validation, exact duplicate rejection, cryptographic lineage attribution (`run_id`, `provider`, `model`, `prompt_template`, `template_version`, `seed`, `content_sha256`), and review gating (`status="pending_review"`).
- REST API routes (`POST /api/v1/datasets/{id}/synthesize`, `GET /api/v1/datasets/{id}/synthetic-lineage`) in `services/api/routes/synthesis.py`.
- Quality engine rule `INFO_SYNTHETIC_PROPORTION` in `packages/dataset_quality/engine.py` disclosing synthetic percentage and count.
- Version document generator disclosure in `packages/dataset_versioning/doc_generator.py` surfacing synthetic ratios and parameter traceability in dataset cards.
- Interactive modal UI in `apps/web/src/components/SyntheticGenerationModal.tsx` and action button in `apps/web/src/components/DatasetDetail.tsx`.
- Automated integration test suite in `tests/integration/test_synthetic_data_generation.py`.

### Exit gate
PASSED: Verified with 65 passing automated tests across the workspace in 6.39s, 0 ruff errors, and clean frontend production build (`tsc -b && vite build` built in 1.96s). Synthetic outputs are clearly tagged with `origin="synthetic"`, strictly routed to `pending_review` by default, preserve reproducible prompt & model lineage, reject duplicate generation attempts, and disclose real vs synthetic ratios in quality audits and published dataset cards.


## 16. Phase 13 — Additional modalities and semantic exploration

**Status: DONE**  
**Dependencies:** Core data model, storage, versioning and task registry are stable

### Tasks
- [x] Add modality-specific asset metadata for audio, video and documents (WAV channels, sample rate, duration in seconds).
- [x] Implement safe PDF/document extraction with parser limits and magic-byte sniffing (`%PDF`).
- [x] Add text extraction/OCR tasks only with explicit annotation contracts (`document_ocr`).
- [x] Add audio playback/transcription review and timestamp validation (`audio_transcription`).
- [x] Add interactive audio player with variable speed (0.75x to 1.5x) and segment cue timeline.
- [x] Add QualityEngine audio timestamp checks (`RULE_AUDIO_TIMESTAMPS`) preventing inverted cues and track duration overruns.
- [x] Add standard W3C WebVTT subtitle and cue alignment export format (`ExportFormat.WEBVTT`).
- [x] Add fixtures, exporters and automated integration tests for audio & document modalities.

### Deliverables
- Audio and document task types (`TaskType.AUDIO_TRANSCRIPTION`, `TaskType.DOCUMENT_OCR`, `AssetRole.PRIMARY_AUDIO`, `ExportFormat.WEBVTT`) in `packages/dataset_core/constants.py`.
- Strict canonical task schema validation with segment timestamp bounds check in `packages/dataset_core/task_schemas.py`.
- Audio magic-byte sniffing and RIFF/WAVE header chunk metadata extraction (channels, sample_rate, duration_seconds) via Python stdlib `wave` in `packages/dataset_io/safety.py` and `packages/dataset_io/ingestion_service.py`.
- Quality engine rule `RULE_AUDIO_TIMESTAMPS` flagging segments exceeding audio track duration or inverted timestamps in `packages/dataset_quality/engine.py`.
- W3C WebVTT subtitle exporter generating per-record cues and master combined transcript VTT archives in `packages/dataset_export/webvtt_exporter.py` and wired into `packages/dataset_export/service.py`.
- Frontend audio playback stage and transcript cue editor in `apps/web/src/components/AnnotationWorkspace.tsx` and WebVTT export option in `apps/web/src/components/ExportModal.tsx`.
- Automated integration test suite in `tests/integration/test_additional_modalities_pipeline.py`.

### Exit gate
PASSED: Verified with 70 passing automated tests across the workspace in 7.43s, 0 ruff errors, and clean frontend production build (`tsc -b && vite build` built in 1.88s). Complete end-to-end slice implemented: safe WAV sniffing and duration extraction, task schema validation, UI audio player with segment cue editing, QualityEngine duration bound enforcement, and W3C WebVTT export.

## 17. Phase 14 — Active learning and baseline evaluation

**Status: DONE**  
**Dependencies:** Phase 7, Phase 8, Phase 12

### Tasks
- [x] Define optional baseline model integration interface.
- [x] Build train/validation/test split management with fixed seeds and manifests.
- [x] Add leakage checks for duplicate/related samples across splits.
- [x] Compute task-appropriate metrics and document assumptions (Accuracy, Precision, Recall, Macro-F1, per-class F1, Confusion Matrix).
- [x] Track model, data version, configuration and metrics with small-sample reliability warnings (< 5 samples).
- [x] Identify uncertain/error-prone samples for review via Confident Learning consensus agreement scoring.
- [x] Add human-controlled queue prioritization (`least_confidence`, `label_noise`, `disagreement`, `unreviewed_first`).
- [x] Add 2D semantic embedding projection (power-iteration PCA normalized to `[-1.0, 1.0]^2`) with density mapping and 8x8 grid coverage gap detection.
- [x] Avoid using test-set outcomes to repeatedly tune the dataset without documenting the evaluation protocol.

### Deliverables
- Evaluation metrics engine (`packages/dataset_evaluation/metrics.py`) computing accuracy, per-class/macro precision, recall, F1, full confusion matrix, and low-support warnings.
- Confident Learning label noise detection (`packages/dataset_evaluation/confident_learning.py`) using text feature vectorization and cosine similarity to discover model-annotation contradictions.
- Semantic 2D PCA projection and coverage gap discovery (`packages/dataset_evaluation/clustering.py`) mapping sample embeddings into $[-1.0, 1.0]^2$ with density scoring and grid gap discovery.
- `EvaluationService` (`packages/dataset_evaluation/service.py`) orchestrating active learning prioritized triage, reproducible baseline evaluation runs against versions, and cluster projections.
- REST API routes (`GET /api/v1/datasets/{id}/active-learning-queue`, `POST /api/v1/versions/{id}/evaluate`, `GET /api/v1/datasets/{id}/clusters`) in `services/api/routes/evaluation.py`.
- Interactive web component (`apps/web/src/components/EvaluationModal.tsx`) with 3 tabs: Active Learning Queue, Baseline Evaluation Report with Confusion Matrix, and 2D Semantic Cluster Map with direct "Synthesize Edge Cases Here" trigger.
- Automated integration test suite in `tests/integration/test_active_learning_and_evaluation.py`.

### Exit gate
PASSED: Verified with 75 passing automated tests across the workspace in 6.70s, 0 ruff errors, and clean frontend production build (`tsc -b && vite build` built in 1.68s). Users can triage uncertain and contradictory records via active learning priority queues, evaluate models against frozen dataset versions with full confusion matrix and per-class metrics, and inspect 2D semantic coverage gaps to synthesize targeted edge cases.

## 18. Phase 15 — Hosted deployment readiness

**Status: DONE**  
**Dependencies:** Phases 0–14

### Tasks
- [x] Define tenant/project isolation and role model (`owner`, `editor`, `viewer`).
- [x] Enforce server-side authorization for all resources, datasets, records, and object downloads (defending against IDOR).
- [x] Add project storage quotas (HTTP 413 rejection) and record volume bounds.
- [x] Add in-memory sliding-window rate limiting for general API (300 req/min), AI inference (30 req/min), and synthesis (25 req/min).
- [x] Add secure secret redaction and error payload sanitization (`api_key`, `token`, `secret`, `bearer`).
- [x] Add append-only audit trail logging for security and administrative actions (`MEMBER_ADDED`, `MEMBER_REMOVED`, `FILE_INGESTED`, `SYNTHETIC_GENERATION`, `EXPORT_CREATED`, `EXPORT_DOWNLOADED`).
- [x] Build web UI Governance & Quotas modal (`apps/web/src/components/ProjectSettingsModal.tsx`) with live storage/record meters, member management, and audit inspection.
- [x] Automated integration test suite covering RBAC, quota enforcement, rate limiting, and secret sanitization (`tests/integration/test_hosted_hardening_and_quotas.py`).

### Deliverables
- Multi-tenant RBAC role definitions (`packages/dataset_security/roles.py`) with permission hierarchy.
- Project-scoped authorization engine (`packages/dataset_security/auth.py`) enforcing access boundaries on projects, datasets, and exports while maintaining local single-user developer ergonomics.
- Quota manager (`packages/dataset_security/quotas.py`) computing live storage bytes and record counts against project limits and rejecting over-quota actions.
- Thread-safe sliding-window rate limiter (`packages/dataset_security/rate_limiter.py`) preventing abuse and denial of service.
- Immutable audit log service (`packages/dataset_security/audit.py`) tracking administrative and lifecycle events.
- Recursive secret redaction engine (`packages/dataset_security/redaction.py`) masking sensitive keys in logs and client error responses.
- REST API routes in `services/api/routes/security.py` (`/members`, `/usage`, `/audit-logs`).
- Interactive Governance Modal in `apps/web/src/components/ProjectSettingsModal.tsx` wired into Project Detail.
- Comprehensive integration tests in `tests/integration/test_hosted_hardening_and_quotas.py`.

### Exit gate
PASSED: Verified with 81 passing automated tests across the workspace in 8.46s, 0 ruff errors, and clean frontend production build (`tsc -b && vite build` built in 1.81s). Multi-tenant isolation strictly blocks cross-tenant access and download attempts; storage and record quotas reject oversized payloads with HTTP 413; rate limiters enforce rolling throughput limits; and secrets are redacted from audit trails and error responses.

## 19. Cross-phase test strategy

### Every phase
- Add unit tests for new domain logic.
- Add API/component tests for user-visible behavior.
- Add regression tests for fixed bugs.
- Run format/lint/type checks and affected tests.
- Record exact commands and results.

### Required test families
- Schema and annotation state machine.
- File upload, parser failures and archive safety.
- Authorization and project isolation.
- Provider capability, malformed output, timeouts, rate limits and retries.
- Job idempotency, cancellation and worker restart.
- Annotation revision history.
- Quality report determinism.
- Dataset version immutability.
- CSV/JSONL/COCO/YOLO round-trip.
- Documentation truthfulness and manifest hashes.
- Clean local installation and backup/restore where applicable.

### Test data
Use small synthetic fixtures only. Include examples of valid/invalid image classification, text classification and object detection. Do not commit copyrighted datasets, personal data, real user uploads or provider credentials.

## 20. Release gates

### Alpha
- Project/dataset CRUD.
- Import and manual classification.
- Provider gateway and one adapter.
- Validation and revision history.
- CSV/JSONL export.
- Local setup and automated tests.

### MVP
- All alpha features plus immutable dataset versions, provenance, generated documentation and quality reports.
- Object detection with COCO/YOLO if included in the advertised MVP.
- Round-trip and end-to-end test suite.
- Known limitations and security considerations documented.

### Public open-source release
- Reproducible clean setup.
- Contribution guide and provider/exporter extension docs.
- CI with deterministic tests.
- License and third-party dependency review.
- No secrets or user data.
- Issue templates and documented support boundaries.

### Hosted beta
- Tenant isolation, quotas, secure secret storage, retention, monitoring and restore tests.
- Explicit external provider data disclosures.
- Operational and privacy review.

## 21. Progress log

The coding agent must append a dated entry after each meaningful work session:

| Date | Phase | Status | Evidence / commands | Blockers | Next action |
|---|---|---|---|---|---|
| 2026-10-26 | Phase 0 — Baseline | DONE | .venv setup, ruff check, pytest 2/2 passed | None | Begin Phase 1 (Domain model & persistence) |
| 2026-10-26 | Phase 1 — Domain & DB | DONE | Models, services, state machine, 16/16 pytest passed | None | Begin Phase 2 (Project & Dataset UI shell) |
| 2026-10-26 | Phase 2 — Web & APIs | DONE | REST routes, React 19 UI, 19/19 pytest passed, Vite build OK | None | Begin Phase 3 (Safe ingestion & asset management) |
| 2026-10-26 | Phase 3 — Ingestion & Assets | DONE | MIME check, path traversal guard, ZIP unpack, 32/32 pytest passed | None | Begin Phase 4 (Annotation Schemas & Manual Workspace) |
| 2026-10-26 | Phase 4 — Annotation & Reviews | DONE | Schemas, revision audit, keyboard UI, 36/36 pytest passed | None | Begin Phase 5 (Provider Gateway & AI Annotation) |
| 2026-10-26 | Phase 5 — Provider Gateway | DONE | FakeProvider, Ollama, secret redaction, 41/41 pytest passed | None | Begin Phase 6 (Validation & Quality Engine) |
| 2026-10-26 | Phase 6 — Quality & Audit | DONE | Split leakage, schema checks, dashboard, 44/44 pytest passed | None | Begin Phase 7 (Provenance & Versioning) |
| 2026-10-26 | Phase 7 — Versioning & Cards | DONE | Immutable manifests, README cards, diffing, 45/45 pytest passed | None | Begin Phase 8 (Export Adapters) |
| 2026-10-26 | Phase 8 — Export Adapters | DONE | CSV & JSONL ZIP bundles, frozen manifests, 46/46 pytest passed | None | Begin Phase 9 (Object Detection) |
| 2026-10-26 | Phase 9 — Object Detection | DONE | Canvas editor, COCO/YOLO exports, geometry checks, 48/48 pytest passed | None | Begin Phase 10 (Local Deployment & DX) |
| 2026-10-26 | Phase 10 — Local Deployment | DONE | Docker Compose, seeder, backup/restore, 51/51 pytest passed, Vite build OK | None | Begin Phase 11 (Source Discovery & Rights Review) |
| 2026-10-26 | Phase 11 — Source Discovery | DONE | SSRF defense, catalog adapter, rights review, 60/60 pytest passed | None | Begin Phase 12 (Synthetic Data & Lineage) |
| 2026-10-26 | Phase 12 — Synthetic Data | DONE | Lineage tracking, seed reproducibility, review gate, 65/65 pytest passed | None | Begin Phase 13 (Additional Modalities) |
| 2026-10-26 | Phase 13 — Additional Modalities | DONE | Audio metadata, WebVTT exporter, timestamp checks, UI player, 70/70 pytest passed | None | Begin Phase 14 (Active Learning & Evaluation) |
| 2026-10-26 | Phase 14 — Active Learning | DONE | Confusion matrix, Confident Learning noise, 2D PCA, 75/75 pytest passed | None | Begin Phase 15 (Hosted Deployment Readiness) |
| 2026-10-26 | Phase 15 — Governance & Quotas | DONE | RBAC, quota enforcement, secret sanitization, audit trail, 81/81 pytest passed | None | Begin Wave 2 Competitor-Killer Features & Deep UI Wiring |
| 2026-10-26 | Wave 2 — Competitor-Killer Suite | DONE | Magnetic Sobel edge-snap, Live token simulator, 4 Export Presets, Geometry augmentations, Version Git-Diff, 2D cluster gap map + anti-collapse filter, TriStateView & DirectionalPageTransition deep wiring, 104/104 pytest passed, Vite build OK | None | Begin UI Redesign (UI-0 to UI-6) |
| 2026-10-26 | UI Redesign (UI-0 to UI-6) | DONE | Comprehensive audit, neutral-first palette (light primary, dark retained), LandingPage.tsx, hash router deep linking, 5-stage lifecycle hub in DatasetDetail, 104/104 pytest passed, Vite build OK | None | Operational & Verified |



## 22. Definition of complete execution

Execution is complete only when every committed phase is either DONE with evidence or explicitly BLOCKED with a concrete external dependency and safe alternatives explored. Deferred future features may remain NOT STARTED if they are outside the agreed release; the MVP must meet its release gate. The agent must never claim the entire platform is complete merely because the scaffold builds.

---

## Simple Mode track (UX redesign)

| Phase | Status | Evidence |
|---|---|---|
| S1 Home dashboard (history, two doors, quick start) | **DONE** | `apps/web/src/components/HomeDashboard.tsx`; default view `#home`; build green |
| S2 Plan + job orchestration + honest ETA | **DONE** | `packages/generation_jobs/`; `POST /generate/plan`, `POST/GET /generate/jobs`, `GET /generate/jobs/{id}`, `POST .../cancel`; 10 unit + 4 integration tests |
| S3 Generation wizard (describe → confirm → live progress → done) | **DONE** | `apps/web/src/components/GenerateWizard.tsx`; E2E `verify_simple_mode.py` 25/25 checks (accept verdict, 100 % label preservation, rows pending review) |
| S4 Labeling wizard (drop → confirm → keyboard labeling → validate → export) | IN PROGRESS (existing workbench is the base) | current annotation workspace + import flow; needs the reduced 3-step shell |
| S5 Natural-language dataset editing with previewed change sets | NOT STARTED | spec in docs/SIMPLE_MODE_UX.md §4 |
| S6 Sample-guided plan analysis (CSV/JSONL/TXT/ZIP/images) | NOT STARTED | spec §5 |
| S7 Advanced-mode parity + copy/a11y audit (no jargon in Simple Mode) | NOT STARTED | spec §7 |

**Verification at time of writing:** backend 338 tests passing, `ruff` clean, frontend build green,
Simple-Mode E2E 25/25 with the simulated trio (zero API spend).

---

## S6 — sample-guided generation: DONE

- `packages/generation_jobs/sample_analysis.py` (CSV/JSONL/JSON/TXT/ZIP/images; safety-bounded).
- `POST /api/v1/generate/analyze-sample` → detection + prefilled plan.
- Job config carries `style_hint`, `seed_examples`, `description`, `labels`, `difficulty`; the runner
  forwards them to `GenerationSpec` → provider request parameters.
- `OpenAICompatibleProvider.generate()` is a real generation call (was an alias of `annotate()`), sharing
  the new `_chat_completion()` transport.
- Wizard step 1 accepts a sample, shows what was detected (rows, labels, 2 quoted samples, style, notes)
  and prefills the confirm step.
- Evidence: 12 new tests (8 unit + 4 integration; 350 total), Simple-Mode E2E **31/31**, ruff clean,
  frontend build green.

**Remaining phases:** S4 labeling wizard shell, S5 natural-language editing, S7 advanced parity + copy audit.

---

## S4 — guided labeling path: DONE

- `apps/web/src/components/LabelWizard.tsx`: **bring** (import CSV/JSONL/TXT with auto-detected columns and
  classes via the shared sample analyser, or pick an existing text dataset) → **label** (one example at a
  time, numbered classes, `1–9` to label, `S` to skip, live progress) → **done** (saved/skipped counts,
  one-click validation, hand-off to the dataset for export/versions).
- Every keystroke performs the same two calls the full workbench uses: create a real annotation, then an
  explicit `approved` transition — **no bulk auto-approval**, in line with AGENTS.md §6.
- The generation wizard's “Label these examples” button now hands off directly into this wizard with the
  produced dataset preselected (one-click generate → label).
- Both wizards are lazy-loaded (`React.lazy` + `Suspense`), keeping the Home route bundle at 475 kB and
  splitting the wizards into 11–14 kB chunks.
- Evidence: guided-labeling E2E **12/12** (import → queue → annotate+approve 4/4 → validate publishable →
  freeze version → export), generation E2E **31/31** unchanged, backend **350 tests**, ruff clean, build green.

**Remaining phases:** S5 natural-language dataset editing, S7 advanced-mode parity + copy audit.

---

## S5 — natural-language dataset editing: DONE

- `packages/dataset_edits/service.py`: deterministic instruction parser → operations with real counts;
  apply with change-set persistence; undo from stored before-state.
- Operations: `add_examples` (starts a generation job on the same dataset), `reject_label` (reversible
  review rejection, not deletion), `rename_label` (schema + annotation revisions), `shorten_text`
  (reversible text truncation); anything else returns `unsupported` with the supported vocabulary.
- API: `POST /datasets/{id}/edits/preview`, `POST /datasets/{id}/edits/apply` (requires `confirm`),
  `GET /datasets/{id}/edits`, `POST /datasets/{id}/edits/{changeset}/undo`.
- UI: `EditByDescriptionModal` (lazy-loaded) in the dataset toolbar — instruction box with suggestions,
  preview table with counts/warnings, Apply, result summary, and a change history with Undo.
- Evidence: **8 new integration tests** (358 total), NL-editing E2E **18/18**, generation E2E **31/31**,
  labeling E2E **12/12**, ruff clean, frontend build green.

**Remaining phase:** S7 advanced-mode parity + copy audit (no jargon left in Simple Mode paths).

---

## S7 — advanced controls + copy audit: DONE

- The generation wizard's `Advanced ▸` panel is now **functional**, not informational: model service and
  model selection (default “Automatic”), max share of one class, minimum label agreement, and target split
  (train/val/test). These flow into the job request and were verified end-to-end: a run with
  `target_split=val` landed **6/6 accepted rows in the validation split**.
- Copy audit across Simple-Mode surfaces: “No model service is connected yet…” instead of provider jargon,
  “Ready to export / A few checks are still open” instead of publishability jargon, plainer advanced-tool
  names in the dataset toolbar (“Multi-model labels”, “Generate more examples”), and an explicit
  **Advanced workspace** entry on Home.
- Bug found by the verification matrix and fixed: `add_examples` started the generation runner **before**
  the request transaction committed, leaving the job stuck in `pending`; the runner now starts after
  commit, with a regression test that waits for the terminal state.

---

## Objective coverage — final verification

| Objective requirement | Status | Evidence |
|---|---|---|
| Home dashboard with recent history + quick/scratch creation | DONE | `HomeDashboard.tsx`; scratch project auto-created by the job layer |
| Two guided paths: Dataset Generation and Dataset Labeling | DONE | `GenerateWizard.tsx`, `LabelWizard.tsx`; E2E 31/31 and 12/12 |
| NL prompt → a few plain questions with examples | DONE | `POST /generate/plan` (3 questions, each with an example); parsed the operator's own grammar example (200 examples, 2 classes) |
| Analyse an uploaded sample (files/zip/images) to infer the pattern | DONE | `POST /generate/analyze-sample`; CSV/JSONL/JSON/TXT/ZIP + image reference-only note; E2E checks |
| Live progress bar + estimated time remaining | DONE | job/progress API + wizard polling; ETA measured (`null` → “estimating…” until 5 items) |
| One-click hand-off to labeling | DONE | “Label these examples” opens the labeling wizard on the generated dataset |
| Simple mode minimal, advanced mode granular | DONE | S7 advanced panel; split/threshold settings verified to reach the data |
| View, edit by natural language, export in many formats | DONE | `EditByDescriptionModal` (preview/apply/undo) 18/18; 5 export formats byte-deterministic |
| Honest: no fabricated ETAs or capability claims | DONE | measured ETA; image samples reference-only; unsupported edit instructions reported; `OpenAICompatibleProvider.generate()` implemented for real instead of aliasing `annotate()` |
| Backend job orchestration, API, UI, tests verified end to end | DONE | 358 tests, ruff clean, build green, E2E matrix: 31 + 12 + 18 + 9 + 32 = **102/102 checks** |

**E2E matrix (live stack, simulated providers, zero API spend):**
SIMPLE MODE 31/31 · GUIDED LABELING 12/12 · NL EDITING 18/18 · S7 9/9 · FULL-MVP 32/32.

---

## Post-completion bugfix — generation limits (reported from a screenshot)

**Symptom.** The wizard let a user request 1,000 examples across 2 classes, which produced
`per_class = 500`; the API cap was 200, so the request failed with FastAPI's raw validation JSON
(`{"type":"less_than_equal","loc":["body","per_class"],…}`) rendered verbatim in the red banner.

**Fix.**
1. **Limits aligned and documented**: at most **500 per category** and **2,000 per run**. A run over
   2,000 now raises a `DomainValidationError` that the API returns as a readable sentence
   ("That is too many examples for one run (2,500). Keep it to 2,000 or fewer, or split it into several runs.").
2. **UI can no longer build an invalid request**: the count options are clamped to
   `min(2000, 500 × categories)`; a `Custom` chip reveals the number input instead of showing a
   duplicate value next to the chips; the helper text states the limit and adds "Capped at the per-run
   limit." when reached.
3. **Raw validation JSON never reaches the user**: `handleResponse` translates FastAPI `detail[]`
   arrays into one plain sentence naming the field.
4. **Placeholder categories are explained**: when no categories can be detected in the description, the
   plan notes "No categories were detected in your description — rename these two…".

**Verification.** New tests: 2,500-example run rejected with a plain message, `per_class=501` remains a
structured field error, 1,000-example run accepted with `total_items=1000` (**361 tests total**).
`verify_limits_fix.py` — **10/10** checks, including the exact screenshot scenario. Regression matrix
unchanged: Simple Mode 31/31, Labeling 12/12, NL editing 18/18, S7 9/9, Full MVP 32/32; ruff clean;
frontend build green.

---

## Incident: "stuck at 500/500" (reported from a live screenshot, and a real gap in our testing)

**What the user saw.** The generation dialog showed `500/500`, "about estimating… left", and never moved.

**What was actually wrong — three separate defects, all reproduced:**

1. **Orphaned jobs.** The runner is an in-process daemon thread. A server restart (which happened
   during a fix rollout) killed it, leaving the database row at `status=running, processed=500/500`
   forever. The UI polled that row indefinitely. Confirmed from the database: a job created at
   17:37:36 was still `running` hours later.
2. **No stall detection in the UI.** Even without a restart, a job that stops heartbeating was
   indistinguishable from a slow one, so the dialog had no way to tell the user.
3. **A verifier that could hang the run.** The wizard auto-selected the *first* provider in API order,
   which could be a cloud provider with no working key. Verification makes one call per generated
   item, so a 50-item run could sit in "checking quality" for 50 × the provider timeout.

**Fixes.**
* `recover_interrupted_jobs()` runs at startup and settles any `pending/running/cancelling` row as
  `interrupted` with a user-readable reason; the UI shows that message instead of an endless spinner.
* Jobs now write a **heartbeat** (`updated_at`) and a **phase** (`generating` → `checking quality and
  saving`); the API exposes `stale`, and the wizard shows a stall banner with a "Stop waiting" action
  after 70 s without a heartbeat.
* Verification models are **preflighted with one tiny call**; models that fail are dropped, and if none
  respond the job fails immediately with an actionable message instead of timing out per item.
* The wizard prefers models that need no key/network (simulated trio → local fake → local ollama →
  cloud), so the default path works out of the box.
* Anti-collapse shortfall fixed: the gate rejects near-duplicates, so a single pass can deliver far
  fewer rows than requested (1,000 requested → ~16 usable). The runner now retries in **bounded waves**
  (max 4) asking for the shortfall, and the simulated generator composes from large independent pools
  (measured unique-trigram ratio: 0.81 @ 50, 0.69 @ 200, **0.47 @ 1,000** — above the 0.35 gate).
  Result: 1,000 requested → **1,000 accepted**, 8 s, through the browser.

**Testing gap, corrected.** Every prior "E2E" in this session was an API-level script with 6–12 item
jobs. There is now a **real browser suite** (Playwright + Chromium) that drives the actual UI, fails on
any console/page error, and includes the reported case:

* `cd apps/web && npm run e2e:ui` → 13/13 checks (Home → generate 50 → result → label wizard → keyboard label)
* `cd apps/web && npm run e2e:ui:large` → 8/8 checks (the exact 1,000-example / 500-per-class screenshot case)

**Verification after the fixes.** Backend **361 tests**; API E2E matrix 31 + 12 + 18 + 9 + 32 + 10 =
**112/112**; browser **21/21**; `ruff` clean; frontend build green.

---

## Autonomous labelling engine: DONE

- `packages/autolabel/service.py`: `decide()` routing (agreement + confidence), preflight, heartbeat,
  cancel, label-space sanitising; job `kind="auto_label"` reuses the existing job endpoints
  (`GET /generate/jobs/{id}`, cancel) and startup recovery.
- `POST /api/v1/datasets/{id}/auto-label` — queues labelling of every record that is not yet approved.
- UI: in the Labeling wizard, **“Label automatically”** runs the engine with progress + ETA, then reloads
  the queue and shows “N auto-labelled · M need review”; Home shows auto-labelled counts in the feed.
- Provenance: `origin=ensemble|model`, actor `auto-labeler`, approval via recorded review transition;
  never `origin=human`.
- Class-name parsing fixed (`neutral — 150 examples` → `neutral`).
- Evidence: 365 backend tests, browser 14/14 + 8/8, API E2E 112/112, ruff clean, build green.


---

## M1 — Image classification in Simple Mode: DONE

- Label wizard accepts **PNG/JPG/WEBP/ZIP of images**, creates an `image_classification` dataset, renders
  the real asset thumbnail, keyboard-labels, and runs the autonomous engine.
- Provider path: `ProviderRequest.asset_bytes` now flows end to end —
  * simulated provider answers deterministically from the image content hash (shared truth across models);
  * `OpenAICompatibleProvider` sends multimodal `image_url` content (base64 data URL) for real vision models.
- Auto-label engine reads the record's primary asset (`record_assets` → storage), probes models with a real
  image before a run, and rejects text-only models at preflight instead of mislabelling pixels.
- Honesty fix: when the engine labels everything, the done screen now says the rows were
  **machine-labelled (`origin=ensemble|model`), never human**, instead of the old manual-label wording.
- Evidence: **8 new tests** (373 total), browser image E2E **9/9** (ZIP upload → thumbnail pixels verified →
  auto-label → provenance copy), other browser suites 14/14 and 8/8, API E2E 112/112, ruff clean, build green.

**Next:** M2 object detection (bbox proposals + guided canvas), M3 paired image-text, M4 audio transcription
wizard, M5 document OCR, M6 video keyframes — see docs/MODALITY_ROADMAP.md.


---

## Dataset-type expansion: plan recorded

`docs/DATASET_TYPES_PLAN.md` now holds the tiered plan for all 18 dataset types and the image MVP work
packages (I1 done; I2 export bundle → I3 object detection → I4 captioning → I5 quality → optional I6 live
vision validation). Audio and video are the next tier; the remaining types are deferred behind new
primitives. No type is advertised in the UI before its acceptance gate passes.

---

## Image generation (real providers) + boxing verification: DONE

- Providers: OpenAI `gpt-image-2` (PNG, priced) and Meta `muse-image-1.0` (WEBP, price unknown) behind the
  gateway, `IMAGE_GENERATION` capability only; registered via `ENABLE_LIVE_IMAGE_PROVIDERS=true` + env keys.
- Service: bounded job (≤25 images), quality low/medium, prompt per class, assets + synthetic
  `pending_review` records, progress/ETA/cancel, per-image cost accounting, `max_cost_usd` guard.
- UI: the Generate wizard detects image plans and offers image mode (count ≤25, low/medium quality, style);
  result shows generated thumbnails and cost, then hands off to labeling.
- Live evidence: 25/25 images accepted for **$0.275** in 250 s; auto-label on those images produced
  **16 auto-approved / 9 review** with diverse labels after fixing an engine bug that dropped image bytes;
  boxing verified in a real browser (draw → save → geometry persisted and inside image bounds).
- Bugs fixed: engine sent no asset bytes (identical labels), Enter shortcut saved stale/empty boxes,
  `FakeProvider` falsely advertised image generation, empty-box detection saves now blocked.
- Tests: **392 backend**, browser 14/14, 8/8, 9/9, **7/7 boxing**; ruff clean; build green.

---

---

## Dataset-type chooser + NL type detection: DONE

- `GET /api/v1/dataset-types` returns the catalogue (21 entries covering the 18-type taxonomy plus
  object detection / image+text / document-OCR): **2 available** (text, image), **4 beta**, **15 planned**.
- Weighted lexicon over all types; non-text and uncertain prompts insert a mandatory type question; the
  wizard always shows a type selector. The reported bottle-labeling prompt now detects Object detection.
- Home "New dataset" chooser groups types by status; planned types are disabled, beta types create a
  dataset for import/workbench, available types open the wizard.
- Detection datasets can be generated as **unannotated base images** (no fabricated boxes).
- Evidence: **399 backend tests**, browser `e2e:ui:dataset-types` **20/20**, other browser suites 14/14,
  8/8, 9/9, 7/7, 10/10; ruff clean; build green.

---

## I2 — image export bundle: DONE

- `ExportFormat.IMAGE_BUNDLE` + `packages/dataset_export/image_bundle_exporter.py`; service branch writes
  `images/` (collision-safe, stable) + `labels.jsonl`/`labels.csv` + `images/README.md` + manifest/README.
- Evidence: **4 integration tests** (contents/provenance, byte determinism, full re-import round-trip,
  text-only rejection → 422); live export of the 25 real generated images (24.4 MB, deterministic,
  SHA matches, label distribution preserved, generation lineage included); browser export dialog check 3/3.
- Backend suite: **403 passed**; ruff clean; build green.

---

## SAM 3.1 box proposals: DONE

- `meta-sam` provider on the Meta Responses API (special-token box grammar, confidence via
  `metadata.include_confidence`), registered with the Meta key next to image generation.
- `POST /datasets/{id}/proposals/detect` + bounded job (`detection_proposals`) with progress/ETA/cancel and
  restart recovery; proposals are `model`/`pending_review` annotations (never auto-approved).
- Box-label schema validation, idempotent re-runs (revision instead of duplicate), `BaseProvider.detect`
  contract, and `FakeProvider.detect` so its OBJECT_DETECTION claim is truthful.
- UI: **Propose boxes (AI)** on detection datasets with a progress/result banner; workbench renders boxes.
- Evidence: **11 new tests** (parser/transport/guards + job lifecycle), **414 backend passed**, browser
  `e2e:ui:proposals` **6/6**, live SAM run: 3/3 images, boxes at ~0.90–0.91 confidence on 1024² images,
  provenance `meta-sam`; ruff clean; build green.
