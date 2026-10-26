# Product Requirements — AI Dataset Engineering Platform

**Version:** 1.0  
**Status:** Baseline requirements for implementation  
**Primary audience:** Individual developers and students  
**Product model:** Open source, local/self-hosted and future hosted service


> **Implementation mapping:** Requirements are implemented in dependency order using [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) and the detailed task-level [`PHASE_BY_PHASE_PLAN.md`](./PHASE_BY_PHASE_PLAN.md). Acceptance criteria in this file remain authoritative for observable product behavior.

## 1. Purpose

The platform turns raw files and source data into structured, reviewed, validated, documented and versioned datasets suitable for machine-learning training, fine-tuning, evaluation and research.

It combines data ingestion, schema definition, AI-assisted annotation, human review, quality validation, provenance, dataset versioning and export. It must remain useful when no AI provider is configured.

## 2. Problem statement

Dataset preparation is fragmented across download scripts, spreadsheets, annotation applications, model APIs, validation notebooks and hand-written documentation. Users repeat work, lose track of sources, accept incorrect model labels, struggle with format conversion and cannot easily reproduce the exact dataset used in an experiment.

The platform should provide one coherent lifecycle while preserving open formats and allowing users to inspect and correct every important result.

## 3. Goals and non-goals

### Goals

- Reduce repetitive manual work in dataset creation and annotation.
- Make AI-assisted labels editable, reviewable and auditable.
- Support paired/multimodal assets through stable record relationships.
- Make dataset quality visible before export.
- Make provenance and licensing uncertainty explicit.
- Produce portable training-ready exports and documentation.
- Support local use and a future hosted deployment.
- Provide extensible provider, task and exporter interfaces.

### Non-goals for MVP

- Train foundation models or provide a full GPU training cloud.
- Guarantee that generated or collected data is legally usable.
- Fully automate legal decisions, bias assessments or ground-truth verification.
- Support every modality and export format at launch.
- Provide a general autonomous agent with unrestricted browser, shell or code execution.
- Require paid AI services for core data management and annotation.
- Build a large-scale multi-tenant SaaS control plane before validating the single-user workflow.

## 4. Users and user stories

### Individual developer/student

- As a user, I can create a project and dataset so I can organize data for one ML task.
- I can import a folder/archive/CSV/JSON and see which records were accepted or rejected.
- I can define labels and required fields before annotation begins.
- I can run a configured model to suggest labels and inspect the output.
- I can correct a wrong label and retain the history of the change.
- I can see which records need review and why.
- I can detect duplicate files and invalid records before training.
- I can publish a dataset version and recreate the same logical dataset later.
- I can export a format compatible with my chosen training library.
- I can generate documentation without manually assembling statistics.
- I can run the application locally and use manual tools without an API key.

### ML researcher/engineer

- I can trace an annotation to its model, prompt/template, source and processing run.
- I can compare dataset versions and see changed records.
- I can inspect class balance and split leakage warnings.
- I can use different providers or a local model without changing dataset schema.
- I can use a programmatic API/CLI in a later phase.

### Maintainer/contributor

- I can add a provider, task type or exporter through a documented interface.
- I can run tests without paid credentials.
- I can start a local development environment from documented commands.
- I can determine phase status and next tasks from repository docs.

## 5. Supported modalities and task scope

### MVP data types

- Images: JPEG, PNG, WebP where supported by the installed image stack; validate actual file content, not only extension.
- Text: UTF-8 text and structured text records.
- Tabular: CSV.
- Structured records: JSON and JSONL.
- Archives: ZIP under strict compressed/decompressed size, file-count and path limits.
- Other files may be retained only if the user explicitly imports them as attachments and the application can safely identify/store them; do not claim they are annotatable.

### MVP tasks

1. Image classification.
2. Text classification.
3. Object detection as the next complete task milestone.

### Later tasks

- Captions and image-text pairs.
- OCR/document layout and document question answering.
- Audio transcription, speaker labels and sound-event classification.
- Video frame annotation, tracking and temporal labels.
- Segmentation, keypoints and 3D/point-cloud workflows.
- Instruction-response datasets and preference data.

Do not expose a task as supported until its schema, UI, validation, export and tests exist.

## 6. Functional requirements

Priority definitions: **P0** required for initial useful release; **P1** next expansion; **P2** later.

### FR-001 — Project management (P0)

Users can create, list, rename and archive projects. Project names and descriptions are validated. Dataset operations are scoped to a project. In hosted mode, every request verifies ownership/authorization on the server.

Acceptance:
- A project can be created and retrieved after application restart.
- Invalid names and malformed input return a useful validation error.
- A user cannot access another project by guessing its ID.

### FR-002 — Dataset setup (P0)

Users can create a dataset with name, description, task type, schema version and annotation instructions. The UI explains what each task means and which export formats it supports.

Acceptance:
- A dataset cannot be created with an unknown task type.
- Schema changes create a new schema version and do not silently reinterpret published versions.
- Task configuration is available to validation and annotation components.

### FR-003 — Safe ingestion (P0)

Import images, text, CSV, JSON, JSONL and ZIP archives. Preview inputs and report accepted, rejected and skipped records. Validate size, parser limits, content type and archive paths.

Acceptance:
- Each accepted record receives a stable ID.
- Duplicate hashes are detected and reported without silently deleting data.
- Invalid rows/files include an item-specific reason.
- Archive path traversal, excessive decompression and unsupported content are rejected safely.
- Failed imports clean up temporary files and do not leave partially published datasets.

### FR-004 — Asset management (P0)

Store original and derived assets separately. Track MIME type, byte size, hash, modality, dimensions/duration when available and provenance. The database stores references, not media blobs.

Acceptance:
- Uploaded content can be retrieved through an authorized path.
- Storage keys are generated server-side.
- Hashes are computed from bytes.
- A derived crop or transformed image references its parent and transformation metadata.

### FR-005 — Annotation schema (P0)

Users can define label sets, required fields, types, allowed values and basic annotation instructions. Schema definitions are versioned and validated.

Acceptance:
- Unknown labels and missing required fields are rejected by validation.
- Schema changes do not mutate old annotation revisions.
- Invalid schema definitions produce actionable errors.

### FR-006 — AI-assisted annotation (P0)

Users can configure a provider/model and run annotation on selected records. The UI shows status and allows cancellation where feasible. Provider output is normalized and schema-validated.

Acceptance:
- No provider configured: manual workflows remain usable.
- Invalid provider output is stored as a failed/invalid result or reviewable diagnostic, never as a valid approved annotation.
- Runs track progress and per-item errors.
- Retrying a run does not create duplicate logical annotations.
- No inference is triggered without explicit user action and configured credentials.

### FR-007 — Human review (P0)

Users can approve, reject, edit or request correction for proposals. Each change is revisioned and linked to its actor/origin.

Acceptance:
- Model-generated proposals default to pending review unless an explicit project policy says otherwise.
- Editing creates a new revision and preserves the previous payload.
- Review actions are auditable.
- The UI makes pending, approved, rejected and invalid states visually distinct and accessible.

### FR-008 — Text classification editor (P0)

Users can read text records, select labels, edit structured metadata and review model proposals.

Acceptance:
- Keyboard and mouse interactions work.
- Empty and very long text are handled safely.
- Invalid labels cannot be approved.
- Saving and navigating away communicate unsaved changes.

### FR-009 — Image classification editor (P0)

Users can view the primary image, inspect metadata, select a label and review model proposals.

Acceptance:
- Image loading failure is shown clearly.
- Large images are displayed within bounded UI dimensions.
- Review status and save state are visible.
- The editor supports basic keyboard navigation.

### FR-010 — Dataset validation and quality (P0)

Provide schema validation, missing asset detection, invalid annotation detection, exact duplicate detection, class counts and unreviewed counts. Present errors, warnings and informational metrics separately.

Acceptance:
- Validation results are reproducible for the same version and rule version.
- A hard error prevents the version from being marked ready unless an explicit override policy is supported and recorded.
- Reports show how many records were checked and which rule produced each issue.
- Automated validation does not claim legal clearance or guarantee model performance.

### FR-011 — Provenance (P0)

Track source information, import runs, transformations, model calls, annotation revisions and validation results.

Acceptance:
- Every model-origin annotation points to a ProcessingRun.
- Each run records provider/model, prompt/template version where available, parameters, status and timestamps.
- Unknown source rights are represented explicitly.
- Provenance records cannot be silently rewritten as if an event never occurred.

### FR-012 — Dataset versioning (P0)

Users can publish immutable snapshots referencing exact record and annotation revisions, schema and validation summary.

Acceptance:
- Published versions are immutable.
- A correction produces a new revision and a new version when published.
- A version manifest can enumerate its records and annotation revisions.
- Export jobs read the snapshot, not mutable current data.

### FR-013 — CSV and JSONL export (P0)

Export generic records and annotations with documented schemas and a manifest.

Acceptance:
- Export includes dataset/version IDs, schema/exporter version, record count, content hashes where feasible and quality warnings.
- Round-trip tests preserve IDs and annotation values.
- Export failure does not mark the artifact as complete.

### FR-014 — Dataset documentation (P0)

Generate README/dataset card, schema/data dictionary, basic statistics, methodology fields, source/rights summary, annotation guidance and known limitations.

Acceptance:
- Generated docs are derived from a frozen version and identify that version.
- Unknown metadata remains unknown; the generator does not invent facts.
- The user can review documentation before publishing.

### FR-015 — Local deployment (P0)

Provide a reproducible Docker Compose setup with API, web app, worker, database, queue and local media storage.

Acceptance:
- A new developer can start the app using the documented instructions.
- Health checks and migrations are documented.
- Manual annotation, validation and export work without AI credentials.
- Secrets are supplied through environment configuration and excluded from Git.

### FR-016 — Provider gateway (P0)

Define typed provider interface and at least one real adapter plus a deterministic fake provider for tests. Keep provider-specific behavior out of domain logic.

Acceptance:
- Unsupported capabilities fail before making a remote call.
- Errors are normalized.
- Credentials never appear in browser bundles or ordinary logs.
- Provider tests can run without paid API access.

### FR-017 — Object detection (P1)

Support bounding boxes, class labels, geometry validation and COCO/YOLO export.

Acceptance:
- Coordinates use a documented convention internally.
- Invalid, negative, zero-area and out-of-bounds boxes are rejected or flagged.
- Export conversion is tested with known fixtures.
- Import/export round trips preserve classes and geometry within documented precision.

### FR-018 — Research/source discovery (P1)

Search or ingest public dataset metadata and source references through permitted APIs and sources. Capture evidence and rights status.

Acceptance:
- Every result has a source reference and retrieval timestamp.
- The platform distinguishes discovered metadata from downloaded assets.
- Unknown rights require review.
- No restriction bypass or unauthorized scraping.

### FR-019 — Synthetic data (P1)

Allow configured generation workflows for synthetic records and paired modalities, with provenance and validation.

Acceptance:
- Synthetic status is explicit at asset and record level.
- Generation parameters and provider/model are recorded.
- Outputs pass the same schema and quality checks as imported data.
- Synthetic records cannot be mistaken for real-world collected samples in reports.

### FR-020 — Additional modalities (P2)

Audio, video and document workflows require modality-specific import, playback/viewer, annotation schema, review UI, validation and export. Do not represent a modality as supported just because its file can be uploaded.

### FR-021 — Active learning and baseline evaluation (P2)

Select uncertain or high-value samples for review and optionally evaluate a baseline model. Evaluation splits must be leakage-aware and reproducible.

### FR-022 — Hosted collaboration (P2)

Add multi-user roles, secure tenancy, quotas, audit trails, backups and retention policies before public hosted launch.

## 7. Quality requirements

### NFR-001 — Correctness

All persisted data must satisfy domain constraints. Invalid state transitions and invalid annotation payloads are rejected at the service boundary.

### NFR-002 — Reliability

Long-running tasks are asynchronous, resumable and idempotent. A worker crash does not lose completed item results. Failures are visible and actionable.

### NFR-003 — Security

Validate authorization on every project-scoped operation. Defend against path traversal, malicious archives, SSRF, XSS, SQL injection, secret leakage and insecure object access. Apply upload and job limits.

### NFR-004 — Privacy

Local mode must not silently transmit data externally. Provider calls are explicit, configured and documented. Logs avoid unnecessary content and secrets.

### NFR-005 — Performance

Use pagination and bounded batch processing. Do not load an entire large dataset or archive into memory without explicit limits. Establish benchmarks after representative fixtures exist; avoid invented performance guarantees.

### NFR-006 — Portability

Users can export records and media with documented schemas. Core functionality is not dependent on a single provider or hosted platform.

### NFR-007 — Accessibility and usability

Keyboard-accessible controls, visible focus, readable contrast, clear validation messages and useful empty/loading/error states.

### NFR-008 — Maintainability

Typed contracts, focused modules, migrations, reproducible development environment, deterministic tests and documentation for extension points.

### NFR-009 — Reproducibility

Published version manifests pin exact annotation revisions and schema. Export metadata records relevant software versions and content hashes.

### NFR-010 — Cost transparency

Show provider/model and available usage/cost estimates before large runs. Enforce configured limits and support cancellation.

## 8. Security, privacy and data rights requirements

- Uploaded files and retrieved content are untrusted.
- Enforce maximum file size, archive entry count, decompressed size, parsing time and supported file types.
- Never execute uploaded content or generated code.
- Never fetch arbitrary user-supplied URLs from the server without SSRF protections.
- Store credentials server-side or in local environment configuration; redact them from logs.
- Apply least privilege to storage and database credentials.
- Distinguish source discovery, source retrieval and rights approval.
- A public URL is not evidence of permission for training or redistribution.
- Store license/terms evidence and attribution requirements when available.
- If rights are unknown, require review or exclude the asset from approved exports according to project policy.
- Provide deletion/retention behavior appropriate to local and hosted deployment.
- Keep private sample data and real API keys out of tests and Git.

## 9. Error behavior

Errors should include a stable category/code, concise human-readable explanation, safe context and a suggested action where useful. Never return stack traces, credentials or raw provider headers to the UI.

Distinguish:
- invalid input,
- unsupported format/capability,
- permission denied,
- quota exceeded,
- transient provider failure,
- permanent provider failure,
- validation failure,
- storage failure,
- cancellation,
- internal error.

A partial batch failure must identify successful, failed and unprocessed items.

## 10. Testing requirements

- Unit tests for schemas, state transitions, normalization, geometry and quality rules.
- API tests for CRUD, permissions, import and version lifecycle.
- Contract tests for provider adapters using fakes/fixtures.
- Resilience tests for timeout, rate limit, malformed output, retry and cancellation.
- Security tests for malicious archives, traversal and cross-project access.
- Round-trip tests for each exporter.
- End-to-end test for import -> annotate -> review -> validate -> publish -> export.
- Clean Docker Compose smoke test.
- No CI requirement for paid API keys or external model availability.

## 11. MVP release acceptance

The MVP is releasable only when all of the following are true:

1. A user can create a project and image/text classification dataset.
2. User can import supported data and understand rejected inputs.
3. User can label manually with no AI provider configured.
4. A configured provider can propose annotations through the gateway.
5. AI proposals and human-approved annotations are distinct.
6. Annotation revisions and provenance are preserved.
7. Quality validation and duplicate checks produce a report.
8. An immutable dataset version can be published.
9. CSV/JSONL export and documentation are generated from that version.
10. Round-trip and end-to-end tests pass.
11. Local deployment instructions work from a clean environment.
12. No known critical security defect or secret is present in the repository.
13. Documentation states unsupported features and limitations honestly.

## 12. Definition of done for any feature

A feature is DONE only when:
- Its user-visible behavior matches a requirement.
- Inputs and state transitions are validated.
- Loading, empty, error and success behavior are implemented.
- Relevant tests are added and run.
- Authorization, privacy and cost implications are considered.
- Documentation and execution status are updated.
- It has no dead UI controls or false completion claims.
