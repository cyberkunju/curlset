# Research Corpus

Read-only evidence for the design decisions in this repository. Imported from the project's research
workspace on **2026-11-05**; 31 markdown documents (~970 KB) plus three experiment result files.

Start with the syntheses, then follow the report that a document cites:

| File | What it is |
|---|---|
| [`00-SYNTHESIS.md`](00-SYNTHESIS.md) | wave-1 verdict: correlated-error ceiling, five levers, ranked plan |
| [`00-SYNTHESIS-WAVE2.md`](00-SYNTHESIS-WAVE2.md) | wave-2 verdict: synthetic regimes, aggregation retired, certification |
| [`00-INVENTIONS.md`](00-INVENTIONS.md) | twelve candidate inventions and their evidence status |
| [`00-ALGORITHMS.md`](00-ALGORITHMS.md) | the specialist-rescue theorem and greedy admission |
| [`00-BREAKTHROUGH-specialist-rescue.md`](00-BREAKTHROUGH-specialist-rescue.md) | the rescue experiment that motivates `dataset_ensemble/specialist.py` |
| [`00-TRAINING-RESULTS.md`](00-TRAINING-RESULTS.md) | model/embedding bake-off results |
| [`LEAD-FINDING-templated-fixture.md`](LEAD-FINDING-templated-fixture.md) | why the benchmark's templates bound every accuracy claim |

Wave 1 reports:

| File | Topic |
|---|---|
| `R1-correlated-error-ceiling.md` | correlated errors cap aggregation; 10.33% blind-spot mass, 89.67% ceiling |
| `R2-label-quality-dedup-leakage.md` | label errors, dedup, leakage; confident-learning queue precision |
| `R3-autolabeling-modalities.md` | auto-labeling stacks, model licences, assisted-annotation speedups |
| `R4-evaluation-statistics.md` | intervals, evaluator identity, run versioning |
| `R5-active-learning-coverage.md` | embeddings, coverage, cluster gaps |
| `R6-synthetic-data.md` | synthetic ratios, gates, failure regimes |
| `R7-competitive-landscape.md` | verified vendor pricing and market gaps (2026-11-04) |
| `R8-data-infrastructure.md` | CAS, deterministic archives, statement/envelope identity |
| `R9-rights-provenance.md` | licence ledger, NOASSERTION, immutable origin |
| `R10-quantified-gains.md` | effect sizes and evidence tags |

Wave 2 studies (`wave2/`):

| File | Topic |
|---|---|
| `W1-llm-juries-debate-verifiers.md` | jury bounds; minimum detectable effect at n=300 |
| `W2-synthetic-images.md` | image synthesis regimes and AP effects |
| `W3-synthetic-text.md` | text synthesis: +1–3 F1, plateau behaviour |
| `W4-vlm-annotators.md` | VLM precision at coverage; boxes/counts far below |
| `W5-weak-supervision-label-models.md` | identifiability, stacked label models |
| `W6-uncertainty-certification.md` | finite-population certificate math |
| `W7-human-ai-deferral.md` | deferral, blind review, consensus effects |
| `W8-data-centric-frontier.md` | curation agents, NL editing evidence |
| `W9-label-noise-theory.md` | noise limits, two-labeller bound |
| `W10-human-baselines.md` | human accuracy ladder |
| `W11-forums-patents-industry.md` | prior art and industry pain points |
| `W12-crowd-wisdom-psychometrics.md` | aggregation/psychometric limits |
| `W13-other-modalities.md` | audio, code and other modalities |

Shipped experiment results (`_src/`):

- `setfit_results.json` — base 94.67%, rescue 96.77%, flip 5.04%, oracle 99.33%
- `stability_results.json` — seed-to-seed variation with intervals
- `bench_results.json` — embedding benchmark (bge / embeddinggemma)

## What is not shipped

The research workspace also contains ~3.8 GB of third-party source captures (vendor pricing HTML, PDFs,
Reddit pages, arXiv metadata) and a 4 GB SetFit checkpoint. They are omitted to keep the repository small
and to avoid redistributing third-party captures. Each report lists its sources and retrieval dates, so
the evidence can be re-fetched.

## How to cite

Cite a file plus the measured number, denominator and date, for example:
`docs/research/R1-correlated-error-ceiling.md` — 31/300 unanimous errors, ceiling 89.67% (2026-11-04).
Never cite a research number as a claim about a user's dataset; they are fixture-specific.

## Relationship to product docs

- [../RESEARCH.md](../RESEARCH.md) is the digest and the list of claims the research retires.
- [../DECISIONS.md](../DECISIONS.md) records which decisions the research changed (ADR-018, ADR-024,
  ADR-026) and which it did not.
- [../ROADMAP.md](../ROADMAP.md) contains the work implied by findings that are not shipped yet.
