# MVP — Status, Evidence, and How to Run

**Status: MVP complete and verified end to end.** Every claim below was executed, not inferred.

---

## 1. What the MVP does

A local-first **text dataset engineering workbench**:

```
create project → create text dataset → import labeled data → label / AI-label → review
   → ensemble pseudo-label (3 models) → gated synthetic generation → validate
   → freeze immutable version → export (JSONL/CSV/ShareGPT/Alpaca/LLaMA-Factory)
```

Two advanced systems are built on top of the base pipeline:

1. **Confidence-Weighted Multi-Model Ensemble Pseudo-Labeling** — fan-out to N models, per-model
   temperature calibration, per-class reliability weights, weighted log-odds aggregation,
   disagreement-driven 3-band routing (auto-accept / human review / reject), Wilson-bound precision
   thresholds, and a correlated-error safety valve.
2. **Gated synthetic generation** — provider generation, deterministic diversity/anti-collapse
   filters, independent label-preservation verification, and all-or-nothing admission with full
   lineage. Failing batches write nothing.

---

## 2. Verification evidence (executed)

| Gate | Command | Result |
|---|---|---|
| Backend suite | `pytest tests -q` | **324 passed, 0 failed** |
| Lint | `ruff check .` | **All checks passed** |
| Frontend build | `npm run build` (`tsc -b && vite build`) | **PASS** (2 430+ modules) |
| Frontend contract tests | `npm test` | **PASS** |
| **Full MVP end-to-end** | `python verify_mvp_e2e.py` against live API+UI | **32/32 checks passed** |
| Live 3-model run (real providers) | `scripts/live_ensemble_run.py` | 900 calls, 0 auth failures; results in `experiments/` |

The end-to-end script exercises: health → providers → project/dataset → 200-row labeled import →
gold approval → ensemble labeling (3 experts, aggregator comparison, calibration, thresholds,
routing bands, correlated-error audit) → vote inventory → audit plan → gated generation →
review → validation → immutable version freeze → 3 exports (real text, no placeholders, identical
SHA-256 on repeat) → UI serves and proxies.

---

## 3. How to run

**Backend** (SQLite, no containers, no keys):
```powershell
cd repo
python -m venv .venv; .\.venv\Scripts\activate
pip install -e ".[dev]"
python scripts/seed_demo_dataset.py
$env:ALLOW_SIMULATED_PROVIDERS="true"     # dev only: deterministic experts, zero API spend
uvicorn services.api.main:app --host 127.0.0.1 --port 8000
```

**Frontend**:
```powershell
cd repo/apps/web
npm install
npm run dev            # http://localhost:5173
```

**Real models** (optional): add provider credentials in the UI (Providers view) or via
`POST /api/v1/provider-credentials`. Any OpenAI-compatible endpoint works. Set `PROVIDER_PRICES`
(JSON) so USD budget caps are enforceable.

---

## 4. Where things live

| Area | Path |
|---|---|
| Ensemble math (calibration, aggregation, weights, selection) | `packages/dataset_ensemble/` |
| Fan-out, service, persistence | `packages/dataset_ensemble/{fanout,service}.py`, `ensemble_votes` table |
| Generation gate + pipeline | `packages/dataset_synthesis/{diversity,generation_pipeline}.py` |
| Provider adapters, pricing, simulated experts | `packages/provider_gateway/` |
| API | `services/api/routes/{ensemble,generation,annotations,review,...}.py` |
| UI | `apps/web/src/components/{EnsembleLab,GenerationLab,AnnotationWorkspace,...}.tsx` |
| Experiments & live reports | `scripts/`, `experiments/` |
| Design + measured results | `docs/ENSEMBLE_PSEUDO_LABELING.md`, `docs/TEXT_MVP.md` |

---

## 5. Known limitations (honest)

1. **"Far-above-human" label quality was not achieved.** With three frontier models the error
   correlation on hard data is φ ≈ 0.8 — they fail on the same items — so the ensemble never beats
   the best single model. Vendor diversity, weight-sharpness tuning and role-prompt diversity all
   failed to break this. See `docs/ENSEMBLE_PSEUDO_LABELING.md` §5d–5e.
2. **What the measurement does support:** audited auto-acceptance — ~96 % precision on ~50 % of
   records, with humans routed to the disagreement band (59 % precision there). Certifying 90/95/99 %
   precision needs ~130/260/1 445 audit labels respectively.
3. **Identity** is the local `X-User-Id` header / `default_user` fallback. Label semantics
   (origin/status/actor) are non-forgeable, but full login/SSO is not implemented.
4. **No migrations** — schema via `create_all`; adding columns requires manual work.
5. **Videos/PDF extraction** are sniffed only; audio + OCR text paths work.
6. **`RULE_CONFIDENT_LABEL_NOISE`** is a lexical heuristic and produces false-positive warnings on
   small text datasets (warning-only; cannot block publication).
7. **Cost reporting** requires `PROVIDER_PRICES` to be configured; unpriced providers are reported
   as unenforceable rather than assumed free.

---

## 6. Bugs found and fixed during this MVP effort (all regression-tested)

- Large labeled imports failed with SQLite `unable to open database file` (temp-file spill under
  per-row SAVEPOINTs) → `PRAGMA temp_store=MEMORY` + startup connection reset.
- Review gate was forgeable via client-supplied `origin`/`status` → server-derived, explicit
  transitions only.
- Text lost through export → canonical `metadata.text` contract end to end.
- Exports were not byte-reproducible → deterministic ZIP writer.
- Accuracy evaluation compared a model to itself → gold-vs-model scoring with provenance.
- Ensemble re-runs re-issued every paid model call (idempotency key omitted `prompt_version`).
- Any component that spends money must be idempotent **by test**, not by intent.
- Repository had no `conftest.py`, so single-module runs failed on a clean database → fixed.
