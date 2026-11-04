# Architecture Decision Log

One decision per entry. Status is one of `Accepted`, `Superseded by ADR-NNN`, or `Deprecated`.
A superseded decision stays here for history. Product status lives in [STATUS](STATUS.md); future work
in [ROADMAP](ROADMAP.md); measured research that changed a decision is cited inline.

---

## ADR-001 — Dataset-first product scope

**Status:** Accepted
**Decision:** Dataset engineering (ingestion, provenance, review, quality, versioning, export) is the
product. Generation, labeling and AI providers are workflow capabilities that produce or improve
dataset artifacts.
**Context:** A collection of AI agents alone would not solve correctness, review, provenance,
versioning and portable export.
**Alternatives:** A general agent platform; only an annotation editor; only a dataset browser.
**Consequences:** Every feature must connect to records, annotations, quality, provenance or versions.
No disconnected AI demos.

## ADR-002 — Modular monolith before microservices

**Status:** Accepted
**Decision:** One backend process composed of explicit packages, plus an in-process job runner.
**Context:** The project is maintained by a small team and must be approachable to individuals.
**Alternatives:** Microservices, serverless-first, one unstructured module.
**Consequences:** Module boundaries are explicit and testable. A real queue/worker split is deferred
until concurrency is a measured problem ([ROADMAP](ROADMAP.md)).

## ADR-003 — Local-first, storage behind an interface

**Status:** Accepted
**Decision:** Local filesystem storage is the default; all access goes through a storage interface so
an S3-compatible backend can be added without touching domain code.
**Context:** Users may have no cloud budget and may need data to stay on their machine.
**Alternatives:** Require object storage; store media blobs in the database.
**Consequences:** Opaque storage keys; local operation never depends on cloud credentials. S3 is not
implemented yet ([ROADMAP](ROADMAP.md)).

## ADR-004 — PostgreSQL metadata and object storage for media

**Status:** Superseded by ADR-015
**Decision (historical):** Use PostgreSQL for relational metadata and object storage for media.
**Context:** Integrity and queryable relationships without media blobs in relational rows.
**Consequences:** The shipped default is SQLite; PostgreSQL remains an intended hosted deployment
option but is not wired (no driver, no migrations). `docker-compose.yml` runs the shipped configuration.

## ADR-005 — Immutable annotation revisions and dataset versions

**Status:** Accepted
**Decision:** Annotation revisions are append-only; published dataset versions are immutable and pin
exact record + annotation revision IDs in a canonical manifest.
**Context:** A dataset must be reproducible after corrections and re-annotation.
**Alternatives:** Overwrite labels in place; copy all media per version.
**Consequences:** Current-state pointers may update; history remains. Export and diff read from the
manifest, never from mutable tables.

## ADR-006 — Provider-neutral, capability-typed gateway

**Status:** Accepted
**Decision:** All model access goes through a typed capability interface; provider SDKs/HTTP adapters
sit behind it; outputs are normalized and validated before persistence.
**Context:** Users mix hosted and local models; core logic must not depend on one vendor.
**Alternatives:** Hard-code one provider; one universal abstraction assuming identical capabilities.
**Consequences:** Capabilities are explicit (`TEXT`, `IMAGE_INPUT`, `STRUCTURED`, `EMBEDDINGS`,
`IMAGE_GENERATION`, `OBJECT_DETECTION`); a missing capability is rejected before any call; tests use
deterministic fake providers.

## ADR-007 — Explicit workflows before autonomous agents

**Status:** Accepted
**Decision:** Deterministic workflow steps and durable job state first; agents may plan and call
approved tools but cannot bypass permissions, budgets, validation or review.
**Context:** Long jobs need retries, progress, cancellation and auditability; unbounded agent loops
make cost and outcome control impossible.
**Consequences:** No free-form agent loop in the product; generation and labeling are bounded jobs.

## ADR-008 — Human review is explicit

**Status:** Accepted
**Decision:** Machine output starts as a proposal and is distinguishable from human-reviewed
annotations forever. Auto-approval is a recorded review transition with a machine actor.
**Context:** Model confidence and agreement are not guarantees of correctness.
**Alternatives:** Auto-approve all model output; trust confidence alone.
**Consequences:** Origin and status are persisted, visible and tested. Any auto-accept policy must be
configurable and auditable.

## ADR-009 — JSON payloads, explicit relational identity

**Status:** Accepted
**Decision:** Task-specific payloads are JSON (`annotation.payload`, `extra_metadata`), while IDs,
ownership, status, timestamps, revisions and foreign keys are explicit columns.
**Context:** Boxes, spans, captions and transcripts differ structurally; identity/lifecycle need
database integrity.
**Consequences:** Payload schemas are versioned and validated at boundaries; task validation lives in
dedicated modules.

## ADR-010 — Task-type rollout order

**Status:** Accepted
**Decision:** Text classification and image classification first, then object detection, paired
image+text, audio transcription, document OCR.
**Context:** These demonstrate multimodal support, review and geometry without requiring video
infrastructure immediately.
**Consequences:** Do not advertise a task type without ingestion + editor + validation + versioning +
round-trip export + browser acceptance.

## ADR-011 — Documentation generated from versioned evidence

**Status:** Accepted
**Decision:** Dataset cards, manifests and quality reports are generated from a frozen version and
verified metadata; unknown values stay unknown.
**Alternatives:** Hand-written claims; unrestricted LLM-generated dataset claims.
**Consequences:** No fabricated fields in exports; limitations are stated in the generated card.

## ADR-012 — Local mode must not silently transmit data

**Status:** Accepted
**Decision:** External calls require explicit provider configuration and visible user initiation;
manual annotation, validation and export work with no credentials.
**Consequences:** Privacy mode and network behavior are part of acceptance testing; secrets live in
environment config, never in the browser bundle.

## ADR-013 — Source rights are tracked, not inferred

**Status:** Accepted
**Decision:** Retrieval and rights approval are separate; unknown/review-required/restricted are
explicit states. A public URL is not a licence.
**Context:** Publicly accessible content is not automatically licensed for redistribution or training.
**Consequences:** Source evidence and intended-use scope are stored; exports report unresolved rights.
The append-only rights ledger is designed but not shipped ([ROADMAP](ROADMAP.md)).

## ADR-014 — No premature platform complexity

**Status:** Accepted
**Decision:** Defer Kubernetes, billing, vector databases, multi-tenant admin and agent frameworks
until product needs justify them.
**Consequences:** Keep seams without implementing speculative infrastructure.

## ADR-015 — Local runtime baseline and package layout

**Status:** Accepted
**Decision:** Python ≥3.11, FastAPI + Pydantic v2 + SQLAlchemy 2, SQLite by default for zero-setup
local operation; React + TypeScript + Vite in `apps/web`; domain code in decoupled `packages/*`.
**Context:** The platform must run offline out of the box with no mandatory external services.
**Consequences:** SQLite is the documented default; PostgreSQL/S3/queue are future deployment work.
The API package owns wiring and settings; packages own behaviour.

## ADR-016 — Multi-provider key management and credential handling

**Status:** Accepted
**Decision:** Providers are configured in the UI or environment; saved keys are stored server-side
(masked on retrieval, redacted from logs), never shipped to the browser bundle. Provider recognition
uses key prefixes/endpoints to prefill the right adapter.
**Context:** Users want to plug in multiple providers without editing files, while keeping the
platform functional offline.
**Alternatives:** Separate hard-coded page per provider; keys in browser localStorage.
**Consequences:** Keys are secrets at rest and in logs; the API never returns them unmasked. Environment
variables remain the recommended path for automated deployments.

## ADR-017 — Brand colour system

**Status:** Superseded by the design tokens in [UI](UI.md)
**Decision (historical):** Six-tone blue brand spectrum (`#0E121E`, `#1F305B`, `#476BC9`, `#8BA5F6`,
`#B6CBFC`, `#D8E1FC`) for all branding and UI state.
**Context:** The UI redesign moved to a neutral-first surface with a single interaction blue.
**Consequences:** The authoritative palette is now the CSS token set documented in [UI](UI.md)
(`#FAFAFA`/`#FFFFFF` surfaces, `#18181B` primary text/actions, `#2563EB` interaction and brand accent).
Do not reintroduce the superseded palette.

---

## D-013 — Simple Mode is the primary information architecture; jobs are first-class records

**Status:** Accepted
**Decision:**
1. Home is the default view with two doors (Generate / Label), recent work and a no-project Quick
   start (auto-created `Scratch` project).
2. Generation runs as a job record executed by a background thread so the UI can show progress,
   cancel, and survive refresh.
3. ETA is measured, never promised: `remaining × rolling mean seconds/item`, `null` until enough
   samples; no hard-coded durations.
4. Plan drafting is deterministic and offline: it extracts counts/classes and asks at most three
   questions with examples.
5. Simple Mode never hides state Advanced Mode needs: generated rows remain `synthetic` /
   `pending_review`; gates stay all-or-nothing.
**Alternatives:** Console + tooltips (structural failure, rejected); synchronous spinner (no cancel,
timeouts); LLM-drafted plans (deferred: paid call for what heuristics already do acceptably).
**Consequences:** In-process worker (single process only; queue is future work); SQLite write
contention mitigated with `busy_timeout`; coarse but honest ETA.

## D-014 — Sample-guided generation analyses an upload; it never pretends to reproduce it

**Status:** Accepted
**Decision:**
1. `POST /generate/analyze-sample` accepts CSV/JSONL/JSON/TXT/ZIP/images through the same upload-safety
   validator, and infers modality, row count, text/label columns, class counts, representative samples
   and a style hint.
2. Inferred labels, style hint and up to five seed examples are persisted on the job and forwarded to
   the provider so a real model imitates the sample; simulated providers ignore the hint (documented).
3. Images are accepted **as a reference only** and the API/UI say so. A ZIP with no text member
   explains that no pattern could be inferred.
4. `OpenAICompatibleProvider.generate()` is a real generation call requesting `{"text","label"}`;
   it is not an alias of `annotate()` (the alias advertised text generation while returning labels).
**Consequences:** One example per provider call; batching is a future cost optimisation and is not
claimed.

## D-015 — Natural-language editing as previewable, reversible change sets

**Status:** Accepted
**Decision:**
1. Instructions parse deterministically into four operations (`add_examples`, `reject_label`,
   `rename_label`, `shorten_text`) plus an explicit `unsupported` result listing supported vocabulary.
   Tone/style rewriting needs a provider and is reported unsupported in this build.
2. `POST /edits/preview` never mutates and returns real counts; `POST /edits/apply` requires
   `confirm=true` and records a change set.
3. Reversibility is structural: "remove label X" is a review rejection (rows kept); text shortening
   stores previous text; renaming appends annotation revisions and restores the previous schema on undo.
4. `add_examples` reuses the generation job layer targeting the existing dataset, inheriting the same
   diversity gate, label-preservation check and pending-review rule.
5. Hard deletion is not offered in Simple Mode; it stays an Advanced operation with confirmation.
**Consequences:** Some phrasings map to nothing and say so with examples. Text-body changes are
recorded in `extra_metadata.edited`, not annotation revisions, so shortened rows should be re-reviewed.

## D-016 — Generation run limits are part of the contract

**Status:** Accepted
**Decision:** ≤500 per category, ≤2,000 per run; the UI clamps to the same numbers; the API raises a
readable domain error for the total bound and keeps field-level validation otherwise; the client
translates validation arrays into one sentence.
**Context:** UI offered 1,000 while the API capped at 200, producing raw validation JSON.
**Consequences:** No silent lowering of requested counts; no accidental 10,000-call run.

## D-017 — In-process job runners require recovery, heartbeats and preflight

**Status:** Accepted
**Decision:**
1. Startup settles orphaned `running` jobs as `interrupted` with a readable reason.
2. Jobs emit heartbeat and phase; the API exposes `stale`; clients treat a non-terminal job without a
   recent heartbeat as stalled.
3. Verifier candidates are preflighted once before a batch; unusable sets fail the job immediately.
4. Generation retries in bounded waves to fill shortfalls caused by the diversity gate.
5. Browser tests are part of the gate for UI work.
**Context:** A live run appeared stuck at 500/500 because a server restart orphaned the thread.
**Alternatives:** Real queue (Celery/RQ + Redis) is the correct multi-worker answer, deferred.
**Consequences:** Recovery + heartbeat makes the single-process deployment honest meanwhile.

## D-018 — Autonomous labeling engine (models label; humans review the disagreement)

**Status:** Accepted
**Decision:**
1. `packages/autolabel/service.py` + `POST /datasets/{id}/auto-label` run on the shared job record
   (`kind="auto_label"`), inheriting progress, measured ETA, cancel and recovery.
2. If models agree and mean confidence clears the threshold (default 0.90), the annotation is created
   with `origin=ensemble` (multi-model) or `origin=model` (single) and moved to `approved` through a
   recorded transition by actor `auto-labeler`; otherwise it stays `pending_review`.
3. Model output is sanitised to the dataset's label space; an out-of-schema label gets no vote.
4. Each record uses three short transactions (read → call models outside a transaction → write) to
   avoid SQLite write-lock contention.
**Consequences:** Cost scales as `models × records`; only classification datasets are supported for
auto-labeling (detection routing needs geometry validation).

## D-019 — Multimodal inputs flow as bytes through the gateway; simulated truth is content-addressed

**Status:** Accepted, amended by D-021
**Decision:**
1. `ProviderRequest.asset_bytes` is the single transport for binary inputs; the OpenAI-compatible
   adapter converts it to an `image_url` data URL plus instruction text.
2. Simulated providers derive truth from a hash of the asset bytes, so different simulated models agree
   on the same image and the fusion/routing logic is demonstrable offline.
3. The autonomous engine preflights image datasets with a real image; a text-only model fails at
   preflight with an actionable message.
4. Generation was text-only at the time; D-021 adds real image generation.
**Consequences:** Image labeling works offline with simulated models; semantic accuracy claims require
a real vision model run and are not claimed by default.

## D-020 — Scope: dataset-type taxonomy is tiered; MVP is text + image

**Status:** Accepted, amended by D-022
**Decision:** Tier every known dataset type by status (`available`, `beta`, `planned`) and make the
catalogue the source of truth. A type passes the same gate before being called supported: ingestion +
editor + validation + immutable versioning + round-trip export + browser acceptance.
**Consequences:** No UI promises for unbuilt types; the code catalogue (21 entries: 2 available,
4 beta, 15 planned) is authoritative and exposed at `GET /api/v1/dataset-types`.

## D-021 — Image generation: two real providers, hard 25/run cap, explicit pricing

**Status:** Accepted
**Decision:**
1. OpenAI `gpt-image-2` and Meta `muse-image-1.0` are `IMAGE_GENERATION`-only providers registered at
   startup when `ENABLE_LIVE_IMAGE_PROVIDERS=true` and their keys are present in the environment.
2. Hard cap **25 images per run**, enforced in API (`le=25`) and service; UI offers 2/4/8/12/25.
3. Default quality `low`; medium/high selectable.
4. Cost is configuration: `IMAGE_PRICES` with gpt-image-2 defaults; an unknown price is reported as
   `priced: false`, never `$0`.
5. Each image becomes an asset + record + `synthetic` annotation at `pending_review` with prompt/provider
   lineage; progress/ETA/cancel/recovery reuse the job record.
**Consequences:** A 25-image low-quality gpt-image-2 run cost ≈$0.275 and took ~250 s in this
environment. Object-detection datasets can only generate base images (no boxes). Simulated
classification models are hash-based; semantic accuracy claims need a real vision run (done for image
labeling: see [STATUS](STATUS.md)).

## D-022 — Dataset-type catalogue is the single source of truth; non-text requests always confirm

**Status:** Accepted
**Decision:**
1. `packages/dataset_core/dataset_types.py` + `GET /api/v1/dataset-types` define every known type with
   an honest status; the UI must not hard-code the list.
2. Natural-language detection scores the prompt against a weighted lexicon covering all types; any
   non-text detection or low confidence inserts a mandatory "What kind of dataset is this?" question
   with the detected type preselected; the wizard always shows a type selector. Silent text fallback
   is gone.
3. Home has a New-dataset chooser listing all types grouped by status; planned types are disabled.
4. Object-detection datasets can be generated as base images without annotations and handed to the
   workbench.
**Context:** A request for a bottle-labeling dataset was silently turned into text classification.
**Consequences:** Planned types cannot be selected and make no promise. Detection generation costs the
same per image as classification generation (≤25/run).

## D-023 — Image exports carry pixels and a machine-readable label mapping

**Status:** Accepted
**Decision:** New `image_bundle` format: `images/<index>_<safe-stem>.<ext>` (collision-safe, stable
order, byte-identical to stored assets), `labels.jsonl` + `labels.csv` (record id, image path, label,
split, origin, review status, confidence, asset SHA-256, dimensions, MIME, synthetic flag, generation
lineage; unannotated rows export `label: null`), `images/README.md` explaining re-import, plus the
canonical manifest and dataset card. Text-only datasets get a clear 422.
**Consequences:** Larger but self-contained, byte-deterministic archives. This is the archive format.

## D-024 — SAM 3.1 box proposals: contract, provenance and idempotency

**Status:** Accepted
**Decision:**
1. `meta-sam` implements `OBJECT_DETECTION` on the Meta Responses API: `stream: true`, one concept
   noun phrase per call, parses the special-token box grammar into canonical pixel boxes; masks are
   parsed but not stored. Confidence is requested via `metadata: {"include_confidence": "true"}`
   (a string; the top-level parameter is rejected by the API).
2. `POST /datasets/{id}/proposals/detect` runs a bounded job (≤50 records, ≤3 concepts) and stores
   merged boxes as a `model`/`pending_review` annotation with `coordinate_system=pixel-intrinsic`,
   image dimensions, `proposed_by` and concepts. Never auto-approved.
3. Concepts must be classes of the dataset (validated at job creation).
4. Re-running proposals updates the existing pending model annotation (a revision) instead of
   duplicating it.
5. UI: detection datasets get **Propose boxes (AI)** with progress/ETA and a result banner; the
   workbench renders proposals for accept/edit/delete.
**Consequences:** SAM calls are billed by Meta (usage reported as zero tokens in probes; pricing
unknown in this build). Detection quality depends on concept phrasing; zero matches is a valid result.

## D-025 — Research corpus is shipped as read-only evidence; product claims cite it

**Status:** Accepted
**Decision:** The 31 research documents (~970 KB) that drove the ensemble, synthetic-data, evaluation,
rights and competitive decisions are shipped under [`docs/research/`](research/README.md), together
with the three small result JSONs. The 3.8 GB of source captures and model checkpoints are not
committed. Product docs may cite a research file only with a measured number and denominator.
**Consequences:** Claims become auditable; the repository stays small; research that contradicts the
shipped design is documented rather than hidden (see [RESEARCH](RESEARCH.md) §4).

## D-026 — The dataset-local specialist probe is optional, cross-fitted and separate from routing

**Status:** Accepted
**Decision:** `packages/dataset_ensemble/specialist.py` fits a logistic probe on frozen embeddings for
this dataset's own labels, with grouped out-of-fold estimates, cluster-bootstrap intervals and a
risk/coverage curve. It is exposed as a library + tests only (not a UI feature yet), and requires the
optional `.[specialist]` extra (numpy + scikit-learn) so the base install stays small.
**Context:** Research showed the panel's correlated blind spot caps aggregation at 89.67%; a
complementary dataset-local probe is the measured way to add headroom, but it must be cross-fitted to
avoid self-scoring.
**Consequences:** Estimates are honest by construction; routing into the panel uses the existing
`route_with_specialist` (product integration remains on the [ROADMAP](ROADMAP.md)).
