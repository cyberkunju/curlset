# Detailed Phase-by-Phase Implementation Plan

**Status:** Planning only. No phase is complete until implementation and verification evidence exist.
**Authority:** Read AGENTS.md, docs/DESIGN.md, docs/REQUIREMENTS.md, docs/EXAMPLES.md and docs/DECISIONS.md first.
**Companion roadmap:** docs/EXECUTION_PLAN.md.

This plan converts the 16-phase roadmap into implementable work packages. Phase 0 must inspect the actual repository and preserve healthy existing code. The agent may split work into smaller commits but must not skip acceptance gates.

## Operating rules for every phase

1. Re-check repository state, dependencies and existing implementation; preserve user changes.
2. Implement complete vertical slices, not dead buttons, mock-only screens or placeholder success responses.
3. Add appropriate unit, API/integration, migration, security and UI/e2e tests.
4. Run available formatter, lint, type-check, test and build commands. Record exact commands and outcomes.
5. Review changes for secrets, unsafe paths, data-loss risks, provenance/license gaps and documentation drift.
6. Update docs/EXECUTION_PLAN.md with evidence. Mark a phase DONE only when its exit gate passes.
7. If blocked by credentials or infrastructure, implement safe independent work and document the exact blocker. Never fabricate results.

Status values: NOT STARTED, IN PROGRESS, BLOCKED, DONE, DEFERRED. DEFERRED is not DONE. A running server or generated scaffold is not acceptance evidence.

---

## Phase 0 — Repository reconnaissance and reproducible baseline

**Dependencies:** None. **Outcome:** The agent understands the real repository and can run checks reliably.

### Tasks
- Read all governing docs; inspect tree, git status, branch, commits, manifests, lockfiles, tests, CI, Docker files, environment examples and ignored files.
- Record existing behavior, missing functionality, current architecture and known baseline failures. Do not rebuild healthy components merely to match a suggested path.
- Identify runtime versions and package managers from the repo; preserve established conventions.
- Establish or repair safe ignore rules, placeholder environment configuration and contributor setup instructions.
- Document install, format, lint, type-check, test, integration-test and build commands; clearly state which checks do not yet exist.
- Check tracked files for credentials, private keys, personal datasets and build artifacts.
- Record consequential decisions in docs/DECISIONS.md and align this plan with the actual repository.

### Deliverables
Repository inventory, reproducible setup/check commands, safe configuration baseline and implementation checklist grounded in the actual code.

### Tests / verification
Run existing checks to capture baseline results. Perform a clean-start setup where possible. Check tracked files and ignore rules for secrets and generated output.

### Exit gate
A contributor can start the repo and run its documented checks; baseline failures are distinguished from new regressions; existing work is preserved.

---

## Phase 1 — Domain model, schemas and persistence foundation

**Dependencies:** Phase 0. **Outcome:** Stable, validated dataset concepts.

### Tasks
- Define typed contracts and persistence models for Project, Dataset, DatasetRecord, Asset, RecordAsset, Annotation, AnnotationRevision, SourceRecord, ProcessingRun, RunItem, DatasetVersion, VersionItem, ExportArtifact and ReviewEvent.
- Define stable IDs, UTC timestamps, task identifiers, schema versions and archive/deletion semantics.
- Define annotation origins (human, model, imported, rule-generated) and states (proposed, pending review, approved, rejected, needs correction, invalid); enforce transitions centrally.
- Separate user-facing validation errors from internal errors; validate at trust boundaries.
- Add database migrations and repository/service boundaries. Keep media bytes outside relational rows.
- Add health/readiness endpoints and validated configuration. Startup must not require AI credentials.
- Add synthetic seed fixtures with no personal or unlicensed data.
- Document migration, backup, restore and development-reset policies. Make destructive reset operations explicit.

### Tests / verification
Clean migration from zero, migration status, persistence round trips, invalid schema/state rejection, stable ID and UTC timestamp tests, startup without providers.

### Exit gate
Dataset and record persistence works; invalid domain states are rejected; clean migrations and tests pass.

---

## Phase 2 — Application shell, projects and datasets

**Dependencies:** Phase 1. **Outcome:** Persisted projects and datasets are manageable through a usable interface.

### Tasks
- Build responsive app shell, navigation, routing and shared loading/error/empty states.
- Implement project create/list/detail/rename/archive.
- Implement dataset create/list/detail/edit with task type, description, annotation instructions and schema version.
- Show counts/status only from real backend data, not production mock records.
- Define consistent API error responses and useful UI messages.
- Scope dataset operations to projects and enforce server-side authorization, including in single-user local mode.
- Provide keyboard navigation, visible focus, adequate contrast and narrow-screen layouts.

### Tests / verification
API CRUD and validation tests, UI workflow tests, restart persistence and cross-project ID access rejection.

### Exit gate
Users can manage persisted projects and datasets; authorization and core flows are tested.

---

## Phase 3 — Import pipeline, safe storage and record normalization

**Dependencies:** Phases 1–2. **Outcome:** User data becomes stable records/assets with diagnostics.

### Tasks
- Implement bounded upload and supported local import paths.
- Support UTF-8 text, JPEG/PNG/WebP images where libraries support them, CSV, JSON, JSONL and constrained ZIP archives.
- Validate content signatures as well as extensions/MIME; cap file size, item count, row length, nesting and decompressed size.
- Prevent ZIP traversal, symlink escape, decompression bombs, unsafe temporary paths and filename collisions.
- Generate opaque storage keys; preserve filenames only as metadata. Compute SHA-256, byte size, MIME, modality and image dimensions when available.
- Normalize each accepted item into a stable record and asset relationship. Preserve original assets and track derived assets separately.
- Record import runs and per-item accepted/rejected/skipped outcomes with actionable errors.
- Define duplicate handling: report exact hashes; never silently delete or merge records. Make retries safe and idempotent.
- Add preview/results UI, progress, cancellation where feasible and cleanup on failure.

### Tests / verification
Valid fixtures per format; malformed structured files, invalid UTF-8, corrupt/spoofed images, oversized files, duplicate hashes, archive traversal and decompression limits. Verify failed imports do not leave partial success states or temporary files.

### Exit gate
Valid inputs produce stable records/assets; invalid inputs fail safely with item-level diagnostics and authorized storage references.

---

## Phase 4 — Annotation schemas and manual labeling

**Dependencies:** Phase 3. **Outcome:** Useful manual workflows without AI providers.

### Tasks
- Implement versioned task schemas, label sets, required fields, allowed values and annotation instructions.
- Build text classification and image classification workspaces.
- Implement annotation CRUD, append-only revision history and auditable review actions.
- Centralize review state transitions and reject illegal transitions.
- Add queues/filters for unannotated, pending review, approved, rejected, needs correction and invalid records.
- Add keyboard-first navigation, save feedback, unsaved-change warnings and request-failure recovery.
- Keep raw imports immutable. Schema changes must not silently reinterpret prior revisions or published versions.

### Tests / verification
Valid/invalid label tests, required-field tests, revision preservation, state transition tests, editor UI tests and manual workflow without provider configuration.

### Exit gate
Users can import text/images, label manually, revise and review annotations while retaining history.

---

## Phase 5 — Provider gateway and AI-assisted annotation

**Dependencies:** Phase 4. **Outcome:** Safe provider-neutral model proposals.

### Tasks
- Define backend provider interface, capability declarations, normalized errors and usage metadata.
- Implement a deterministic fake provider for tests. Add at least one real adapter only after verifying current API support and configuration.
- Keep keys server-side; validate configuration and redact secrets from logs/errors.
- Require explicit user action to start inference. Explain which provider/model receives which selected data and disclose external transfer.
- Validate output against the task schema. Invalid output remains a diagnostic/invalid proposal, never approved.
- Store provider/model, prompt/template version, run configuration, timestamps, per-item outcomes and usage where available.
- Add bounded concurrency, timeouts, bounded retries/backoff, cancellation, idempotency and per-run limits.
- Add progress, failure details and retry-failed-items. Manual workflows remain available without provider credentials.

### Tests / verification
Fake-provider contract tests; missing credentials, invalid output, timeout, rate limit, cancellation, partial failure and retry tests; secret-redaction tests. Verify startup and dataset viewing do not trigger external requests. Model proposals default to pending review.

### Exit gate
Explicitly initiated runs create validated, reviewable proposals and per-item outcomes without hidden transfer; manual workflows still work offline.

---

## Phase 6 — Quality validation and diagnostics

**Dependencies:** Phases 3–5. **Outcome:** Reproducible data-quality findings before publication.

### Tasks
- Build a deterministic, versioned validation engine with stable rule IDs, severity, affected record IDs and remediation.
- Check required fields, labels, malformed values, unreadable assets, duplicates, empty/oversized text, schema mismatch and unresolved review states.
- Add task-aware image checks, class distributions and split-leakage warnings where supported by metadata.
- Distinguish blocking errors from warnings; document configurable rules and their limits.
- Persist validation runs against the dataset/schema revision; mark stale results when inputs change.
- Build summary/filter/navigation UI for affected records.
- Never claim automated checks prove legal clearance, absence of bias or training suitability.

### Tests / verification
Fixtures for each rule and boundary, deterministic ordering, stale-result behavior and performance on synthetic datasets.

### Exit gate
Known seeded issues are found and actionable; blockers/warnings are distinct and results are reproducible.

---

## Phase 7 — Provenance, immutable versions and documentation

**Dependencies:** Phases 1–6. **Outcome:** Traceable, immutable dataset snapshots.

### Tasks
- Link source, import run, original/derived asset, annotation revision, model run, review event and dataset record.
- Freeze exact record IDs, annotation revisions, schema revision and asset hashes when publishing a version.
- Define canonical manifest serialization and hashing with stable ordering and normalization.
- Prevent in-place changes to published versions; corrections require a new version.
- Add version list/detail, counts, validation summary and record-level diffs.
- Generate dataset documentation from actual version metadata: purpose, task, schema, source, collection/annotation process, splits, counts, limitations, risks and licensing status.
- Represent unknown source/license details as unknown; do not infer permission.
- Add integrity checks for assets and manifests.

### Tests / verification
Snapshot immutability after live edits, stable hashes for identical snapshots, accurate version diffs, documentation statistics matching version contents and persistent provenance links.

### Exit gate
Published versions are immutable, reproducible, traceable and documented from actual contents.

---

## Phase 8 — Training-ready exports and reproducibility

**Dependencies:** Phase 7. **Outcome:** Portable, version-bound exports.

### Tasks
- Implement CSV and JSONL exporters first, with deliberate field inclusion and escaping.
- Define media packaging/references, deterministic paths, encoding, null handling and safe filenames.
- Export an explicit immutable version, not a live query. Include manifest, schema, version/exporter identifiers, hashes and quality warnings.
- Add export preview and only expose supported options.
- Store export artifact status, checksum, size and location; stream large exports with bounded memory.
- Make failed exports retryable without corrupt/duplicate artifacts.
- Document Python consumption examples without claiming compatibility with every ML library.

### Tests / verification
Golden files covering Unicode, commas, newlines, quotes, nulls and empty values; deterministic repeat exports; correct version binding; checksum verification; failure cleanup; quality blocker behavior.

### Exit gate
Users can export valid, documented CSV/JSONL artifacts from immutable versions and reproduce the same logical output.

---

## Phase 9 — Object detection and COCO/YOLO

**Dependencies:** Phases 4, 6–8. **Outcome:** End-to-end object detection, not just a schema.

### Tasks
- Add a versioned object-detection schema, class registry and bounding-box representation.
- Choose one internal coordinate convention and document conversion, rounding and origin.
- Build annotation canvas controls to add/select/move/resize/delete boxes, assign classes, zoom/pan and provide accessible alternatives.
- Validate positive dimensions, bounds, class IDs, degenerate boxes and transformations for resized/derived images.
- Implement COCO JSON and YOLO directory/text exports with deterministic category mapping and manifests.
- Add import only when mappings are complete and tested.
- Add examples and conversion documentation.

### Tests / verification
Coordinate round trips and boundary tests; invalid/zero-area/out-of-bounds boxes; unknown classes; golden COCO/YOLO exports; editor save/revision tests; snapshot geometry immutability.

### Exit gate
Object detection works through annotation, validation, review, versioning and tested COCO/YOLO export.

---

## Phase 10 — Local deployment and developer experience

**Dependencies:** Phases 0–9. **Outcome:** Reproducible local MVP.

### Tasks
- Provide Docker Compose or the repository's established equivalent for required services.
- Add health checks, startup dependency handling, persistent volumes, migration policy and graceful shutdown.
- Document setup, update, backup, restore and troubleshooting; provide placeholder-only environment examples.
- Make local mode work without provider credentials; bind services safely and explain network exposure.
- Test backup/restore for metadata and media, including integrity checks.
- Add CI for format, lint, type-check, tests, build and migrations without paid credentials.
- Document safe reset semantics separately from normal startup.

### Tests / verification
Clean startup, restart persistence, backup/restore into a clean instance, asset integrity, secret-safe logs and documented port exposure.

### Exit gate
A new contributor can run, test, back up and restore the local MVP from documented steps.

---

## Phase 11 — Source discovery, provenance and rights review

**Dependencies:** Phases 3, 7 and 10. **Outcome:** Traceable source collection and explicit rights review.

### Tasks
- Define source adapters with source URL/identifier, retrieval time/method, attribution, license evidence, terms notes and content hash.
- Separate discovery from downloading/import; search results do not imply permission.
- Require explicit initiation before collection or external transfer; honor source restrictions and rate limits.
- Add rights states: unknown, review required, permitted with evidence, restricted and rejected. Record evidence and user decisions.
- Do not bypass logins, paywalls, anti-bot controls or access restrictions; do not crawl private content.
- Treat retrieved content as untrusted and sanitize before rendering.
- Allow export policies to exclude unresolved/restricted records without silently deleting source data.

### Tests / verification
Connector contract fixtures, rate-limit/error/cancellation behavior, rights-based export policy and persistence of evidence/hashes. Unknown rights must never become permitted automatically.

### Exit gate
Provenance and rights review are explicit; discovery is not conflated with permission; restricted data is not silently exported.

---

## Phase 12 — Synthetic data generation

**Dependencies:** Phases 5–7 and 11. **Outcome:** Traceable candidate synthetic data.

### Tasks
- Check provider capabilities for each generation modality; never assume support.
- Version prompts/templates and record parameters, requested count, constraints and usage limits.
- Require explicit initiation, visible transfer notice and configured budget/count limits.
- Mark synthetic records/assets and link them to generation runs/configuration.
- Validate outputs, detect exact duplicates and route candidates through review by default.
- Support bounded retry, partial failures and cancellation.
- Allow synthetic data inclusion/exclusion in versions and exports; disclose it in generated docs.

### Tests / verification
Deterministic fake provider, malformed outputs, partial batch failure, limits, cancellation and lineage through version/export. Verify synthetic candidates are not silently approved.

### Exit gate
Synthetic data is explicitly generated, bounded, reviewable, traceable and clearly identified in outputs.

---

## Phase 13 — Additional modalities and task plugins

**Dependencies:** Phases 4–8 and 10. **Outcome:** New modalities reuse core guarantees.

### Tasks
- Define task/provider capability contracts before adding modality support.
- Add one complete modality at a time, prioritizing by value: captions/image-text pairs; audio transcription/sound events; document/OCR; video frames/temporal labels.
- For each modality implement ingestion/parser limits, asset metadata, schema, annotation UI/API, validation, review, provenance, immutable versions, documentation and at least one tested export.
- Track derived-media lineage, timestamps, spans, units and coordinate transforms.
- Add modality-specific privacy, size, codec and parser constraints.
- Do not advertise a task as supported until the complete vertical slice and tests pass.

### Tests / verification
Fixture-based parsers and schemas, timestamp/span/geometry bounds, export golden files, lineage tests and bounded-resource tests for malformed/large media.

### Exit gate
Every advertised modality has a complete tested workflow and export; incomplete ones remain experimental or unsupported.

---

## Phase 14 — Active learning, evaluation and advanced quality loops

**Dependencies:** Phases 5–9 and complete task-specific workflows. **Outcome:** Explainable review prioritization and reproducible evaluation.

### Tasks
- Add pluggable prioritization strategies, beginning with transparent heuristics such as unreviewed records and model disagreement.
- Use uncertainty only when a provider supplies meaningful scores; never invent confidence.
- Add distribution, imbalance, missingness, duplicates and possible split-leakage diagnostics.
- Compare annotation revisions or model runs against human-reviewed evaluation sets.
- Record metric definitions, dataset version, evaluation set, model/provider and configuration.
- Surface small-sample limitations and avoid unsupported statistical-significance/fairness claims.
- Keep recommendations explainable and overridable.

### Tests / verification
Deterministic ranking, metrics checked against hand-computed fixtures, version/config reproducibility and missing-confidence/small-sample warnings.

### Exit gate
Prioritization and evaluation are reproducible, explainable and tied to exact versions; uncertainty and limitations are represented honestly.

---

## Phase 15 — Hosted deployment, collaboration and operational hardening

**Dependencies:** Phases 0–10. **Outcome:** Secure hosted mode without weakening local guarantees.

### Tasks
- Threat-model multi-user tenancy; implement authentication, membership and server-side ownership checks before exposing hosted access.
- Test tenant isolation across database queries, storage, exports, background jobs and provider credentials.
- Add secret management, transport security, secure session/cookie policy, CSRF protection where relevant, rate limits and abuse controls.
- Define retention, export, deletion, backup/restore and incident response policies. Destructive operations must be explicit and auditable.
- Add observability that excludes secrets and sensitive dataset contents by default; monitor health, errors, queues and storage.
- Add job limits, retry/dead-letter behavior, provider budgets and per-tenant quotas.
- Document deployment, migration, rollback, restore drills, monitoring and supported upgrades.
- Review dependencies, ingestion, authorization, SSRF in connectors, path traversal and data-exfiltration boundaries.
- Keep hosted deployment optional; preserve local/self-hosted support.

### Tests / verification
Tenant-isolation tests across all layers, rate-limit/session/upload/provider-budget tests, backup/restore and migration recovery drills, security scan findings and remediation records.

### Exit gate
Hosted mode is not production-ready until isolation, security, recovery and monitoring are tested. Missing infrastructure is a blocker, never evidence of a live deployment.

---

## Cross-phase release gates

### Gate A — Useful local alpha (after Phase 4)
Project/dataset persistence; safe imports; manual text/image classification and review; tests pass; local setup documented.

### Gate B — AI-assisted dataset workflow (after Phase 8)
Explicit provider runs; human review; validation, provenance, immutable versions, generated docs and reproducible CSV/JSONL exports work together.

### Gate C — Object-detection release (after Phase 9)
Geometry, review, validation, versioning and COCO/YOLO exports pass end-to-end tests.

### Gate D — Local MVP (after Phase 10)
Clean setup/startup, persistence, backup/restore and CI are verified.

### Gate E — Extended platform (after applicable Phases 11–14)
Each optional feature is complete before advertised; rights, synthetic lineage and evaluation limits are explicit.

### Gate F — Hosted production readiness (after Phase 15)
Tenant isolation, security, recovery and operations are demonstrated. Do not claim a hosted service is live until it is actually deployed and smoke-tested.

## Required completion report for every phase

Report phase and status; user-visible behavior implemented; important files/modules changed; migrations and API contracts; exact test commands and actual pass/fail counts; manual checks; limitations/deferred items/blockers; exit-gate evidence; next phase and dependencies.

**A checklist tick, commit, scaffold or successful build is not a substitute for verified product behavior.**
