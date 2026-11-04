# Operations — Setup, Configuration, Providers, Backup

Status: current and verified on 2026-11-05. This is the supported deployment path.

## 1. Prerequisites

- Python ≥ 3.11
- Node.js ≥ 20 (Vite 6 / React 19)
- No database server, Redis or Docker required for the supported local path.

## 2. Native local setup

```bash
# backend
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # macOS/Linux
pip install -e .
cp .env.example .env            # edit if needed

# seed a demo dataset (no paid calls)
python scripts/seed_demo_dataset.py

# run API
uvicorn services.api.main:app --host 127.0.0.1 --port 8000 --reload

# run web (second terminal)
cd apps/web
npm install
npm run dev                     # http://localhost:5173
```

Health checks: `GET /api/v1/health`, `GET /api/v1/readiness`, OpenAPI at `/docs`.

Optional ML extra (dataset-local specialist probe):

```bash
pip install -e ".[specialist]"
```

## 3. Environment variables

`.env.example` is the canonical template. Groups:

| Variable | Default | Meaning |
|---|---|---|
| `ENVIRONMENT` | `development` | deployment label |
| `API_HOST` / `API_PORT` / `WEB_PORT` | `127.0.0.1` / `8000` / `5173` | bind addresses |
| `SECRET_KEY` | placeholder | must be changed for any non-local deployment |
| `DATABASE_URL` | `sqlite:///./data/dataset_platform.db` | SQLAlchemy URL; SQLite is supported, PostgreSQL is not wired |
| `STORAGE_BACKEND` | `local` | only `local` is implemented |
| `LOCAL_STORAGE_DIR` | `./data/storage` | raw asset directory |
| `WORKER_MODE` | `inline` | job execution mode; jobs are in-process |
| `PRIVACY_MODE` | `local_only` | `allow_external` permits explicitly configured external calls |
| `ALLOW_SIMULATED_PROVIDERS` | `false` | registers deterministic simulated experts (offline demos/tests) |
| `ENABLE_LIVE_IMAGE_PROVIDERS` | `false` | registers OpenAI/Meta image generation from env keys |
| `MAX_UPLOAD_SIZE_BYTES` | 100 MB | per-file upload limit |
| `MAX_ARCHIVE_ENTRY_COUNT` | 1000 | ZIP entry limit |
| `MAX_DECOMPRESSED_SIZE_BYTES` | 500 MB | decompression limit |
| `MAX_PARSING_TIMEOUT_SECONDS` | 60 | safe parser timeout |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | — | OpenAI-compatible provider (chat + image generation) |
| `META_API_KEY` / `META_BASE_URL` | — | Meta image generation and SAM 3.1 |
| `PROVIDER_PRICES` / `IMAGE_PRICES` | built-in defaults | JSON price tables; unknown price is reported `priced: false`, never `$0` |

Never commit `.env`, keys, tokens or real datasets. The backend reads keys from the environment or the
provider-credentials store; the browser bundle never receives them.

## 4. Providers

| Provider | Capabilities | Notes |
|---|---|---|
| `fake` | text + detection (deterministic) | used by tests and offline demos |
| simulated experts | text classification, image classification, image generation | must be enabled with `ALLOW_SIMULATED_PROVIDERS`; hash-based "truth", clearly labelled |
| OpenAI-compatible | text, image input, structured output | set `OPENAI_API_KEY`; base URL optional |
| Ollama-compatible local | text, image input | point at a local OpenAI-compatible endpoint; no key required |
| `openai-image` | image generation (`gpt-image-2`) | requires `ENABLE_LIVE_IMAGE_PROVIDERS` |
| `muse-image` | image generation (`muse-image-1.0`) | Meta key; price unknown in this build |
| `meta-sam` | object detection (`sam-3.1`) | Meta key; boxes only, pending review |

Cost rules:

- image generation is hard-capped at **25 images per run** (API and service);
- quality defaults to `low`;
- every paid run must be initiated by the user, with a visible provider choice;
- unknown pricing is surfaced as `priced: false`, never as free.

## 5. Tests and build

```bash
pytest tests -q                 # backend suite (no paid providers)
ruff check .                    # lint
cd apps/web && npm run build    # type-check + production build
cd apps/web && npm test         # coordinate + UI-integrity contracts
cd apps/web && node e2e/ui-smoke.mjs   # browser suite (API + Vite must be running)
```

Browser suites need the API on `:8000` and Vite on `:5173`; they fail on console/page errors.
See [TESTING](TESTING.md).

## 6. Backup and restore

```bash
python scripts/backup_restore.py backup --output ./backups/backup_latest.tar.gz
python scripts/backup_restore.py verify --input ./backups/backup_latest.tar.gz
```

The backup covers the SQLite database and `LOCAL_STORAGE_DIR` with a SHA-256 manifest. Restoring into a
different directory requires stopping the API first.

## 7. Docker (local configuration only)

```bash
docker compose up --build -d      # api :8000, web :5173, SQLite + local volume
```

Compose runs exactly the supported stack. It does **not** provide PostgreSQL, Redis, S3 or a distributed
worker; those are [ROADMAP](ROADMAP.md) items E1–E3.

## 8. Data lifecycle

- Assets are copied into `LOCAL_STORAGE_DIR` with content hashes; originals on the user's disk are not
  modified.
- Deleting a dataset is an Advanced-mode operation; exports and versions are artifacts on disk.
- Restarting the API marks interrupted jobs and settles them; no automatic retry.
- Logs never include API keys; error responses are redacted.

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `database is locked` | concurrent writes on SQLite | reduce concurrent jobs; WAL + busy timeout are enabled; see limitations in [ARCHITECTURE](ARCHITECTURE.md) |
| Job stuck `running` after restart | orphaned in-process thread | restart settles it as `interrupted`; re-run the job |
| No image provider listed | live providers disabled or key missing | set `ENABLE_LIVE_IMAGE_PROVIDERS=true` and the key, restart |
| Unknown image cost | provider price not configured | add to `IMAGE_PRICES`; the UI reports `priced: false` rather than guessing |
| Browser suite fails with console error | Vite/API stale or unreachable | restart both, then re-run the suite |
| `npm run build` fails on Windows with an esbuild temp error | temp-dir permissions | set `TMP`/`TEMP` to a writable directory before building |
| Upload rejected | size/entry/timeout limits | adjust the `MAX_*` variables deliberately; do not bypass in code |

## 10. Security notes

- Local mode is not hardened for exposure to the internet: `X-User-Id` is not authentication.
- Do not publish a deployment until E6 in [ROADMAP](ROADMAP.md) is done.
- Rotate any key that was ever pasted into a chat or committed by mistake; secret scanning is the
  contributor's responsibility, not automation's.
- Report vulnerabilities per [SECURITY](../SECURITY.md). Never open a public issue with an exploit.
