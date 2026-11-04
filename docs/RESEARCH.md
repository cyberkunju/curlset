# Research — What We Measured, What It Changed, What It Rules Out

Status: current. This is the digest of the research corpus shipped under [`docs/research/`](research/README.md)
(31 documents, ~970 KB). Read the syntheses first: `00-SYNTHESIS.md` (wave 1) and
`00-SYNTHESIS-WAVE2.md` (wave 2). Every claim below cites a file; numbers are fixture-specific with a
stated denominator.

## 1. Method

The research asked a narrow question: *can a dataset tool honestly claim high accuracy, and what would
it take?* The method was:

1. Build a hard, templated fixture (300 records, 3 model panel) and measure where models fail together.
2. Run controlled experiments (panel composition, synthetic ratios, calibration, specialist probes) with
   grouped cross-validation so near-duplicates cannot leak.
3. Read the literature (`R1`–`R10`, `W1`–`W13`) and the market (`R7`), then reconcile claims against
   measurements.
4. Retire every claim the measurements did not support.

Artifacts not shipped: 3.8 GB of source captures (pricing pages, PDFs, Reddit HTML, arXiv metadata) and a
4 GB model checkpoint used for the SetFit experiment. The three small result JSONs are shipped under
`docs/research/_src/`.

## 2. Findings that changed the product

### 2.1 Aggregation is capped by correlated error

- On the fixture, **31 of 300 records (10.33%) are wrong in all three model votes**; no aggregation can
  exceed **89.67%** when the panel shares that blind spot (`R1-correlated-error-ceiling.md`).
- Plurality (86.33%) was **below** the best single model (87.33%) (`R1`, `00-SYNTHESIS.md`).
- Therefore: ensemble output is used for **routing and evidence**, not as an accuracy claim. Exact
  decision: ADR-018, ADR-024; product rule: annotations stay `pending_review` unless a recorded
  auto-label transition exists.

### 2.2 The only measured way past the ceiling is complementarity (a dataset-local specialist)

- A probe fitted on the dataset's own labels (SetFit, `BAAI/bge-large-en-v1.5`) scored **94.67%** base,
  **96.77%** after rescue, with a **5.04% flip rate** and **99.33%** oracle
  (`_src/setfit_results.json`, `00-BREAKTHROUGH-specialist-rescue.md`).
- The panel is wrong where the specialist is right; it is complementarity, not raw accuracy, that
  creates headroom (`00-ALGORITHMS.md`).
- Therefore: `packages/dataset_ensemble/specialist.py` implements grouped cross-fitting, cluster
  bootstrap, risk/coverage curves and the router hook (ADR-026). Productisation is roadmap L2/L3.

### 2.3 Synthetic data helps in a narrow regime and hurts outside it

- Text: gains are **+1–3 macro-F1**, not +6; paraphrase gains plateau around 0.9M tokens
  (`W3-synthetic-text.md`).
- A **~30% synthetic share** is the defensible cap; a 4-class task scored 93.1 with 30% synthetic vs
  95.3 real-only; diversity filtering hurt **9 of 12** configurations (`R6-synthetic-data.md`).
- Images: gains track missing supervision — **+0–2 mAP** with ample data, **+4–10** for taxonomy gaps,
  **+13–21** for domain gaps, **−7** for synthetic-only; copy-paste is a stronger baseline (+1.5 box /
  +3.6 mask AP) (`W2-synthetic-images.md`).
- Therefore: no "synthetic improves everything" claim; cap is documented, image generation is one
  evidence source with lineage, and a synthetic-share guard is roadmap M9.

### 2.4 Machine annotation is not "close to human" at full coverage

- No VLM reached 95% precision at full coverage; the best board was **87.5%**, Claude 73.13% on the
  fixture's task (`W4-vlm-annotators.md`).
- Human accuracy is a ladder: single **88–92%**, majority-of-3 **95–98%**, κ=0.8 ≈ 92% single
  (`W10-human-baselines.md`).
- Therefore: machine labels start `pending_review`; the autonomous path is classification-only,
  thresholded and recorded; detection/captioning/audio remain human-reviewed.

### 2.5 Evaluation and certification

- Bare metrics hide uncertainty: 42/50 (84%) has a 95% interval of [71.5, 91.7]; reports need per-item
  rows, intervals and frozen run identity (`R4-evaluation-statistics.md`).
- A finite-population certificate needs audit receipts and a refusing publish gate; with the fixture's
  maximum (0.9402) the defensible certificate is **90%**, not 95% (`W6-uncertainty-certification.md`).
- At n=300 the minimum detectable effect is ~3.3 points, so a 1.5-point gate cannot be passed
  (`W1-llm-juries-debate-verifiers.md`).
- Therefore: certification is roadmap L4 — not a shipped claim.

### 2.6 Rights and reproducibility

- Rights defaults were decorative and synthesis was auto-approved in the research prototype; unknown
  licences must be `NOASSERTION`, not "cleared"; an append-only ledger is required
  (`R9-rights-provenance.md`).
- Version identity needs a canonical statement + signed envelope; hashing a version id and wall clock is
  not reproducible (`R8-data-infrastructure.md`).
- Therefore: ADR-005/ADR-013 stand; rights ledger and statement/envelope split are roadmap L5/E5.

### 2.7 Interaction design

- Assisted image/video annotation is 2–6× faster; text 10–20% (`R3-autolabeling-modalities.md`).
- Showing the model answer reduces consensus quality: 44% slower, consensus 8% → 38%
  (`W7-human-ai-deferral.md`).
- Therefore: proposals are shown as proposals with provenance; blind-two-plus-adjudication is roadmap
  L7; keyboard-first review exists.

### 2.8 Market gap (see [COMPETITIVE_ANALYSIS](COMPETITIVE_ANALYSIS.md))

- Consensus/QA analytics, audit logs and immutable versions are enterprise-only; no vendor offers a
  self-serve accuracy certificate (`R7-competitive-landscape.md`, verified 2026-11-04).
- That gap is the product thesis; it is not a claim of superiority.

## 3. Claims retired by the research

Do not reintroduce these in docs or UI:

- "Ensemble voting beats the best single model" (measured: 86.33% vs 87.33%).
- "Beyond-human accuracy" / "up to 10% labels wrong" without a denominator.
- "100% / zero-cost" anything (image APIs bill per image; unknown price is not $0).
- "Confident learning" for a k-NN heuristic; name the actual method.
- "Synthetic data improves all datasets" (regime-dependent, cap ~30%).
- "Certified 95%" (fixture maximum 0.9402; certify 90%).
- "SAM 3.1 is a box detector" (it is a concept segmenter; boxes come from prompts/other detectors).
- "Legally cleared" or "rights approved" from a public URL.

## 4. Limits of the research

- The fixture is templated; the lead finding is that template diversity, not model choice, bounds the
  benchmark (`LEAD-FINDING-templated-fixture.md`). A de-templated gold set is roadmap L8.
- Model numbers are snapshots (2026-11) and change with providers.
- Most experiments used classification; detection/captioning/audio conclusions are extrapolations and
  are labelled as such where used.
- No research proves the product's overall accuracy; it constrains what the product may claim.

## 5. Corpus map

| File(s) | Topic |
|---|---|
| `00-SYNTHESIS.md`, `00-SYNTHESIS-WAVE2.md` | verdicts and ranked plans |
| `00-INVENTIONS.md`, `00-ALGORITHMS.md`, `00-BREAKTHROUGH-specialist-rescue.md`, `00-TRAINING-RESULTS.md` | rescue theory and experiments |
| `R1` | correlated-error ceiling |
| `R2` | label quality, dedup, leakage |
| `R3` | auto-labeling and modality stacks |
| `R4` | evaluation statistics |
| `R5` | active learning, embeddings, coverage |
| `R6` | synthetic data |
| `R7` | competitive landscape and pricing |
| `R8` | data infrastructure, CAS, determinism |
| `R9` | rights and provenance |
| `R10` | quantified gains and evidence tags |
| `W1`–`W13` | wave-2 studies (juries, synthetic image/text, VLMs, label models, certification, deferral, curation, noise theory, human baselines, patents/forums, psychometrics, other modalities) |
| `_src/*.json` | shipped experiment results (SetFit, stability, embedding benchmark) |
