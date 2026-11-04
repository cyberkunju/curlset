# 00 — TRAINING RESULTS: base-model search and the complementarity breakthrough

**Date:** 2026-11-04/05
**Hardware:** local RTX 4060 Laptop 8 GB (Modal available, unused so far)
**Protocol:** template-grouped 5-fold CV on `repo/data/hard.db` (300 rows, 107 unique stems,
4 balanced classes). No stem ever appears in both train and test.
**Status:** fine-tuning still running; frozen/fusion/selection results are final.

---

## 1. Headline result

Greedy submodular source selection over everything available (3 LLMs, LLM plurality, and four
embedding probes) admits **three sources** and then stops:

| Order | Admitted source | Accuracy | Rescue ρ⁺ | Flip ρ⁻ | Marginal | Oracle after |
|---|---|---|---|---|---|---|
| 1 | probe_fusion (bge-large+e5-base+bge-small) | 90.67% | — | 0.093 | +0.9067 | 90.67% |
| 2 | gpt-6-luna | 87.33% | 0.929 | 0.132 | **+0.0867** | **99.33%** |
| 3 | probe_bge_large | 90.00% | 0.500 | 0.021 | +0.0033 | 99.67% |

**Blind-spot mass after selection: 0.33% — one row in 300.**

Your earlier result was `c = 10.33%` (31 rows where all three LLMs are wrong). Adding free local
specialists drops that to **1 row**. The 89.67% "hard ceiling" was never a property of the task —
it was a property of consulting three correlated generalist models.

**Achievable without an oracle:** majority vote over all seven sources = **92.00%**
(cluster bootstrap 95% CI [84.85, 97.68]) versus **86.33%** for the LLM plurality. Point estimate
+5.7 points; the interval is wide because there are only 107 stems.

---

## 2. Base-model bake-off (frozen embeddings + logistic regression)

| Backbone | Params | Accuracy | Rescue ρ⁺ vs LLM plurality | Hybrid |
|---|---|---|---|---|
| all-MiniLM-L6-v2 | 22M | 82.67% | 0.710 | 89.00% |
| all-mpnet-base-v2 | 110M | 86.33% | 0.774 | 89.33% |
| bge-small-en-v1.5 | 33M | 88.33% | 0.903 | 92.67% |
| e5-base-v2 | 110M | 88.00% | **0.968** | 92.33% |
| bge-base-en-v1.5 | 109M | 88.33% | 0.806 | 91.00% |
| e5-large-v2 | 335M | 81.67% | 0.903 | 90.67% |
| gte-modernbert-base | 149M | 80.67% | 0.806 | 90.33% |
| **bge-large-en-v1.5** | 335M | **90.00%** | 0.935 | 92.00% |
| **3-backbone probability-average fusion** | — | **90.67%** | 0.935 | **93.00%** |
| LLM plurality (your baseline) | — | 86.33% | 0.139 | — |

**Leaderboard scores did not transfer.** The researched recommendations for intent classification were
`google/embeddinggemma-2` (93.12 intent mean), `codefuse-ai/F2LLM-v2-0.6B` (91.57) and
`Qwen/Qwen3-Embedding-0.6B` — measured here they scored **81.33%**, **83.67%** and **73.33%**, all
below `bge-large` (MTEB classification 78.34). MTEB intent numbers are not a proxy for this fixture.

**Bigger is not better:** e5-large is worse than e5-base; Qwen3-0.6B is the worst model tested.

**Even the weakest probe has a rescue rate of 0.71** against the LLM panel — the complementarity is
qualitative, not a function of probe strength.

---

## 3. Fine-tuning — SetFit (COMPLETE, with a correction that matters)

SetFit (contrastive sentence-transformer fine-tuning + logistic head) on `bge-large-en-v1.5`,
identical template-grouped 5-fold protocol, repeated across independent split seeds:

| Split | Standalone acc | Cluster 95% CI | Rescue ρ⁺ | Flip ρ⁻ | Oracle w/ LLM | Hybrid |
|---|---|---|---|---|---|---|
| GroupKFold (unshuffled) | **94.67%** | — | 0.968 | 0.050 | 99.33% | 96.67% |
| seed 7 | **89.67%** | [0.8097, 0.9709] | 0.968 | 0.113 | 99.00% | 93.67% |
| seed 13 | **87.33%** | [0.7832, 0.9527] | 0.936 | 0.126 | 98.00% | 91.33% |
| **Mean / spread** | **90.56% / 7.3 pts** | — | **0.957 (stable)** | 0.097 | **0.988 (stable)** | 93.89% |

**The 94.67% headline was a lucky partition.** It was carried by one fold scoring 100%; two independent
group-level splits put standalone accuracy at 89.67% and 87.33%. Standalone fine-tuning is therefore
**statistically indistinguishable from the frozen 3-backbone fusion (90.67%)**, and both cluster CIs
include the 86.33% LLM baseline.

**What IS robust across every split:**
- **Rescue rate ρ⁺ = 0.936–0.968** (the LLMs' best was 0.139) — stable to within 3 points.
- **Oracle with the LLM panel = 98.0–99.3%** — the complementarity finding survives completely.
- Blind-spot collapse from 10.33% to ~0.3% when specialists and LLMs are pooled.

**Corrected conclusion: the finding is complementarity, not standalone accuracy.** A local specialist does
not reliably beat the frontier panel on its own. It *does* reliably know things the panel does not — which
is a different claim, and the more valuable one.

Method research (SetFit paper) reports 8/class SetFit-MPNet 62.3 vs RoBERTa-large fine-tune 43.0, and
64/class 75.3 vs 69.7 — gains shrinking as labels grow, consistent with our picture at 75/class.

Deployment model trained on all 300 rows and saved to
`C:\Users\knava\Downloads\curlset\models\specialist-bge-large-setfit` (1.34 GB; `model.safetensors` +
`model_head.pkl` + model card), kept outside the repo per AGENTS.md §12.

**Required before any accuracy claim ships:** ≥10 split seeds for between-split variance, and a fresh
group-disjoint gold set to remove backbone-selection bias.

---

## 4. Code shipped

- `repo/packages/dataset_ensemble/rescue.py` — `blind_spot_mask`, `agreement_mask`, `oracle_accuracy`,
  `SourceProfile`, `profile_source`, `greedy_source_selection`, `route_with_specialist`.
- `repo/tests/unit/test_rescue.py` — 8 tests, including a brute-force check that greedy satisfies the
  `(1 − 1/e)` submodular bound.
- `repo/packages/dataset_ensemble/__init__.py` — exports added.
- **Suite status: 175 unit tests pass, 0 failures.**

---

## 5. Honest limits

1. **Selection bias.** Backbones were compared and chosen on the same folds that produced the reported
   numbers. The 90–92% figures are optimistic; the *complementarity* result (blind spot 10.33% → 0.33%)
   is structural and does not depend on selection.
2. **107 stems.** Cluster-robust CIs are 2–4× wider than naive ones; the hybrid's CI [84.9, 97.7] overlaps
   the LLM baseline's. This is not yet a statistically established win.
3. **The oracle is a bound, not a system.** Reaching 99.33% requires a router that knows which source is
   right per item. The achievable number today is 92.00%.
4. **Small-gold dependence.** The probe is trained on gold labels; with 30 rather than 300 rows per task
   the rescue effect should be re-measured.
5. **All text.** The image track (DINOv2-base, Apache-2.0, recommended by research) has not been run yet.

---

## 6. Next actions

1. Finish SetFit CV; if it holds ≥ 92%, retrain on all 300 rows and save to `repo/models/specialist`.
2. Build the learned router (features: probe confidence, panel agreement, class, stem cluster) and
   measure how much of the 99.33% oracle is capturable.
3. Re-run everything on a **fresh, group-disjoint gold set** to remove selection bias.
4. Run the same rescue analysis on images with DINOv2-base + Grounding DINO Tiny.
5. Wire `rescue.py` into the API so a dataset page reports "this source adds X effective votes".
