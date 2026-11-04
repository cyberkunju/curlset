# R5 — Active Learning, Data Selection, Embeddings and Coverage

**Date:** 2026-11-04 · **Scope:** Curlset (`C:\Users\knava\Downloads\curlset\repo`), FastAPI + SQLAlchemy + React, SQLite/Postgres, CPU-first.
**Markers:** `[P]` paper-reported number; `[M]` measured here; `[I]` my inference/estimate; `[V]` verified from model/code repository. Unmarked §4 numbers are design parameters.

## 1. Executive summary

- **The current map is not a weak method; it is not a measurement.** `dataset_quality/clustering.py` builds a 24-word vocabulary from `extra_metadata["text"]`, so filename-only image datasets produce zero vectors, PCA returns `(0,0)` for every record, and `density` is hard-coded to `1.0` (line 171).
- **Highest ROI: TypiClust for the cold start, BADGE afterwards, k-center/dedup as a constraint.** Both run on frozen embeddings, CPU-only, with no training loop. For detection use object-level entropy plus image diversity; for segmentation image-level entropy/margin plus diversity, with random+SSL as the baseline.
- **Expect modest gains.** Fair re-evaluations find entropy as good as complex methods, some methods below random `[P]`. Credible wins are 0–3 accuracy points or 20–40% fewer labels; Cluster-Margin's 60% needs 1M-example batches `[P]`, and TypiClust's +39.4 points is a 10-label result `[P]`.
- **SSL gains are real but out of scope.** FixMatch reaches 94.93% on CIFAR-10 with 250 labels `[P]`, but only by training on unlabeled images. A curation platform cannot book that gain. LLM pseudo-label ensembles already saturate internally (0.542 vs 0.542 in the correlated audit), so do not build them.
- **Best local stack:** DINOv2 ViT-S/14 (384-d, Apache-2.0) for images, BGE-small-en-v1.5 (384-d, MIT) for text, both ONNX. Exact NumPy kNN suffices to 1M: 0.43 / 0.84 / 8.13 ms per query at 10k / 100k / 1M `[M]`. HNSW only above 1M.

## 2. Method findings

### 2.1 Uncertainty and Bayesian AL

```
least confidence : 1 - max_c p(y=c|x)
margin           : p_(1) - p_(2)              (select smallest)
entropy          : H(x) = -Σ_c p_c log p_c
BALD             : I(x) = H[y|x,D] - E_{p(ω|D)} H[y|x,ω]
```

BALD measures epistemic uncertainty as mutual information `[P]`; MC-dropout approximates the posterior with T stochastic passes `[P]`; Deep Ensembles trains M models and averages predictive distributions `[P]`. Ensembles calibrate best but cost M trainings and M inferences.

Failure modes dominate method choice: networks are overconfident, so entropy ranks by confidence rather than information `[P]` (Guo et al., 2017); pure uncertainty sampling selects outliers, which Settles & Craven's information density mitigates by weighting average pool similarity `[P]`; and per-point scores ignore duplicate points in a batch.

Curlset stores only a scalar `AnnotationModel.confidence`, not a class distribution. Entropy, margin, BALD and MC-dropout are therefore **not computable** without inventing one. Ship least-confidence only, with provenance, until a provider stores per-class probabilities or ensemble members.

### 2.2 Diversity: core-set, BADGE, TypiClust, Cluster-Margin

**Core-set** (Sener & Savarese, ICLR 2018) solves

```
min_{S⊆P, |S|=B} max_{x∈P} min_{s∈S} Δ(x,s)
```

Greedy farthest-point selection is a 2-approximation of this NP-hard objective (Gonzalez, 1985) and needs no labels. The paper reports large gains over uncertainty and random on CIFAR-10/100 and SVHN, with no single scalar `[P]`.

**BADGE** (Ash et al., ICLR 2020) clusters last-layer gradient embeddings:

```
g_x = ( p(x) - onehot(ŷ(x)) ) ⊗ z(x)
```

k-means++ seeding on `{g_x}` yields high-norm (uncertain) and dispersed (diverse) points with no trade-off hyperparameter `[P]`; the paper claims "as well or better" rather than a scalar `[P]`. This fits Curlset: a logistic head on frozen embeddings has exactly this gradient, computable in NumPy.

**TypiClust** (Hacohen et al., ICML 2022) clusters into `|L|+B` clusters and picks the most typical point from the B largest uncovered clusters:

```
typicality(x) = 1 / ( (1/k) Σ_{j=1..k} ||x - x_j|| )
```

CIFAR-10 with 10 labels reaches 93.2%, +39.4% over random `[P]`. The same paper shows uncertainty/diversity baselines tie or lose to random at low budget, and typicality *fails at high budget* `[P]`. Use it as a bootstrap, not a permanent policy.

**Cluster-Margin** (Citovsky et al., 2021) clusters the pool with HAC and round-robins low-margin points across clusters. Open Images: 29% fewer labels at batch 100K, 60% at 1M, and 37%/71% of Margin's labels `[P]`. Strongest verified reduction, but classification at huge batches, not COCO.

Rule: core-set/TypiClust when no labels, BADGE when a cheap head exists, Cluster-Margin only above ~10k batch. Deduplicate every batch at cosine > 0.98–0.99.

### 2.3 Cold start and cold pool

**Cold start** means no model, so no uncertainty; only embedding geometry exists. TypiClust and core-set target it. ALPS (Yuan et al., EMNLP 2020) does the text analogue with self-supervised LM probabilities; ODAL (2021) targets imbalanced cold-start streams, reporting gains up to 80% over random using 2–10% of labels `[P]` (the metric is undefined in the abstract, so treat it as directional).

**Cold pool** means the class or phenomenon is absent from the unlabeled pool. No acquisition function can select what is not there; the fix is source expansion, open-set detection or targeted synthesis `[I]`. Detect it explicitly: a class in `label_schema` with zero pool instances should raise a coverage warning, not a ranking.

Curlset is normally in cold start: most datasets have zero approved labels, yet `least_confidence` scores every unannotated record 0.0 and sorts by database order — primary-key selection.

### 2.4 Detection and segmentation

Image-level uncertainty is diluted in detection: one hard object among fifty easy ones barely moves the image score. Methods that work score regions:

- **Choi et al. (ICCV 2021)** use mixture-density heads and combine aleatoric and epistemic uncertainty in one pass. VOC07: 0.7598 mAP, +2.6 over LLAL (0.7338) and up to +2.52 over random `[P]`; their COCO subset gains only 30.51 vs 29.83 at 7k images, about +0.7 mAP `[P]`.
- **CALD (CVPRW 2022)** uses original/augmented consistency and region scores: +2.9 / +2.8 / +0.8 mAP over random on VOC07 / VOC12 / COCO `[P]`.
- **Hsu et al. (ICCV 2019)** score region-level mutual information; better than random on pedestrians and BDD100K, but at cycle 14 they still use only 13% of data and do not reach 100%-label accuracy `[P]`.

No verified detection paper reports a clean "% labelling cost reduction" on COCO; they report mAP at fixed budgets. Gains are +0.7 to +2.9 mAP and shrink under fair tuning: the 2024 "Deep Active Learning: A Reality Check" trained 3,000+ networks and found no single-model method decisively beats entropy, some fall below random, and detection entropy beating random by a peak of 1.7 points `[P]`. "Parting with Illusions" (2019) finds AL "barely" beats random with modern augmentation `[P]`.

Segmentation: Suggestive Annotation (MICCAI 2017) reports SOTA gland/lymph-node segmentation with 50% of data `[P]`. But the 2023 "Best Practices" study finds random+SSL best at low budget on diverse data and AL "highly volatile"; on diverse PASCAL-VOC all methods perform similarly because all cover the distribution `[P]`.

Recommendation: detection = per-object entropy/margin aggregated to image (max/mean) then image k-center; segmentation = per-pixel entropy/margin plus image diversity; always report the random+SSL baseline.

### 2.5 Semi-supervised learning and pseudo-labelling

- **FixMatch (NeurIPS 2020):** pseudo-label if `max p ≥ τ`, train the strong view to match; 94.93% CIFAR-10 with 250 labels, 88.61% with 40 `[P]`.
- **Noisy Student (CVPR 2020):** teacher labels 300M unlabeled images, noisy student becomes next teacher; 88.4% ImageNet top-1, +2.0 `[P]`.
- **Mean Teacher (NeurIPS 2017):** EMA teacher supplies consistency targets; 4.35% error on SVHN with 250 labels, 6.28% on CIFAR-10 with 4,000 `[P]`.
- **MixMatch (NeurIPS 2019):** K augmentations, sharpening, MixUp; 11.08% error on CIFAR-10 with 250 labels `[P]`.

Momentum-weighted pseudo-labels are real: Mean Teacher is a weight-space EMA ensemble, and weighted teacher averaging is standard. But gains require in-distribution unlabeled data, strong augmentation, and actually training the target model. A curation platform only pre-labels; it cannot claim SSL gains. The in-scope use is model proposals as `origin=model` annotations entering review.

The project's own audit is decisive for LLM ensembles: with 45% shared failures, three models agreeing gave 0.542 accuracy versus 0.542 for the best member; reweighting could not help, and agreement was kappa 0.83 at 55% accuracy. Correlated-error detection, not aggregation, was the control.

### 2.6 Embeddings and indexes

Verified metadata: DINOv2 ViT-S/14 is 22.1M params, 384-d, Apache-2.0 `[V]`; ViT-B/14 is 86.6M, 768-d `[V]`. DINOv3 ViT-S/16 is 21.6M but gated under a custom, non-OSI licence with redistribution/publication terms `[V]`; it reports stronger dense features than prior foundation models `[P]`. SigLIP 2 Base is 375M total, 768-d, Apache-2.0 `[V]`. CLIP ViT-B/32 is 512-d, MIT `[V]`. BGE-small-en-v1.5 is 33.4M, 384-d, 512 tokens, MIT, ONNX `[V]`; E5-small-v2 is the same size with required `query:`/`passage:` prefixes `[V]`; GTE-base-en-v1.5 is 768-d, 8192 tokens, Apache-2.0 `[V]`; BGE-M3 is 1024-d, 8192 tokens, 100+ languages, MIT `[V]`.

**Image choice: DINOv2 ViT-S/14.** Apache-2.0, ONNX export, strong dense and global features without text supervision. Measured on this workstation (ONNX Runtime, 8 threads, 224×224): **73.0 ms/image at batch 1 and 37.9 ms at batch 8 FP32; 56.6 / 26.1 ms for INT8** `[M]` — 4.3 min per 10k images at batch-8 INT8, 43 min per 100k `[I, arithmetic]`. INT8 accuracy was not measured; validate before defaulting. Upgrade to SigLIP 2 Base when image-text alignment matters (Apache-2.0, ONNX, 3–5× slower `[I]`); CLIP ViT-B/32 (ONNX) is the light fallback. DINOv3 stays opt-in until its licence is reviewed.

**Text choice: BGE-small-en-v1.5.** MIT, 384-d, 512 tokens, ONNX. Measured at 128 tokens: **18.3–19.5 ms/text** across batch 1/8/32 `[M]`, about 3 min per 10k documents and 30 min per 100k `[I]`. Fallbacks: E5-small-v2 (same shape, prefixes), GTE-base-en-v1.5 for 8k-token documents, multilingual-e5-small (384-d, 118M `[V]`) or BGE-M3 for non-English. Qwen3-Embedding-0.6B is the Apache-2.0 quality ceiling but ~18× larger `[I]`.

Always L2-normalize; use the prescribed pooling (CLS for DINOv2, mean for BGE/E5); do not add BGE's retrieval instruction for symmetric tasks (dedup, clustering); keep image and text in separate indexes keyed by `model_id`. A 384-d image and 384-d text vector are not comparable.

**Index.** Exact NumPy kNN (float32, 384-d, 100 queries, chunked top-10), measured:

| N | Memory | Latency/query |
|---:|---:|---:|
| 10k | 15 MB | 0.43 ms `[M]` |
| 100k | 154 MB | 0.84 ms `[M]` |
| 1M | 1.5 GB | 8.13 ms `[M]` |

Exact search is the right default to 1M: no recall loss, no build, no dependency. HNSW gives logarithmic query complexity `[P]` and is worth adding above 1M or when 1.5 GB does not fit; `hnswlib` is Apache-2.0 `[V]`. FAISS (MIT `[V]`) with IVF-PQ is for 10M+ `[I]`.

### 2.7 Clustering, coverage and under-representation

- **k-means:** fast, deterministic, assumes spherical similar-size clusters; best for batch partitioning and coverage quotas, poor for elongated manifolds.
- **HDBSCAN:** variable density, no `k`, labels noise; weak on 384-d, so run UMAP to 5–10D first `[I]`. Noise points are rare-or-broken, not "deserts".
- **Leiden:** kNN-graph communities, guaranteed connected; Louvain can yield 25% badly connected and 16% disconnected communities `[P]`. `leidenalg` is GPL-3.0 `[V]`, incompatible with a permissive distribution; keep optional.
- **UMAP:** visualization, competitive with t-SNE and better at global structure `[P]`, but it does not preserve density or absolute distance `[I]`. Deserts computed on the 2D layout are artifacts.

Coverage must be measured in the original space:

```
covering radius  R(S) = max_{x∈P} min_{s∈S} ||x - s||
kNN density      d_k(x) = k / (N · V_d · r_k(x)^d)
redundancy       ρ_τ = |{x : ∃x'≠x, cos(x,x') > τ}| / N
```

Report the distribution of nearest-selected distances, `R(S)`, cluster sizes and redundancy. A "desert" is a region of the *current pool* far from any labeled/selected example, with distance and point count; it is not evidence that the phenomenon is absent from the world. These are distinct axes: redundancy = mutual similarity; coverage = spread over the pool; difficulty = model behaviour (loss, confidence, variability). Dataset Cartography `[P]` separates easy, hard and ambiguous examples by confidence mean vs variability, and shows ambiguous examples drive OOD generalization while hard ones correlate with label errors.

Without labels you can detect *rare-in-pool* clusters (long tail, low density) and *label concentration* (a class in few clusters, or many mixed clusters), but not *deployment under-representation* without a target sample. Domino `[P]` (36% of 1,235 slices, +12 points) needs model errors and cross-modal embeddings; it is a later feature, and every slice needs human confirmation because clusters carry the embedder's biases.

### 2.8 LLM/text data selection

- **Quality:** LIMA `[P]` used 1,000 curated examples and was preferred/equal to GPT-4 in 43% of cases (58% vs Bard, 65% vs DaVinci003). AlpaGasus `[P]` kept 9k of 52k Alpaca examples scored by ChatGPT, beat the full set, and trained 5.7× faster. DEITA `[P]` selects 6k SFT examples by complexity, quality and diversity, reaching 7.55 MT-Bench / 90.06% AlpacaEval after DPO.
- **Influence:** LESS `[P]` builds low-rank LoRA gradient features and selects examples similar to a few target examples; 5% often beats the full set and it beats random by 2–5 points across three models. Strongest targeted-SFT method, but needs gradients (GPU tier).
- **Distribution matching:** DSIR `[P]` computes `w(x)=p_target(x)/p_source(x)` over hashed n-grams and resamples; 100M Pile documents in 4.5 hours on CPU, +2–2.5% GLUE over random/heuristic filtering, KL reduction correlates with downstream accuracy at r=0.82. Best local-first fit.
- **Dedup/diversity:** SemDeDup `[P]` removes 50% of LAION with minimal loss; deduplicating C4 `[P]` cuts verbatim memorization 10×.

For 2026 SFT, the defensible order is exact/near dedup (MinHash), semantic dedup, DSIR target matching when a target exists, quality heuristics (length, repetition, refusals, instruction-response overlap), then cluster quotas. LLM-judge filtering last: most expensive and most gameable, and AlpaGasus/DEITA gains depend on strong paid judges; a local judge needs re-validation.

## 3. Evidence table

| Method | Venue/year | Claimed gain (type) | Dataset / budget | Caveats |
|---|---|---|---|---|
| Least confidence / margin / entropy | Settles survey, 2009 | No fixed gain; standard baselines `[P]` | Any classifier | Needs calibrated posteriors; outlier-prone |
| BALD | Houlsby et al., 2011 | Beats popular AL baselines `[P]` | GP classification | Posterior samples; batch-naive |
| MC-dropout | Gal & Ghahramani, ICML 2016 | Better likelihood/RMSE, not AL `[P]` | MNIST | Approximate; T× inference |
| Core-set | Sener & Savarese, ICLR 2018 | "Significantly outperforms"; no scalar `[P]` | CIFAR-10/100, SVHN | Label-free; outlier-prone; O(NKd) |
| BADGE | Ash et al., ICLR 2020 | "As well or better"; no scalar `[P]` | SVHN/CIFAR/OpenML | Trained head; gradient memory |
| TypiClust | Hacohen et al., ICML 2022 | 93.2% CIFAR-10 @10 labels, +39.4% over random `[P]` | 10 labels | Low budget only |
| Cluster-Margin | Citovsky et al., 2021 | 29% / 60% fewer labels @100K/1M batch `[P]` | Open Images | Huge batches; classification |
| CALD | CVPRW 2022 | +2.9/+2.8/+0.8 mAP vs random `[P]` | VOC07/VOC12/COCO | Detection-specific |
| Choi et al. | ICCV 2021 | +2.6 mAP over LLAL VOC07; ~+0.7 COCO `[P]` | 1k images/cycle | Mixture-density head |
| Suggestive Annotation | MICCAI 2017 | SOTA segmentation with 50% data `[P]` | Gland, ultrasound | Biomedical |
| Deep AL Reality Check | 2024 | Entropy as good as any; some below random; detection +1.7pp max `[P]` | 3,000+ nets, VOC07+12 | Strong negative result |
| Parting with Illusions | 2019 | AL "barely" beats random with augmentation `[P]` | CIFAR, segmentation | Fair protocol |
| Best Practices seg AL | 2023 | Random+SSL best at low budget; AL volatile `[P]` | Cityscapes/A2D2/VOC | Redundancy-dependent |
| ODAL cold start | 2021 | Up to 80% gain using 2–10% labels `[P]` | 4 imbalanced datasets | Metric ambiguous |
| FixMatch | NeurIPS 2020 | 94.93% CIFAR-10 @250; 88.61% @40 `[P]` | 40/250 labels | Requires training |
| Noisy Student | CVPR 2020 | 88.4% ImageNet, +2.0 `[P]` | Full labels + 300M unlabeled | Enormous corpus |
| Mean Teacher | NeurIPS 2017 | 6.28% error CIFAR-10 @4k; 4.35% SVHN @250 `[P]` | 250/4k labels | Training only |
| LESS | ICML 2024 | 5% often beats full; +2–5 over random `[P]` | 3 LLMs, targeted SFT | GPU gradients |
| DEITA | ICLR 2024 | 6K SFT: 7.55 MT-Bench, 90.06% AlpacaEval `[P]` | 6K SFT + 10K DPO | LLM judge |
| LIMA | 2023 | 1K examples; 43% preferred/equal vs GPT-4 `[P]` | 1K curated | Human curation |
| AlpaGasus | 2023 | 9K/52K beats Alpaca; 5.7× faster `[P]` | 52K Alpaca | ChatGPT filter |
| DSIR | NeurIPS 2023 | 100M docs/4.5h; +2–2.5% GLUE `[P]` | Pile | Pretraining focus |
| SemDeDup | 2023 | Remove 50%, minimal loss `[P]` | LAION, C4 | Threshold sensitive |
| Domino | ICLR 2022 | 36% slices found, +12pp `[P]` | 1,235 settings | Needs model errors |

## 4. Concrete redesign for Curlset

### 4.1 Pipeline

```
ingest -> resolve content (text | image asset)
       -> embed (DINOv2-S / BGE-small, batched, cached by content hash)
       -> persist (BLOB, float32, model_id, dim)
       -> index (NumPy exact <=1M; hnswlib above)
       -> project for display only (UMAP/PCA, fixed seed)
       -> cluster in high-dim (k-means; HDBSCAN on 5-10D optional)
       -> coverage (radius, kNN density, redundancy, cluster sizes)
       -> queue (TypiClust cold start -> BADGE; entropy for detection)
```

The projection is rendering only. No decision metric may be computed on 2D coordinates.

### 4.2 Modules

```
packages/dataset_embeddings/
  base.py registry.py onnx_text.py onnx_image.py
  cache.py store.py index.py
packages/dataset_selection/
  pool.py uncertainty.py coreset.py typiclust.py badge.py
  cluster_margin.py batch.py coverage.py service.py
services/api/routes/embeddings.py
services/api/routes/coverage.py
```

Delete `packages/dataset_evaluation/clustering.py` and its shadowed route at `services/api/routes/evaluation.py:154-160`. Replace the live `packages/dataset_quality/clustering.py` with the coverage service; keep `GET /clusters` as a compatibility endpoint with a corrected schema.

### 4.3 Database

Alembic revision adds:

- `dataset_embeddings(record_id PK, dataset_id, modality, model_id, dim, vector BLOB, content_hash, created_at)`, unique `(record_id, model_id)`, index `(dataset_id, model_id)`.
- `embedding_jobs(id, dataset_id, model_id, modality, status, total, done, error, timestamps)`.
- `selection_runs(id, dataset_id, strategy, params JSON, seed, created_at)`.
- `selection_scores(run_id, record_id, score, rank, components JSON)`.

Use `LargeBinary` on SQLite, `BYTEA` on Postgres. A 384-d float32 vector is 1,536 bytes as BLOB versus roughly 8–10 KB as JSON `[I]`.

### 4.4 Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/datasets/{id}/embeddings/build`; `GET /datasets/{id}/embeddings/status` | build job; counts and failures |
| GET | `/datasets/{id}/records/{rid}/neighbors?k=10` | semantic neighbors, leak/dedup |
| GET | `/datasets/{id}/duplicates?threshold=0.95` | duplicate groups |
| GET | `/datasets/{id}/clusters` | points, clusters, status, honest gaps |
| GET | `/datasets/{id}/coverage` | radius, density, redundancy, cluster sizes |
| GET | `/datasets/{id}/active-learning/queue` | strategies + `batch_size`, `seed`, `exclude_ids` |
| POST | `/datasets/{id}/selection-runs` | persist a reproducible queue |
| GET | `/datasets/{id}/selection-runs/{run_id}` | queue by rank |

Prefix all with `/api/v1`. Use unique paths to avoid the current router-shadowing bug. Keep the existing queue shape (`items`, `total`, `strategy`) and add `components`/`explain`.

### 4.5 Selector logic and cost

| Situation | Strategy | Complexity |
|---|---|---|
| Cold start, no labels | TypiClust, fallback k-center | k-means `O(NKdI)`; k-center `O(NdK)` |
| ≥10 labels/class, cheap head | BADGE on logistic regression | memory `O(NCd)`; seeding `O(NKCd)` |
| Batch >10k | Cluster-Margin | HAC `O(n²)` on confidence subset |
| Detection / segmentation | object or pixel entropy -> image score -> k-center | `O(objects)` / `O(pixels)` |
| Text SFT | DSIR + dedup + heuristics; LESS with GPU | `O(N)` hashing |

Implementation rules: train the BADGE head only on approved human/imported labels (never `origin=model`); require ≥2 classes and ≥5 examples/class, else TypiClust. BADGE gradients at 100k × 10 classes × 384 dims are 1.5 GB float32; PCA to 128–256 dims or chunk, and record the approximation in `params` `[I]`. k-center with K=1,000 over 100k × 384 is ~3.8×10^10 multiply-adds, seconds in NumPy `[I]`. Dedup every batch greedily at cosine 0.98. Persist the seed; selection must be reproducible.

### 4.6 No-text / image-only handling

Resolve the primary asset through `RecordAssetModel -> AssetModel.storage_key -> StorageBackend.read_bytes` and embed pixels. This is the fix for the `(0,0)` collapse.

1. **Never treat the filename or `str(metadata)` as semantic text.** Filenames are at most an explicit weak feature.
2. Missing/corrupt image -> `unembeddable` with a reason, excluded from the map and counted; never a zero vector.
3. Detection: two spaces — whole-image DINOv2 for diversity, box-crop vectors for object coverage ("2,000 cars but 12 bicycles").
4. Classification: labels color the map and drive per-class coverage; they are **not** concatenated into the vector (current code leaks label tokens and box count).
5. Text datasets: embed the canonical field from `dataset_io/text_normalize.py`.
6. Nothing embeddable -> `status: "no_embeddable_content"` with a fix hint. Honest empty states are a feature.

### 4.7 Frontend

`apps/web/src/components/EvaluationModal.tsx` and `ClusterMapModal.tsx` expect `points[].x/y/density/label` and `coverage_gaps[]`; update `apps/web/src/types.ts` with `status`, `clusters`, `coverage`, and make `coverage_gaps` optional. Render "not built", job progress and a coverage panel (radius, redundancy, cluster sizes). Always return `coverage_gaps: []` for old clients; the current UI crashes when it is missing.

### 4.8 Tests and ROI harness

**Unit:** BLOB roundtrip and cache hit/miss; k-center on five blobs covers every blob and decreases radius monotonically; BADGE on a 3-class toy gives larger gradient norm for the uncertain point and K distinct seeds; entropy/margin/least-confidence against hand-computed values and refusal without a distribution; TypiClust picks cluster centers, not an outlier; exact 1-D coverage radius/redundancy; image-only dataset has non-zero variance and non-constant density; 0/1 records return a status.

**Integration:** ingest 20 generated PNGs with no text, build embeddings with a deterministic stub, `GET /clusters` returns ≥2 clusters and distinct coordinates, `GET /coverage` finite metrics, `GET /queue?strategy=typi_clust` unique ids; with labels, `strategy=badge` returns no pair above cosine 0.99; OpenAPI has one `/clusters` and the response validates against the TS type.

**Performance:** 10k × 384 index build <5 s, p95 query <50 ms, throughput logged; 100k exact index <1 GB and <5 ms/query.

**ROI harness** (`experiments/al_benchmark.py`): start 1 label/class, batch 20, 10 seeds, logistic regression on frozen embeddings; compare random, least-confidence, entropy, margin, core-set, TypiClust and BADGE; report accuracy@budget, labels-to-target and area under the accuracy-vs-labels curve with bootstrap CIs. Run on scikit-learn digits (1,797 samples, public, offline) in CI and on a checked-in 2k-image fixture for the real stack. Gate merges on "no selector worse than random by >2 points at 20% budget", not published SOTA. This measures labels per accuracy point.

### 4.9 Rollout

1. Delete the dead module/route; fix the UI crash; add honest `status` states.
2. Embeddings table, ONNX backends, content-hash cache (DINOv2 + BGE).
3. Coverage metrics and new map; remove grid deserts and hard-coded density.
4. TypiClust/k-center cold-start queue, then BADGE; detection aggregation; dedup.
5. ROI harness and report before any user-facing label-savings claim.

## 5. Dead ends

- **2D grid deserts.** Density on PCA/UMAP is a projection artifact; the current code reports 24/25 cells as deserts. Delete it; use distance-based coverage in embedding space.
- **Character-trigram hash "embeddings."** 32 buckets have no semantic neighborhood; the confident-learning kNN vote is noise. Rename it neighbor-label-disagreement unless a real cross-validated confident-learning implementation is built.
- **Scalar-confidence sorting as AL.** With missing confidences the queue degenerates to unannotated-first; label it a work queue.
- **Entropy/margin/BALD without a distribution.** Synthesizing a distribution from one scalar is worse than least-confidence.
- **MC-dropout on a frozen linear head.** Not a useful posterior; Deep Ensembles cost M× and belong behind a provider adapter.
- **Core-set alone at high budget.** Optimizes coverage, not boundaries; can spend budget on outliers.
- **TypiClust at high budget.** The paper shows typicality loses once labels are plentiful.
- **UMAP/HDBSCAN as ground truth.** UMAP distorts density; HDBSCAN noise is not a semantic category.
- **Leiden in the default install.** GPL-3.0 `[V]`.
- **LLM-judge filtering as a local-first default.** Reported gains use paid judges; re-validate with a local judge.
- **LLM pseudo-label ensembles.** Correlated errors erase the lift; weighting cannot fix shared blindness.
- **Claiming SSL gains from curation.** FixMatch/Noisy Student gains require training.
- **HNSW at 10k.** 15 MB and 0.43 ms exact `[M]`; ANN adds recall risk for nothing.
- **Vectors as JSON.** 5–6× larger and slower; use BLOB with explicit dtype/dim.

## 6. References

Primary sources (URLs verified reachable 2026-11-04):

1. Settles, *Active Learning Literature Survey*, 2009. https://burrsettles.com/pub/settles.activelearning.pdf
2. Settles & Craven, *An Analysis of Active Learning Strategies for Sequence Labeling Tasks*, EMNLP 2008. https://aclanthology.org/P08-1028/
3. Houlsby et al., *Bayesian Active Learning for Classification and Preference Learning*, 2011. https://arxiv.org/abs/1112.5745
4. Gal & Ghahramani, *Dropout as a Bayesian Approximation*, ICML 2016. https://arxiv.org/abs/1506.02142
5. Lakshminarayanan et al., *Deep Ensembles*, NeurIPS 2017. https://arxiv.org/abs/1612.01474
6. Guo et al., *On Calibration of Modern Neural Networks*, ICML 2017. https://arxiv.org/abs/1706.04599
7. Sener & Savarese, *A Core-Set Approach*, ICLR 2018. https://arxiv.org/abs/1708.00489
8. Gonzalez, *Clustering to Minimize the Maximum Intercluster Distance*, 1985. https://doi.org/10.1016/0304-3975(85)90224-5
9. Ash et al., *BADGE*, ICLR 2020. https://arxiv.org/abs/1906.03671
10. Hacohen et al., *Active Learning on a Budget*, ICML 2022. https://arxiv.org/abs/2202.02794
11. Citovsky et al., *Batch Active Learning at Scale*, 2021. https://arxiv.org/abs/2107.14263
12. Choi et al., *AL for Deep Object Detection via Probabilistic Modeling*, ICCV 2021. https://arxiv.org/abs/2103.16130
13. *Consistency-based Active Learning for Object Detection*, CVPRW 2022. https://arxiv.org/abs/2103.10374
14. Hsu et al., *Active Learning for Deep Detection Neural Networks*, ICCV 2019. https://arxiv.org/abs/1911.09168
15. Yang et al., *Suggestive Annotation*, MICCAI 2017. https://arxiv.org/abs/1706.04737
16. Gashi et al., *Deep Active Learning: A Reality Check*, 2024. https://arxiv.org/abs/2403.14800
17. Mittal et al., *Parting with Illusions about Deep Active Learning*, 2019. https://arxiv.org/abs/1912.05361
18. Mittal et al., *Best Practices in AL for Semantic Segmentation*, 2023. https://arxiv.org/abs/2302.04075
19. *AL for Imbalanced Data under Cold Start*, 2021. https://arxiv.org/abs/2107.07724
20. Yuan et al., *Cold-start AL through Self-supervised Language Modeling*, EMNLP 2020. https://aclanthology.org/2020.emnlp-main.637/
21. Sohn et al., *FixMatch*, NeurIPS 2020. https://arxiv.org/abs/2001.07685
22. Xie et al., *Noisy Student*, CVPR 2020. https://arxiv.org/abs/1911.04252
23. Tarvainen & Valpola, *Mean Teacher*, NeurIPS 2017. https://arxiv.org/abs/1703.01780
24. Berthelot et al., *MixMatch*, NeurIPS 2019. https://arxiv.org/abs/1905.02249
25. Swayamdipta et al., *Dataset Cartography*, EMNLP 2020. https://arxiv.org/abs/2009.10795
26. Eyuboglu et al., *Domino*, ICLR 2022. https://arxiv.org/abs/2203.14960
27. McInnes et al., *UMAP*, 2018. https://arxiv.org/abs/1802.03426
28. Campello et al., *HDBSCAN*, PAKDD 2013. https://link.springer.com/chapter/10.1007/978-3-642-37456-2_14
29. Traag et al., *From Louvain to Leiden*, 2019. https://arxiv.org/abs/1810.08473
30. Malkov & Yashunin, *HNSW*, 2016. https://arxiv.org/abs/1603.09320
31. Johnson et al., *FAISS*, 2017. https://arxiv.org/abs/1702.08734
32. Radford et al., *CLIP*, 2021. https://arxiv.org/abs/2103.00020
33. Oquab et al., *DINOv2*, 2023. https://arxiv.org/abs/2304.07193
34. Siméoni et al., *DINOv3*, 2025. https://arxiv.org/abs/2508.10104
35. Tschannen et al., *SigLIP 2*, 2025. https://arxiv.org/abs/2502.14786
36. Wang et al., *E5*, 2022. https://arxiv.org/abs/2212.03533
37. Li et al., *GTE*, 2023. https://arxiv.org/abs/2308.03281
38. Xiao et al., *C-Pack / BGE*, SIGIR 2024. https://arxiv.org/abs/2309.07597
39. Chen et al., *BGE-M3*, 2024. https://arxiv.org/abs/2402.03216
40. Zhang et al., *Qwen3 Embedding*, 2025. https://arxiv.org/abs/2506.05176
41. Xia et al., *LESS*, ICML 2024. https://arxiv.org/abs/2402.04333
42. Liu et al., *DEITA*, ICLR 2024. https://arxiv.org/abs/2312.15685
43. Zhou et al., *LIMA*, 2023. https://arxiv.org/abs/2305.11206
44. Chen et al., *AlpaGasus*, 2023. https://arxiv.org/abs/2307.08701
45. Xie et al., *DSIR*, NeurIPS 2023. https://arxiv.org/abs/2302.03169
46. Abbas et al., *SemDeDup*, 2023. https://arxiv.org/abs/2303.09540
47. Lee et al., *Deduplicating Training Data Makes LMs Better*, ACL 2022. https://arxiv.org/abs/2107.06499

Model/tool metadata:

48. DINOv2-small (Apache-2.0, 22.1M, 384-d). https://huggingface.co/facebook/dinov2-small
49. DINOv3 (custom licence, gated). https://huggingface.co/facebook/dinov3-vits16-pretrain-lvd1689m · https://github.com/facebookresearch/dinov3/blob/main/LICENSE.md
50. SigLIP 2 Base (Apache-2.0, 375M). https://huggingface.co/google/siglip2-base-patch16-224
51. CLIP ViT-B/32 ONNX (MIT). https://huggingface.co/Xenova/clip-vit-base-patch32
52. BGE-small-en-v1.5 (MIT, 33.4M, 384-d). https://huggingface.co/BAAI/bge-small-en-v1.5
53. E5-small-v2 (MIT). https://huggingface.co/intfloat/e5-small-v2
54. GTE-base-en-v1.5 (Apache-2.0). https://huggingface.co/Alibaba-NLP/gte-base-en-v1.5
55. BGE-M3 (MIT). https://huggingface.co/BAAI/bge-m3
56. hnswlib (Apache-2.0). https://github.com/nmslib/hnswlib
57. FAISS (MIT). https://github.com/facebookresearch/faiss
58. UMAP (BSD). https://pypi.org/project/umap-learn/
59. HDBSCAN (BSD). https://github.com/scikit-learn-contrib/hdbscan
60. leidenalg (GPL-3.0). https://github.com/vtraag/leidenalg

Internal evidence:

61. `docs/ENSEMBLE_PSEUDO_LABELING.md` — correlated audit: 0.542 vs 0.542 accuracy, kappa 0.83 at 55% accuracy.
62. `studies/00-MASTER-DOSSIER.md` §5 — `(0,0)` collapse, hard-coded density, 24/25 deserts, dead clustering route.