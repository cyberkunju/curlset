# Changelog

Dated record of delivered work. This is a record, not a promise: future work is in
[docs/ROADMAP.md](docs/ROADMAP.md), current measured state in [docs/STATUS.md](docs/STATUS.md).

Dates reflect repository history. The project began 2026-10-25 (history imported/renamed; first public
commit date is 2026-10-26).

## 2026-11-05 — Repository and documentation overhaul

- Consolidated 22 overlapping documents into a single source of truth per topic
  ([docs/README.md](docs/README.md)): requirements, architecture, modalities, labeling, UI, operations,
  testing, status, roadmap, decisions, examples, research, competitive analysis.
- Shipped the research corpus as read-only evidence (`docs/research/`, 31 documents + result JSONs) and
  added [docs/RESEARCH.md](docs/RESEARCH.md) digest with measured limits.
- Added `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, GitHub CI (`ruff`, backend tests, specialist
  tests, frontend build + contract tests), issue/PR templates.
- Simplified `docker-compose.yml` to the supported local stack (API + web, SQLite + local volume);
  removed unsupported PostgreSQL/Redis/worker claims.
- Renamed `brand assests/` → `brand-assets/`, organized `scripts/` into ops/experiments/fixtures,
  added `docs/assets/` screenshots.
- Added optional `.[specialist]` extra and shipped `packages/dataset_ensemble/specialist.py`
  (grouped cross-fitting, cluster bootstrap, risk/coverage, rescue router hook) with tests.
- Completed `.gitignore`, `.env.example` (providers, image flags, prices) and `AGENTS.md` references.

## 2026-11-04 → 2026-11-05 — Image, detection and export track

- OpenAI `gpt-image-2` and Meta `muse-image-1.0` image generation with a hard 25-image cap, explicit
  pricing and `priced: false` for unknown prices; live run: 25/25 images, ≈$0.275.
- Image auto-labeling fixed to forward real asset bytes; live run: 16 approved / 9 review.
- SAM 3.1 box proposals (`meta-sam`, Meta Responses API, special-token box grammar) with bounded jobs,
  schema validation, pending-review provenance and idempotent re-runs; live run 3/3 images.
- `image_bundle` export: real images + label mapping + provenance + manifest, byte-deterministic,
  round-trip re-import tested; live export 24.4 MB / 25 images.
- Dataset-type catalogue (21 entries; available/beta/planned) and natural-language type detection; no
  silent text fallback; New-dataset chooser.
- Natural-language dataset editing (preview/apply/undo change sets) and sensitive-artifact cleanup.

## 2026-11-03 → 2026-11-04 — Text MVP, ensemble and simple mode

- Text MVP contract and acceptance suite; canonical text normalization; labeled import fixtures;
  exporters preserve real text (no fabricated placeholders).
- Server-derived annotation provenance and enforced review transitions (machines cannot write `human`).
- Calibrated multi-model ensemble pseudo-labeling with routing bands and per-record votes; research
  documented the 89.67% correlated-error ceiling and retired aggregation accuracy claims.
- Autonomous labeling engine with confidence routing and recorded `auto-labeler` approvals.
- Background generation jobs with measured ETA, cancel, heartbeat, stall detection and restart
  recovery; bounded retry waves; sample-guided generation.
- Simple-mode UX: Home with Generate/Label doors, plan → questions → progress wizard, one-click
  hand-off to labeling; advanced mode retains granular controls.

## 2026-10-26 → 2026-10-27 — Platform foundation

- Domain model, review state machine, persistence, REST API, React shell, project/dataset management.
- Safe multimodal ingestion (MIME checks, path traversal guards, ZIP limits, duplicate detection),
  asset storage, annotation workspace, reviews and revisions.
- Provider gateway (fake, Ollama, OpenAI-compatible), validation and quality engine, dataset card
  generation, immutable versioning and manifests.
- Export adapters (CSV, JSONL, COCO, YOLO, WebVTT), source discovery with SSRF defense and rights
  review, synthetic data with lineage, active learning/evaluation surfaces.
- UI redesign and remediation (neutral-first palette, motion system, accessibility, 5-stage lifecycle
  dock) over 2026-10-27 → 2026-10-28.
- PostgreSQL/Redis/MinIO orchestration was scaffolded in this period and has since been reduced to the
  supported local stack; the hosted work is now tracked in the roadmap.

## 2026-10-25 — Project start

- Product contract, architecture, requirements, phased execution plan and initial decisions committed
  before code (first public commit date: 2026-10-26).
