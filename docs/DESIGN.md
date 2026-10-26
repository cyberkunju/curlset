# System Design — AI Dataset Engineering Platform

**Status:** Initial architecture baseline  
**Audience:** Contributors, AI coding agents and maintainers  
**Primary users:** Individual developers and students  
**Deployment targets:** Local/self-hosted first, hosted service later  
**Architecture style:** Modular monolith with asynchronous workers


> **Implementation sequencing:** Use [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) for the roadmap and current status, and [`PHASE_BY_PHASE_PLAN.md`](./PHASE_BY_PHASE_PLAN.md) for task-level implementation steps, tests and exit gates. The design describes intended boundaries; inspect the actual repository before applying it.

## 1. Product concept

The platform is a dataset engineering workbench. It helps a user define a training-data task, ingest raw assets, normalize records, propose annotations with configurable models, review/correct the annotations, run quality checks, publish an immutable dataset version and export a documented package.

The dataset is the product. Models, agents and web research are tools used to improve the dataset; they are not substitutes for quality control, rights review or reproducibility.

### Product principles

1. Dataset-first: all workflows produce or improve structured dataset records.
2. Multimodal by design: one logical record can reference multiple related assets.
3. Human accountability: AI outputs are proposals until accepted under an explicit policy.
4. Provider-neutrality: provider SDKs are isolated behind an adapter contract.
5. Reproducibility: source, transformations, annotations and export versions are traceable.
6. Portability: open formats and documented schemas; no essential data lock-in.
7. Local-first: core annotation, validation and export work without a cloud account or AI key.
8. Safe automation: explicit limits, durable jobs and clear approval gates.
9. Evidence-based quality: automated checks expose risks; they do not promise perfect data.
10. Incremental delivery: finish vertical slices and prove them with tests.

## 2. Personas and core journey

### Primary persona: individual developer/student

Needs a practical way to prepare a dataset for a course project, research prototype, portfolio project or fine-tuning experiment. Has limited budget, may have modest hardware, and values straightforward setup, understandable errors and portable output.

### Secondary persona: ML researcher/engineer

Needs repeatable ingestion, annotation, provenance, validation, splits and export. May connect multiple model providers or a local inference server.

### Core journey

1. Create project and select task.
2. Define a schema and annotation instructions.
3. Import files or structured data.
4. Preview normalized records and resolve ingestion errors.
5. Select a provider/model and configure an annotation run, or annotate manually.
6. Review proposals, correct labels and resolve uncertainty.
7. Run validation and inspect the quality report.
8. Freeze an immutable dataset version.
9. Export a framework-compatible package and generated documentation.
10. Re-open the version and reproduce or compare the export.

## 3. Scope boundaries

### MVP includes

- Projects and logical datasets.
- Image and text assets/records.
- Import of images, text, CSV, JSON, JSONL and ZIP with strict safety limits.
- Versioned task schemas.
- Image classification and text classification workflows.
- Model-assisted annotation through a provider gateway.
- Human review, edits and annotation revision history.
- Basic duplicate detection, schema validation and quality statistics.
- Provenance and processing-run records.
- Immutable dataset-version manifests.
- CSV and JSONL exports, dataset documentation, quality report.
- Docker Compose local deployment and configuration for cloud object storage.
- Object detection and COCO/YOLO exports as the next MVP milestone.

### Explicitly deferred

- Audio/video editing timelines.
- Arbitrary agent-generated code execution.
- Autonomous unrestricted web scraping.
- Full hosted billing, organization administration and complex multi-tenant operations.
- Kubernetes/microservices.
- Training large models within the platform.
- Guaranteed legal clearance, bias elimination or annotation correctness.
- Every possible dataset format in the first release.

## 4. Logical architecture

The backend is a modular monolith. Modules communicate through explicit service interfaces and domain types. Long-running tasks execute through a background worker. The web app calls the API; only backend code may access secret-bearing provider credentials.

### Modules

- **Identity/workspace:** user identity and project ownership. Local mode may start as a single-user instance but must not hard-code assumptions that prevent hosted isolation.
- **Project/dataset:** project settings, dataset metadata, task type, schema versions and lifecycle.
- **Ingestion:** safe file validation, parsing, asset storage, record normalization and import reports.
- **Asset storage:** opaque storage keys, hashes, MIME types, byte sizes and derived-asset lineage.
- **Annotation:** task-specific annotation schemas, statuses, edits, revisions and review events.
- **Provider gateway:** capability discovery, provider adapters, request normalization, usage metadata, error normalization and timeouts.
- **Workflow/jobs:** durable run state, item-level progress, retries, cancellation and idempotency.
- **Validation/quality:** schema and task-specific validation, duplicates, missing data, distribution and quality reports.
- **Provenance:** source references, model calls, transformations, prompt versions and review decisions.
- **Versioning:** immutable manifests of exact record/annotation revisions and schema.
- **Import/export:** versioned format adapters, deterministic serialization where feasible and export manifests.
- **Documentation:** dataset card, README, data dictionary, annotation instructions, quality summary and known limitations.
- **Web UI:** project overview, import wizard, schema editor, annotation workbench, review queue, quality dashboard, version history and export flow.

### Request and job flow

- API requests validate input and permissions before writing state.
- A job request creates a ProcessingRun and queued work items.
- Workers claim work, perform one bounded unit of work, persist output and update status.
- A retry uses the same logical idempotency key and does not duplicate accepted output.
- UI polls or subscribes to job status through a stable API. Start with polling; introduce server-sent events only when useful.
- Publishing validates that the version manifest references existing immutable revisions.
- Export jobs read a frozen version, not mutable current records.

## 5. Suggested repository layout

Adapt to an existing repository rather than replacing it blindly.

    apps/
      web/                       React + TypeScript frontend
    services/
      api/                       FastAPI API
      worker/                    Background job entry point
    packages/
      dataset_core/              Domain types and schema contracts
      provider_gateway/           Provider interfaces and adapters
      dataset_io/                 Importers and exporters
      validation/                 Quality rules
      documentation/              Dataset card/report generation
    migrations/                   Database migrations
    schemas/                      Versioned public JSON schemas
    tests/
      unit/
      integration/
      contracts/
      roundtrip/
      e2e/
    examples/                     Small synthetic fixtures
    docs/                         Product and engineering documentation
    docker-compose.yml
    .env.example

Use the layout only as a target. If the repository already has a sound structure, keep it and document mapping decisions.

## 6. Domain model

### Project

A workspace boundary: ID, owner, name, description, settings, created/updated timestamps.

### Dataset

Belongs to a project. Has ID, name, description, task type, current schema version, lifecycle state and optional parent dataset. A dataset is a logical mutable workspace; published versions are immutable.

### DatasetRecord

One logical sample. Has stable ID, dataset ID, schema version, optional external/source key, normalized metadata, record state and timestamps. It references assets and annotations rather than embedding large media bytes.

### Asset

An immutable file or derived artifact. Fields include asset ID, modality, MIME type, byte size, SHA-256, storage key, original filename as untrusted metadata, dimensions/duration when applicable, parent asset/transform reference and timestamps. Storage keys are generated by the application, never accepted directly from a client.

### RecordAsset

Join entity connecting records and assets, with a role such as primary_image, crop, source_document, audio, video, thumbnail or attachment; include ordering where useful.

### Annotation

Task-specific structured data attached to a record. Includes ID, task, schema version, payload, origin (human/model/import/rule), review status, latest revision ID and optional ProcessingRun reference. Annotation payloads must be validated against task schemas.

### AnnotationRevision

Append-only revision with annotation ID, revision number, payload, actor/source, change reason, timestamp and optional linked model run. Do not overwrite revision history. A current annotation pointer may be updated transactionally.

### SourceRecord

Records origin and usage evidence: source type, URL/identifier, creator/publisher when known, retrieved time, license identifier/text/URL, attribution requirements, terms evidence, intended-use review state and notes. Unknown license is a valid state; it is not approval.

### ProcessingRun

Represents import, inference, transformation, validation, generation, split or export work. Includes ID, run type, status, configuration snapshot, software version, actor, started/finished timestamps, summary, error category and cost/usage metadata where available.

### RunItem

Tracks per-record progress inside a run: record ID, idempotency key, status, attempts, output reference, normalized error and timestamps. This allows partial resume.

### DatasetVersion

Immutable published snapshot with version ID, dataset ID, parent version, manifest reference/hash, schema version, exporter-compatible metadata, creation actor/time, quality report reference and state. Published versions cannot be edited in place.

### VersionItem

Maps a dataset version to exact record, asset and annotation revision identifiers. The manifest must be sufficient to reconstruct the exported logical dataset.

### ExportArtifact

Output location/key, format, exporter version, dataset version, content hash, byte size, creation time and validation result. Exporting a version again should produce semantically equivalent output; document unavoidable nondeterminism.

### ReviewEvent

Optional explicit event record for approve/reject/request-correction, actor, reason and timestamp. Useful for auditability and later collaborative review.

## 7. Data contracts and example

Use explicit public JSON schemas with a schema version. Database JSONB is acceptable for flexible payloads, but identity, ownership, status, foreign keys and revision references should remain explicit columns.

Illustrative record:

    {
      "id": "rec_demo_0001",
      "dataset_id": "ds_product_damage",
      "schema_version": 1,
      "assets": [
        {
          "asset_id": "asset_demo_0001",
          "role": "primary_image",
          "modality": "image",
          "mime_type": "image/jpeg",
          "sha256": "illustrative-hash-only",
          "storage_key": "assets/generated/asset_demo_0001"
        }
      ],
      "annotations": [
        {
          "id": "ann_demo_0001",
          "task": "image_classification",
          "data": {"label": "damaged_product"},
          "origin": "model",
          "status": "pending_review",
          "processing_run_id": "run_demo_0001"
        }
      ],
      "source": {
        "type": "user_upload",
        "license_status": "user_attested"
      }
    }

This is illustrative, not a real asset or license assertion. In production, compute hashes from actual bytes, validate MIME type by inspection, and store source evidence separately. Avoid duplicating authoritative annotation state inside arbitrary record JSON if the normalized relational model already owns it.

### Annotation state machine

Recommended states: proposed, pending_review, approved, rejected, needs_correction, invalid. Define legal transitions centrally. Example: proposed -> pending_review; pending_review -> approved/rejected/needs_correction; needs_correction -> proposed/pending_review after a new revision. Imported human-labeled data may follow an explicit import policy, but never infer approval solely from missing metadata.

## 8. Storage and versioning

- PostgreSQL stores metadata, state, relations and manifests metadata.
- Object storage stores source media, derived assets, export archives and large reports.
- Local mode uses a configured data directory; hosted mode uses an S3-compatible adapter.
- Use opaque application-generated storage keys, not user-supplied paths.
- Compute SHA-256 on ingest and verify when needed.
- Avoid duplicate physical storage only when deduplication semantics and ownership are safe; do not let one user's deletion remove another user's referenced asset.
- Dataset versions reference immutable revision IDs and manifest hashes. They should not depend on mutable "latest annotation" pointers.
- Create a new version for corrections or split changes.
- Do not copy all media bytes for every version unless storage policy requires it.

## 9. Ingestion pipeline

1. Accept a bounded upload or a configured import source.
2. Check authentication/ownership and quotas.
3. Validate file size, archive entry count, decompressed size, path names, MIME/type signature and supported parser.
4. Parse into a temporary safe workspace without executing content.
5. Compute checksums and write immutable assets.
6. Normalize rows/items to records and create source records.
7. Validate schema and task requirements.
8. Return an import report with accepted, rejected and skipped counts and actionable per-item errors.
9. Clean up temporary files on success and failure.

Reject or quarantine unsafe content. Never extract an archive using untrusted paths without traversal protection. Apply decompression limits and timeouts.

## 10. Provider gateway

### Internal request contract

A request identifies task, input asset/text references, desired output schema, optional provider/model preference, parameters, privacy policy, budget limit and idempotency key. It should reference stored assets rather than repeatedly embedding large media payloads.

### Internal result contract

A result includes provider ID, model identifier, raw output reference or redacted raw output, normalized output, usage metadata, duration, status and normalized error details. Keep raw responses only when appropriate; avoid storing sensitive content by default.

### Capability model

Providers declare capabilities such as text generation, image understanding, structured output, embeddings, image generation, audio transcription and batch processing. The router checks capability before dispatch.

### Routing

Start with explicit user-selected provider/model and safe defaults. Later add task-based routing informed by benchmarked quality, cost, latency, privacy and availability. No provider should be selected solely from model name assumptions.

### Reliability

Timeouts, bounded retries, exponential backoff with jitter, circuit breaking if needed, cancellation, rate limits and idempotency. Distinguish transient network errors from permanent schema errors. Store model version and prompt/template version where available.

### Costs and privacy

Show estimates before batch work when possible. Enforce configured run/project budgets. No external call without configured credentials and visible user intent. Never send local data to a remote provider silently.

## 11. Workflow and agent orchestration

Start with deterministic workflows and explicit state transitions. A workflow may contain import, source review, annotation, normalization, validation, human review, version publication and export steps. A future planner agent can generate a proposed workflow from the task description, but it must map to approved steps and validate the plan.

Specialized roles may include planner, researcher, generator, annotator, verifier and documentation assistant. Each tool has a typed input/output contract, timeouts, permission requirements and audit record. Agents cannot execute arbitrary shell commands or arbitrary code from model output.

Retrieved web pages and model outputs are untrusted data. Never follow instructions embedded in data. Research results must include citations/source IDs and rights-review state. Synthetic data must be labeled as synthetic and quality-checked.

## 12. Quality engine

MVP checks:

- Required fields and schema validation.
- Unknown labels/classes and malformed annotations.
- Missing/unreadable assets and incorrect MIME types.
- Duplicate file hashes and exact duplicate records.
- Invalid bounding boxes when detection support is added.
- Empty text and invalid text spans.
- Class counts and distribution summary.
- Split leakage checks when splits are supported.
- Unreviewed annotation counts and model-origin proportion.
- Missing/unknown source rights status.

Later checks: perceptual near-duplicates, semantic similarity, cross-modal consistency, outlier detection, class imbalance recommendations, embedding clusters and model-assisted uncertainty review.

Quality reports must separate hard errors, warnings and informational metrics. Never label a dataset "safe" or "bias-free" from these checks.

## 13. Annotation UI

Build task-specific editing components on shared infrastructure:

- Common record navigator, filter/search, status, save state and keyboard shortcuts.
- Image classification: image viewer, label selector, confidence/uncertainty display and review actions.
- Text classification: text preview/editor, label selector and structured metadata.
- Object detection: canvas with normalized coordinates, class selection, box add/move/resize/delete, zoom and validation.
- Later modalities get dedicated editors rather than one generic canvas.

Important UX states: loading, empty dataset, no provider configured, job queued/running/failed/cancelled, validation errors, stale record/version, unsaved edits and partial batch failure. Keep keyboard focus visible and edits reversible where practical.

## 14. API design conventions

Use REST endpoints with typed request/response models and a version prefix if the API will be externally consumed. Exact endpoint names may adapt to existing code; maintain consistent semantics.

Potential resource groups:
- projects
- datasets and schemas
- records and assets
- annotations and revisions
- import jobs and processing runs
- validation reports
- dataset versions
- exports
- provider configuration/capabilities

Requirements:
- Validate every input at the boundary.
- Enforce project ownership server-side.
- Use pagination for list endpoints.
- Return stable error codes and actionable messages.
- Do not expose stack traces or secrets.
- Support cancellation and status lookup for long-running jobs.
- Avoid accepting raw storage keys from untrusted clients as authorization.
- Keep OpenAPI documentation current.

## 15. Local/cloud deployment

### Local

Docker Compose starts web, API, worker, PostgreSQL, Redis and local asset storage. Provide health checks, migration startup guidance, a non-secret .env.example, named volumes, resource guidance and backup instructions. AI is optional. A user should be able to run manual annotation and export without an API key.

### Hosted later

Use managed PostgreSQL, object storage, queue and application deployment. Enforce tenant/project isolation, quotas, secure secret storage, upload limits, retention, backup/restore and monitoring. Keep provider keys encrypted or use a managed secret facility. Add billing only after product value and usage model are validated.

## 16. Observability

Structured logs include request/run IDs, safe error categories, durations and status transitions. Do not log secrets or full sensitive payloads. Provide per-run progress, counters and retry counts. Metrics may include import throughput, job latency, provider failure rate, estimated spend and export failures. Local telemetry should be opt-in and documented.

## 17. Key architecture decisions

- Modular monolith over microservices until measured bottlenecks justify a split.
- Explicit job state machine before general agent framework.
- Relational metadata plus object storage for media.
- Immutable annotation revisions and dataset-version manifests.
- JSONB for flexible task payloads with explicit schema validation.
- Provider adapters behind a capability-based gateway.
- Local operation as a real supported mode, not merely a developer convenience.
- Human review and rights checks as explicit states.
- Start with three tasks: image classification, text classification, then object detection.

Record material changes in docs/DECISIONS.md with context, chosen option, alternatives and consequences.

## 18. Architecture exit criteria

Architecture is adequately implemented when:
- Modules have clear boundaries and tests.
- A record can link multiple assets and annotations.
- AI and human annotations are distinguishable and revisioned.
- Background runs can resume after transient failures.
- A dataset version identifies exact record/annotation revisions.
- An export is generated from a frozen version and has a manifest.
- Local mode works without provider credentials.
- Security-sensitive boundaries have explicit validation and tests.
