# R4 — Evaluation, Metrics and Statistical Guarantees

**Date:** 2026-11-04 · **Scope:** `packages/dataset_evaluation`, `packages/dataset_ensemble/selection.py`, the Evaluation UI, and the gold-set/CI process around them.
**Code state:** HEAD `37d5d05`. The dossier's three evaluation defects are partly fixed: self-comparison is blocked (`_resolve_comparable_pair`, `service.py:255`), empty splits return 422 (`:587`), runs persist (`EvaluationRunModel`, `db/models.py:324`). What remains is statistical.
**Tags:** **[S]** number from the cited source's own experiment; **[I]** inference here (formula applied to stated inputs); **[U]** unverified.

---

## 1. Executive summary

- **Point estimates are presented as measurements.** `metrics.py:99` rounds accuracy to four decimals and returns no interval; the UI prints `formatPercent(evalReport.accuracy)` at 1.4rem (`EvaluationModal.tsx:627`). At n=50, 42/50 = 84.0% has a 95% Wilson interval of **[71.5%, 91.7%]**; 420/500 = 84.0% has **[80.5%, 87.0%]** **[I]**. The first supports only a weak claim; the second supports a useful one.
- **Threshold selection and certification are circular.** `solve_threshold_for_precision` (`selection.py:83`) solves the largest accepted set whose Wilson lower bound clears the target on the gold set, then returns that same bound as the certificate. This is winner's curse; the design doc's calibration ⊥ audit separation is not enforced in code.
- **No item-level rows means no paired statistics.** `EvaluationRunModel` stores aggregates only. McNemar, DeLong, paired bootstrap, per-class intervals and cluster-robust errors all need the per-item outcome vector; without it the platform can only compare independent point estimates.
- **Runs are not version-bound and predictions are not snapshotted.** `TEXT_MVP.md` F4 binds a run to dataset id, model/provider and timestamp, not to the frozen manifest hash. Editing annotations after a run changes what recomputation would produce.
- **Metric coverage is classification-only, and "mAP" is a family name.** COCO AP and Ultralytics `mAP50-95` differ in max detections (100 vs 300), ignore/crowd handling, area ranges and class set; reporting either without the evaluator identity creates incomparable numbers.

---

## 2. Metric definitions and traps

### 2.1 Classification

Accuracy \(=\frac1n\sum\mathbf 1[\hat y_i=y_i]\); \(P_c=TP_c/(TP_c+FP_c)\), \(R_c=TP_c/(TP_c+FN_c)\), \(F1_c=2P_cR_c/(P_c+R_c)\). Macro averages over classes; micro pools counts (and equals accuracy for single-label multiclass); weighted averages by support.

- **Run-dependent label set.** `metrics.py:72` uses `set(y_true) | set(y_pred)`. One hallucinated label adds a class with recall 0 and depresses macro-F1, so the same model scored twice can yield different macro numbers. Average over the declared schema and report `out_of_schema_rate`; classes with support 0 are not estimable and should be `null`, not 0.0.
- **Micro-F1 is accuracy** for single-label multiclass; reporting both is redundant. Weighted F1 hides minority-class collapse; report per-class F1 with support and interval.
- **Macro-F1 is not a proportion.** Wilson/Clopper-Pearson do not apply; use a paired bootstrap over items.
- **The split is not a sampling design.** There is no stratification check, no leakage check against `train`, and no record of how `test` was chosen. Report the composition, not just n.
- **The 0.0-on-empty path still exists in the pure function.** `compute_classification_metrics([])` returns a 0.0 report (`metrics.py:60`); only the service layer raises 422. Any new caller (CLI, notebook, gate) reintroduces the green-card bug. The function should raise `ValueError` on empty input; the API translates it to 422.

### 2.2 Detection: COCO AP vs Ultralytics mAP

| | COCO `pycocotools` | Ultralytics `mAP50-95` |
|---|---|---|
| IoU grid | 0.50:0.05:0.95 (10) [12] | same [14] |
| Interpolation | 101-point [13] | 101-point (`compute_ap`) [14] |
| Max detections | 100 [13] | 300 (default) [15] |
| Validation confidence | integrated over all scores | 0.001 default [15] |
| Ignore / crowd | `iscrowd`, area ranges [13] | no crowd flag; area metrics only with `save_json=True` |
| Class set | 80 COCO categories | dataset's classes |

Both compute "AP" correctly by their own definitions, but the same detections produce different numbers; Padilla et al. catalogue these variants and show why AP from different implementations is not directly comparable [16]. If the label says "COCO AP", it must come from `pycocotools` and the report must store `maxDets`, area range, class set and evaluator version. Otherwise call it "Ultralytics mAP50-95 (max_det=300, conf=0.001)" and never compare it to a leaderboard. Report AP50, AP75 and AP50-95 together.

### 2.3 Segmentation

\(\mathrm{mIoU}=\frac1K\sum_k TP_k/(TP_k+FP_k+FN_k)\) over pixels, with an explicit ignore label and aggregation order (per-image mean vs pooled — they differ). Panoptic quality: \(PQ=\frac{\sum_{TP}IoU}{|TP|+\frac12|FP|+\frac12|FN|}=SQ\times RQ\) [17]. PQ requires non-overlapping panoptic targets and separates things/stuff; mIoU is insensitive to boundary error on large objects, while PQ punishes small instances. Add Boundary IoU when boundary quality is the claim [18]. State semantic vs panoptic, aggregation and ignore policy.

### 2.4 Calibration

\(\mathrm{ECE}=\sum_m\frac{|B_m|}{n}|\mathrm{acc}(B_m)-\mathrm{conf}(B_m)|\) with equal-width bins (Guo et al. use \(M=15\) [19]); adaptive ECE uses equal-mass bins and is more stable [20]; class-conditional ECE computes ECE within each class and averages, exposing minority miscalibration [21]. Brier and NLL are proper scoring rules; ECE is not, is bin-dependent, and is biased upward/downward in finite samples [20][22][23].

Traps: fitting temperature on the reporting split is leakage; low ECE can coexist with dangerous tails; reliability diagrams need binomial error bars; a single ECE hides the 0.9–1.0 bin where auto-accept lives. Report Brier and NLL as primary, ECE-15 + adaptive + per-class as diagnostics, each with n and bin counts. Fit temperature on a calibration split, never the audit split.

### 2.5 Ranking and open-set

\(\mathrm{AUROC}=P(s_+>s_-)\); AUPRC is average precision. AUROC is prevalence-invariant, AUPRC is not, so an AUPRC number without the positive rate is uninterpretable [24][25]. For open-set, the unknown class must not be a softmax class; report AUROC/AUPRC for known-vs-unknown plus TNR at 95% TPR, and name the score (MSP, energy, Mahalanobis) [26]. Paired AUCs use DeLong [10]; AUPRC comparisons use a paired bootstrap.

### 2.6 Selection

Sort by confidence, accept the top \(c\) fraction (coverage), and plot selective risk against coverage; \(\mathrm{AURC}=\int_0^1R(c)dc\) (lower is better) [27]. Report **selective accuracy at fixed coverage** (e.g., accuracy on the top 50%) and **coverage at a fixed risk floor** (e.g., coverage at 99% precision); AURC is scale- and base-error-dependent, so plot the curve, compare against random ranking and the oracle, and report the operating point the product uses. A model can win AURC and lose at 50% coverage — which is what the ensemble doc found when its confidence ranking was non-monotone.

---

## 3. Statistics cookbook

| question | method | key assumption |
|---|---|---|
| single proportion, display | Wilson | i.i.d. Bernoulli items |
| single proportion, certify a floor | one-sided Clopper-Pearson | i.i.d.; n pre-registered |
| small n, symmetric interval | Jeffreys | i.i.d. |
| two models, same items, accuracy | McNemar (exact) | paired items, same gold |
| two models, same items, AUC | DeLong | independent items |
| F1/AUPRC/AURC difference | paired bootstrap | correct resampling unit |
| many classes or models | Holm (FWER) or BH (FDR) | pre-specified family |
| "no worse than" | TOST / non-inferiority | margin declared in advance |
| clustered items | cluster bootstrap | exchangeable clusters |

### 3.1 Proportions: Wilson, Clopper-Pearson, Jeffreys

Wilson (two-sided \(1-\alpha\)) [11]:
\[
\frac{\hat p+\frac{z^2}{2n}\pm z\sqrt{\frac{\hat p(1-\hat p)}{n}+\frac{z^2}{4n^2}}}{1+\frac{z^2}{n}}.
\]
Clopper-Pearson: lower \(=B^{-1}(\alpha/2;k,n-k+1)\), upper \(=B^{-1}(1-\alpha/2;k+1,n-k)\); one-sided replaces \(\alpha/2\) by \(\alpha\). Jeffreys: equal-tailed \(B(k+\tfrac12,n-k+\tfrac12)\).

Brown, Cai and DasGupta recommend **Wilson or equal-tailed Jeffreys**, especially for small n; Clopper-Pearson is exact but conservative [5]. Use Wilson for display, one-sided Clopper-Pearson for certification, and Jeffreys as a good small-n choice. Do not mix conventions: the lower end of a two-sided 95% interval is a 97.5% one-sided statement.

Worked **[I]**: 42/50 → [0.7149, 0.9166]; 420/500 → [0.8053, 0.8695]; 0/10 CP upper 0.3085 (rule of three); 100/100: one-sided CP lower 0.9705, two-sided Wilson lower 0.9630. "100% on 100 samples" honestly means "at least 97%".

### 3.2 Bootstrap

Use it for macro-F1, per-class F1, AUROC/AUPRC, AURC, calibration slope. Resample the **sampling unit** (records, not labels or boxes), paired units together for model comparisons, clusters when records nest in documents/annotators [31], and stratify by class when support is small. Percentile intervals at \(B=2{,}000\); BCa at \(B=10{,}000\) for skewed statistics. \(B\ge20/\alpha\) is a useful resolution rule (2,000 at 95%, 4,000 at 99%) **[I]** [28]. Persist seed and resample indices.

### 3.3 McNemar

With \(b\) = A right/B wrong, \(c\) = A wrong/B right:
\[
\chi^2=\frac{(|b-c|-1)^2}{b+c},\quad df=1,
\]
or the exact two-sided binomial test on \(b\sim\mathrm{Binomial}(b+c,0.5)\) [8]. Dietterich recommends McNemar for two classifiers on one split [9]. Examples **[I]**: n=300, b=25, c=20 → p=0.55 (a 1.7-point gap is noise); b=40, c=15 → p=0.001; b=60, c=40 → p=0.057. This replaces "84.2% vs 83.9%".

### 3.4 DeLong

For paired AUCs, DeLong uses U-statistics: \(\mathrm{AUC}=\frac{1}{n_+n_-}\sum_{i\in+}\sum_{j\in-}(\mathbf 1[s_i>s_j]+\tfrac12\mathbf 1[s_i=s_j])\), with placement-value variance and a covariance term for paired models [10]. It assumes independent items; cluster → bootstrap. No DeLong analogue exists for AUPRC.

### 3.5 Power and audit size

One-sided exact 95% bound, smallest n with \(B^{-1}(0.05;k+1,n-k)\le1-\text{target}\) **[I]**:

| expected precision | LB 90% | LB 95% | LB 99% |
|---|---|---|---|
| 0.96 | 61 | 1,237 | impossible |
| 0.98 | 46 | 124 | impossible |
| 1.00 (zero errors) | 29 | 59 | 299 |

Certifying a 95% floor from a 96% labeler costs >1,000 audits; at a 99% floor, zero errors need 299 audits, one error 473, two 628, three 773 **[I]**. The ensemble doc's "130 / 260 / 1,445" for 90/95/99% cannot be reproduced from a stated precision and sidedness and is **[U]** until the harness prints the formula. If audits are monitored, fixed-n intervals are invalid at interim looks: pre-register n or use a confidence sequence [29].

### 3.6 Multiplicity

Holm controls FWER: reject \(p_{(i)}\le\alpha/(m-i+1)\) [6]. Benjamini-Hochberg controls FDR at \(p_{(i)}\le i\alpha/m\) [7]. Pre-specify the family (classes, models, metrics) and report adjusted values. "99% per-class precision" over 20 classes without correction is not a system-level 99% claim.

### 3.7 Paired, stratified, clustered comparisons

Pair on the same items with the same gold; stratify by class/difficulty; cluster by document/annotator; report per-stratum and weighted overall deltas with CIs. Different samples make the comparison unpaired and confounded. Do not compare two 95% CIs by overlap: the paired test is more powerful and answers the right null. For "B is no worse than human A", a non-significant superiority test is not equivalence: use TOST/non-inferiority with a pre-declared margin [30]. Cluster example **[I]**: 1,000 items in 100 documents (\(m=10\), \(\rho=0.2\)) have design effect \(1+(m-1)\rho=2.8\), effective n≈357; Wilson on 1,000 independent items understates the interval by ~1.7×.

### 3.8 The point-estimate trap

The ASA statement is explicit: p-values do not measure effect size or importance, and conclusions should not depend only on a threshold [32]. Rule: **no number ships without n, an interval, the method and the sampling unit.** "84.73%" is not more precise than "84% (n=50, 95% CI 71.5–91.7)"; it is less honest.

---

## 4. Conformal prediction and risk control

### 4.1 Split conformal

For exchangeable calibration data, score \(s(x,y)\), and \(q\) the \(\lceil(n+1)(1-\alpha)\rceil\)-th smallest calibration score, \(C(x)=\{y:s(x,y)\le q\}\) satisfies \(\Pr(Y_{n+1}\in C(X_{n+1}))\ge1-\alpha\) [1][2]. The guarantee is **marginal**, not conditional; Mondrian (per-class) calibration improves class-conditional coverage at the cost of smaller per-class sets. With \(s=1-\hat p(y\mid x)\), a singleton set is \(\hat p(\hat y\mid x)\ge1-q\).

### 4.2 CRC and LTT

Conformal risk control (CRC) chooses \(\hat\lambda=\inf\{\lambda:\frac{n}{n+1}\hat R_n(\lambda)+\frac{B}{n+1}\le\alpha\}\) for a bounded monotone loss, giving \(\mathbb E[R(\hat\lambda)]\le\alpha\) — an expectation, not a high-probability statement [3]. Learn then Test treats the \(\lambda\) grid as multiple hypotheses, uses Hoeffding-Bentkus p-values and FWER control, and certifies operating points at confidence \(1-\delta\); it is the right tool when the threshold is selected from data [4].

### 4.3 What guarantee can the platform actually give?

The honest sentence: *"With 95% confidence, the error rate among auto-accepted labels is at most X, assuming the audit is a uniform random sample of accepted items exchangeable with future items."* X is a one-sided Clopper-Pearson upper bound. Examples **[I]**: 0 errors in 299 → ≤1.00%; 3 in 500 → ≤1.54%; 10 in 1,000 → ≤1.69%. After ~3 errors, more audits barely move the bound.

Conformal gives a weaker sentence: the true label is in the prediction set with probability ≥1−α. If acceptance = singleton set, \(\Pr(\text{error}\mid\text{accept})\le\alpha/\Pr(\text{accept})\) **[I]**. At α=0.05 and 50% coverage this is a 10% error bound, not 99% precision. Certifying 99% at 50% coverage by this route needs α=0.005, a much larger calibration set and a lower-yield operating point. Conformal buys **calibrated abstention**, not a magic accuracy boost.

### 4.4 Where the assumptions break

- **Selection leakage:** threshold chosen on the audit items (the current `solve_threshold_for_precision` pattern).
- **Non-random audits:** auditing hard or convenient items breaks exchangeability; the bound then applies to the audited distribution only.
- **Drift:** weighted conformal and adaptive conformal inference restore guarantees only under stated assumptions; ACI gives long-run coverage, not a fixed-n certificate [33][34].
- **Dependence:** documents, users or annotators cluster; conformal's guarantee is over exchangeable units.
- **Gold noise:** coverage is w.r.t. the gold label, not truth. A 99% claim against a 2%-noisy reference is agreement with that reference; publish the gold set's own agreement.

### 4.5 Practicality

Practical for a marginal guarantee on the auto-accepted band and for choosing an abstention boundary; not practical for per-class 99% at low prevalence, or for subgroup-conditional guarantees, without thousands of audits per cell. The architecture is: scores → conformal/LTT threshold → random audit of accepted items → exact one-sided bound → publish bound, coverage and assumption. `dataset_ensemble` has the right instinct (Wilson + `audit_sample_size`); it needs the split and the pre-registered n.

---

## 5. Agreement, gold sets and judges

### 5.1 Inter-annotator agreement

- **Cohen's κ** \(=(p_o-p_e)/(1-p_e)\), two raters, nominal, fixed items [35]. **Fleiss' κ** generalises to m raters with the same count per item [36].
- **Krippendorff's α** \(=1-D_o/D_e\) handles **missing data, any number of coders, and nominal/ordinal/interval/ratio** metrics [37]. This is the default for annotation platforms because annotators rarely label every item.
- **ICC** is for continuous scores: ICC(2,1) two-way random absolute agreement, ICC(3,1) consistency [38]; guidelines: <0.5 poor, 0.5–0.75 moderate, 0.75–0.9 good, >0.9 excellent [39].
- **Paradoxes:** with skewed marginals, high observed agreement yields low κ (prevalence effect); marginal imbalance between raters produces the "bias" paradox; κ changes when marginals change even at constant \(p_o\) [40][41]. Always publish \(p_o\), the coefficient, the full confusion table and a bootstrap CI over items. Krippendorff's convention treats α ≥ .800 as the reliability floor [52], but the number should never replace the agreement table.
- **LLM "annotators" are not independent raters** when they share a base model; report pairwise agreement but do not treat it as human reliability.

### 5.2 Gold-set design and contamination

Stratify by class × source × difficulty; allocate ≥30 per class for a per-class interval **[I]**, then Neyman \(n_h\propto N_h\sigma_h\). Freeze ids and seed. Use two annotators plus adjudication, and publish the gold set's α/κ — α<0.80 is a noisy second labeler, not a reference standard.

Contamination is a design problem, not a footnote: deduplicate against known training data (MinHash/embedding near-duplicates), keep a time-based sealed slice collected after the evaluated model's training cutoff, and never tune on it. Deduplication changes memorisation and measured performance [42], and memorisation scales with duplication and model size [43]. If a user fine-tunes on the dataset, the `test` split is training data: record `train_test_overlap_checked` and the method. Keep calibration and audit disjoint (three-way split or cross-fitting); audit the **accepted** population and store sampling probabilities.

Monitor drift with KS on scores, MMD/classifier two-sample on embeddings, and a confidence sequence on accepted-band precision; no single detector dominates, so log several [44][45]. Bind every run to `manifest_sha256` and gate on **non-inferiority** against a baseline run on the same frozen items, not on a point estimate.

### 5.3 Validating an LLM judge

Zheng et al. report GPT-4 agreeing with human preferences **over 80%**, "the same level of agreement between humans" **[S]** [46]. But Wang et al. show the verdict is order-dependent: swapping two responses let Vicuna-13B "beat" ChatGPT on **66 of 80** queries when ChatGPT judged **[S]** [47]. Zheng et al. also document verbosity and self-enhancement biases [46].

Validation protocol before trusting a judge: (1) draw a stratified human sample (≥300 judgments, all classes and difficulty bands); (2) report **Cohen's κ with CI**, not raw agreement; (3) run both orders and report the flip rate; (4) regress the verdict on length difference to quantify verbosity bias; (5) test self-preference across model families; (6) test-retest at temperature 0 across seeds; (7) pin the judge model version and date, because silent updates break reproducibility; (8) use two judges plus adjudication for high-stakes labels. G-Eval-style prompt scoring improves alignment [48] but is not a substitute for this validation.

---

## 6. Redesign of the evaluation module

### 6.1 Principles

Every metric is an estimate object `{value, n, unit, ci:{method, level, low, high}}`; every run is immutable, versioned and signed; selection and certification use different data; item-level rows are mandatory; gates are non-inferiority tests with a stored decision rule.

### 6.2 Schema (SQLAlchemy, SQLite/Postgres)

| table | columns | purpose |
|---|---|---|
| `evaluation_runs` (extend) | `dataset_version_id`, `manifest_sha256`, `schema_version`, `task_type`, `sampling_design`, `candidate_snapshot_sha256`, `code_commit`, `status`, `report_json`, `canonical_sha256`, `signature`, `key_id` | immutable run |
| `evaluation_items` | `run_id`, `record_id`, `item_id`, `stratum`, `gold_label`, `pred_label`, `gold_annotation_id`, `candidate_annotation_id`, `correct`, `score`, `cluster_key` | paired evidence |
| `audit_plans` | `run_id`, `metric`, `target`, `alpha`, `sided`, `expected_precision`, `planned_n`, `strata_json`, `status` | pre-registration |
| `audit_observations` | `plan_id`, `item_id`, `human_label`, `correct`, `annotator_id` | clustered audit evidence |
| `metric_baselines` | `dataset_id`, `metric`, `value`, `ci_low`, `manifest_sha256`, `run_id` | gate reference |

The repo has no Alembic migrations; ship one hand-written migration plus a `create_all` fallback and test SQLite and Postgres.

### 6.3 Report JSON (`eval-report/2.0`)

```json
{"schema_version":"eval-report/2.0",
 "run":{"id":"evaluation_01J...","dataset_version_id":"version_01J...","manifest_sha256":"sha256:9f2c...","split":"test","status":"completed"},
 "provenance":{"gold_source":"human_approved","candidate_source":"model","provider":"openai","model":"gpt-6-luna","candidate_snapshot_sha256":"sha256:4a71...","code_commit":"37d5d05"},
 "sample":{"n_items":420,"n_records":420,"n_clusters":42,"sampling_design":"stratified class x source"},
 "metrics":{"accuracy":{"value":0.84,"n":420,"unit":"item","ci":{"method":"wilson","level":0.95,"sided":"two","low":0.8053,"high":0.8695}},
            "macro_f1":{"value":0.81,"n":420,"unit":"item","ci":{"method":"bootstrap_percentile","B":2000,"seed":1234,"low":0.76,"high":0.85}}},
 "per_class":{"billing":{"precision":{"value":0.91,"n":60,"ci":{"method":"wilson","level":0.95,"low":0.84,"high":0.96}},"support":60}},
 "calibration":{"brier":{"value":0.08},"nll":{"value":0.31},"ece_15":{"value":0.04},"ece_adaptive":{"value":0.03}},
 "ranking":{"auroc":{"value":0.93,"ci":{"method":"delong","low":0.90,"high":0.96}}},
 "comparisons":[{"baseline_run_id":"evaluation_01H...","test":"mcnemar","b":25,"c":20,"p_value":0.55,"delta":{"value":0.017,"ci":{"low":-0.02,"high":0.05}},"adjusted_p":0.55}],
 "warnings":[],
 "integrity":{"canonicalization":"RFC8785","sha256":"sha256:7d0e...","signature":{"alg":"ed25519","key_id":"eval-key-2026","sig_b64":"3b1f...c9"}}}
```

A consumer cannot print the value without the uncertainty. Signing is canonical JSON (RFC 8785 [49]) + Ed25519 (RFC 8032 [50]) inside a DSSE envelope [51]; it proves integrity, not authorship, because the platform's auth is still weak.

### 6.4 API and tests

Endpoints: `POST /datasets/{id}/evaluation/runs` (requires `dataset_version_id` or explicit override; 409 on manifest mismatch; idempotency on `(version, split, candidate_snapshot)`), `GET /evaluation/runs/{id}`, `GET .../items`, `GET .../verify`, `POST /evaluation/compare` (McNemar/DeLong/paired bootstrap + Holm), `POST /evaluation/audits`, `POST /evaluation/audits/{id}/observations`, `GET .../certificate`, `GET /evaluation/gates`. Keep the 422 behaviours; add 409 for version mismatch.

Tests: (1) known-answer Wilson/CP/Jeffreys; (2) coverage simulation at n=10/50/500 (10,000 replicates; empirical coverage ≥0.94 for CP, ≥0.93 for Wilson); (3) interval contains the estimate, width shrinks with n, and boundary cases (k=0, k=n) put CP outside Wilson; (4) McNemar exact vs χ²; (5) bootstrap determinism by seed; (6) empty split 422; (7) self-comparison guard; (8) version binding: mutate annotations after run, re-verify unchanged hash; (9) signature tamper fails verify; (10) gate: 3-point drop at n=300 fails, 1-point drop with wide CI reports "inconclusive".

### 6.5 Statistics module and CI gate

`packages/dataset_evaluation/stats.py`, pure functions, no I/O: `wilson_interval`, `clopper_pearson`, `jeffreys_interval`, `mcnemar_exact`, `bootstrap_ci` (seeded, cluster-aware), `delong_auc`, `ece`/`adaptive_ece`/`class_conditional_ece`, `brier`, `nll`, `risk_coverage`/`aurc`, `holm`, `benjamini_hochberg`. The repo has no numpy/scipy; use `math.lgamma` plus a continued-fraction incomplete Beta, and `random.Random(seed)`.

`scripts/eval_gate.py` loads a candidate run and a baseline run on the same frozen items, runs the paired test, and fails if the lower bound of the delta is below \(-\delta\) or a class F1 lower bound is below its floor, Holm-adjusted. Store the decision and baseline id. The gate is a non-inferiority test, not "accuracy ≥ 0.85".

---

## 7. References

1. Angelopoulos & Bates (2021). *A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification.* arXiv:2107.07511. https://arxiv.org/abs/2107.07511
2. Vovk, Gammerman & Shafer (2005). *Algorithmic Learning in a Random World.* Springer. https://doi.org/10.1007/b106715
3. Angelopoulos, Bates, Fisch, Lei & Schuster (2023). *Conformal Risk Control.* ICLR. https://arxiv.org/abs/2208.02814
4. Angelopoulos, Bates, Candès, Jordan & Lei (2025). *Learn then Test.* Annals of Applied Statistics. https://doi.org/10.1214/24-aoas1998
5. Brown, Cai & DasGupta (2001). *Interval Estimation for a Binomial Proportion.* Statistical Science 16(2). https://doi.org/10.1214/ss/1009213286
6. Holm (1979). *A Simple Sequentially Rejective Multiple Test Procedure.* Scand. J. Statist. 6(2). https://www.jstor.org/stable/4615733
7. Benjamini & Hochberg (1995). *Controlling the False Discovery Rate.* JRSS-B 57(1). https://doi.org/10.1111/j.2517-6161.1995.tb02031.x
8. McNemar (1947). *Note on the Sampling Error of the Difference Between Correlated Proportions.* Psychometrika 12(2). https://doi.org/10.1007/BF02295996
9. Dietterich (1998). *Approximate Statistical Tests for Comparing Supervised Classification Learning Algorithms.* Neural Computation 10(7). https://doi.org/10.1162/089976698300017197
10. DeLong, DeLong & Clarke-Pearson (1988). *Comparing the Areas under Two or More Correlated ROC Curves.* Biometrics 44(3). https://doi.org/10.2307/2531595
11. Wilson (1927). *Probable Inference, the Law of Succession, and Statistical Inference.* JASA 22(158). https://doi.org/10.1080/01621459.1927.10502953
12. Lin et al. (2014). *Microsoft COCO.* ECCV. https://doi.org/10.1007/978-3-319-10602-1_48
13. COCO `pycocotools/cocoeval.py` (maxDets, 101 recall thresholds, area ranges, iscrowd). https://github.com/cocodataset/cocoapi/blob/master/PythonAPI/pycocotools/cocoeval.py
14. Ultralytics `utils/metrics.py` (`compute_ap`, 101-point interpolation) and `engine/validator.py`. https://github.com/ultralytics/ultralytics/blob/main/ultralytics/utils/metrics.py
15. Ultralytics `cfg/default.yaml` (`max_det: 300`; val `conf` 0.001). https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/default.yaml
16. Padilla, Netto & da Silva (2020). *A Survey on Performance Metrics for Object-Detection Algorithms.* IWSSIP. https://doi.org/10.1109/IWSSIP48289.2020.9145130
17. Kirillov, He, Girshick, Rother & Dollár (2019). *Panoptic Segmentation.* CVPR. https://doi.org/10.1109/CVPR.2019.00963
18. Cheng, Girshick, Dollár, Berg & Kirillov (2021). *Boundary IoU.* CVPR. https://doi.org/10.1109/CVPR46437.2021.01508
19. Guo, Pleiss, Sun & Weinberger (2017). *On Calibration of Modern Neural Networks.* ICML. https://proceedings.mlr.press/v70/guo17a.html
20. Nixon, Dusenberry, Zhang, Jerfel & Tran (2019). *Measuring Calibration in Deep Learning.* CVPRW. https://openaccess.thecvf.com/content_CVPRW_2019/papers/Uncertainty%20and%20Robustness%20in%20Deep%20Visual%20Learning/Nixon_Measuring_Calibration_in_Deep_Learning_CVPRW_2019_paper.pdf
21. Kull et al. (2019). *Beyond Temperature Scaling: Dirichlet Calibration.* NeurIPS. https://arxiv.org/abs/1910.12656
22. Roelofs, Cain, Shlens & Mozer (2022). *Mitigating Bias in Calibration Error Estimation.* AISTATS. https://proceedings.mlr.press/v151/roelofs22a.html
23. Gneiting & Raftery (2007). *Strictly Proper Scoring Rules, Prediction, and Estimation.* JASA 102(477). https://doi.org/10.1198/016214506000001437
24. Davis & Goadrich (2006). *The Relationship Between Precision-Recall and ROC Curves.* ICML. https://doi.org/10.1145/1143844.1143874
25. Saito & Rehmsmeier (2015). *The Precision-Recall Plot Is More Informative than the ROC Plot on Imbalanced Datasets.* PLoS ONE 10(3). https://doi.org/10.1371/journal.pone.0118432
26. Scheirer, Rocha, Sapkota & Boult (2013). *Toward Open Set Recognition.* IEEE TPAMI 35(7). https://doi.org/10.1109/TPAMI.2012.256
27. Geifman & El-Yaniv (2017). *Selective Classification for Deep Neural Networks.* NeurIPS. https://proceedings.neurips.cc/paper_files/paper/7073-selective-classification-for-deep-neural-networks.pdf
28. Carpenter & Bithell (2000). *Bootstrap Confidence Intervals: When, Which, What?* Statistics in Medicine 19(9), 1141–1164. https://pubmed.ncbi.nlm.nih.gov/10797513/
29. Howard, Ramdas, McAuliffe & Sekhon (2021). *Time-Uniform, Nonparametric, Nonasymptotic Confidence Sequences.* Annals of Statistics 49(2). https://doi.org/10.1214/20-AOS1991
30. Lakens (2017). *Equivalence Tests: A Practical Primer.* Social Psychological and Personality Science 8(4). https://doi.org/10.1177/1948550617697177
31. Cameron, Gelbach & Miller (2008). *Bootstrap-Based Improvements for Inference with Clustered Errors.* REStat 90(3). https://doi.org/10.1162/rest.90.3.414
32. Wasserstein & Lazar (2016). *The ASA Statement on p-Values.* The American Statistician 70(2). https://doi.org/10.1080/00031305.2016.1154108
33. Barber, Candès, Ramdas & Tibshirani (2023). *Conformal Prediction Beyond Exchangeability.* Annals of Statistics 51(2). https://doi.org/10.1214/23-AOS2276
34. Gibbs & Candès (2021). *Adaptive Conformal Inference Under Distribution Shift.* NeurIPS. https://arxiv.org/abs/2106.00170
35. Cohen (1960). *A Coefficient of Agreement for Nominal Scales.* Educ. Psychol. Meas. 20(1). https://doi.org/10.1177/001316446002000104
36. Fleiss (1971). *Measuring Nominal Scale Agreement Among Many Raters.* Psychological Bulletin 76(5). https://doi.org/10.1037/h0031619
37. Krippendorff (2011). *Computing Krippendorff's Alpha-Reliability.* https://www.asc.upenn.edu/sites/default/files/2021-03/Computing%20Krippendorff%27s%20Alpha-Reliability.pdf
38. Shrout & Fleiss (1979). *Intraclass Correlations: Uses in Assessing Rater Reliability.* Psychological Bulletin 86(2). https://doi.org/10.1037/0033-2909.86.2.420
39. Koo & Li (2016). *A Guideline of Selecting and Reporting Intraclass Correlation Coefficients.* J. Chiropractic Medicine 15(2). https://doi.org/10.1016/j.jcm.2016.02.012
40. Feinstein & Cicchetti (1990). *High Agreement but Low Kappa: I.* J. Clinical Epidemiology 43(6). https://doi.org/10.1016/0895-4356(90)90158-L
41. Byrt, Bishop & Carlin (1993). *Bias, Prevalence and Kappa.* J. Clinical Epidemiology 46(5). https://doi.org/10.1016/0895-4356(93)90018-V
42. Lee et al. (2022). *Deduplicating Training Data Makes Language Models Better.* ACL. https://doi.org/10.18653/v1/2022.acl-long.577
43. Carlini et al. (2023). *Quantifying Memorization Across Neural Language Models.* ICLR. https://arxiv.org/abs/2202.07646
44. Rabanser, Günnemann & Lipton (2019). *Failing Loudly.* NeurIPS. https://arxiv.org/abs/1810.11953
45. Gama, Žliobaitė, Bifet, Pechenizkiy & Bouchachia (2014). *A Survey on Concept Drift Adaptation.* ACM Computing Surveys 46(4). https://doi.org/10.1145/2523813
46. Zheng et al. (2023). *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena.* NeurIPS. https://arxiv.org/abs/2306.05685
47. Wang et al. (2024). *Large Language Models are not Fair Evaluators.* ACL. https://aclanthology.org/2024.acl-long.511/
48. Liu et al. (2023). *G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment.* EMNLP. https://doi.org/10.18653/v1/2023.emnlp-main.153
49. IETF RFC 8785. *JSON Canonicalization Scheme.* https://www.rfc-editor.org/rfc/rfc8785
50. IETF RFC 8032. *EdDSA (Ed25519).* https://www.rfc-editor.org/rfc/rfc8032
51. Secure Systems Lab. *DSSE: Dead Simple Signing Envelope.* https://github.com/secure-systems-lab/dsse
52. Krippendorff (2019). *Content Analysis: An Introduction to Its Methodology* (4th ed.). SAGE. https://methods.sagepub.com/book/mono/content-analysis-4e/toc
