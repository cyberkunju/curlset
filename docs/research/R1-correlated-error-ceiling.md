# R1 — Breaking the Correlated-Error Ceiling

**Date:** 2026-11-04 · **Scope:** Curlset `packages/dataset_ensemble` · research memo, no code changed

**Evidence tags.** **(M)** measured in this repo (`repo/docs/ENSEMBLE_PSEUDO_LABELING.md`); **(P)** the cited paper's own experiment; **(D)** derived here by arithmetic from (M)/(P) inputs — my inference, not a published result; **(U)** unverified / not stated in the source. Every URL was checked; where an abstract gave no number, the gap is marked rather than filled.

---

## 1. Executive summary

- **The ceiling is the all-wrong mass, not the best member.** 31/300 records (10.3 %) are unanimously wrong (M: 277 unanimous @ 88.8 %). The exact three-voter identity `plurality = 1 − 3p + 2c` (p = pairwise co-error, c = all-wrong mass) reproduces the measured 86.7 % to the decimal at p = 0.1133, c = 0.1033 (D). The best any aggregator can do with these same 900 votes is **89.3 %** (all 22 split records resolved); the real gap to that oracle is 2.6 points confined to 22 records.
- **Vendor diversity was never going to work, and now it is quantified.** `n_eff = k/(1+(k−1)φ̄)` is bounded by `1/φ̄`. At φ = 0.78 the panel has **1.17 of 3 effective votes**, and the bound is **1.28** — a hundred more vendors converge to 1.28, not 3. External corroboration: Kim et al. (ICML 2025) measure 60 % agreement conditional on both models erring, over 349 HuggingFace + 71 HELM models; a 2026 preprint measures `n_eff` = 2.2–2.5 for **nine**-judge panels and panel lift of +0.2/−6.5/−2.5 points.
- **Agreement is routing, not safety.** ≈77 % of all errors (31 of ~40) sit in the *unanimous* band that auto-accept targets. Disagreement-first routing reaches 23 % of errors; only a random audit of the accept band can certify it. Keep the audit, make it sequential.
- **Only new evidence moves the ceiling, and the target is measurable.** Certifying 95 % requires `c ≤ 5 %`, i.e. **≥16 of the 31 unanimously-wrong records corrected**. Cheapest credible local-first channel: retrieve the *label policy plus nearest adjudicated cases* into every prompt, add one non-LLM classifier and a rule set as genuinely different sources, then aggregate with a supervised, cross-fitted label model.
- **Two certification defects cost more than any aggregator improvement.** Repeated Wilson bounds as audits accumulate are invalid under optional stopping (use a betting confidence sequence); and the current κ/φ diagnostics are degenerate — per-record Fleiss κ can only return 1.0 or −0.5 on three voters, and `_phi` returns 0.0 when an error vector is constant, i.e. reports *no* correlation exactly in the saturated case.

---

## 2. Theory and math

### 2.1 Condorcet with correlated votes

Condorcet: `n` voters, accuracy `p > ½`, independent → majority accuracy → 1. Both preconditions fail here. Ladha (1992) shows that under exchangeable correlated votes the jury still improves with `n` but converges to a limit strictly below 1 governed by the common factor, not by `p`. The clean way to hold the whole argument is a two-regime mixture:

> With probability `r` the item is a **shared blind spot** — every voter, hence the majority, is wrong. Otherwise voters err independently at rate `q`. Then `e = r + (1−r)q` and majority accuracy → `1 − r`.

Three consequences, all visible in the data: (i) more voters cannot fix a blind spot; (ii) the limit is a property of the *item distribution*, which is why swapping vendors, prompts and temperatures changed nothing — those interventions move `q`, not `r`; (iii) `r` is estimable and belongs on the dashboard; φ and κ are not it.

### 2.2 The exact three-voter identity

Let `a` = P(all right), `b` = P(exactly two right), `c` = P(all wrong), `d` = P(exactly two wrong). Plurality accuracy `= a + b = 1 − c − d`, and by symmetry `p = c + d/3`, so `d = 3(p − c)` and

> **plurality accuracy = 1 − 3p + 2c** (exact; no distributional assumption) (D)

Inputs (M): 277/300 unanimous at 88.8 % → `a = 0.820`, `c = 31/300 = 0.1033` (unanimous-and-wrong *is* all-wrong, so `c` is exact). Reported `both_wrong` is 10.4–11.7 %; solving the identity for the measured 86.7 % gives `p = 0.1133` (D):

`1 − 3(0.1133) + 2(0.1033) = 0.8667` ✔

Implications:

- **Sensitivity `∂/∂p = −3`**: one point of co-error is worth three points of plurality accuracy *while c is fixed* — for +2 pts you need `p` down 0.67 pp; +5 pts needs 1.7 pp. This is why "decorrelation" sounds so attractive, and why the constraint `p ≥ c` destroys it: `c` cannot fall without new evidence, so `p` cannot either. Plurality accuracy is confined to `[1 − c, 1 − 3p + 2c]`.
- **Range of the whole decorrelation spectrum at this accuracy:** perfect nesting (`p = c`) gives `1 − c = 89.7 %`; perfect independence gives ≈95.4 %. Curlset at 86.7 % is slightly *worse* than the maximally-nested case, because `p > c`.
- **The vote-only oracle is 89.3 %** (246 unanimous-correct + all 22 splits; (D)) — just under the 89.7 % nesting bound, because a few split records are all-wrong with divergent labels. That bounds every reweighting, temperature, role prompt or stacker applied to the existing votes. It also makes the repo's E1 bar (`≥ best single + 1.5 pts` = 88.8 %) a near-perfect split-resolver — **21 of 22** splits correct versus 13 today. No monotone weighting scheme is that.

### 2.3 How much decorrelation buys what

`n_eff = k/(1+(k−1)φ̄)` is increasing in `k` with limit `1/φ̄` (D; standard design effect, and the formula used by Kohli 2026):

| k | φ̄=0.78 | φ̄=0.50 | φ̄=0.25 |
|---|---|---|---|
| 3 | 1.17 | 1.50 | 2.00 |
| 5 | 1.21 | 1.67 | 2.50 |
| 9 | 1.24 | 1.80 | 3.00 |
| ∞ | **1.28** | 2.00 | 4.00 |

At φ̄ = 0.78 **no number of same-distribution voters ever equals three independent votes.** Curlset has 1.17 of the 1.28 available; 0.11 of a vote is all that vendor shopping can still buy. Inverting: `n_eff ≥ 2` at k=3 needs **φ̄ ≤ 0.25**; `n_eff ≥ 2.5` needs **φ̄ ≤ 0.10**; `n_eff ≥ 3` at k=5 needs **φ̄ ≤ 0.167** (D). Measured φ is 0.776–0.799 — three times too correlated for the mildest useful target.

### 2.4 Which correlation statistic, and two code traps

**φ** (Pearson on error indicators) is scale-free but not action-guiding and degenerate at zero variance; **κ** measures chance-corrected agreement, mixing accuracy with dependence; **Yule's Q** `= (ad−bc)/(ad+bc)` (Yule 1912) is marginal-invariant but explodes in sparse 2×2 cells — exactly the 300-row regime; **tetrachoric/polychoric** (Olsson 1979) is the theoretically right latent-continuous object but unstable at n = 300 with 10 % error rates (H).

Report φ for continuity, but **gate on `c` and `p`**, because those enter §2.2, and add `n_eff` as a headline. Two traps matter more than the statistic: `service.py::_phi` returns `0.0` when either error vector is constant — a 100 %-accurate model is reported as *perfectly independent*; and `aggregation.py:210` computes Fleiss κ over a single record, so it can only return 1.0 (unanimous) or −0.5 (any 2–1 split), making `kappa_min` a confusingly named unanimity test.

### 2.5 α-sharpening cannot exceed the best member

`w ∝ acc^α` with `α → ∞` converges to a one-hot weight on the most accurate model, so pooled label → that model's label. The α sweep interpolates between "average everyone" and "use the best model"; it cannot leave the members' convex hull. The repo's E1b result ("α = 20 recovers 95.5 %, matching the dominant model") is that limit being approached. It is a *model-selection* win, not fusion.

---

## 3. Method-by-method findings

**3.1 Self-consistency.** Wang et al. (ICLR 2023): sample reasoning paths, plurality answer — **+17.9 GSM8K, +11.0 SVAMP, +12.2 AQuA, +6.4 StrategyQA, +3.9 ARC-c** over greedy CoT (P). Universal Self-Consistency (2023) extends it to free-form outputs, matching SC on math/code (P) — it solves a problem Curlset does not have. *Beats the best single model?* Yes, on reasoning, but against a single greedy decode, not against a model panel; the mechanism is variance reduction over diverse paths, and at temperature 0 (what the repo runs) there is none. Its real value here is **uncertainty**: the empirical distribution over sampled labels is an observation, not a self-report.

**3.2 Trained aggregators.** LLM-Blender (ACL 2023) pairs a trained ranker (PairRanker) with a generative fuser (GenFuser) on MixInstruct and claims significant gains over individual models (P; exact deltas **(U)**). The transferable claim is *a trained aggregator beats a fixed formula*; the non-transferable part is GenFuser, since there is nothing to fuse in a 4-way label. PoLL (2024): a panel of three small different-family models beats a single large judge at 7–8× lower cost (P), and — the useful diagnostic — self-preference is highest when a model judges itself, i.e. **intra-model correlation exceeds inter-model correlation** (P). Mixture-of-Agents (2024): **65.1 vs 57.5 on AlpacaEval 2.0** with open proposers (P) — but that is an **LLM-judged win rate**, not gold accuracy, under a judge with its own correlated preferences; and MoA aggregation is generative.

**3.3 Debate.** Du et al. (ICML 2024) report gains, e.g. biography **74 % vs 66 %** single-model (P). The replications are the point: Smit et al. (ICML 2024) find MAD "do[es] not reliably outperform … self-consistency and ensembling" (P); a 2025/26 follow-up opens from "MAD may not outperform or even significantly underperform single-agent approaches" (P). Debate is a protocol for *exchanging* evidence, not a source of it, and a 4-way intent decision has no argumentative surface.

**3.4 Verifiers and best-of-N.** Snell et al. (2024): compute-optimal scaling with a dense process verifier is **>4× more efficient than best-of-N**, and a smaller model with test-time compute beats a **14× larger** one FLOPs-matched (P). Best-of-N is only as good as its scoring function, so (i) the repo's planned "fourth call checks the label" is a verifier whose value is bounded by its independence from the first three — same family + different prompt = fourth correlated judge; (ii) *executable* checks (unit tests, schemas, rule engines) are independent precisely because their errors are not learned from text, which is why tool use works where debate does not.

**3.5 Weak-supervision label models — right model class, wrong estimator.** Dawid–Skene (1979) is a latent-class EM with per-annotator confusion matrices and no gold: the principled version of `weights.py`, but estimating the *joint* calibration rather than a scalar accuracy. Snorkel MeTaL (2019) learns dependencies between labelling functions: **+20.2 points on average over a supervised baseline at 1/96 of the labels** on three fine-grained classification tasks (P) — against a near-label-free baseline, *not* an LLM panel; do not quote it as an ensemble result. FlyingSquid (NeurIPS 2020) replaces EM with a triplet method-of-moments, orders of magnitude faster at comparable accuracy (P). Bach et al. (ICML 2017) select which dependencies to model by ℓ1-regularised pseudolikelihood — the principled answer to φ = 0.78: put an edge between the LLMs instead of pretending they are independent. A 2026 Ising-model aggregator (Balasubramanian et al.) beats majority vote and Dawid–Skene on WikiQA/Jigsaw by explicitly dropping conditional independence (P; deltas **(U)**, abstract-level only). **Verdict for Curlset:** with 3 near-identical sources and 300 gold rows, unsupervised EM is unidentified (the likelihood barely distinguishes "three accurate correlated sources" from "one source counted thrice"). Use the *model class* — per-source confusion matrices plus dependence terms — but **fit it supervised** on gold.

**3.6 Independent evidence — the only direction that moves `c`.** *Retrieval:* REIC (Amazon, 2025) retrieves top-k intent candidates to ground LLM intent classification on real customer-service logs (~52 k samples): **F1 0.572 vs RoBERTa 0.516**, better than zero-/few-shot on unseen intents (P). In-context RALM (TACL 2023) reports large gains from prepending retrieved neighbours (P); kNN-LM (2020) established retrieval as a bias complementary to parametric memory (P). For Curlset the mechanism is not "more context" but that the corpus can carry **the label definitions and adjudicated boundary cases** — the information models cannot get from pretraining, i.e. the most plausible content of the 10.3 % blind spot. *Different model class:* Bucher & Martini (2024) compare GPT-3.5/GPT-4/Claude Opus to fine-tuned BERT-style models across sentiment, approval, emotion and party-position tasks on news/tweets/speeches and find fine-tuning wins **in all cases** (P; magnitudes **(U)**). A small classifier has a different inductive bias and has *memorised the actual gold labels*; whether its errors are decorrelated is **(H)** and must be measured. *Rules/lexicons:* Snorkel's premise, packaged for NLP by skweak (2021), which supports text classification and abstention (P). *Paraphrase/cross-lingual invariance:* no strong evidence it decorrelates LLM errors was found **(U)**; it is well supported as an uncertainty signal, not an accuracy intervention, and role-prompt diversity already failed here at φ = 0.73–0.82. *Tool use:* decisive where a checkable artefact exists; for free text the analogue is the rule engine plus **retrieval-neighbour consistency** — the closest thing to a unit test for a label.

**3.7 Uncertainty that is not self-report.** Semantic entropy (Kuhn et al., ICLR 2023; Farquhar et al., *Nature* 2024) clusters sampled answers by bidirectional entailment and takes entropy over meanings: unsupervised, single-model, "more predictive of model accuracy … than comparable baselines" (P; higher AUROC/AURAC than baselines (P), exact values **(U)**). This is the correct replacement for self-report, which here is ≈1.0 with fitted T ≈ 5.6 (M). Conformal prediction (2023) gives marginal **coverage**, not precision, and says nothing about a selected subset. **Conformal risk control** (ICLR 2024) bounds the expected value of any bounded monotone loss — including errors per accepted item — with a finite-sample guarantee: the right formal object for "auto-accept at ≥ 95 % precision". **Learn-then-Test** (AoAS 2025) handles non-monotone risk over a *family* of thresholds, exactly a per-class threshold sweep. Selective classification (2017) supplies the diagnostic the repo lacks — the risk–coverage curve and the requirement that it be monotone; the measured curve is **not** (10 % yield → 86.7 %; 50 % → 96.0 % (M)), a defect in the score, not a fact about the data. **Guarantee ranking:** CRC/LTT (finite-sample, needs exchangeability) > confidence sequences (anytime-valid) > Wilson at fixed n > entropy/κ/φ/self-report (heuristics).

**3.8 Human-in-the-loop.** The measured error geography settles routing: 31 of ~40 errors are unanimous, 9 are splits. Disagreement-first routing is efficient for *model improvement* (those 22 records are the only ones a better aggregator can act on) and useless for *certification* (it ignores 77 % of the mistakes). Audit arithmetic: `audit_sample_size` gives **130 / 260 / 1445** labels for 90 / 95 / 99 % at observed 0.96 (M). Three improvements: (i) **sequential, not fixed-n** — recomputing Wilson as audits arrive and stopping when it clears is invalid under optional stopping; a betting confidence sequence (Waudby-Smith & Ramdas 2024) is valid at every look and allows early stopping when precision is far above target (D on the constant factor; measure it); (ii) **stratify by band** — unanimous (≈89 %) and split (≈59 %) are different populations, and Neyman allocation tightens the interval while revealing infeasibility early; (iii) **report the ceiling** `1 − c_upper` alongside the bound — auditing is the only way to estimate `c`, so that, not marginal precision, is the audit's real job.

---

## 4. Evidence table

| Method | Venue / year | Claimed gain (as stated) | Data | Caveats |
|---|---|---|---|---|
| Condorcet, correlated votes | Ladha, AJPS 1992 | Jury converges < 1, governed by the common factor | Theory | No experiments; limit depends on the dependence model |
| Correlated LLM errors | Kim et al., ICML 2025 | 60 % agreement when both err; larger models *more* correlated | 349 HF + 71 HELM models | Observational; "ensemble gains overstated" is an argument, not a measured ensemble delta |
| Nine-judge panels | Kohli, arXiv 2605.29800 (2026, **preprint**) | `n_eff` 2.18/2.35/2.48; Condorcet gap 22.0/14.0/7.6 pp; lift **+0.2/−6.5/−2.5 pp** | MNLI, SNLI, αNLI | Single-author preprint; classification only; no mitigation tested |
| Self-consistency | Wang et al., ICLR 2023 | +17.9 GSM8K, +11.0 SVAMP, +12.2 AQuA, +6.4 StrategyQA, +3.9 ARC-c | Reasoning benchmarks | vs single greedy decode; needs sampled diversity |
| Universal self-consistency | Chen et al., 2023 | Matches SC on math/code; better open-ended QA | Free-form QA | Solves a problem Curlset doesn't have |
| LLM-Blender | Jiang et al., ACL 2023 | "Significantly outperforms individual LLMs" | MixInstruct | Deltas **(U)**; trained ranker is the transferable part |
| PoLL | Verga et al., 2024 | 3 small diverse models beat a single large judge; 7–8× cheaper | LLM-judge eval | Judge accuracy, not label accuracy; intra-model correlation > inter-model is the useful finding |
| Mixture-of-Agents | Wang et al., 2024 | 65.1 vs 57.5, AlpacaEval 2.0 | AlpacaEval 2.0 / MT-Bench / FLASK | **LLM-judged win rate**; generative aggregation |
| Multi-agent debate | Du et al., ICML 2024 | 74 % vs 66 % (biography); MMLU gains | Arithmetic, biography, MMLU | No cost-matched single-agent baseline in the headline |
| Debate — negative | Smit et al., ICML 2024 | MAD does **not** reliably beat self-consistency/ensembling | MedQA + others | Cleanest negative; matches Curlset's role-prompt result |
| Debate — negative | arXiv 2510.20963, 2025/26 | MAD may underperform single-agent; a fixed protocol gains "up to 10 pp" | Reasoning | Preprint; protocol-specific |
| Best-of-N + verifier | Snell et al., 2024 | >4× more efficient than best-of-N; beats 14× larger model, FLOPs-matched | MATH | Needs a *good* verifier; correlated verifiers inherit blind spots |
| Self-correction, no feedback | Huang et al., ICLR 2024 | Self-correction **degrades** accuracy | Reasoning | Indicts "ask the model to check itself" |
| Dawid–Skene | JRSS-C 1979 | Latent-class aggregation, per-annotator confusion | Crowdsourcing | Conditional independence; unidentified with few correlated sources |
| Snorkel MeTaL | Ratner et al., 2019 | **+20.2 pts** avg over supervised baseline at 1/96 labels | 3 fine-grained classification tasks | vs near-label-free baseline; not an LLM result |
| FlyingSquid | Fu et al., NeurIPS 2020 | Orders of magnitude faster than EM, comparable accuracy | Weak-supervision benchmarks | Parity, not a gain |
| LF structure learning | Bach et al., ICML 2017 | Learns dependency structure without labels | Weak supervision | Depends on regularisation |
| Ising dependence-aware aggregation | Balasubramanian et al., 2026 | Beats majority vote and Dawid–Skene | WikiQA, Jigsaw | Deltas **(U)**; small label space |
| REIC (RAG for intent) | Zhang et al., 2025 | **F1 0.572 vs 0.516** | Real CS logs, ~52 k | Low absolute F1 (large label space); proprietary |
| Fine-tuned small vs zero-shot LLM | Bucher & Martini, 2024 | Fine-tuned wins **in all cases** | Sentiment/approval/emotion/party position | Magnitudes **(U)**; no correlation analysis |
| Semantic entropy | Kuhn et al. 2023; Farquhar et al. *Nature* 2024 | Most predictive uncertainty signal tested | QA | Uncertainty, not accuracy; needs sampling budget |
| Conformal prediction | Angelopoulos & Bates 2023 | Coverage ≥ 1 − α, distribution-free | General | Coverage ≠ precision |
| Conformal risk control | Angelopoulos et al., ICLR 2024 | Finite-sample bound on monotone loss | General | Needs exchangeability |
| Learn-then-Test | Angelopoulos et al., AoAS 2025 | Risk control over a threshold family | General | Power depends on grid and n |
| Selective classification | Geifman & El-Yaniv, NeurIPS 2017 | Risk–coverage framework | ImageNet etc. | Framework, not a gain |
| Confidence sequences | Waudby-Smith & Ramdas, JRSS-B 2024 | Anytime-valid bounds on bounded means | General | Wider than fixed-n at the same n |

---

## 5. Recommendation for this codebase

### 5.1 Stop doing three things

1. **Stop using ensemble macro-F1 as the primary metric.** At n = 300 with an 89.3 % ceiling, ±0.7 is noise and arithmetically forced. Primary = **`c` on the unanimous band** and **certifiable precision at fixed coverage**.
2. **Stop gating on φ > 0.6.** Replace with `ceiling = 1 − c_upper` (Clopper–Pearson upper bound on the unanimous-wrong rate). If `ceiling < target_precision`, refuse to certify — the *actual* condition, and it fires here (89.7 % < 95 %).
3. **Stop sweeping α as a fusion claim.** It is a model selector (§2.5).

### 5.2 Module map

| Where | What | Algorithm | Complexity |
|---|---|---|---|
| `types.py` | add `source_type` (llm/retrieval/rule/classifier/human) and `abstain` to `ModelVote` | — | — |
| **new** `evidence.py` | non-LLM channels emitting `ModelVote` distributions | kNN over frozen embeddings of the labelled pool; regex/lexicon rules with abstention; TF-IDF+logreg or SetFit | kNN O(N·d)/query (trivial at 300; HNSW above ~10⁵); rules O(1); logreg O(N·d²) |
| **new** `label_model.py` | supervised Dawid–Skene with explicit dependence | per-source confusion matrix fitted on gold by closed-form counts; Ising/Bach coupling on top-`m` pairs selected by measured co-error; posterior by exact enumeration over 4 classes × 2^m coupling states | O(N·K·C²) fit; O(C·2^m) per item |
| `selection.py` | betting confidence sequence; CRC/LTT threshold solve | fixed-sequence testing over the λ grid | O(1)/audit; O(\|grid\|·N) |
| `aggregation.py` | keep; add `oracle_ceiling()` and `monotonicity_report()` | §2.2 identity; Spearman ρ(score, correct) + risk–coverage monotonicity | O(N log N) |
| `service.py` | emit `c`, `p`, `n_eff`, `ceiling` in `EnsembleOutcome`; fix `_phi` guard | — | — |

Nothing needs a paid API. The only new artefact is a small embedding model (`all-MiniLM-L6-v2` or `bge-small-en-v1.5`, ~90 MB, CPU). If that is unacceptable in the default install, TF-IDF+SVD is a worse but zero-dependency fallback — and it is the pattern `dataset_quality/clustering.py` already uses, so the dependency story stays consistent.

### 5.3 E1e — free, uses the stored votes (run first)

Reload the 300 rows' votes. Compute `a,b,c,d,p,n_eff,ceiling` and the oracle (246 + 22 = 268/300). Fit a **cross-fitted multinomial logistic stacker** on vote-pattern features — per-model label one-hot (3×4), unanimity, per-model calibrated max-prob, top-2 margin, vote entropy, three pairwise agreement flags — with 5-fold grouped-by-record CV and a 2-fold swap for out-of-fold scores. Fit the supervised label model and compare. Emit risk–coverage curves with paired bootstrap CIs (2000 resamples of records).

**Pass/fail.**
- **P1 (must pass):** risk–coverage monotone non-increasing within CI and Spearman ρ(score, correct) ≥ 0.5. If this fails, the confidence score is broken and no threshold work is meaningful.
- **P2 (expected to fail):** stacker macro-F1 ≥ best single + 1.0 pt with CI excluding 0. The headroom is 2.6 points over 22 records. A failure is a *positive* result — it closes the aggregation branch with evidence.
- **P3:** at 50 % coverage, precision ≥ 96 % with Wilson LB ≥ 95 % (the repo reports 96.0 %/91.6 %; the stacker should tighten the LB, not raise the point estimate).

**Decision rule:** P1+P3 pass and P2 fails → stop investing in aggregation, move 100 % of effort to E1f. This is the cheapest way to end a direction that already has three negative experiments.

### 5.4 E1f — the decisive experiment

Split 300 gold rows 150/150 (stratified, fixed seed). Build three non-LLM sources on the train half only: **E-retrieval** (frozen embeddings, k = 8 nearest train neighbours, similarity-weighted class histogram, abstain below a similarity floor fit on train) plus a **policy card** — the label definitions and two adjudicated boundary cases per class — prepended to every LLM prompt; **E-rules** (6–10 regex/lexicon rules written from the definitions, not the data, with abstention); **E-classifier** (TF-IDF+logreg, or SetFit). Aggregate {3 LLMs, retrieval, rules, classifier} with the supervised label model; evaluate on the held-out half.

**Primary metric: `c_unan`, the all-wrong mass among records where all three LLMs agree** — the only quantity that moves the ceiling. Secondary: fused macro-F1; precision at 50 % coverage.

**Pre-registered pass/fail.**
- **F1:** `c_unan` falls from 10.3 % to **≤ 7.0 %** (≥30 % relative), bootstrap CI excluding zero — i.e. ~10 of the 31 unanimous-wrong records corrected.
- **F2:** fused macro-F1 ≥ **88.8 %** (best single + 1.5), paired bootstrap 95 % CI excluding 0. Only reachable if F1 passes; that dependency *is* the argument.
- **F3:** the retrieval channel alone is ≥ 75 % accurate **and** its error correlation with the LLM-unanimous-wrong set is ≤ 0.30. If it is accurate but correlated at 0.6, it is the fourth correlated judge — report another negative.
- **F4 (kill):** if F1 fails and the policy-card ablation shows no movement in `c`, the honest conclusion is that label quality here cannot be improved by any local-first fusion; ship **audited routing only**.

Cost: 150 × 3 models × 2 arms = 900 calls (comparable to E1c); retrieval, rules and classifier are free and sub-second on CPU.

### 5.5 Certification changes (independent of experiment outcomes)

1. **Confidence sequence, not repeated Wilson.** Keep `audit_sample_size` for planning; the *decision* comes from a betting CS evaluated once at the stopping time. Report both so the gap is visible.
2. **Stratified audit by band**, Neyman allocation, per-band precision plus the volume-weighted overall figure.
3. **CRC/LTT for the threshold**, with exchangeability written down as an assumption; if the pool drifts, the guarantee does not transfer — that is what the anchor set is for.
4. **Two-sided reporting:** precision with interval *and* `1 − c_upper`. A certificate whose target exceeds the ceiling should be impossible to produce in code, not merely discouraged in prose.

---

## 6. Dead ends

1. **Another vendor.** At φ = 0.78, `n_eff → 1.28`; the fourth vendor is worth ≤0.05 of a vote.
2. **Role/persona prompts.** Failed here (φ 0.815/0.731/0.821); the encouraging split-band signal (59 % → 83 %) rests on n = 24.
3. **α/temperature-weight sharpening as fusion.** Provably a model selector in the limit.
4. **"Ask 9 instead of 3."** Nine judges, two effective votes — the same arithmetic that produced −0.7.
5. **Debate for a 4-way label.** No argumentative surface; the best replication says it loses to self-consistency anyway.
6. **Self-verification / "are you sure?" / a fourth LLM as adversarial check.** Self-correction without external feedback degrades accuracy; a same-family checker is a correlated judge.
7. **LLM-judge win rates as evidence of label quality.** MoA's and PoLL's numbers are judge-scored.
8. **Polychoric/tetrachoric at n = 300, 10 % error rates.** Unstable, and the decision it would feed is already made by `c`.
9. **Unsupervised Dawid–Skene with three correlated sources.** Flat likelihood; use it supervised.
10. **Thresholding on a non-monotone score.** The measured curve will select the contaminated head.
11. **Chasing the last 2.6 points inside 22 split records.** Even a perfect resolver buys 89.3 % and will not generalise from n = 22.

---

## 7. References

1. Ladha, K. K. (1992). The Condorcet Jury Theorem, Free Speech, and Correlated Votes. *AJPS* 36(3). https://www.jstor.org/stable/2111584
2. Kim, E., Garg, A., Peng, K., Garg, N. (2025). Correlated Errors in Large Language Models. ICML 2025. https://arxiv.org/abs/2506.07962
3. Kohli, G. (2026). Nine Judges, Two Effective Votes. Preprint. https://arxiv.org/abs/2605.29800
4. Yu et al. (2026). Diversity Combining for Multi-Path LLM Reasoning. https://arxiv.org/abs/2609.38829
5. Wang, X. et al. (2023). Self-Consistency Improves Chain of Thought Reasoning. ICLR 2023. https://arxiv.org/abs/2203.11171
6. Chen, X. et al. (2023). Universal Self-Consistency. https://arxiv.org/abs/2311.17311
7. Jiang, D. et al. (2023). LLM-Blender. ACL 2023. https://aclanthology.org/2023.acl-long.792/
8. Verga, P. et al. (2024). Replacing Judges with Juries. https://arxiv.org/abs/2404.18796
9. Wang, J. et al. (2024). Mixture-of-Agents. https://arxiv.org/abs/2406.04692
10. Du, Y. et al. (2024). Improving Factuality and Reasoning through Multiagent Debate. ICML 2024. https://arxiv.org/abs/2305.14325
11. Smit, A. P. et al. (2024). Should we be going MAD? ICML 2024. https://proceedings.mlr.press/v235/smit24a.html
12. When and Why Does Multi-Agent Debate Fail (2025/26). https://arxiv.org/abs/2510.20963
13. Snell, C. et al. (2024). Scaling LLM Test-Time Compute Optimally. https://arxiv.org/abs/2408.03314
14. Huang, J. et al. (2024). LLMs Cannot Self-Correct Reasoning Yet. ICLR 2024. https://arxiv.org/abs/2310.01798
15. Dawid, A. P., Skene, A. M. (1979). Maximum Likelihood Estimation of Observer Error-Rates Using the EM Algorithm. *JRSS C* 28(1):20–28. https://doi.org/10.2307/2346806
16. Ratner, A. et al. (2020). Snorkel: rapid training data creation with weak supervision. *VLDB J.* https://link.springer.com/article/10.1007/s00778-019-00552-1
17. Ratner, A. et al. (2019). Training Complex Models with Multi-Task Weak Supervision (Snorkel MeTaL). https://arxiv.org/abs/1810.02840
18. Fu, D. Y. et al. (2020). Speeding Up Weak Supervision with Triplet Methods. NeurIPS 2020. https://arxiv.org/abs/2002.11955
19. Bach, S. H. et al. (2017). Learning the Structure of Generative Models without Labeled Data. ICML 2017. https://arxiv.org/abs/1703.00854
20. Balasubramanian, K. et al. (2026). Dependence-Aware Label Aggregation for LLM-as-a-Judge via Ising Models. https://arxiv.org/abs/2601.22336
21. Lison, P. et al. (2021). skweak: Weak Supervision Made Easy for NLP. ACL 2021 Demo. https://aclanthology.org/2021.acl-demo.40/
22. Bucher, M. J. J., Martini, M. (2024). Fine-Tuned "Small" LLMs (Still) Significantly Outperform Zero-Shot Generative AI Models in Text Classification. https://arxiv.org/abs/2406.08660
23. Zhang, Z. et al. (2025). REIC: RAG-Enhanced Intent Classification at Scale. https://arxiv.org/abs/2506.00210
24. Ram, O. et al. (2023). In-Context Retrieval-Augmented Language Models. *TACL*. https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00605/118118/
25. Khandelwal, U. et al. (2020). Generalization through Memorization: kNN-LMs. ICLR 2020. https://arxiv.org/abs/1911.00172
26. Rubin, O. et al. (2022). Learning To Retrieve Prompts for In-Context Learning. NAACL 2022. https://arxiv.org/abs/2112.08633
27. Farquhar, S., Kossen, J., Kuhn, L., Gal, Y. (2024). Detecting hallucinations using semantic entropy. *Nature* 630. https://www.nature.com/articles/s41586-024-07421-0
28. Kuhn, L., Gal, Y., Farquhar, S. (2023). Semantic Uncertainty. ICLR 2023. https://arxiv.org/abs/2302.09664
29. Angelopoulos, A. N., Bates, S. (2023). A Gentle Introduction to Conformal Prediction. https://arxiv.org/abs/2107.07511
30. Angelopoulos, A. N. et al. (2024). Conformal Risk Control. ICLR 2024. https://arxiv.org/abs/2208.02814
31. Angelopoulos, A. N. et al. (2025). Learn then Test. *Annals of Applied Statistics*. https://arxiv.org/abs/2110.01052
32. Geifman, Y., El-Yaniv, R. (2017). Selective Classification for Deep Neural Networks. NeurIPS 2017. https://arxiv.org/abs/1705.08500
33. Waudby-Smith, I., Ramdas, A. (2024). Estimating means of bounded random variables by betting. *JRSS-B*. https://arxiv.org/abs/2010.09686
34. Yule, G. U. (1912). On the Methods of Measuring Association between Two Attributes. *JRSS* 75(6). https://academic.oup.com/jrsssa/article/75/6/579/7092317
35. Olsson, U. (1979). Maximum likelihood estimation of the polychoric correlation coefficient. *Psychometrika* 44(4):443–460. https://econpapers.repec.org/article/sprpsycho/v_3a44_3ay_3a1979_3ai_3a4_3ap_3a443-460.htm
36. Wilson, E. B. (1927). Probable Inference, the Law of Succession, and Statistical Inference. *JASA* 22(158). https://doi.org/10.1080/01621459.1927.10502953
37. Kamen, A. et al. (2025). Majority Rules: LLM Ensemble for Unstructured Text Categorization. https://arxiv.org/abs/2511.15714 — **flagged:** claims "up to 65 % F1 over the strongest single model", far outside every other result surveyed and not replicated; treat as an unverified outlier.

---

### Appendix — the arithmetic, in full

```
(M) n=300 · unanimous=277 @ 88.8 % · splits=22 @ 59.1 %
a = 246/300 = 0.8200 (unanimous & correct) · c = 31/300 = 0.1033 (all three wrong)
identity 1 − 3p + 2c => p = (1 + 2·0.1033 − 0.8667)/3 = 0.1133  (reported there: 10.4–11.7 %)
oracle = (246 + 22)/300 = 0.8933 · n_eff(3, 0.78) = 1.172 · lim n_eff = 1/0.78 = 1.282
```

### Appendix — what would falsify this memo

- A measured `c` materially below 10 % on another hard set → the ceiling is dataset-specific and the vendor question reopens.
- A retrieval channel ≥ 75 % accurate **and** correlated ≤ 0.3 with LLM-unanimous-wrong → the blind spot is capacity/coverage, not definitional.
- A replicated result where a 3-model panel beats its best member by >2 points on a 4-class text task at φ > 0.6. None was found here.
