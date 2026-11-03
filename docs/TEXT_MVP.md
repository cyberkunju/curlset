# TEXT MVP — End-to-End Contract (target: ship-ready)

**Product aim:** a **text dataset generator + labeler** that produces *high-accuracy, training-ready* text
datasets. This document is the acceptance contract for the text vertical slice. It is authoritative over
`docs/*` where they conflict, because it is verified by executable tests.

**Status:** IN PROGRESS. A criterion is met only when its acceptance test passes.

---

## 0. Canonical data contract (the one decision everything else hangs off)

For text tasks (`text_classification`, and `paired_image_text`/instruction pairs), a record is:

| Location | Field | Meaning | Mutability |
|---|---|---|---|
| `Record.extra_metadata["text"]` | **input text** | The sample's content. **Source of truth.** | Immutable once imported |
| `Record.extra_metadata["label"]` | proposed label | Label that arrived *with* the data (CSV/JSONL). Never authoritative. | Immutable once imported |
| `Record.extra_metadata["split"]` | `train/val/test/unassigned` | Split hint from the data file | Immutable once imported |
| `Annotation.payload["label"]` | **decided label** | The reviewed label. **Authoritative.** | Append-only revisions |
| `Annotation.origin` | `human/model/imported/rule_generated/synthetic/augmented` | Who produced *this* annotation | Server-derived only |
| `Annotation.status` | `proposed/pending_review/approved/rejected/needs_correction/invalid` | Review state | Server-derived only |

**Rules**
1. `metadata.text` is the *only* place input text is read from by all features (workspace, AI labeling,
   quality, clustering, token simulation, exports). `Annotation.payload["text"]` is **not** a text field for
   `text_classification`.
2. Imported pre-labeled data becomes an `Annotation(origin="imported", status="pending_review")`. It is
   **never** auto-approved.
3. `origin`, `status` and `actor_id` are **never** accepted from a request body. They derive from the
   authenticated actor + the action performed.
4. There is exactly **one** active-annotation selector
   (`packages/dataset_core/annotation_selector.py`) used by quality, versioning, evaluation, queue, clustering.

---

## 1. Acceptance criteria

Each criterion maps to a test in `tests/integration/test_text_mvp_acceptance.py`.

### A. Import
- **A1** CSV (RFC 4180, quoted fields) → one record per row; `metadata.text` and `metadata.label` populated via
  column aliases (`text|sentence|content|prompt|input|question|document`, `label|category|class|intent|target|sentiment`).
- **A2** JSONL and JSON-array → same normalization; unknown keys preserved.
- **A3** `.txt` file → one record per non-empty line, content in `metadata.text` (and stored as a text asset for lineage).
- **A4** A file with a malformed row (stray column / missing text) is **rejected at row level** with a row number
  and reason; the good rows import; **no orphan record is created**.
- **A5** Import is **atomic per record**: a mid-file failure never leaves a committed record without its run item.
- **A6** Optional `split` column assigns `train/val/test`; otherwise the dataset-level split applies. Invalid split → row rejected.
- **A7** A row whose `label` is present and inside the dataset `label_schema` creates
  `Annotation(origin="imported", status="pending_review", payload={"label": ...})`; a label outside the schema is a
  row-level rejection (not a silent metadata write).
- **A8** Rows with empty/whitespace text are rejected (row-level), not imported.
- **A9** Re-importing the same file content **into the same split** does not duplicate text records (dedupe by
  `(split, normalized-text hash)`). The same content imported into a **different split** is allowed and recorded,
  because cross-split duplicates are a leakage signal that quality rules must be able to see.

### B. Labeling
- **B1** Manual `text_classification` label via `POST /records/{id}/annotations` creates
  `origin="human"`, `status="pending_review"` regardless of what the client sent; an explicit
  `POST /annotations/{id}/transition` performs approve/reject/correction and writes a `ReviewEvent`.
- **B2** Client-supplied `origin`/`status`/`actor_id` are ignored/rejected — forging an approved human label is
  impossible over HTTP. (Regression test for the study's C1.)
- **B3** AI labeling (`POST /datasets/{id}/ai-annotate`) reads `metadata.text`, writes proposals with
  `origin="model"`, `status="pending_review"`, model/run provenance, and never auto-approves.
- **B4** Bulk review: `POST /datasets/{id}/review/bulk` approves/rejects a list of record ids with one audited call.
- **B5** A record can hold multiple annotations (imported + model + human); the active one follows the shared selector.

### C. Quality
- **C1** New blocking rule `RULE_EMPTY_TEXT`: a text-task record with no/blank `metadata.text` is blocking.
- **C2** New rule `RULE_DUPLICATE_TEXT`: normalized duplicate text content across records is a **warning**.
  Its primary purpose is to surface cross-split duplicates (train/test leakage); see A9 for why same-split
  duplicates are deduped at import.
- **C3** Unresolved/pending review, OOV label and class imbalance continue to work for text datasets.
- **C4** Validation is deterministic (same dataset → identical report hash) and **never validates a different
  annotation than the one a version will freeze** (shared selector).

### D. Freeze
- **D1** `POST /datasets/{id}/versions` freezes the *selector-chosen* annotation and `metadata.text`; manifest
  `records[].metadata.text` and `records[].annotation.payload.label` are present.
- **D2** Publication blocked while any record is unreviewed (existing behaviour preserved).
- **D3** Version immutability: no API path mutates a published version; hash is reproducible from the manifest bytes.

### E. Export
- **E1** `jsonl` and `csv` exports contain the real text and the decided label; no fabricated placeholders.
- **E2** `unsloth_sharegpt_vlm`, `axolotl_alpaca_chatml`, `llama_factory_bundle` use **real** text
  (`metadata.text`, falling back to `payload.text` only for audio/OCR) — never
  "Classify this sample." / "Sample instruction" / "Target answer" / "positive" fabrications.
- **E3** Split-aware: train/val files contain the records of their split; an empty val split yields an empty
  file, never a copy of train.
- **E4** Byte-deterministic export: same version + format twice → identical SHA-256.

### F. Accuracy (the "high accuracy" claim, made honest)
- **F1** `POST /datasets/{id}/evaluation/run` scores **approved ground truth** against
  **model-origin proposals** for the same records; it never compares a label to itself.
  Ground truth = `status="approved"` with `origin ∈ {human, imported}` (imported labels are
  pre-existing truth from a labeled file; model/synthetic/rule_generated output never qualifies).
  The report states which was used via `gold_source` (`human_approved` / `imported_approved` /
  `human_and_imported_approved`) and `gold_origins`. `allow_imported_gold=false` restricts to human-only.
- **F2** With no comparable pairs it returns HTTP 422 with a clear reason (not a green 0 % or 100 % card).
- **F3** The report includes `total_samples`, `accuracy`, per-class P/R/F1, confusion matrix, and
  `gold_source`/`candidate_source` provenance.
- **F4** A run is persisted and retrievable (`GET /datasets/{id}/evaluation/runs`) bound to
  dataset id, model/provider, and timestamp.
- **F5** A synthetic sanity check: given a known fixture, the reported accuracy equals the hand-computed value.

### G. UI
- **G1** Text dataset flow is usable end-to-end: create dataset (label schema) → import CSV → label → approve →
  validate → freeze → export.
- **G2** No SPA crash on the Evaluation cluster tab (contract mismatch guarded + app-level ErrorBoundary).
- **G3** Accuracy is displayed with sample count and provenance; no unconditional "Accuracy 100 %" or
  "Safe to freeze" claims.

---

## 2. Out of scope for this MVP
Object detection geometry correctness, audio/video, S3/Postgres/Redis, real multi-tenant auth (we do
*server-derived* semantics, not full login), image generation, model training.

## 3. Definition of done
1. `tests/integration/test_text_mvp_acceptance.py` — all criteria pass.
2. Existing suite still green (no regression in the 153 tests).
3. `ruff check` clean for touched files.
4. The demo seed produces a text dataset that works end-to-end in the UI.
5. No new AGENTS.md §10 violations introduced.

---

## 4. Status — COMPLETE (2026-11-04)

**Executed evidence (Lead-run, central):**

| Gate | Command | Result |
|---|---|---|
| Full backend suite | `pytest tests -q` (clean isolated DB) | **260 passed, 0 failed, 20.2 s** (153 baseline + 107 new) |
| Independent acceptance | `tests/integration/test_text_mvp_acceptance.py` | **31 passed** — A1–A9, B1–B5, C1–C4b, D1–D3, E1–E4, F1–F5, G1 all PASS |
| **Real provider labeling** | `tests/integration/test_text_real_provider_labeling.py` | **3 passed** — production `OpenAIProvider` performs real `httpx` POSTs to an OpenAI-compatible endpoint (local stub, no key), 15/15 proposals `pending_review` with provenance, accuracy **1.0 on 15 hand-computed pairs**, plus malformed-output and auth-failure isolation |
| Lint | `ruff check .` | **All checks passed** |
| Frontend build | `npm run build` (`tsc -b && vite build`) | **PASS** — 2 430 modules, 3.70 s, index chunk 463.57 kB (123.21 kB gzip) |
| Frontend contract tests | `npm test` | **PASS** — both suites, all 6 integrity groups |
| **Live HTTP demo** (`demo_text_mvp_live.py`) | real uvicorn + Vite, 22 assertions | **22/22 PASS** — import → label → bulk approve → validate → freeze → 5 exports (real text, no placeholders, identical sha256) → AI label → accuracy `n=15` with provenance → UI proxy |

**Follow-up defects found during verification and then fixed:**
- Paired image+text ZIP used to write the text **filename** into `metadata.text`; it now stores the decoded
  **content** (bounded) and keeps filenames under `paired_text_filename` / `paired_image_filename`.
- Import dedupe is **split-aware**: same content in the same split is deduped (A9), the same content in a
  different split is recorded so `RULE_DUPLICATE_TEXT` can expose train/test leakage (C2).
- Evaluation gold accepts `origin ∈ {human, imported}` (pre-existing labels from a labeled file are real
  ground truth) with `gold_source` provenance and an `allow_imported_gold` opt-out; model output is never gold.
- **Real provider path verified end to end** (`test_text_real_provider_labeling.py`): the production
  `OpenAIProvider` adapter is exercised over real HTTP against an OpenAI-compatible stub —
  credentials are registered through `POST /api/v1/provider-credentials`, the bearer key and
  `response_format: json_object` reach the wire, model output is parsed/validated into
  `origin="model"` / `status="pending_review"` proposals carrying `provider`/`model` provenance, and the
  accuracy evaluator scores them against gold (15/15 = 1.0 by construction). Auth failure and malformed
  JSON are isolated per record (`failed_items`), never persisted as labels and never corrupting the dataset.
- **Annotation precedence (intentional):** when a record already has an approved gold label, a new
  unapproved model proposal does not block publishing and never enters the frozen manifest — the version
  freezes the approved annotation. Verified in the real-provider test (manifest origins are all
  `imported`, no `model` row leaks into an immutable snapshot).

**What changed in the product (by criterion):**
- **A** — one canonical row pipeline for CSV / JSONL / JSON / `.txt`; alias detection; per-row savepoint
  atomicity (fixes the orphan-record bug); row-numbered rejections; optional label → `imported` +
  `pending_review` annotation; content-hash dedupe; split column support.
- **B** — `origin`/`status`/`actor_id` are no longer accepted from request bodies; manual labels are always
  `human` + `pending_review`; decisions require an explicit FSM transition; new
  `POST /api/v1/datasets/{id}/review/bulk`; record detail/queue expose the selector-chosen annotation.
  (Closes the study's C1 forging hole: a forged `approved` body can no longer unlock publishing.)
- **C** — `RULE_EMPTY_TEXT` (blocking) and `RULE_DUPLICATE_TEXT` (warning); quality and freeze share
  `annotation_selector.select_active_annotation`, so the audited annotation is provably the frozen one.
- **D** — manifests carry `metadata.text` + the decided label; publication still blocked while unreviewed.
- **E** — JSONL/CSV/ShareGPT/Alpaca/LLaMA-Factory emit **real** text and labels with zero placeholder
  fabrications; empty `val` stays empty; exports are **byte-deterministic** (`ZipInfo` epoch 1980 +
  sorted members) so the recorded SHA-256 is reproducible. Exporter version bumped to `1.1.0`.
- **F** — evaluation scores **approved human gold vs model-origin proposals**, refuses with 422 when there
  are no comparable pairs / non-classification tasks, persists `evaluation_runs`, and exposes run history.
  The old `y_pred = y_true` self-comparison (fake 100 %) is gone.
- **G** — app-level + per-view ErrorBoundary (the cluster-tab white screen is impossible); honest accuracy
  UI with `n=` and provenance; bulk review in the workbench; import modal shows row-level rejections;
  §10 puffery removed (`zero external telemetry`, `Sobel <150ms`, `Real-time`, fabricated progress copy).

**Known limitations (deliberate, documented):**
1. **C2 reachability** — because A9 dedupes identical text on import, duplicate text content is normally
   unconstructible through CSV/JSONL/TXT; `RULE_DUPLICATE_TEXT` therefore mainly triggers on legacy data and
   on paired/archived imports. Cross-split duplicate policy is a follow-up decision (blocking vs warning).
2. **D3 hash verification** — a black-box client can confirm determinism and immutability of
   `manifest_hash`, but cannot recompute the canonical bytes without a raw-manifest endpoint.
3. **Auth** — identity remains the local-dev `X-User-Id` header / `default_user` fallback. What is fixed is
   that *label semantics* (origin/status/actor) can no longer be forged; full login is out of scope here.
4. **`.txt` line semantics** are scoped to text-primary tasks; audio/OCR `.txt` handling is unchanged.
5. **Dedupe** scans dataset metadata (no new indexed column — schema/migrations were out of scope).
6. **`RULE_CONFIDENT_LABEL_NOISE` is a weak heuristic.** Its "confident learning" is a lexical k-NN vote, so on
   small/short text datasets it emits false-positive warnings (observed: 11/15 clean records flagged during the
   real-provider test). It is **warning-only** and cannot block publication; treat it as a triage hint, and
   replacing it with a real embedding model is the next quality upgrade.
7. **No live third-party provider call** is part of CI: the real-provider test uses a loopback
   OpenAI-compatible stub so the suite is hermetic and key-free. Pointing
   `POST /api/v1/provider-credentials` at a real endpoint is a one-line config change at runtime.

