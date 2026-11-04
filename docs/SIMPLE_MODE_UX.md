# Simple Mode — UX & Product Spec

**Problem with the current product:** it is an engineer's console. Twelve modals, dense headers, jargon
(`provenance`, `ensemble`, `kappa`, `gated generation`) and long forms. A first-time user cannot answer
*"how do I get my dataset?"* in one screen.

**Goal:** the shortest path from *intent* to *usable dataset* is under 60 seconds in Simple Mode, while
Advanced Mode exposes everything without ever blocking the simple path.

---

## 1. Information architecture (new)

```
Home  ──────────────────────────────────────────────────────────────────────────
  ├─ Quick start (no project needed)      → Scratch dataset, auto-named, archived later
  ├─ Recent work (projects + datasets + jobs, newest first, resumable)
  └─ Two big doors:
       ┌──────────────────────┐   ┌──────────────────────┐
       │  Generate data       │   │  Label my data       │
       └──────────┬───────────┘   └──────────┬───────────┘
                  │                          │
        Simple wizard (default)      Simple wizard (default)
        1 Describe (one text box)    1 Drop files (CSV/JSONL/TXT/ZIP)
        2 Few questions (≤3)         2 Confirm columns/classes
        3 Generating (live ETA)      3 Label (keyboard-first)
        4 Done → label / export     4 Done → export
        [Advanced ▾]                 [Advanced ▾]
```

**Rules**
- **One primary action per screen.** Everything else is secondary or hidden under `Advanced`.
- **No dead ends:** every screen offers *Back*, *Save & exit*, and *Continue*.
- **Examples beat instructions:** every question shows a filled-in example the user can accept with one click.
- **One vocabulary layer:** Simple Mode never says *provenance, kappa, log-odds, pseudo-label, manifest*.
  Advanced Mode uses the precise terms.
- **Everything done in Simple Mode is visible in Advanced Mode** (no hidden state, no "quick mode dataset").

---

## 2. Generation — Simple Mode (the main flow)

### Step 1 — Describe (single textarea)
Placeholder carries an example:
> *"A dataset for identifying whether an English sentence uses **these** correctly — about 200 examples, beginner level."*

Below: `Upload a sample` (optional) — CSV/JSONL/TXT/ZIP/images. Uploaded samples are analysed and used as
the **style + label guide** (see §5).

### Step 2 — A few plain questions (derived from the prompt, ≤3, each with a default)
The system proposes a **plan** and asks only what it genuinely cannot infer:
1. **How many examples?** → chips: `50 · 200 · 500 · custom` (default 200) with a sentence explaining cost/time.
2. **Which categories?** → prefilled chips from the prompt (`correct usage`, `incorrect usage`, …) — one click to keep.
3. **Difficulty / style?** → `Beginner · Mixed · Hard` (default Mixed) + one example sentence per option.

Every field is editable inline; `Advanced ▾` reveals: per-class counts, label schema JSON, seed, provider,
model, temperature, dedupe thresholds, generation prompt template.

### Step 3 — Generating (live, honest progress)
- Progress bar with `x / N generated`, elapsed, **estimated time remaining**, and current phase
  (`writing examples → checking quality → verifying labels → saving`).
- ETA is computed from measured throughput (rolling average of completed items); it displays
  **"estimating…"** until at least 5 items complete, and never counts down faster than reality.
- Cancel is always available; partial batches are discarded (all-or-nothing, as the gate requires).
- If the quality gate would reject the batch, the user is told **in plain language**
  ("the model kept repeating itself — try a more specific description") with one-click retry.

### Step 4 — Done
- Preview table (first 10 rows), class counts, quality verdict in one sentence.
- Primary: **Label these examples** (hands off to the Labeling wizard with the new dataset preselected).
- Secondary: **Edit by description** (§4), **Export** (JSONL/CSV/ShareGPT/Alpaca/LLaMA-Factory), **Advanced**.

---

## 3. Labeling — Simple Mode

1. **Drop files** (or pick an existing dataset). Auto-detect text vs image, columns, and classes.
2. **Confirm** one screen: file count, detected text column, detected classes + "looks right" button.
3. **Label**: keyboard-first (`1–9` classes, `Enter` approve, `S` skip, `U` undo). Sidebar shows
   progress `labelled / total` and the plain-language instruction from the dataset.
4. **Done** → Validate (one click) → Export. Advanced exposes review states, bulk actions, ensemble.

---

## 4. Natural-language editing (both modes)

One box: *"make the examples shorter and add 50 more about formal writing."*

The system turns it into **explicit operations** and shows them before applying:
```
Plan:   +50 examples (class: correct usage, formal register)
        shorten existing examples (top 40 by length)
        keep labels, keep ids
[ Apply ]   [ Show raw changes ]
```
Operations are applied through the same validated pipeline (dedupe → quality gate → review states),
never as raw SQL. Every edit is reversible (recorded as a change set).

---

## 5. Sample-guided generation

Upload any of: CSV/JSONL with example rows, TXT lines, ZIP of images+text, images alone.
The analyser returns a **plan proposal**:
- detected task type (text classification / instruction pair / image+text),
- detected label set (with counts) and a confidence note,
- detected style (length, tone, formatting) with 3 quoted samples,
- a generation prompt draft that imitates the sample, shown to the user for editing.
Honest limits are stated: images can guide *style/labels*, not be pixel-reproduced.

---

## 6. Progress & ETA — how "accurate" is defined

We do **not** hard-code times. For a job of `N` items:
```
eta_remaining = (N - done) * avg_seconds_per_item_rolling(last 20 completions)
```
The UI shows: elapsed, done/N, rolling rate, **estimated remaining**, and a confidence hint
(`±` widening when variance is high). Before 5 items it says *"estimating…"* rather than guessing.
The ETA is measured from real throughput of the same provider/model, so it self-corrects when the
provider is slower than expected.

---

## 7. Engineering plan (phased)

| Phase | Deliverable |
|---|---|
| **S1** | Home dashboard (history + two doors + Quick start) and the Generation wizard skeleton |
| **S2** | Backend: plan endpoint (prompt → structured plan + ≤3 questions), job orchestration with live progress/ETA, cancel, all-or-nothing admission |
| **S3** | Generation wizard wired to jobs (progress, ETA, plain-language failures, done → label/export) |
| **S4** | Labeling wizard (drop → confirm → keyboard labeling → validate → export) |
| **S5** | Natural-language editing with previewed change sets |
| **S6** | Sample-guided plan analysis (CSV/JSONL/TXT/ZIP/images) |
| **S7** | Advanced mode parity + polish, keyboard/a11y pass, copy audit (no jargon in Simple Mode) |

**Non-negotiables carried over from the engine:** generated data is `origin=synthetic` / `pending_review`,
never auto-approved; quality gates stay all-or-nothing; no fabricated ETAs; Simple Mode never hides state
that Advanced Mode needs.

---

## Implementation status (updated)

- **S1 Home** — DONE. Default route `#home`; history feed polls generation jobs every 3 s.
- **S2 Backend** — DONE. `generation_jobs` table, plan drafting, background runner, measured ETA, cancel.
- **S3 Generation wizard** — DONE. Steps: describe → ≤3 questions → live progress (elapsed, ETA, cancel) →
  result (accepted count / plain-language rejection) → Open dataset / Label these examples.
- **S4–S7** — see docs/EXECUTION_PLAN.md "Simple Mode track".

**Demo path (zero cost):** `ALLOW_SIMULATED_PROVIDERS=true`, then Home → Generate a dataset → paste
"A dataset for identifying whether an English sentence uses “these” correctly — about 200 examples:
correct usage, incorrect usage" → Continue → Generate. The simulated trio accepts (100 % label
preservation) and lands 200 rows pending review.

---

## Final status

All phases **S1–S7 DONE**. See docs/EXECUTION_PLAN.md for the objective-coverage table and the final E2E matrix
(102/102 checks, 358 backend tests, ruff clean, frontend build green).
