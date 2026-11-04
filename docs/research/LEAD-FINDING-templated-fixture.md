# LEAD FINDING — The 300-row "hard set" is 107 sentences, and the error mass is 8 policy disputes

**Date:** 2026-11-04
**Source:** direct analysis of `repo/data/hard.db` (300 records × 3 models = 900 votes).
**Status:** original finding, not from any research agent. Recomputed twice.

---

## 1. What the data actually is

Strip the trailing parenthetical from each text and count:

| Quantity | Value |
|---|---|
| Records | 300 |
| **Unique base sentences** | **107** |
| Largest cluster | 9 rows (one sentence, 9 suffixes) |
| Cluster size distribution | 49 singletons, 12×2, 7×3, 15×4, 11×5, 4×6, 6×7, 2×8, 1×9 |
| Errors are not independent | **ICC(1) of the error indicator over sentence clusters = 0.715** |
| Design effect | **3.37** |
| **Effective sample size** | **74.5**, not 300 |

The suffixes are irrelevant noise: `(on Safari)`, `(in the EU region)`, `(since Monday)`,
`(after the last update)`, `(with SSO enabled)`. The same sentence appears up to nine times.

## 2. The 31 "all-wrong" records are 8 sentences

| Base sentence (n rows) | Gold | All 3 models said | All-wrong rows |
|---|---|---|---|
| "Who do I ask about an invoice from last year?" (6) | general_inquiry | billing | **6/6** |
| "What tier are we on?" (6) | general_inquiry | billing | **6/6** |
| "The number changed without anyone telling us" (5) | billing | technical_support | **5/6** |
| "We pay for five seats and only three of them work" (5) | billing | technical_support | **5/7** |
| "What happens if we downgrade?" (5) | general_inquiry | billing | **5/7** |
| "Wish this worked on my phone" (4) | feature_request | technical_support | **3/7** |
| "Can it remember the view I used last time?" (1) | feature_request | general_inquiry | 1/9 |
| "Can it flag duplicates at import time?" (1) | feature_request | general_inquiry | 1/5 |

**Every one is a label-ontology boundary dispute, not a model capability failure.** Is "who do I ask
about an invoice" billing or a general inquiry? Is a seat-count change billing or technical support?
Is "wish this worked on my phone" a feature request or a bug report? The models are not failing to
understand the text — they are failing to guess the guideline.

This changes the meaning of the headline number: **31 errors are not 31 independent failures; they are
8 decisions, repeated by templating.**

## 3. Every confidence interval in the project is too narrow

Cluster bootstrap (4,000 resamples over the 107 sentence clusters, seed 7 / 11):

| Metric | Naive | Cluster-robust | Inflation |
|---|---|---|---|
| Plurality accuracy | 86.33%, Wilson [82.0, 89.8] | 86.33% **[77.7, 94.0]** | **2.1×** wider |
| Unanimous-band precision (n=267) | 89.14%, Wilson ≈ [84.6, 92.0] | 89.14% **[81.0, 96.0]** | **≈4×** wider |

The point estimates are unchanged. The *precision of the claims* is not. A "certified 95% floor" derived
from this fixture is not certifiable — the interval spans 15 points.

## 4. Consequences (these are work items, not caveats)

1. **Use cluster-robust statistics everywhere.** Sentence/template is the exchangeable unit. Cluster
   bootstrap or cluster-robust Wilson; never Wilson on rows.
2. **Audit sizing must use the effective n.** A design effect of 3.37 means the 59-clean-audit rule for a
   95% floor becomes ~200 audits on *this* fixture — or, better, sample unique sentences, not rows.
3. **The "fix 16 of 31" prescription becomes "resolve 8 policy disputes".** Adjudication cost collapses
   from 31 labels to 8 decisions — and each decision flips 1–9 rows at once.
4. **The ceiling is conditional on the guideline.** The 89.7% oracle bound assumes gold is correct. If
   the guideline sides with the models on even half of these templates, the bound moves up by several
   points at zero model cost. This is the cheapest accuracy available in the entire project.
5. **Build a de-templated gold set.** 300 *unique* sentences, or report cluster-robust intervals and say
   so. The current fixture cannot support a precision certificate.
6. **This is direct evidence for the E1f design.** The highest-value "independent evidence" is not a
   fourth model — it is the *written label policy*. Retrieval of the guideline + the adjudicated
   boundary cases is precisely what would have fixed all 31 rows.

## 5. What this does NOT change

The arithmetic of the correlated-error ceiling stands: with fixed gold, 31 rows have no correct vote and
aggregation cannot recover them. What changes is the *interpretation*: the mass is not diffuse model
blindness, it is concentrated, repeated, and policy-shaped — which makes it tractable.
