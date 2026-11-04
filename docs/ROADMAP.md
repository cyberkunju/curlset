# Roadmap — Unfinished Work Only

Delivered work is recorded in [CHANGELOG](../CHANGELOG.md) and [STATUS](STATUS.md). This file contains
only what is **not** done. No dates are promised; items are ordered by dependency and value.

## 1. Engineering foundations

| # | Item | Why | Size |
|---|---|---|---|
| E1 | Durable job queue (Redis/RQ or Postgres-backed) + real worker process | In-process threads die with the API; one replica only | M |
| E2 | PostgreSQL support with migrations (Alembic, batch mode) | Hosted deployment, concurrent writers | M |
| E3 | Object storage adapter (S3-compatible) behind the existing storage interface | Hosted media storage, backups | M |
| E4 | Content-addressed asset storage (CAS) + fail-closed missing-asset handling | Byte-identity, dedup, reproducible manifests | M |
| E5 | Split statement vs envelope hashing; stop hashing wall-clock/version id | Byte-reproducible dataset identity | S |
| E6 | Real authentication (OIDC/SSO) and enforced RBAC | The current `X-User-Id` is not a boundary | M |
| E7 | PostgreSQL full-text/search and pagination audit across list endpoints | Scale behaviour | S |
| E8 | Structured logging/metrics (no telemetry by default) | Operability | S |

## 2. Labeling and quality (research-backed)

| # | Item | Why | Size |
|---|---|---|---|
| L1 | Persist per-item model predictions and per-source out-of-fold estimates | Required for any honest audit/certificate | S |
| L2 | Rescue-audit API + per-item router UI (engine and router already exist) | Research: aggregation is capped by correlated errors; routing is the lever | M |
| L3 | Specialist probe productised (embedding extraction + grouped CV + router) | Measured complementarity; today library-only | M |
| L4 | Finite-population certification gate with a refusing publish action | Only defensible accuracy statement; 95% currently impossible | M |
| L5 | Rights ledger (append-only) + three-valued publish gate (cleared/unknown/restricted) | EU AI Act Art. 10 / licence evidence | M |
| L6 | Quality engine split (structural, embeddings, dedup, label-errors, leakage, report) + ranked label-error queue gated on measured probe precision | Current quality output is coarse | L |
| L7 | Blind deferral review UX (two annotators + adjudication, no model answer shown) | Research: showing the model answer reduces consensus | M |
| L8 | De-templated gold set (300+ unique stems) + grouped CV harness | Current fixture overstates accuracy | M |
| L9 | Evaluation reporting: per-item rows, confidence intervals, McNemar, frozen run identity | Bare metrics are not defensible | S |

## 3. Modalities and generation

| # | Item | Why | Size |
|---|---|---|---|
| M1 | Audio wizard (ingest → transcribe → review → export), Meta `muse-voice-transcribe-1.0` | `audio` is beta; wizard missing | M |
| M2 | Video support (frames, tracking, WebVTT/COCO sequences) | Catalogue `video` is planned | L |
| M3 | Image captioning (paired image+text) end-to-end | `image_text` is beta | M |
| M4 | Image quality/duplicate surfacing for image datasets | Text quality has it; images don't | M |
| M5 | Detection-in-wizard flow (base images → propose → review in one path) | Today proposals live on the dataset page | S |
| M6 | SAM mask storage/overlay (boxes only today) | Research: masks are the pixel-precise artifact | M |
| M7 | Multi-concept detection in one proposal run (currently ≤3 concepts, one call each) | Cost/UX | S |
| M8 | Cost dashboard + budget guardrails across jobs | Spend visibility | S |
| M9 | Synthetic-share guard on generated datasets (cap ~30% researched) | Model-collapse risk | S |
| M10 | Prefer construction-time labels for images (copy-paste/augmentation) over prompt-only synthesis | Research: +1.5 box / +3.6 mask AP baseline | L |

## 4. Dataset-type rollout

Statuses are owned by `packages/dataset_core/dataset_types.py`; planned types (15) graduate only when
the full gate passes: ingestion + editor + validation + immutable versioning + round-trip export +
browser acceptance.

Next candidates, in dependency order: `image_text` (captioning), `audio` (wizard), `video`, then
`multimodal` bundles, `tabular`, `time_series`, `code`, `transactional` (reuse existing primitives);
later: geospatial, 3D/spatial, motion/pose, graph, scientific, medical, sensor/IoT, neurophysiological,
robotics.

## 5. UX and product

| # | Item | Why | Size |
|---|---|---|---|
| U1 | Provider-side plan drafting (LLM) as an opt-in upgrade of the deterministic planner | Better prompts/sample understanding | S |
| U2 | Batching for generation calls (one call per example today) | Cost | M |
| U3 | Export presets per trainer target in the UI (formats exist; UI lists them plainly) | Discoverability | S |
| U4 | Hard-delete flows with confirmation in Advanced mode | Only reversible edits exist today | S |
| U5 | Internationalisation / accessibility audit (keyboard paths covered, a11y audit not) | Reach | M |

## 6. Explicitly not planned

Training or hosting models, a general BI tool, Kubernetes, billing at scale, "autonomous labeling
without review", and any claim of legal clearance or guaranteed correctness.

## 7. Dependencies

- L2/L3 need L1; L4 needs L1 + L8; L5 is independent; L6/L7 depend on L1.
- E2/E3/E1 are prerequisites for hosted multi-user operation.
- M1 needs audio ingestion (beta) + transcription provider integration.
