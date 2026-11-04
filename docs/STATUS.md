# Status — Measured State

Only measured facts belong here. Every number was produced by a command in this repository on the
date shown; no forward-looking claims. Capability lists come from code, not from this file.

**Measured:** 2026-11-05 (Asia/Kolkata) · `main` @ the commit containing this file. Commands below were run after the documentation consolidation.

## 1. Commands and results

| Gate | Command | Result |
|---|---|---|
| Backend tests | `pytest tests -q` | **414 passed, 1 skipped** (skip: specialist extra not installed at baseline) |
| Lint | `ruff check .` | **clean** |
| Frontend build | `cd apps/web && npm run build` | **green** (`tsc -b` + Vite) |
| Frontend unit contracts | `cd apps/web && npm test` | **pass** — 2 suites (coordinate contract, UI integrity) |
| Browser suites | `node e2e/<suite>.mjs` | 9 suites; last results in §3 |
| Optional specialist tests | `pip install -e ".[specialist]" && pytest tests/unit/test_specialist.py` | 9 tests, skipped as a module without the extra by design |

## 2. Implemented capabilities (code-derived)

| Area | State |
|---|---|
| Dataset types | 21 catalogue entries — 2 available (`text`, `image`), 4 beta (`object_detection`, `image_text`, `audio`, `document_ocr`), 15 planned |
| Task types | 6 (`text_classification`, `image_classification`, `object_detection`, `paired_image_text`, `audio_transcription`, `document_ocr`) |
| Export formats | 10 (`csv`, `jsonl`, `coco`, `yolo`, `webvtt`, `unsloth_sharegpt_vlm`, `axolotl_alpaca_chatml`, `llama_factory_bundle`, `ultralytics_yolo_v8_v11`, `image_bundle`) |
| API surface | 69 paths / 78 operations across 26 route modules |
| Frontend | 8 views; 31 components/modals (React 19 + Vite) |
| Jobs | synthetic text generation, auto-labeling, image generation, SAM box proposals; shared job record with heartbeat, measured ETA, cancel, restart recovery |
| Providers | fake (deterministic), simulated text/image experts (opt-in), OpenAI-compatible chat, Ollama-compatible, Meta image generation, SAM 3.1 detection |

## 3. Browser acceptance (Playwright + Chromium, real backend + Vite)

| Suite | Checks |
|---|---|
| `ui-smoke.mjs` | 14/14 (re-run after docs/restructure 2026-11-05) |
| `ui-large-run.mjs` | 8/8 |
| `ui-image-label.mjs` | 9/9 |
| `ui-detection-boxing.mjs` | 7/7 |
| `ui-image-gen.mjs` | 10/10 |
| `ui-dataset-types.mjs` | 20/20 |
| `ui-export-bundle.mjs` | 3/3 |
| `ui-proposals.mjs` | 6/6 |
| `logo-check.mjs` | branding/logo presence check |

Suites that call paid providers are run manually with explicit keys; deterministic suites use
simulated providers.

## 4. Live evidence (paid calls, explicitly initiated)

| Experiment | Measured result |
|---|---|
| 25-image dataset, OpenAI `gpt-image-2`, quality low | 25/25 accepted, **$0.275**, ~250 s, 1024² PNGs |
| 3-image dataset, Meta `muse-image-1.0` | 3/3 accepted, 1600² WEBP, price unknown (`priced: false`) |
| Auto-label the 25 real images (simulated panel) | 16 approved / 9 review, 22 distinct confidence values |
| SAM 3.1 box proposals, 3 real images, concept `fruit` | 3/3 images proposed, 1 box each, confidence 0.90–0.91, 1024² coordinates, `origin=model`, pending review |
| Image bundle export of the 25-image version | 24.4 MB, 25 images + 25 label rows, byte-deterministic, SHA-256 matches per image |

"Simulated panel" means the labels come from hash-based simulators, not a real vision model; label
semantics are therefore not evidence of accuracy. Real-model accuracy is an explicit experiment, not
a default claim.

## 5. Known limitations (shipped behaviour)

1. **SQLite single-writer.** Concurrent generation + labeling + review can serialize or return
   `database is locked`; WAL + busy timeout mitigate, burst concurrency is untested.
2. **In-process jobs.** Jobs die with the API process; startup marks them interrupted. One API
   replica; not a durable queue.
3. **No migration framework.** Schema changes use an additive startup column helper; a destructive
   change needs a manual step.
4. **Auth is local-only in practice.** Request identity (`X-User-Id`) is not a security boundary; RBAC
   middleware exists but hosted enforcement is not a deployment mode.
5. **Docker Compose ships the local configuration** (SQLite + local volume). PostgreSQL, Redis, S3 and
   a separate worker are not wired.
6. **Version manifests are deterministic; exporter bytes are deterministic per format** — formats that
   embed a timestamp are documented as such.
7. **Auto-labeling is classification-only.** Detection/captioning/audio routing needs its own
   validation and is not shipped.
8. **Masks are not stored** for SAM proposals — boxes only.
9. **No hosted billing, quotas at scale, SSO, or telemetry.**
10. **Specialist probe is library-only** and requires the optional `.[specialist]` extra.

## 6. Release state

- Version: `0.1.0` (not published to PyPI).
- Supported install: clone + `pip install -e .` + `npm install` (see [OPERATIONS](OPERATIONS.md)).
- Supported deployment: single-process local machine.
- CI: `.github/workflows/ci.yml` runs lint, backend tests and the frontend build (no paid providers).

## 7. Evidence pointers

- Decisions and their rationale: [DECISIONS](DECISIONS.md).
- Research measurements and their limits: [RESEARCH](RESEARCH.md) and `docs/research/`.
- Test organization and how to reproduce: [TESTING](TESTING.md).
