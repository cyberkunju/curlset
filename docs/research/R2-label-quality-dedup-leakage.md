# R2 — Label Errors, Deduplication and Leakage: Algorithms and a Replacement Design

**Date:** 2026-11-04 · **Scope:** `packages/dataset_quality` (engine, `confident_learning.py`, `phash_leakage.py`, `clustering.py`), `packages/dataset_io/hashing.py`, and the publication gate in `packages/dataset_versioning/service.py`.

**Code state:** HEAD `37d5d05`. The dossier's findings are taken as given: the "DCT pHash" is a dHash (`hashing.py:15-45`), the "confident learning" is a 7-NN vote over `ord(char)%32` features (`engine.py:241-253`), and the cluster map collapses to (0,0).

**Evidence tags.** **(P)** = the cited paper's own experiment. **(M)** = measured in this task (Windows laptop, Python 3.12, no GPU). **(I)** = my inference or estimate. **(U)** = unverified; marked, not filled. URLs in §6 were resolved on 2026-11-04.

---

## 1. Executive summary

- **The label-error feature is not confident learning.** CL is a specific estimator: out-of-sample probabilities → per-class thresholds → confident joint → row calibration → rank. It has a consistency result for the label-noise joint, but it is a *review-queue generator*. Only **51 % of algorithmically flagged candidates were confirmed errors** (P), and in our synthetic benchmark top-k precision tracked probe accuracy one-for-one: **25.8 % at 15.9 % accuracy, 85.2 % at 78 %** (M). Ship a ranked queue gated on measured probe quality, not an oracle.
- **The pHash rule must be withdrawn, not renamed.** On five synthetic 64×64 images, the current dHash maps flat gray, a vertical gradient and a horizontal gradient to the same all-zero hash, so three unrelated images have Hamming distance 0 and the **BLOCKING** leakage rule fires (M). A true DCT pHash does not fix this: on a flat image every AC coefficient is ~0 and the bits are set by floating-point noise (M/I). Use a variance guard plus embeddings; demote 64-bit hashes to prefilters.
- **Dedup is a leakage/memorization/compute intervention first, an accuracy lever second.** D4 reports **>1 %** of unprompted output copied verbatim, **10×** less memorization after dedup, and **>4 %** train/validation overlap (P). SemDeDup removes **50 %** of LAION-440M at "minimal performance loss" with roughly half the training time (P). But DataComp's ablation found dedup alone moved ImageNet accuracy only **0.195 → 0.200**, versus **0.288** when CLIP top-30 % filtering was added (P).
- **Leakage is cluster- and group-level, not row-level.** Exact hashes miss paraphrases: LLM-based decontamination found **8–18 %** HumanEval overlap in RedPajama-Data-1T and StarCoder-Data, and a 13B model can match GPT-4 on a contaminated benchmark (P). Kapoor & Narayanan document leakage in **329 papers across 17 fields** (P). Audit clusters, group keys and time order.
- **Severity must be earned by measured precision.** The gate assigns BLOCKING to a heuristic with a demonstrated false-positive mode and WARNING to exact duplicates. That is severity inversion: users learn `force=True`, and the gate stops gating. BLOCKING only for deterministic invariants; every probabilistic detector is a WARNING with a precision/recall card.

---

## 2. Algorithms with math

### 2.1 Confident learning, exactly

**Inputs.** `P[i][j] = p̂(ỹ=j | x_i)` for `n` examples and `m` classes, where `ỹ` is the given label. Probabilities must be **out-of-sample** (cross-validated or held out); in-sample probabilities make CL overconfident and invalid (P).

**Assumption.** A class-conditional noise process (CNP): `p(ỹ | y*, x) = p(ỹ | y*)`. Noise depends only on the latent true class, not on features (P). This fails for exactly the errors teams care about: annotator-specific confusion, hard-example ambiguity, and ontology overlap the model has also learned (I).

**Step 1 — thresholds.** For each class `j`, average self-confidence over examples given that label:

```
t_j = (1 / |X_j|) * Σ_{x ∈ X_j} p̂(ỹ=j | x)
```

**Step 2 — confident joint.** Count example `x` with given label `i` in `C[i][j]` iff `p̂(ỹ=j|x) ≥ t_j`; on a collision (several classes pass), take `j = argmax_k p̂(ỹ=k|x)` (Eq. 3 / Alg. 1 in P):

```
C[i][j] = |{ x ∈ X_{ỹ=i} : p̂(ỹ=j|x) ≥ t_j,
             j = argmax_{k : p̂(ỹ=k|x) ≥ t_k} p̂(ỹ=k|x) }|
```

Rows are given labels, columns guessed true labels. Cost `O(m² + nm)` (P); finding ImageNet label errors took **3 minutes on an i7 CPU** (P).

**Step 3 — calibrate.** Rescale each row to the known count of its given label, then normalize:

```
C̃[i][j] = C[i][j] / Σ_j C[i][j] * |X_i|
Q̂       = C̃ / Σ_{i,j} C̃[i][j]        # estimate of p(ỹ, y*)
```

The estimated noise rate is `1 − trace(Q̂)` (I: direct from the definition).

**Step 4 — rank.** The paper orders candidates by normalized margin, `p̂(given|x) − max_{j≠given} p̂(j|x)` (P). Cleanlab exposes a per-example label-quality score; the product should surface a ranked queue, not a set.

**What it guarantees.** Theorem 1: if predicted probabilities are "ideal" and each diagonal entry of `Q_{ỹ|y*}` maximizes its row and column, the confident joint identifies label errors and `Q̂` is consistent (P). §4.2 extends this to noisy probabilities under a stated per-class condition; the headline claim is "provably consistent" (P). This concerns the **joint distribution**, under CNP, with class-conditional model error.

**What it does not guarantee.**

1. **Per-example truth.** A flag is a hypothesis; Pervasive Label Errors found 51 % precision on flags (P).
2. **Instance-dependent noise.** If mislabeling depends on the example (hard cases, ambiguous ontology, one annotator's habit), CNP fails and off-diagonals mix model error with label error (I; P analyzes probability error, not annotator bias).
3. **Weak or miscalibrated probes.** Our sweep (M) shows estimated noise inflating from 10.2 % true to 12.3 %, 15.0 %, 29.0 %, 58.3 % and 85.4 % as probe accuracy fell from 84.3 % to 15.9 % on 20 classes. A weak probe measures its own confusion.
4. **Tiny or missing classes.** Thresholds are per-class averages; require ≥20 labeled examples per class (I).
5. **Shared model/label bias.** If the model learned the same ontology confusion, the error sits on the diagonal and is invisible.
6. **Binary tasks.** With `m=2`, CL reduces to thresholded disagreement and loses most of its advantage (I).

**Measured behavior (M).** 5,000 synthetic samples, 20 Gaussian classes, 128 dimensions, 10 % uniform label flips (CNP holds), 5-fold multinomial logistic regression on frozen features, CL as above. Probe accuracy varied by class separation; runtime is all five folds on one CPU core.

| probe OOF acc | top-k precision | top-k recall | AUROC | estimated noise | true noise | runtime |
|---|---|---|---|---|---|---|
| 0.159 | 0.258 | 0.258 | 0.706 | 0.854 | 0.101 | 0.2 s |
| 0.372 | 0.507 | 0.507 | 0.873 | 0.583 | 0.106 | 0.2 s |
| 0.590 | 0.663 | 0.663 | 0.942 | 0.290 | 0.098 | 0.3 s |
| 0.780 | 0.852 | 0.852 | 0.987 | 0.150 | 0.097 | 0.3 s |
| 0.843 | 0.868 | 0.868 | 0.992 | 0.123 | 0.102 | 0.5 s |

CL is cheap; the classifier, not the counting, dominates. But **precision is bounded by probe quality**, so the run must publish OOF accuracy next to the flag count and suppress CL near chance.

### 2.2 Alternatives and their real cost

**Data maps (Swayamdipta et al., EMNLP 2020).** Per example, confidence `c_i = (1/E) Σ_e p̂(y_i|x_i;θ_e)` and variability `s_i = std_e p̂(y_i|x_i;θ_e)`; easy = high `c`/low `s`, hard = low/low, ambiguous = high `s`. On WinoGrande, training on the 33 % most ambiguous examples gave **78.7 ID / 87.6 OOD** versus **79.7 / 86.0** for 100 % of data (P): +1.6 OOD at one third of the data, −1.0 ID. Cost: a full training run plus per-epoch probabilities. It is training telemetry, not a pre-training audit, and its regions are model-relative.

**AUM (Pleiss et al., NeurIPS 2020).** `AUM_i = (1/E) Σ_e [z_i^(e)(y_i) − max_{j≠y_i} z_i^(e)(j)]`; a threshold class of deliberately mislabeled samples learns an upper bound. Removing **17 %** of WebVision50 improved test error by **1.6 absolute points**; removing **13 %** of CIFAR-100 improved error by **1.2 points** (P). Requires full training and per-epoch logits.

**Influence functions (Koh & Liang, ICML 2017).** `I(z,z_test) = −∇L(z_test)^T H^{-1} ∇L(z)` via Hessian-vector products; useful even where theory breaks, but `O(np)` per query and it answers "which training point affects this prediction", not "how many labels are wrong" (P).

**TracIn (Pruthi et al., NeurIPS 2020).** `Σ_t η_t ∇L(z',θ_t)·∇L(z,θ_t)` over checkpoints (P); cheap per pair but needs many checkpoints and a trained model. **Forgetting events (Toneva et al., ICLR 2019)** count correct→incorrect transitions; forgettable examples can be omitted "while still maintaining state-of-the-art generalization" (P). Both are training-time only.

**Noisy-label losses.** Symmetric CE adds reverse CE to CE (P); generalized CE is `(1−p_y^q)/q`, interpolating CE (`q→0`) and MAE (`q=1`) (P); co-teaching cross-selects small-loss examples between two networks (P); DivideMix fits a two-component loss mixture and trains semi-supervised (P). All change the training algorithm; none outputs a per-record audit, and robust losses trade clean-data fit for noise robustness (GCE's own paper shows MAE can fail, P).

**LLM auditing (Nahum et al., EMNLP 2025).** An LLM ensemble re-labels; high-confidence disagreement is the flag. On four TRUE datasets, LLMs detected **6–21 %** label errors; at >**95 %** LLM confidence, **more than two-thirds** of flags were errors; corrected test labels raised measured performance by up to **15 %**, and filtering/flipping training labels improved it by up to **4 %** (P). Caveats: binary tasks, English, cost, and the LLM's own bias. Optional second stage with a local model, never the default.

**Cost ranking (I):** CL `O(nm+m²)` after one inference pass ≪ LLM audit `O(n)` generations ≪ data maps/AUM `O(E × training)` ≈ forgetting ≈ TracIn ≪ influence functions.

### 2.3 Deduplication

**Exact.** SHA-256 over bytes; for text a normalized hash (NFKC, lowercase, collapse whitespace). `O(n)`, zero false positives. The only tier that may block publication.

**MinHash + LSH (Broder 1997; Indyk & Motwani 1998).** With `k`-shingles, for a random permutation `π`, `Pr[min π(A)=min π(B)] = J(A,B) = |A∩B|/|A∪B|`. A signature of `s` min-hashes has standard error `sqrt(J(1−J)/s)` (I: binomial). Banding `b` bands of `r` rows (`s=b·r`) gives candidate probability

```
P(candidate | J) = 1 − (1 − J^r)^b
```

an S-curve with threshold near `(1/b)^(1/r)`. `b=32, r=4, s=128` gives ≈0.42, `P(candidate|J=0.8) ≈ 1`, and `P(candidate|J=0.5) ≈ 0.87` before exact verification (I). Always verify candidates with exact Jaccard.

**SimHash (Charikar 2002).** `h(x)=sign(w·x)`; `Pr[bit differs]=θ/π`, so Hamming estimates angle. Cheap for short near-duplicate text, but worse recall than MinHash on long documents with local edits (I). A prefilter, not a primary index.

**Suffix arrays (Manber & Myers 1993; D4).** Concatenate documents with separators and find maximal repeated substrings in `O(n log n)`; D4 used this to find a 61-word sentence repeated **over 60,000 times** in C4, plus MinHash for whole-document near-duplicates (P). Exact and finds partial duplication, but memory-bound; cap at ~10^8 characters on a laptop.

**Content-defined chunking (FastCDC, USENIX ATC 2016).** Rolling hash; cut when `hash mod 2^b == 0`, giving average chunk `2^b` and boundaries that survive insertions. For binary artefacts (zip/tar, media containers), not semantic near-duplicates.

**Semantic dedup (SemDeDup, Abbas et al. 2023, preprint).** Embed; k-means into `k` clusters (50,000 for LAION-440M, 11,000 for C4); within a cluster treat cosine `≥ 1−ε` as duplicate; keep the item **least** similar to the centroid, remove the rest (P). Reported: **50 %** of LAION-440M removed at "minimal performance loss", **~2×** faster training, better OOD, and 10–15 % less compute to match a full-data run when training multiple epochs on the pruned set (P).

**Images: hashes versus learned embeddings.** A 64-bit dHash compares 8×8 adjacent-pixel gradients; pHash compares low-frequency DCT coefficients to their median. Both target *copies* under compression/resize, not semantic duplicates: no crop/rotation/overlay invariance, only 64 bits. SSCD (ResNet-50, 512-d) reaches **86.6 mAP** on Copydays-CD10K "strong" transforms and beats SimCLR descriptors by **48 absolute points** on DISC2021 (P) — learned descriptors dominate hand-crafted hashes on exactly the transforms that break dHash. For semantic dedup use DINOv2/DINOv3 or CLIP; SSCD is for "same source image, transformed".

**Text near-dup.** MinHash/LSH for document Jaccard, suffix arrays for exact repeated substrings, SimHash for short texts. Embeddings detect "same meaning, different words", a different and riskier removal criterion.

**What dedup buys.** D4: **>1 %** verbatim unprompted output, **10×** less memorization, **>4 %** validation overlap (P). Kandpal et al.: extraction grows superlinearly — a sequence present **10 times** is generated **~1,000×** more often (P). Muennighoff et al.: up to **4 epochs** of repeated data is "negligible" versus unique data; beyond that the value decays toward zero (P). DataComp: dedup alone moved ImageNet accuracy **0.195 → 0.200** across dedup thresholds, while adding CLIP top-30 % filtering reached **0.288** at 33.5M samples (P) — dedup was not the lever. Honest claim: dedup reduces memorization, leakage and compute; it does not reliably raise accuracy once quality filtering is in place.

### 2.4 Leakage and contamination

**Taxonomy (Kapoor & Narayanan, Patterns 2023):** no test set; preprocessing on all data; feature engineering on all data; duplicate rows; temporal leakage; non-independence (same patient/user/scene/document); sampling leakage. Their survey finds **329 papers across 17 fields** affected, sometimes with "wildly overoptimistic conclusions"; in one civil-war literature, complex ML did not beat logistic regression once leakage was removed (P).

**Detection ladder.** (1) Exact row: SHA-256 equality, `O(n)`, zero false positives. (2) Near-duplicate pair: text Jaccard or image cosine ≥ τ; dHash Hamming ≤ 6 only as a variance-guarded prefilter. (3) Cluster leakage: build connected components over near-duplicate pairs *before* splitting; if a component spans train/test, the split is contaminated even when no single pair was noticed. (4) Group leakage: a group key (patient, source URL, session, cluster) in both splits. (5) Temporal leakage: `max(train time) ≥ min(test time)`. (6) Benchmark contamination: overlap with a named eval set, including paraphrases.

**Measured contamination is not one number.** D4 found **>4 %** validation overlap and cites **13.2 %** LM1B test/train overlap (P). Yang et al. found **8–18 %** HumanEval overlap in RedPajama-Data-1T and StarCoder-Data; a 13B model can reach GPT-4-level scores on MMLU/GSM8K/HumanEval when paraphrased test data is present, and n-gram decontamination misses it (P). GSM1k, a fresh GSM8K-style benchmark, produced drops of **up to 13 %** in the arXiv v1 (**up to 8 %** in the NeurIPS 2024 version) for models suspected of overfitting GSM8K (P). There is no defensible "typical percentage": report a measured overlap for the specific corpus/benchmark pair, with detector and threshold named, or report nothing.

**Severity inversion** = assigning a stronger severity to a lower-precision detector. The current engine is a concrete case: `RULE_SPLIT_LEAK_PERCEPTUAL_PHASH` is BLOCKING on a dHash whose flat-image output is all zeros (M), while exact duplicates are only WARNING. The expected cost of a blocking false positive is a blocked release and `force=True`; once users learn that, every blocking rule loses authority.

**Group/time-aware splits.** Split by entity/group (`GroupKFold` semantics), by timestamp (`TimeSeriesSplit` semantics) with `max(train) < min(test)`, and by near-duplicate connected component. The engine detects violations; the splitter must be group/cluster-aware. Record the policy and seed in the version manifest.

### 2.5 Class imbalance

**Logit adjustment (Menon et al., ICLR 2021).** With priors `π_y`:

```
argmax_y f_y(x) + τ log π_y                  (post-hoc; τ=1 canonical)
loss: −log[ exp(f_y + τ log π_y) / Σ_j exp(f_j + τ log π_j) ]
```

This is Fisher-consistent for the **balanced error** `(1/L) Σ_y P(x|y)(y ∉ argmax)`; weight normalisation is not (P). Balanced error (%, lower better): CIFAR-10-LT **27.16 → 22.33** (loss, τ=1) or **19.08** (post-hoc, best τ); CIFAR-100-LT **61.64 → 56.11**; ImageNet-LT **53.11 → 48.89**; iNaturalist **38.66 → 33.64** (P, Table 3). These are balanced-error gains, not top-1. Post-hoc adjustment is nearly free.

**Class-balanced loss (Cui et al., CVPR 2019).** Effective number `E_n=(1−β^n)/(1−β)`, weight `∝1/E_n`. iNaturalist 2018 ResNet-50 top-1 error **42.86 → 38.88** (CB focal, 224px); iNat 2017 **45.38 → 41.92**; ILSVRC **23.92 → 22.71** (P, Table 3). Real, but on a different metric (top-1 error) from logit adjustment's balanced error, and `β` is another hyperparameter.

**When it hurts.** Buda et al.'s CNN study: imbalance is detrimental; **oversampling** dominated almost all settings; oversample until imbalance is eliminated; oversampling does not necessarily overfit CNNs; thresholding compensates priors when the number of correct classifications matters (P). Much of the apparent harm is **decision-threshold/prior bias**, fixable post-hoc without touching data; the residual harm is **representation starvation** for genuinely rare, diverse classes. A 95/5 prior may be a faithful deployment sample: flag imbalance only when minority support is low *and* the metric of record is macro/balanced or minority recall (I).

**Oversampling versus generation.** Oversampling is cheap, deterministic and supported by Buda. Generative oversampling can add tail diversity that duplication cannot, but adds mode collapse, artefacts and label drift; it is not a substitute for real tail data. Default to class weights/logit adjustment at training time, resampling for evaluation support, and keep generation as an explicit, disclosed intervention (`INFO_SYNTHETIC_PROPORTION`).

---

## 3. Evidence table

| Method | Venue / year | Claimed gain (as published) | Dataset | Caveats |
|---|---|---|---|---|
| Confident learning | JAIR 2021 | Consistent `Q(ỹ,y*)`; exact errors under ideal probs; beats 7 baselines (P) | CIFAR, ImageNet, Amazon | CNP; OOS probs; 51 % flag precision |
| Pervasive Label Errors | NeurIPS 2021 D&B | ≥3.3 % avg test error; ImageNet ≥6 % (2,916); QuickDraw ~10 % (5M); 51 % flags confirmed (P) | 10 test sets | Human validation; lower bound |
| Data Maps | EMNLP 2020 | 33 % ambiguous: 78.7 ID / 87.6 OOD vs 79.7 / 86.0 (P) | WinoGrande, SNLI | Full training; model-relative |
| AUM | NeurIPS 2020 | −17 % data → −1.6 error (WebVision50); −13 % → −1.2 (CIFAR-100) (P) | WebVision, CIFAR | Full training; per-epoch logits |
| Influence functions | ICML 2017 | Debugging/error detection; no cleaning benchmark (P) | Linear, CNNs | HVP; non-convex approximation |
| TracIn | NeurIPS 2020 | Influence from checkpoints; no cleaning benchmark (P) | CIFAR-style | Many checkpoints |
| Forgetting events | ICLR 2019 | Large fraction omittable at SOTA (P) | CIFAR | Training-time only |
| Symmetric CE | ICCV 2019 | Beats SOTA under synthetic noise (P) | CIFAR-10/100 | Loss, not audit |
| Generalized CE | NeurIPS 2018 | Robust loss family; MAE can fail (P) | CIFAR, FMNIST | No per-record output |
| Co-teaching | NeurIPS 2018 | Superior robustness at high noise (P) | MNIST, CIFAR | Two networks |
| DivideMix | ICLR 2020 | Substantial gains under high noise (P) | CIFAR, Clothing1M | Semi-supervised; costly |
| LLM label audit | EMNLP 2025 | 6–21 % errors; >2/3 precision at >95 % conf.; +4 % train, +15 % eval (P) | 4 TRUE datasets | Binary; LLM cost/bias |
| D4 dedup | ACL 2021 | 10× less memorization; >4 % val overlap; 1 % verbatim (P) | C4, LM1B | English; memory |
| SemDeDup | arXiv 2023 | −50 % data, minimal loss, ~2× faster; 10–15 % less compute (P) | LAION-440M, C4 | Preprint; 50k clusters |
| DataComp dedup | NeurIPS 2023 D&B | Dedup alone 0.195 → 0.200; +CLIP top-30 % 0.288 (P) | 12.8B pool | Small dedup-only effect |
| Kandpal dedup | ICML 2022 | 10 duplicates → ~1,000× generations; dedup reduces extraction (P) | C4 | Privacy, not accuracy |
| Muennighoff repetition | NeurIPS 2023 | ≤4 epochs ≈ unique; value decays to zero (P) | 400 runs | Fixed-compute regime |
| Logit adjustment | ICLR 2021 | CIFAR-10-LT 27.16→22.33/19.08; CIFAR-100 61.64→56.11; IN-LT 53.11→48.89; iNat 38.66→33.64 (P) | LT benchmarks | Balanced error |
| Class-balanced loss | CVPR 2019 | iNat18 42.86→38.88; iNat17 45.38→41.92; ILSVRC 23.92→22.71 (P) | iNat, ILSVRC | β tuning |
| CNN imbalance study | Neural Networks 2018 | Imbalance detrimental; oversampling dominant (P) | MNIST, CIFAR, ImageNet | ROC-AUC |
| Leakage survey | Patterns 2023 | 329 papers / 17 fields (P) | Survey | Lower bound |
| GSM1k | NeurIPS 2024 D&B | Up to 13 % drop (v1; 8 % NeurIPS) (P) | GSM8K-style | Model-family dependent |
| LLM decontamination | arXiv 2023 | 8–18 % HumanEval overlap; 13B matches GPT-4 when contaminated (P) | MMLU, GSM8K, HumanEval | LLM detector; preprint |

---

## 4. Replacement design for the quality engine

### 4.1 Module layout

```
packages/dataset_quality/
  engine.py                 # orchestrator
  policy.py                 # severities, thresholds
  structural.py             # empty/schema/assets/text/timestamps (deterministic)
  embeddings/
    base.py                 # backend + cache key
    text.py                 # bge-small / model2vec
    image.py                # DINOv2 / CLIP; variance-guarded dHash fallback
    store.py                # SQLite float32 BLOB cache; optional sqlite-vec
  dedup/
    exact.py                # sha256 + normalized-text hash
    minhash.py              # MinHashLSH + exact-Jaccard verification
    simhash.py              # optional short-text prefilter
    semantic.py             # k-means + cosine threshold (SemDeDup-style)
  label_errors/
    probe.py                # OOF linear probe on frozen embeddings
    confident_learning.py   # CJ, calibration, ranking
    llm_audit.py            # optional local-LLM second stage
  leakage.py                # exact/near/cluster/group/time
  imbalance.py              # effective number, support, ratio
  clustering.py             # PCA/hexbin over embeddings
  report.py                 # findings + evidence
```

`engine.py` stays network-free and GPU-free; embeddings are an optional extra, and every rule degrades to a deterministic fallback.

### 4.2 Rule inventory

**Keep (deterministic, BLOCKING):** `RULE_EMPTY_DATASET` (O(1)), `RULE_UNRESOLVED_REVIEWS` (O(n)), `RULE_MISSING_ASSETS` (O(a)), `RULE_EMPTY_CONTENT` (O(a)), `RULE_EMPTY_TEXT` (O(n)), `RULE_AUDIO_TIMESTAMPS` (O(segments); add overlap/gap checks). **Strengthen** `RULE_SCHEMA_MISMATCH` into typed per-task validation (Pydantic), including bbox `0 ≤ x1 < x2 ≤ W`, `area > 0`, no duplicate boxes, vocabulary membership.

**Replace and add:**

| Rule | Algorithm | Complexity | Severity |
|---|---|---|---|
| `RULE_SPLIT_LEAKAGE_EXACT` (replaces `RULE_SPLIT_LEAKAGE`) | SHA-256 set intersection across splits | O(n) | BLOCKING |
| `RULE_DUPLICATE_EXACT` (merges exact duplicates/text) | SHA-256 + normalized-text hash | O(n) | WARNING within; BLOCKING cross-split |
| `RULE_NEAR_DUP_TEXT` | MinHash LSH on 5-gram shingles, exact Jaccard verify | O(n·s + cand·s) | WARNING; BLOCKING cross-split at J≥0.9 |
| `RULE_NEAR_DUP_IMAGE` (replaces pHash rule) | Embedding cosine; dHash prefilter with variance guard | O(n²d) brute force or ANN | BLOCKING cross-split at ≥0.98; WARNING ≥0.95 |
| `RULE_LABEL_ERROR_CL` (replaces k-NN vote) | CL over OOF probe probabilities | O(nm+m²)+probe | WARNING (ranked queue) |
| `RULE_DUPLICATE_LABEL_CONFLICT` | Same near-dup cluster, different labels | O(cluster) | WARNING |
| `RULE_GROUP_LEAKAGE` | Group key across splits | O(n) | BLOCKING if key present |
| `RULE_TEMPORAL_LEAKAGE` | max train time vs min test time | O(n) | WARNING |
| `RULE_LONG_TAIL` (replaces 80 % rule) | Effective number + support + ratio | O(n+m) | WARNING if support <20; INFO else |
| `RULE_HASH_DEGENERATE` | Grayscale variance / gradient energy floor | O(a) | INFO |

`INFO_SYNTHETIC_PROPORTION` and `RULE_CROSS_MODAL_NEGATION_CONTRADICTION` stay INFO/WARNING.

**Defaults, not truths.** Text: 5-gram shingles, J≥0.8 warning, J≥0.9 blocking across splits, ≥20 tokens. Image: DINOv2 ViT-S/14 cosine ≥0.98 blocking across splits, ≥0.95 warning; dHash Hamming ≤4 only when `std(gray) ≥ 8` and gradient energy exceeds a floor. CL: bottom 2 % or `margin < 0` with `p̂(given) < t_given`, only when OOF accuracy ≥ `max(0.5, 2×chance)` and each class has ≥20 examples. Store every default in run metadata.

### 4.3 Minimal viable embedding stack

| Modality | Default | Dim | Params | License | Why |
|---|---|---|---|---|---|
| Text (quality) | `BAAI/bge-small-en-v1.5` | 384 | 33.4M | MIT | Strong small MTEB model; CPU/ONNX |
| Text (speed) | `minishlab/potion-base-8M` | 256 | 7.56M | MIT | ~92 % of MiniLM MTEB at far lower cost (P: model card) |
| Image (quality) | `facebook/dinov2-small` ViT-S/14 | 384 | 21M | Apache-2.0 | Strong dense features, CPU-feasible |
| Image (optional) | DINOv3 ViT-S/16 | — | — | DINOv3 custom license | Better features; numbers unverified (U); license review required |
| Image (copy) | SSCD ResNet-50 | 512 | — | MIT | Copy detection under transforms |
| Index ≤100k | NumPy blocked cosine | — | — | BSD | 20k×384: 1.4 s measured (M) |
| Index >100k | sqlite-vec 0.1.9 / usearch 2.26.6 | — | — | MIT / Apache-2.0 | Local ANN; sqlite-vec is pre-v1 |

Do not default to DINOv3 until its custom license is reviewed; DINOv2 is Apache-2.0 and sufficient. Keep `torch` out of the core install: text via ONNX (`fastembed`), image via an optional `[vision]` extra. Cache normalized float32 vectors keyed by `(asset_id, model_id, dim, preprocessing_hash)`; a model change invalidates the cache rather than mixing spaces.

**Budget.** Structural `O(n+a)`; exact `O(n)`; MinHash `O(n·s)` with `s=128`. Encoding dominates: ViT-S/14 at 224² is a few GFLOPs per image (I), so 10k images is minutes on CPU. Pair search is not the bottleneck: 20k×384 blocked cosine took **1.4 s**, 5k **0.1 s** (M); 100k extrapolates to ~35 s (I). Reserve ANN for >100k.

### 4.4 Thresholds, calibration and severity policy

1. **Calibrate on a planted-error fixture.** Before enabling a probabilistic rule, run it on known injected errors (label flips, paraphrases, crops, cross-split copies) and record precision/recall in the run.
2. **Earn severity.** BLOCKING iff deterministic and zero observed false positives on the fixture (empty, missing asset, schema, exact SHA cross-split, group key). Probabilistic rules are WARNING; promote only after ≥200 audited positives with a Wilson lower bound on precision ≥0.99 (see R4 for interval machinery).
3. **Cap the queue.** CL emits ≤`max(50, 2 % of n)` candidates, ranked by margin, each with probe OOF accuracy and estimated noise rate. Never auto-delete.
4. **Fail closed.** If the probe cannot reach the accuracy gate, emit `INFO_LABEL_AUDIT_UNAVAILABLE` with the reason instead of a misleading finding.
5. **Determinism.** Sort by `(severity, rule_id, count)` and lexicographic IDs; seed k-means/CV; record library versions.

### 4.5 Tests and acceptance criteria

- **Degenerate-hash regression:** flat gray, vertical/horizontal gradients and checkerboard must not yield a cross-split duplicate finding. Fails at HEAD (M).
- **CL math:** hand-computed fixture for `t_j`, `C`, `C̃` row sums, `trace(Q̂)`; cross-check against cleanlab 2.9.0 (Apache-2.0).
- **Injected-error benchmark:** 5k samples, 20 classes, 10 % flips, probe accuracy ≥0.75 → top-k precision and recall ≥0.70 (our 0.85 at 0.78 suggests this is achievable; M/I).
- **Dedup recall:** plant 1 % paraphrases and 1 % crops; require ≥95 % recall at ≤1 % false-positive pairs, verified exactly.
- **Leakage:** a 10-item cluster split 8/2 is one cluster-level finding, not 16 pairwise warnings.
- **Performance:** 20k text records <120 s; 10k images <20 min on 4 CPU cores (I: encode-dominated).
- **Determinism:** two runs produce byte-identical findings after canonical JSON.

### 4.6 Migration

**Phase 0 (hours):** rename `compute_phash` → `compute_dhash`; add the variance guard; downgrade the perceptual-leakage rule to WARNING. Removes the demonstrated false-block mode.
**Phase 1 (days):** exact SHA cross-split → BLOCKING; normalized-text exact duplicates; MinHash LSH; long-tail support rule. Only `datasketch` added.
**Phase 2 (1–2 weeks):** embedding cache + text probe + real CL; DINOv2 image near-dup; cluster-aware split audit.
**Phase 3 (optional):** local-LLM audit, benchmark-overlap index, SSCD copy detection.

---

## 5. Dead ends

- **Swapping dHash for pHash.** It does not fix low-information images (all AC coefficients ~0; bits become numerical noise) and adds no crop/rotation invariance.
- **Any 64-bit hash as the primary near-duplicate detector.** It cannot represent semantics, and Hamming thresholds conflate "same scene" with "same source".
- **k-NN majority vote labelled "confident learning".** No noise model, no calibration, no guarantee; the audit measured 18–25 % false positives on clean binary data. Tuning `K` does not make it CL.
- **Data maps/AUM/forgetting/TracIn/influence as the default audit.** All require training the downstream model, sometimes repeatedly; excellent training telemetry, wrong pre-training gate.
- **Noisy-label losses as a substitute for auditing.** They change learning, produce no review queue, and can hurt clean-data accuracy.
- **Dedup as an accuracy silver bullet.** DataComp shows ~+0.5 point after CLIP filtering; the reliable gains are memorization, leakage and compute.
- **The 80 % class-ratio rule.** Flags faithful deployment priors and misses a 12-example rare class with no evaluation support.
- **n-gram-only contamination detection.** Paraphrase and translation evade it (8–18 % HumanEval overlap found by LLM decontamination).
- **UMAP/t-SNE "semantic cluster maps".** Non-deterministic, density-distorting, not a coverage estimator. If a 2-D view is needed, use PCA plus hexbin density and report explained variance.
- **LLM-only label auditing.** 6–21 % detection, per-record cost, its own bias; use as a second stage after CL ranks the queue.

---

## 6. References

1. Northcutt, Athalye, Mueller. *Confident Learning.* JAIR 2021. https://doi.org/10.1613/jair.1.12125 · https://arxiv.org/abs/1911.00068
2. Northcutt, Athalye, Mueller. *Pervasive Label Errors in Test Sets…* NeurIPS 2021 D&B. https://arxiv.org/abs/2103.14749 · https://labelerrors.com
3. Swayamdipta et al. *Dataset Cartography.* EMNLP 2020. https://doi.org/10.18653/v1/2020.emnlp-main.746
4. Pleiss et al. *Area Under the Margin Ranking.* NeurIPS 2020. https://arxiv.org/abs/2001.10528
5. Koh & Liang. *Influence Functions.* ICML 2017. https://arxiv.org/abs/1703.04730
6. Pruthi et al. *TracIn.* NeurIPS 2020. https://arxiv.org/abs/2002.08484
7. Toneva et al. *Example Forgetting.* ICLR 2019. https://arxiv.org/abs/1812.05159
8. Wang et al. *Symmetric Cross Entropy.* ICCV 2019. https://arxiv.org/abs/1908.06112
9. Zhang & Sabuncu. *Generalized Cross Entropy.* NeurIPS 2018. https://arxiv.org/abs/1805.07836
10. Han et al. *Co-teaching.* NeurIPS 2018. https://arxiv.org/abs/1804.06872
11. Li et al. *DivideMix.* ICLR 2020. https://arxiv.org/abs/2002.07394
12. Nahum et al. *Are LLMs Better than Reported?* EMNLP 2025. https://arxiv.org/abs/2410.18889
13. Tan et al. *LLMs for Data Annotation and Synthesis: A Survey.* EMNLP 2024. https://aclanthology.org/2024.emnlp-main.54/
14. Lee et al. *Deduplicating Training Data Makes LMs Better.* ACL 2021. https://arxiv.org/abs/2107.06499
15. Abbas et al. *SemDeDup.* arXiv 2023. https://arxiv.org/abs/2303.09540
16. Gadre et al. *DataComp.* NeurIPS 2023 D&B. https://arxiv.org/abs/2304.14108
17. Kandpal, Wallace, Raffel. *Deduplicating Training Data Mitigates Privacy Risks.* ICML 2022. https://arxiv.org/abs/2202.06539
18. Muennighoff et al. *Scaling Data-Constrained LMs.* NeurIPS 2023. https://arxiv.org/abs/2305.16264
19. Kapoor & Narayanan. *Leakage and the Reproducibility Crisis.* Patterns 2023. https://arxiv.org/abs/2207.07048
20. Zhang et al. *GSM1k.* NeurIPS 2024 D&B. https://arxiv.org/abs/2405.00332
21. Yang et al. *Rethinking Benchmark and Contamination…* arXiv 2023. https://arxiv.org/abs/2311.04850
22. Menon et al. *Logit Adjustment.* ICLR 2021. https://arxiv.org/abs/2007.07314
23. Cui et al. *Class-Balanced Loss.* CVPR 2019. https://arxiv.org/abs/1901.05555
24. Buda, Maki, Mazurowski. *Class imbalance in CNNs.* Neural Networks 2018. https://arxiv.org/abs/1710.05381
25. Broder. *Resemblance and containment.* SEQUENCES 1997. https://doi.org/10.1109/SEQUEN.1997.666900
26. Charikar. *Similarity estimation via rounding.* STOC 2002. https://doi.org/10.1145/509907.509965
27. Indyk & Motwani. *Approximate nearest neighbors.* STOC 1998. https://doi.org/10.1145/276698.276876
28. Manber & Myers. *Suffix Arrays.* SIAM J. Comput. 1993. https://doi.org/10.1137/0222058
29. Xia et al. *FastCDC.* USENIX ATC 2016. https://www.usenix.org/conference/atc16/technical-sessions/presentation/xia
30. Kaufman et al. *Leakage in Data Mining.* TKDD 2012. https://doi.org/10.1145/2382577.2382579
31. Oquab et al. *DINOv2.* TMLR 2024. https://arxiv.org/abs/2304.07193 · https://github.com/facebookresearch/dinov2
32. Siméoni et al. *DINOv3.* arXiv 2025. https://arxiv.org/abs/2508.10104
33. Pizzi et al. *SSCD.* CVPR 2022. https://arxiv.org/abs/2202.10261
34. BAAI. *bge-small-en-v1.5.* https://huggingface.co/BAAI/bge-small-en-v1.5
35. Minish. *potion-base-8M.* https://huggingface.co/minishlab/potion-base-8M
36. Cleanlab 2.9.0 (Apache-2.0). https://github.com/cleanlab/cleanlab
37. datasketch 2.0.0 (MIT). https://github.com/ekzhu/datasketch
38. imagehash 4.3.2 (BSD). https://github.com/JohannesBuchner/imagehash
39. sqlite-vec 0.1.9 (MIT/Apache-2.0, pre-v1). https://github.com/asg017/sqlite-vec
40. usearch 2.26.6 (Apache-2.0). https://github.com/unum-cloud/usearch
41. fastembed 0.9.1. https://github.com/qdrant/fastembed
42. scikit-learn. *Cross-validation* (GroupKFold, TimeSeriesSplit). https://scikit-learn.org/stable/modules/cross_validation.html
