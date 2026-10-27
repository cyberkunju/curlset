# Core Features & Architecture Upgrades (`docs/EXISTING_FEATURES_UPGRADES.md`)

**Status:** Authoritative Implementation Specification  
**Architecture Rule:** Preserve all existing Phase numbers (`Phase 0` through `Phase 15`) and deliver zero-cost, zero-Docker native local execution.

---

## 1. Zero-Lag No-Docker Native / Web-Hybrid Runtime Architecture

To eliminate the 4GB+ RAM overhead and disk lag of Docker Desktop on developer machines, the platform defaults to a native local-first execution mode while preserving Docker Compose for Phase 10 deployment:

1. **Metadata Database:** Native SQLite with async driver (`sqlite+aiosqlite:///./data/dev_metadata.db`) by default, with seamless support for PostgreSQL connection strings (e.g., Supabase / Neon / self-hosted).
2. **Object Media Storage:** Content-addressed local filesystem storage (`STORAGE_BACKEND=local_fs`, `LOCAL_STORAGE_DIR=./data/storage`) structured by `assets/{dataset_id}/{asset_id}.{ext}`.
3. **Task Queue:** Threaded / in-process async worker (`QUEUE_BACKEND=in_process`) with graceful fallback to Redis if configured.
4. **Local Network Privacy:** When `PRIVACY_MODE=local_only`, all external outbound HTTP calls to third-party model providers are strictly blocked at the gateway level.

---

## 2. Multi-Modal Record Bundler (`packages/dataset_io/bundler.py`)

Handles multi-modal ingestion pairing:
- **Priority 1 (Explicit Manifests):** Pairs assets explicitly indexed in `manifest.jsonl`, `metadata.jsonl`, or `annotations.csv`.
- **Priority 2 (Stem Matching):** Automatically discovers and bundles files sharing the same filename stem (e.g., `sample_01.jpg` + `sample_01.txt` + `sample_01.wav`) into a single `DatasetRecord` with distinct `RecordAsset` roles (`primary_image`, `paired_text`, `audio_track`).

---

## 3. Mathematical Dual-Model Consensus Engine

When AI auto-labeling runs with consensus verification enabled, two distinct models evaluate each item: a **Primary Annotator** and a **Critic Verifier**.

### 3.1 Classification Consensus ($C_{\text{cls}}$)
$$C_{\text{cls}} = \begin{cases} 1.0 & \text{if } \text{label}_A = \text{label}_B \\ 0.0 & \text{if } \text{label}_A \neq \text{label}_B \end{cases}$$
If confidence scores $p_A, p_B$ are reported:
$$C_{\text{cls}} = 1.0 - \frac{|p_A - p_B|}{2} \quad (\text{when labels match})$$

### 3.2 Object Detection Bounding-Box Consensus ($C_{\text{det}}$)
Using Hungarian bipartite matching between box sets $B_A$ and $B_B$ based on Intersection over Union (IoU):
$$\text{IoU}(b_1, b_2) = \frac{\text{Area}(b_1 \cap b_2)}{\text{Area}(b_1 \cup b_2)}$$
A match is valid if $\text{class}(b_1) = \text{class}(b_2)$ and $\text{IoU} \ge 0.50$. The consensus score is the F1-harmonic mean of precision and recall over matched pairs:
$$C_{\text{det}} = \frac{2 \cdot |M|}{|B_A| + |B_B|}$$

### 3.3 Disagreement Threshold
When overall consensus $C < 0.65$, the record is flagged with `disagreement_flagged = True` and prioritized at the top of the human reviewer triage queue.

---

## 4. Perceptual Split Leakage Blocker (`packages/dataset_quality/phash_leakage.py`)

To prevent model memorization and contaminated benchmarks:
- Computes 64-bit DCT perceptual hash (`phash`) for all image assets.
- Compares Hamming distance across `train` and `test`/`val` split partitions:
  $$d_H(h_1, h_2) = \text{bit\_count}(h_1 \oplus h_2)$$
- If $d_H \le 6$ between a training image and an evaluation image, raises a hard `RULE_SPLIT_LEAK_PERCEPTUAL_PHASH` blocker preventing dataset version publication.

---

## 5. SSRF Defense Engine (`packages/dataset_sources/ssrf_guard.py`)

Restricts outbound web research and external asset fetchers:
- Rejects loopback addresses (`127.0.0.0/8`, `::1`).
- Rejects RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- Blocks cloud instance metadata services (`169.254.169.254`, `metadata.google.internal`).
- Enforces HTTP/HTTPS schemes only and applies strict size caps (10MB).

---

## 6. Synthetic Anti-Collapse Diversity Filter

During synthetic generation (`packages/dataset_synthesis/`), prevents mode collapse and repetitive text/image variations:
- Computes token 3-gram Jaccard overlap between new candidates and existing dataset records.
- For images, checks `phash` Hamming distance against previously generated assets ($d_H > 8$ required).
- Rejects near-duplicate candidates before persistence.
