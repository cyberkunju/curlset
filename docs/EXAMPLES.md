# Examples

One runnable end-to-end tutorial, then the fixture index. All commands are against the local API
(`http://127.0.0.1:8000`) with the server running ([OPERATIONS](OPERATIONS.md)).

## 1. Text classification, start to export

### 1.1 Create project and dataset

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/projects \
  -H 'Content-Type: application/json' -d '{"name":"Support Tickets"}'
# → {"id":"prj_...", ...}

curl -s -X POST http://127.0.0.1:8000/api/v1/projects/prj_.../datasets \
  -H 'Content-Type: application/json' \
  -d '{"name":"tickets-v1","task_type":"text_classification","label_schema":{"labels":["billing","technical","account"]}}'
# → {"id":"ds_...", ...}
```

### 1.2 Import labeled rows

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/datasets/ds_.../import/file \
  -F 'file=@examples/text_support_tickets.csv'
```

The response reports `accepted_items`; import is idempotent by content hash, so re-uploading the same
file does not duplicate records.

### 1.3 Review

```bash
curl -s 'http://127.0.0.1:8000/api/v1/datasets/ds_.../queue?limit=50'
curl -s -X POST http://127.0.0.1:8000/api/v1/datasets/ds_.../review/bulk \
  -H 'Content-Type: application/json' \
  -d '{"record_ids":["rec_a","rec_b"],"action":"approve","reason":"spot-checked"}'
```

Alternatively use the UI: open the dataset → **Annotate** → keyboard `1`–`9` to label, `Enter` to save.

### 1.4 Validate, version, export

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/datasets/ds_.../validate
# → {"is_publishable": true, "blocking_count": 0, ...}

curl -s -X POST http://127.0.0.1:8000/api/v1/datasets/ds_.../versions \
  -H 'Content-Type: application/json' -d '{"version_tag":"1.0.0"}'
# → {"id":"ver_...", "record_count": N, "manifest_hash":"..."}

curl -s -X POST http://127.0.0.1:8000/api/v1/versions/ver_.../exports \
  -H 'Content-Type: application/json' -d '{"format":"jsonl"}'
# → {"id":"exp_...", "sha256":"...", "byte_size":...}

curl -sL http://127.0.0.1:8000/api/v1/exports/exp_.../download -o tickets-v1.zip
```

Every archive contains the format file(s), `manifest.json` (pinned revisions) and the dataset card.
Deterministic formats re-export byte-identically.

## 2. Image classification with generation (paid, explicit)

```bash
# requires ENABLE_LIVE_IMAGE_PROVIDERS=true + provider key; hard cap is 25 images
curl -s -X POST http://127.0.0.1:8000/api/v1/datasets/ds_.../generate-images \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a single ripe apple on a white background","count":4,"provider":"openai-image","model":"gpt-image-2","quality":"low"}'
# → job payload; poll GET /api/v1/generate/jobs/{id}
```

Then auto-label the images and export the self-contained bundle:

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/datasets/ds_.../auto-label \
  -H 'Content-Type: application/json' -d '{"provider":"simulated-vision","model":"sim-vision-1"}'
# review the pending band in the UI, then freeze a version and export
# {"format":"image_bundle"} → images/ + labels.jsonl + labels.csv + manifest.json
```

Cost note: image APIs bill per image; the price shown is configured, and an unknown provider price is
reported as `priced: false`, never as free.

## 3. Object detection with SAM 3.1 proposals

1. Create an `object_detection` dataset with classes (e.g. `["bottle"]`).
2. Import images or generate base images (no boxes).
3. From the dataset page click **Propose boxes (AI)** → boxes arrive at `pending_review` with
   `proposed_by=meta-sam`, pixel coordinates and confidence.
4. Review/delete boxes in the canvas; export COCO, YOLO, Ultralytics or `image_bundle`.

API equivalent:

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/datasets/ds_.../proposals/detect \
  -H 'Content-Type: application/json' \
  -d '{"concepts":["bottle"],"provider":"meta-sam","model":"sam-3.1","limit":10}'
```

Proposals are never auto-approved. Re-running updates the pending proposal instead of duplicating it.

## 4. Natural-language editing

```bash
# preview first — never mutates
curl -s -X POST http://127.0.0.1:8000/api/v1/datasets/ds_.../edits/preview \
  -H 'Content-Type: application/json' -d '{"instruction":"remove the account label"}'

# apply with explicit confirmation, then undo if needed
curl -s -X POST http://127.0.0.1:8000/api/v1/datasets/ds_.../edits/apply \
  -H 'Content-Type: application/json' -d '{"instruction":"remove the account label","confirm":true}'
curl -s -X POST http://127.0.0.1:8000/api/v1/datasets/ds_.../edits/{change_set_id}/undo
```

Supported vocabulary: add examples, reject a label, rename a label, shorten text; anything else returns
an explicit `unsupported` result with examples.

## 5. Fixtures in this repository

| Fixture | Rows | Use |
|---|---|---|
| `examples/text_support_tickets.csv` | 12 | quick labeled text import (documented tutorial) |
| `examples/text_support_tickets.jsonl` | 12 | same rows, JSONL import |
| `examples/text_intents_200.csv` | 200 | larger classification fixture |
| `examples/text_intents_hard.csv` | 300 | hard/templated fixture used by the research experiments |
| `apps/web/e2e/fixtures/images-samples.zip` | 3 images | image import path in browser tests |
| `scripts/seed_demo_dataset.py` | demo project/dataset | zero-cost seeded demo |

All fixtures are synthetic content authored for this repository and distributed under the repository
licence (MIT). Demo/brand images in `brand-assets/` and `apps/web/src/assets/` are project-owned. No
third-party dataset is redistributed.

## 6. Where the numbers come from

Dataset type/export counts, test counts and live experiment results are not repeated here. See
[STATUS](STATUS.md) for measured state and [RESEARCH](RESEARCH.md) for research measurements and their
limits.
