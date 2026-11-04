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

## ADR-015 — Local runtime baseline and modular package structure

**Status:** Accepted  
**Decision:** Standardize on Python 3.13 for backend services (`FastAPI`, `Pydantic v2`, `SQLAlchemy 2.0`) with support for SQLite for zero-setup local-first operation and PostgreSQL for production deployments. Frontend uses React + TypeScript with Vite in `apps/web`. Backend domain modules are organized into decoupled packages (`dataset_core`, `provider_gateway`, `dataset_io`, `validation`, `documentation`).

**Context:** The platform must run 100% offline out-of-the-box with zero mandatory external services (like cloud databases or paid APIs) while remaining fully compatible with Docker Compose PostgreSQL and MinIO for production.

**Alternatives:** Single monolith file; microservices; pure PostgreSQL dependency requiring Docker running on user machine at all times.

**Consequences:** Developers and students can immediately clone, run unit tests, and annotate datasets offline without needing Docker or running database daemons. When Docker Compose is used, it connects to PostgreSQL and MinIO seamlessly.

## ADR-016 — Multi-Provider API Key Management and Smart Recognition

**Status:** Accepted  
**Decision:** Provide a unified Model Providers & API Keys management interface with real-time heuristic provider auto-recognition (key prefixes, endpoint URLs, and fuzzy keywords) that loads matching SVG provider assets. The backend supports OpenAI (`OpenAIProvider` for `gpt-4o`, `gpt-4o-mini`), Anthropic Claude (`AnthropicProvider` for `claude-3-5-sonnet`, `claude-3-5-haiku`), local nodes (`OllamaProvider`), and generic OpenAI-compatible endpoints (`OpenAICompatibleProvider`). API keys are stored locally with reversible obfuscation and masked on retrieval (`sk-ant-••••••••abcd`), never exposed to browser logs or client bundles.

**Context:** Users require using external frontier models (OpenAI, Claude) and local servers with their own keys without hardcoded per-provider forms, while keeping the platform functional offline when no keys are provided.

**Alternatives:** Hardcoded separate pages for each provider; saving raw keys in plain client local storage; requiring cloud secrets manager for local development.

**Consequences:** Enables flexible multi-key workflows, unified recognition UI, dynamic model switching in AI annotation batches, and strict compliance with secret redaction and privacy principles.

## ADR-017 — Authoritative Brand Color System Specification

**Status:** Accepted  
**Decision:** Standardize on the 6-tone official Curlset brand color spectrum (`#0E121E` Brand Ink, `#1F305B` Deep Indigo, `#476BC9` Primary Blue, `#8BA5F6` Periwinkle, `#B6CBFC` Soft Sky, `#D8E1FC` Lavender Ice) for all platform branding, typography hierarchy, interactive states, surface elevations, and data visualizations. Detailed specifications, WCAG contrast matrices, and semantic CSS variable architecture are recorded in [`BRAND_COLOR_SYSTEM.md`](./BRAND_COLOR_SYSTEM.md).

**Context:** The platform requires an authentic, cohesive visual identity reflecting the official brand logo while maintaining strict WCAG Level AA/AAA contrast ratios across both light and dark desktop modes.

**Alternatives:** Arbitrary ad-hoc utility blues; monochrome-only surfaces; unstandardized hex codes across components.

**Consequences:** All future UI iterations, chart distributions, and component states reference this single source of truth for color definitions, contrast guarantees, and interaction states.

---

## D-013 — Simple Mode as the primary information architecture; generation jobs as first-class records

**Context.** The product shipped as an engineer's console (dense headers, ~12 modals, jargon). The
operator reported that a first-time user cannot see how to create data, and asked for a beginner-first
Home with two doors (Generate / Label), a plain-language wizard, live progress with a *time estimate*,
sample-guided generation, natural-language dataset editing and an advanced escape hatch.

**Decision.**
1. Home becomes the default view (`#home`): recent generation, recent projects, two primary actions, and
   Quick start that needs no project (`Scratch` project is auto-created).
2. Generation runs as a **job record** (`generation_jobs`) executed by a background thread, not a blocking
   request, so the UI can show progress, cancel, and resume after refresh.
3. ETA is **measured, never promised**: `remaining × rolling mean seconds/item`, and the API reports
   `eta_seconds: null` ("estimating…") until at least 5 items complete. No hard-coded durations.
4. Plan drafting is deterministic and offline: it extracts counts/classes and asks at most three questions
   with examples. It never claims to have understood more than it did.
5. Simple Mode never hides state that Advanced Mode needs: generated rows are still `origin=synthetic` /
   `pending_review`, gates stay all-or-nothing.

**Alternatives considered.** (a) Keep the current console and only add tooltips — rejected: the operator's
failure was structural, not explanatory. (b) Run generation synchronously with a spinner — rejected: no
cancel, no ETA, and request timeouts on larger batches. (c) LLM-drafted plans via a provider call —
deferred: requires a configured provider and a paid call for what heuristics already do acceptably; kept
as an optional enhancement.

**Consequences.** Long jobs need a process-local worker (single-process deployments only for now; a real
queue is the follow-up for multi-worker hosting). Job progress writes contended with request reads on
SQLite, mitigated with `PRAGMA busy_timeout=5000`. The ETA is honest but coarse for highly variable
providers, which is preferable to a fabricated constant.

---

## D-014 — Sample-guided generation: analyse the upload, never pretend to reproduce it

**Context.** The operator asked that generation accept a sample (files / ZIP / images) and "generate
the rest" from it. Naively promising this would be dishonest: the generator is a text LLM, so an image
sample cannot be pixel-reproduced.

**Decision.**
1. `POST /generate/analyze-sample` accepts CSV/JSONL/JSON/TXT/ZIP-or-images, runs the same upload-safety
   validator as dataset import, and infers: modality, row count, text/label columns, class counts,
   three representative samples, and a style hint (length + tone).
2. The inferred **labels + style hint + up to five seed examples** are persisted on the generation job and
   forwarded to the provider's generation request, so a real model imitates the sample instead of
   guessing. Simulated providers ignore the hint (documented).
3. Images are accepted **as a reference only**, and the API/UI say so explicitly. ZIPs are inspected for
   a text member; if there is none, the response explains that no pattern could be inferred.
4. `OpenAICompatibleProvider.generate()` is now a **real** generation call (new prompt asking for
   `{"text","label"}`), no longer an alias of `annotate()`. The alias was a correctness bug: the adapter
   advertised `text_generation` while returning classification labels, so the wizard would have generated
   nothing. Shared transport was extracted into `_chat_completion()` (same optional-parameter stripping,
   auth/rate-limit mapping, cost accounting).

**Alternatives considered.** (a) Keep image samples as full multimodal generation — rejected: not
supported by the adapter and would be a capability lie. (b) Ask the model to "understand" the sample at
generation time on every call — rejected: repeated cost and non-deterministic labels.

**Consequences.** Generation is one example per provider call; batching is a cost optimisation left for a
later phase and must not be advertised until implemented.` 

---

## D-015 — Natural-language editing as previewable, reversible change sets

**Context.** The objective requires editing datasets by natural language. Applying an LLM-parsed
instruction straight to rows would be unreviewable and could silently corrupt a dataset.

**Decision.**
1. Instructions are parsed **deterministically** into four named operations — `add_examples`,
   `reject_label`, `rename_label`, `shorten_text` — plus an explicit `unsupported` result that lists the
   supported vocabulary. Tone/style rewriting is *not* faked: it requires a provider and is reported as
   unsupported in this build.
2. Two-step API: `POST /edits/preview` never mutates and returns **real counts** computed from the
   database; `POST /edits/apply` requires `confirm=true` and records a `dataset_edits` change set.
3. Reversibility is structural, not promised: "remove labelled X" is a **review rejection** (rows are
   kept), text shortening stores the previous text, renaming appends annotation revisions and restores
   the previous schema on undo. `POST /edits/{id}/undo` replays the stored before-state.
4. `add_examples` reuses the generation job layer targeting the **existing** dataset (`create_job(...,
   dataset_id=...)`), so natural-language growth inherits the same diversity gate, label-preservation
   check and pending-review rule as every other generation path.
5. Destructive hard deletion is deliberately not offered in Simple Mode; it remains an Advanced-mode
   operation with its own confirmation.

**Alternatives considered.** (a) Let the LLM write SQL/JSON patches — rejected: unauditable and unsafe.
(b) Apply edits immediately with an implicit undo buffer in the browser — rejected: state must survive a
refresh and be auditable server-side. (c) Hard-delete rows for "remove label X" — rejected: violates the
principle that raw records are preserved; rejection is reversible and keeps provenance.

**Consequences.** Some phrasings map to nothing; the API says so with examples instead of guessing. Text
body changes are recorded in `extra_metadata.edited` and are not part of annotation revision history, so
Advanced users should re-review shortened rows before publishing.

---

## D-016 — Generation run limits are part of the contract

**Context.** UI and API disagreed: the wizard offered 1,000 examples while `per_class` was capped at 200,
so a legitimate-looking request failed with raw validation JSON.

**Decision.** Limits are explicit and shared: **≤500 per category, ≤2,000 per run**. The UI clamps to the
same numbers (`min(2000, 500 × categories)`), so it cannot produce a rejected request; the API raises a
domain error with a readable sentence for the total bound and keeps field-level validation for the rest;
the client translates validation arrays into one plain sentence rather than echoing JSON.

**Alternatives.** Silently lowering the user's requested count was rejected (surprising); removing the cap
was rejected (a 10,000-call run at one provider call per item must not be an accidental default).

---

## D-017 — In-process job runners require recovery, heartbeats and preflight

**Context.** A live run appeared stuck at 500/500. Root cause: the generation runner is a daemon thread,
so restarting the server orphaned the database row at `running`; the UI had no way to notice.

**Decision.**
1. Startup **settles orphaned jobs** (`interrupted` + readable reason) rather than leaving them running.
2. Jobs emit a **heartbeat and phase**; the API exposes `stale`, and clients must treat a
   non-terminal job without a recent heartbeat as stalled (UI shows a banner with "Stop waiting").
3. Candidate verifier models are **preflighted once** before a batch; failures are dropped and an
   unusable set fails the job immediately. Verification heartbeats every few items.
4. Generation **retries in bounded waves** to fill a shortfall caused by the diversity gate, instead of
   silently delivering a fraction of the requested count.
5. **Browser tests are part of the gate** for UI work: `npm run e2e:ui` and `npm run e2e:ui:large`
   drive Chromium and fail on console/page errors. API-only tests were proven insufficient here.

**Alternatives.** A real task queue (Celery/RQ + Redis) remains the correct multi-worker answer and is
documented as the follow-up; recovery + heartbeat makes the single-process deployment honest meanwhile.

---

## D-018 — Autonomous labelling engine (models label; humans only where models disagree)

**Context.** The operator asked that everything in the product be autonomous except the manual hand-off.
Manual labelling already existed; what was missing was a model-driven labelling path that also covers the
whole dataset without hand-holding.

**Decision.**
1. New engine (`packages/autolabel/service.py`, `POST /datasets/{id}/auto-label`) runs on the **same job
   record** as generation (`kind="auto_label"`), inheriting progress, measured ETA, cancel,
   heartbeat/staleness and restart recovery.
2. Routing is explicit: if the models **agree** and mean confidence clears the threshold (default 0.90),
   the annotation is created with `origin=ensemble` (multi-model) or `origin=model` (single) and moved to
   `approved` through a **recorded review transition** by actor `auto-labeler`. Otherwise it stays
   `pending_review` and enters the human queue. The engine never writes `origin=human`.
3. Model output is **sanitised to the dataset's label space**: an out-of-schema label gets no vote. This
   was a real bug found in verification — the simulated verifier emitted `general_inquiry` for a
   positive/negative/neutral dataset and previously cost the whole record.
4. Each record uses three short transactions (read state → call models outside any transaction → write
   annotation), avoiding SQLite write-lock contention between the runner and the API.

**Alternatives.** A separate “auto” workflow UI — rejected: it duplicates the wizard. Auto-approving
everything — rejected: it would make the precision guarantee meaningless and violate the rule that model
output is never presented as human-approved.

**Consequences.** Cost scales as `models × records` calls; the UI defaults to local/simulated models. Only
classification datasets are supported for now (the decision function is task-agnostic, but detection/OCR
routing needs its own geometry validation).

---

## Fix — class names leaked their counts ("neutral — 150 examples")

`draft_plan` split a prompt on commas and kept trailing counts in class names. Labels are now normalised
(`_clean_labels`): trailing “— N examples / N rows / (N samples)” is stripped, duplicates are removed
case-insensitively, and length is bounded. Verified on realistic prompts:
`"positive, negative, neutral — 150 examples"` → `positive, negative, neutral`.

---

## Autonomous labelling: verification

| Gate | Result |
|---|---|
| Engine integration tests | **4 passed** (decision routing, honest provenance, cancel, authz) |
| Backend suite | **365 passed** |
| Browser suite (`e2e:ui`) | **14/14** — inline auto-label: badge “2 auto-labelled · 2 need review”, queue shrinks 4 → 2, keyboard labelling still works on the review band |
| Browser large run (`e2e:ui:large`) | 8/8 |
| API E2E matrix | **112/112** |
| `ruff` / frontend build | clean / green |


---

## D-019 — Multimodal inputs flow as bytes through the gateway; simulated truth is content-addressed

**Context.** Image datasets already existed in the engine, but every model call carried only text, so image
labelling could only be manual.

**Decision.**
1. `ProviderRequest.asset_bytes` is the single transport for binary inputs; the OpenAI-compatible adapter
   converts it into a multimodal chat payload (`image_url` data URL + instruction text). Text-only calls
   keep their plain-string shape.
2. The simulated provider derives its "truth" from a hash of the asset bytes, not the model name, so
   different simulated models agree on the same image and can demonstrate the fusion/routing logic offline.
3. The autonomous engine probes models with a **real image** for image datasets; a text-only model fails at
   preflight with an actionable message rather than producing garbage labels per record.
4. The generation track stays text-only for now: no pixel synthesis is claimed without an
   `image_generation` provider (see docs/MODALITY_ROADMAP.md).


---

## D-020 — Scope: 18 dataset types acknowledged, MVP limited to text + image

**Context.** The operator listed 18 dataset types (text, image, audio, video, multimodal, tabular,
time-series, geospatial, 3D/spatial, motion/pose, graph, code, scientific, medical, sensor/IoT,
neurophysiological, robotics, transactional). Building all of them now would guarantee a shallow product.

**Decision.** Tier them (docs/DATASET_TYPES_PLAN.md):
* **MVP** = **text (done)** and **image (in progress: classification done; export bundle, object detection,
  captioning, quality surfacing remain)**.
* **Next** = audio and video.
* **Near** = types that reuse existing primitives (multimodal pairs, tabular, time-series, code,
  transactional).
* **Later** = types needing new primitives (geospatial, 3D, motion, graph, scientific/medical formats,
  sensor, neuro, robotics) — explicitly not advertised.

Every type passes the same gate before being called supported: ingestion + editor + validation +
immutable versioning + round-trip exporter + browser E2E.

**Consequences.** No UI promises for unbuilt types; the image track is the only active build track besides
MVP polish. Deadlines are deliberately not promised; slices are sequenced by dependency.


---

## D-021 — Image generation: two real providers, hard 25/run cap, explicit pricing

**Context.** The operator supplied a Meta API key (`~/.pi/agent/auth.json`) and the existing OpenAI key,
asking for real image-dataset generation with tight cost control (≤25 images per test dataset, low/medium
quality). Probing found OpenAI `gpt-image-2` at `/images/generations` and Meta `muse-image-1.0` at
`https://api.meta.ai/v1` (OpenAI-compatible response shape, WEBP output).

**Decision.**
1. Both are `IMAGE_GENERATION`-only providers registered at startup when `ENABLE_LIVE_IMAGE_PROVIDERS=true`
   and their keys are present in the environment. Keys are never committed; the server reads env vars.
2. **Hard cap 25 images per run**, enforced in the API (`le=25`) and the service. UI offers 2/4/8/12/25.
3. Default quality **low**; medium/high selectable. Generation supports image-classification datasets.
4. Cost is configuration: `IMAGE_PRICES` (per model/quality) with gpt-image-2 defaults; Meta pricing is
   unknown and reported as `priced: false`, never as $0.
5. Each image becomes an asset + record + `synthetic` annotation at `pending_review` with prompt/provider
   lineage; progress, measured ETA, cancel and restart recovery reuse the job record.

**Consequences.** A 25-image gpt-image-2 low run costs ≈$0.275 and took ~250 s in this environment.
Object-detection datasets cannot be generated this way (they need boxes), and simulated `IMAGE_CLASSIFICATION`
models remain hash-based, so semantic accuracy claims require a real vision model run (not done here).


---


---

## D-022 — Dataset-type catalogue is the single source of truth; non-text requests always confirm

**Context.** A natural-language request ("i need an dataset for bottle labeling … detect the label
mistakes") was silently turned into a **text_classification** dataset: the detector only knew a handful
of keywords, the wizard had no type switch, and Home had no type chooser.

**Decision.**
1. `packages/dataset_core/dataset_types.py` + `GET /api/v1/dataset-types` define every known dataset type
   with an honest status — **available** (text, image), **beta** (object detection, image+text, audio,
   document/OCR), **planned** (the rest of the 18-type taxonomy). The UI must not hard-code this.
2. Natural-language detection scores the prompt against a weighted lexicon covering all types (multi-word
   phrases weigh more). Any **non-text** detection — or low confidence — inserts a mandatory
   "What kind of dataset is this?" question with the detected type preselected; the wizard also always
   shows a type selector. Silent text fallback is gone.
3. Home gets a **New dataset** chooser listing all types grouped by status; planned types are disabled,
   beta types create a dataset and open it for import/annotation, available types continue to the wizard.
4. Object-detection datasets can now be **generated as base images** (no annotations): detection needs
   human/detector boxes, so the engine stores images only and hands off to the workbench.

**Consequences.** Planned types cannot be selected and make no promise in the UI. Detection generation
costs the same per image as classification generation (≤25/run). The detector is deterministic and
offline; it is a draft the user confirms, never a hidden classification.


---

## D-023 — Image exports must carry pixels and a machine-readable label mapping

**Context.** Version exports bundled asset files under `assets/<original filename>`, which is neither
collision-safe nor linked to labels: a user could not rebuild the dataset from the archive.

**Decision.** New `image_bundle` export format:
* `images/<index>_<safe-stem>.<ext>` — index-prefixed names, sorted by record id, byte-identical to the
  stored asset; each row's `asset_sha256` lets a consumer verify the pixels.
* `labels.jsonl` + `labels.csv` — record id, image path, decided label, split, annotation origin,
  review status, confidence, asset id/hash, dimensions, mime, synthetic flag and generation lineage.
  Unannotated records export with `label: null` (never a fabricated label).
* `images/README.md` explains how to re-import; canonical `manifest.json` and dataset card stay.
* The generic formats keep their existing layout. Text-only datasets get a clear 422 for `image_bundle`.

**Consequences.** Archives are larger (the pixels are included) but self-contained and deterministic;
same version + format → identical bytes. This is the format to hand to a trainer or to archive.


---

## D-024 — SAM 3.1 for box proposals: contract, provenance and idempotency

**Context.** The operator asked whether SAM 3.1 works in the product. It did not: probing showed
`/chat/completions` returns 404 ("use /v1/responses") and `/v1/responses` returns **special-token text**,
not prose. Docs confirmed the format and the confidence switch.

**Decision.**
1. `packages/provider_gateway/sam_provider.py` implements `OBJECT_DETECTION` for `meta-sam`:
   Responses API, `stream: true`, one concept noun phrase per call, parses
   `<0f>id<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..;c=..|><|mask;…|>` into canonical boxes
   (`x, y, width, height` in source pixels); masks are parsed but **not stored** yet.
   Confidence is requested via `metadata: {"include_confidence": "true"}` (metadata values are strings;
   the top-level parameter is rejected).
2. `POST /datasets/{id}/proposals/detect` runs a bounded job (≤50 records, ≤3 concepts) and stores each
   record's merged boxes as a `model`/`pending_review` annotation with `coordinate_system=pixel-intrinsic`,
   image dimensions, `proposed_by` and concepts. **Never auto-approved.**
3. Concepts must be classes of the dataset (box labels are validated against the schema at job creation).
4. Re-running proposals updates the existing pending model annotation (a revision) instead of duplicating it.
5. UI: detection datasets get a **Propose boxes (AI)** action with progress/ETA and a result banner;
   the workbench renders the proposals for accept/edit/delete.

**Consequences.** SAM calls are billed by the Meta API (usage reported as zero tokens for these image
calls in our probes; pricing unknown in this build). Detection quality depends on the concept phrasing
(one concrete noun phrase); the model returns zero matches legitimately. Masks remain a future slice.
