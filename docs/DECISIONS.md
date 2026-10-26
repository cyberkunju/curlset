# Architecture Decision Log

This log records material decisions. New decisions should include context, the chosen option, alternatives considered and consequences. Update existing entries only when the decision genuinely changes; retain the history of important reversals.


> **Execution reference:** Implement decisions through [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) and [`PHASE_BY_PHASE_PLAN.md`](./PHASE_BY_PHASE_PLAN.md). If implementation evidence requires changing a decision, record the rationale here and update affected plans.

## ADR-001 — Dataset-first product scope

**Status:** Accepted  
**Decision:** Treat dataset engineering as the core product. Annotation, AI providers, research and generation are workflow capabilities that produce or improve dataset artifacts.

**Context:** A collection of AI agents alone would not solve the difficult parts of dataset preparation: correctness, review, provenance, versioning and portable export.

**Alternatives:** Build a general agent platform; build only an annotation editor; build only a dataset browser.

**Consequences:** Every feature should connect to records, annotations, quality checks, provenance or dataset versions. Avoid disconnected AI demos.

## ADR-002 — Modular monolith before microservices

**Status:** Accepted  
**Decision:** Start with a modular backend and separate background worker process.

**Context:** The initial team is small and the project must be approachable to individual developers and students.

**Alternatives:** Microservices, serverless-first architecture, one monolithic unstructured module.

**Consequences:** Keep module interfaces explicit and testable. Split services only after measured operational or scaling needs justify the cost.

## ADR-003 — Local-first and cloud-compatible storage

**Status:** Accepted  
**Decision:** Support local media storage in development/self-hosted deployment and an S3-compatible object-storage adapter for hosted use.

**Context:** Users may not have a cloud budget and may need to keep datasets on their own machine.

**Alternatives:** Require managed cloud storage; store all media in PostgreSQL.

**Consequences:** Keep storage behind an interface, use opaque keys, and do not make local operation dependent on cloud credentials.

## ADR-004 — PostgreSQL metadata and object storage for media

**Status:** Accepted  
**Decision:** Store relational metadata, ownership, state, relations and version references in PostgreSQL. Store large media and export artifacts as objects/files.

**Context:** The platform needs integrity and queryable relationships without putting large media blobs into relational rows.

**Alternatives:** Filesystem-only metadata; media blobs in SQL; separate database per module.

**Consequences:** Use migrations and foreign keys for core relationships; maintain explicit storage cleanup and orphan detection.

## ADR-005 — Immutable annotation revisions and dataset versions

**Status:** Accepted  
**Decision:** Keep annotation revisions append-only and published dataset versions immutable, with manifests pinning exact revision IDs.

**Context:** Dataset results must be reproducible after corrections and re-annotation.

**Alternatives:** Overwrite labels in place; snapshot complete copies of all media on every version.

**Consequences:** Current-state pointers may update, but history remains. Version manifests pin record and annotation revisions; media can be deduplicated only with safe reference/ownership semantics.

## ADR-006 — Provider-neutral model gateway

**Status:** Accepted  
**Decision:** Use a typed capability-based provider interface, with provider-specific SDKs isolated behind adapters.

**Context:** Users may use different hosted providers or local models. Core domain logic should not depend on one vendor.

**Alternatives:** Hard-code one provider; use one universal abstraction that assumes every provider supports the same capabilities.

**Consequences:** Model capabilities must be explicit and outputs normalized. Provider-specific features remain optional capabilities. Automated tests use a fake provider.

## ADR-007 — Explicit workflows before autonomous agents

**Status:** Accepted  
**Decision:** Implement deterministic workflow steps and durable job state first. Add planner/research/generation/verification agents only when the underlying tools are reliable.

**Context:** Long-running data jobs require retries, progress, cancellation and auditability. Unbounded agent loops make costs and outcomes difficult to control.

**Alternatives:** Make a multi-agent framework the core application; let an LLM execute arbitrary code or tools freely.

**Consequences:** Agents may plan and invoke approved tools but cannot bypass permissions, quotas, source policies, validation or review requirements.

## ADR-008 — Human review is explicit

**Status:** Accepted  
**Decision:** AI-generated labels begin as proposals and remain distinct from human-reviewed annotations.

**Context:** Model confidence and agreement are not guarantees of correctness.

**Alternatives:** Auto-approve all model output; rely only on model confidence thresholds.

**Consequences:** Review status is persisted, visible and tested. Any future auto-accept policy must be explicit, configurable and auditable.

## ADR-009 — JSONB for flexible payloads, explicit relational identity

**Status:** Accepted  
**Decision:** Use JSONB for task-specific annotation payloads and configuration where helpful, while keeping IDs, ownership, status, timestamps, revisions and foreign-key relations explicit.

**Context:** Image boxes, text spans and captions have different structures, but important identity and lifecycle fields need database-level integrity.

**Alternatives:** Entire application data in untyped JSON; one rigid table for every possible annotation shape.

**Consequences:** Public schemas are versioned and validated at boundaries; task-specific validation lives in dedicated modules.

## ADR-010 — Three initial task types

**Status:** Accepted  
**Decision:** Start with image classification and text classification, then add object detection with COCO and YOLO export.

**Context:** These tasks demonstrate multimodal support, manual review, model integration and geometry conversion without requiring audio/video infrastructure immediately.

**Alternatives:** Attempt to support all modalities from day one; support only one narrow data type.

**Consequences:** Do not advertise unsupported modalities. Each task must have ingestion, editing, validation, versioning and export acceptance tests.

## ADR-011 — Documentation is generated from versioned evidence

**Status:** Accepted  
**Decision:** Generate dataset cards, manifests and quality reports from a frozen dataset version and verified metadata.

**Context:** Documentation that is disconnected from actual data can invent facts or become stale.

**Alternatives:** Hand-written README only; unrestricted LLM-generated dataset claims.

**Consequences:** Unknown values remain unknown; generated text identifies limitations and links to source/version evidence.

## ADR-012 — Local mode must not silently transmit data

**Status:** Accepted  
**Decision:** External provider calls require explicit provider configuration and visible user initiation. Core manual annotation, validation and export work without external credentials.

**Context:** Local/self-hosted users may have privacy or budget constraints.

**Alternatives:** Send all uploads to a hosted model service by default; require cloud access for all workflows.

**Consequences:** Provider settings, privacy disclosure and network behavior are part of acceptance testing.

## ADR-013 — Source rights are tracked, not inferred

**Status:** Accepted  
**Decision:** Keep source retrieval separate from rights approval; represent unknown/review-required/restricted states explicitly.

**Context:** Publicly accessible content is not automatically licensed for redistribution or model training.

**Alternatives:** Treat every public URL as cleared; omit source metadata.

**Consequences:** Research and generation workflows must record source evidence and intended-use scope; export reports unresolved rights status.

## ADR-014 — No premature platform complexity

**Status:** Accepted  
**Decision:** Defer Kubernetes, complex billing, a dedicated vector database, multi-tenant administration and a general agent framework until product needs justify them.

**Context:** The target user is an individual developer/student and the first release should be maintainable by a small team.

**Alternatives:** Build production SaaS infrastructure before the core workflow is proven.

**Consequences:** Keep seams for future expansion without implementing speculative infrastructure prematurely.
