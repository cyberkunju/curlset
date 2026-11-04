# Architecture

Status: current. This document describes what is actually deployed in this repository, not the
aspirational stack. [DECISIONS](DECISIONS.md) records why; [ROADMAP](ROADMAP.md) records what is not
built.

## 1. Shape

A modular monolith with four runtime parts:

```
┌──────────────┐      ┌──────────────────────────────┐      ┌──────────────────┐
│ React 19 SPA │ ───▶ │ FastAPI backend (services/api)│ ───▶ │ SQLite metadata  │
│ Vite :5173   │      │ 78 operations / 26 routers   │      │ + filesystem CAS │
└──────────────┘      └──────────────┬───────────────┘      └──────────────────┘
                                     │
                     in-process background job threads
                                     │
                             provider gateway (HTTP)
                       fake / Ollama / OpenAI-compatible / Meta
```

- **Frontend**: React 19 + TypeScript + Vite 6. Hash router, 8 views, modal-based tools.
- **API**: FastAPI + Pydantic v2; 26 route modules, 69 paths / 78 operations; OpenAPI at `/docs`.
- **Persistence**: SQLAlchemy 2 + SQLite (`DATABASE_URL`); additive SQLite column helper on startup;
  no migration framework yet (see limitations).
- **Blobs**: `LocalStorageBackend` writes raw assets under `LOCAL_STORAGE_DIR`; storage is accessed
  only through `get_storage_backend()` so an S3 implementation can be added without touching domain
  code.
- **Jobs**: daemon threads in the API process, with heartbeat (`updated_at`), `phase`, `stale`
  detection, cancel, and startup recovery (`recover_interrupted_jobs`). No Celery/Redis.

## 2. Package map

| Package | Responsibility |
|---|---|
| `dataset_core` | Domain models, constants, provenance enums, review state machine, ID generation, DB session, dataset-type catalogue, annotation selection |
| `dataset_io` | Ingestion, format parsing, safety limits, text normalization, storage backends |
| `dataset_quality` | Structural validation, duplicates, split leakage, distribution findings |
| `dataset_evaluation` | Metrics, confusion matrix, calibration, clustering/coverage, active-learning surfaces |
| `dataset_versioning` | Immutable versions, canonical manifest, manifest hash, dataset card |
| `dataset_export` | 10 exporters and deterministic ZIP assembly (incl. `image_bundle`) |
| `dataset_ensemble` | Calibration, weighted aggregation, routing bands, rescue router, dataset-local specialist probe |
| `autolabel` | Autonomous labeling engine (preflight, confidence routing, review writes) |
| `dataset_edits` | Natural-language edit planning, preview, apply, undo |
| `dataset_synthesis` | Synthetic text generation pipeline and diversity checks |
| `generation_jobs` | Plan drafting, dataset-type detection, job queueing, background execution, live ETA |
| `image_generation` | Cost-bounded image dataset generation (OpenAI/Meta), ≤25 images per run |
| `detection_proposals` | SAM 3.1 box proposals for object detection, pending review |
| `provider_gateway` | Provider abstraction, capability guards, pricing, HTTP adapters, fake/simulated providers |
| `dataset_security` | RBAC, quotas, rate limiting, audit log, request identity |
| `dataset_sources` | Safe URL discovery, SSRF defense, rights-review fields |

`services/api` wires these packages into routers and owns settings (`services/api/config.py`).
`services/api/worker.py` is a heartbeat stub, not a job worker; jobs run in-process.

## 3. Domain model (essential)

```
Project 1─n Dataset 1─n DatasetRecord 1─n Annotation 1─n AnnotationRevision
                    │            └─n RecordAsset n─1 Asset
                    ├─n DatasetVersion 1─n VersionItem (pins record + annotation revision)
                    └─n ExportArtifact, GenerationJob(shared table, kind ∈ generate|auto_label|image_generation|detection_proposals)
```

Rules encoded in the model:

- `Asset` stores `sha256`, MIME, dimensions/duration and storage key; bytes never live in the DB.
- `Annotation` separates `origin` (who produced it) from `status` (review state); revisions are
  append-only; a published version pins exact revisions.
- `DatasetVersion` stores a canonical manifest + SHA-256; published versions are immutable.
- `GenerationJob` is shared across job kinds and exposes one progress contract (`status`, `phase`,
  `processed_items`, `total_items`, `eta_seconds`, `result_json`).

## 4. Review state machine

```
pending_review ──approve──▶ approved
      │  ▲                  │
      │  └─reopen───────────┘
      ├──reject──▶ rejected
      └──request_correction──▶ needs_correction ──approve/reject──▶ …
```

- Transitions are validated in one place (`AnnotationService.transition`), recorded with actor and
  reason, and exposed as revision history.
- Origin/status are derived server-side. A machine cannot write `human`; auto-approval is allowed
  only through a recorded transition whose actor is the `auto-labeler`.

## 5. Provenance

| Field | Values | Meaning |
|---|---|---|
| `origin` | human, model, ensemble, imported, synthetic, augmented | who/what produced the payload |
| `status` | pending_review, approved, rejected, needs_correction | review state |
| annotation revision | append-only rows | immutable history |
| job record | provider, model, prompt hash, seed, limits | how a machine annotation was produced |

Exports and manifests carry the same fields; `image_bundle` additionally carries per-image SHA-256.

## 6. Jobs

Every long-running operation uses the same pattern:

1. create a `GenerationJob` row with `kind`, config, total items;
2. start a daemon thread (`start_*_job`) with heartbeat updates every few records;
3. stream progress through `GET /generate/jobs/{id}` (measured ETA: rolling average, `null` until
   enough samples — never a fabricated number);
4. honour cancel (`cancelling` → `cancelled`);
5. on process restart, mark orphaned `running` jobs `interrupted` and allow retry;
6. write results transactionally per record; a failed record never kills the run.

Job kinds: synthetic text generation, auto-labeling, image generation, detection proposals.

## 7. Provider gateway

- All model calls go through `ProviderGateway` server-side; the browser never sees keys.
- Capabilities are explicit (`TEXT`, `IMAGE_INPUT`, `STRUCTURED`, `EMBEDDINGS`,
  `IMAGE_GENERATION`, `OBJECT_DETECTION`); a provider that lacks a capability is rejected before any
  call.
- Payload normalization + validation happens inside each provider; the gateway records latency and
  usage when provided.
- Providers in the default test configuration: `fake` (deterministic), plus simulated text/image
  experts when `ALLOW_SIMULATED_PROVIDERS=true`. Live providers: any OpenAI-compatible endpoint,
  Meta (image generation, SAM 3.1), and Ollama-compatible local runtimes. See [OPERATIONS](OPERATIONS.md).
- Pricing is explicit: known prices produce a cost estimate; an unknown price is reported as
  `priced: false`, never `$0`.

## 8. Trust boundaries

- Uploads: untrusted; validated MIME, size, entry counts, decompression limits and timeouts.
- Provider output: untrusted data; parsed, schema-validated, then stored at `pending_review`.
- URLs for source discovery: SSRF-checked against private ranges and unsupported schemes.
- Secrets: read from environment only; redacted from logs and error responses.
- Auth: local mode uses a request identity header with a default user; hosted RBAC exists in
  `dataset_security` but is not a deployment mode yet (see limitations).

## 9. Deployment reality (as shipped)

- Local: `uvicorn` + Vite, SQLite + local filesystem. This is the supported path.
- Docker: `Dockerfile.api` and `Dockerfile.web` build the two services; `docker-compose.yml` runs
  exactly those two (local storage volume, SQLite file). PostgreSQL/Redis/MinIO are **not** wired.
- Hosted multi-tenant operation requires the work listed in [ROADMAP](ROADMAP.md) (PostgreSQL,
  migrations, queue worker, object storage, auth providers).

## 10. Known architectural limitations

1. SQLite is a single-writer database; concurrent generation + labeling + review may serialize or
   hit `database is locked`. WAL mode and busy timeouts mitigate; burst concurrency is untested.
2. In-process jobs die with the API process; recovery marks them interrupted, but it is not a durable
   queue. One API replica only.
3. No migration framework: schema changes use a startup additive-column helper. A destructive change
   needs a manual migration step.
4. Version manifests are deterministic, but exports are not byte-identical if a format embeds a
   generation timestamp (documented per format).
5. Auth is local-only in practice; `X-User-Id` is not a security boundary.
