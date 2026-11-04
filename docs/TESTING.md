# Testing

Status: current. Numbers are reported in [STATUS](STATUS.md), not here.

## 1. Layout

```
tests/
  conftest.py              shared fixtures (temp DB, storage, TestClient)
  unit/                    28 files — pure domain logic, math, parsers, providers
  integration/             35 files — FastAPI endpoints against a real temp SQLite DB
apps/web/
  tests/                   node contract tests (coordinates, UI integrity)
  e2e/                     Playwright + Chromium browser suites (9)
```

Backend total: **63 test files**. Browser suites are intentionally co-located with the frontend because
they drive the Vite dev server.

## 2. Backend

- `pytest tests -q` runs everything with `asyncio_mode=auto`; no network and no paid providers are
  required. Providers are fakes/simulated or mocked transports.
- Integration tests create their own SQLite database and storage directory; the shared dev DB is never
  touched.
- Tests that need optional heavy dependencies use `pytest.importorskip`: `tests/unit/test_specialist.py`
  is skipped unless `pip install -e ".[specialist]"` is present.
- Provider tests cover malformed responses, timeouts, rate limits, parameter retries and cost
  reporting; export tests cover round trips and byte determinism; security tests cover auth boundaries
  and untrusted uploads.

## 3. Frontend

```bash
cd apps/web
npm test           # coordinate contract + UI integrity (node, no browser)
npm run build      # tsc -b + vite build — type errors fail the build
npm run e2e:ui     # browser smoke (needs API :8000 + Vite :5173)
npm run e2e:ui:large
npm run e2e:ui:image
```

Additional browser suites are plain scripts (run individually):

| Suite | Covers |
|---|---|
| `ui-smoke.mjs` | home, simple-mode generation, review, export basics |
| `ui-large-run.mjs` | large generation job, progress/ETA, cancel |
| `ui-image-label.mjs` | image import, thumbnails, auto-label hand-off |
| `ui-detection-boxing.mjs` | canvas draw/save, empty-box guard |
| `ui-image-gen.mjs` | image generation flow, 25-image clamp, cost display |
| `ui-dataset-types.mjs` | type chooser, NL detection confirmation |
| `ui-export-bundle.mjs` | image bundle export option |
| `ui-proposals.mjs` | SAM proposals button → progress → workbench boxes |
| `logo-check.mjs` | logo/brand asset presence |

Rules for browser tests:

- They must fail on console/page errors.
- They must not require paid providers; deterministic suites use simulated models. Suites that call a
  paid provider are run manually with explicit keys and are documented as live evidence.
- Screenshots produced during a run are local artifacts (`apps/web/e2e/screenshots/`, git-ignored).

## 4. CI

`.github/workflows/ci.yml` runs on push/PR:

1. `ruff check .`
2. `pytest tests -q` (with `DATABASE_URL`/`LOCAL_STORAGE_DIR` pointed at a temp directory)
3. `cd apps/web && npm ci && npm run build`

CI never installs paid providers or calls external APIs. The `.[specialist]` extra is installed in a
separate job so the probe's tests run rather than skip.

## 5. Adding a test

- Domain math/parser change → unit test next to the module.
- API behaviour change → integration test asserting status code, payload and persisted side effects.
- UI behaviour change → extend the relevant Playwright suite; a UI change without a browser check is not
  accepted.
- Bug fix → regression test that fails on the old code path (state the failure in the PR/commit).
- Never weaken assertions, skip a relevant test or delete a failing test to get green. If a test is
  environment-dependent, mark the exact blocker in [STATUS](STATUS.md).

## 6. Fixtures and policy

- Small, deterministic fixtures live in `tests/` and `examples/`; no real credentials, private data or
  large media.
- Demo images/fonts tracked in the repo are product fixtures, not test datasets; their licences are
  documented in [EXAMPLES](EXAMPLES.md).
- A browser suite may reference a seeded dataset by ID; such IDs are documented in the suite itself and
  must be reproducible with `scripts/seed_demo_dataset.py` or an equivalent setup step.

## 7. Known environment notes

- SQLite write contention can cause rare flakes when integration tests share an in-process job runner;
  each test module uses its own database to avoid this.
- `pytest-asyncio` emits deprecation warnings about loop scope; they are warnings, not failures.
- On Windows, `npm run build` can fail if the esbuild temp directory is not writable — set `TMP`/`TEMP`
  to a writable path.
