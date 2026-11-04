# Competitive Analysis

Status: snapshot verified **2026-11-04** against vendor pages; prices change — re-verify before quoting
publicly. Full research record: `docs/research/R7-competitive-landscape.md`. This document states the
market position; it makes no superiority claim.

## 1. Landscape in one paragraph

The market has split three ways: **annotation platforms** (Roboflow, Labelbox, Encord, SuperAnnotate,
V7, Segments, Kili) adding agents and moving up-market; **observability/quality** players (Arize,
Galileo, WhyLabs, Cleanlab Studio, Humanloop) mostly not labeling, several acquired; **hub/training**
players (Hugging Face, W&B) versioning artifacts and training models but not auditing labels.
Consolidation is heavy: Humanloop sunset 2025-09-08; WhyLabs → Apple (Jan 2025); W&B → CoreWeave
(2025-05-05); Galileo → Cisco (announced 2026-04-09); Scale sold 49% to Meta (June 2025); Labelbox raised
a $100M Series E and now leads with RL environments/agent fleets.

## 2. Verified pricing snapshot

| Platform | Published price | Notes |
|---|---|---|
| CVAT Online | Free (1 project/3 tasks/1 GB); Solo **$33/mo** ($23 annual); Team **$66/mo** ($46 annual) | strongest open-source CV ecosystem |
| Label Studio / HumanSignal | Starter **$99/mo + $49/additional user** (12-user cap) | enterprise features gated |
| Roboflow | Free 10 credits/mo; Core **$39/mo** → $1,399/mo; auto-label 1 credit/1,000 images; labeling from **$0.10/box** | distribution + UX moat |
| Labelbox | Free 500 LBUs/mo; **$0.10/LBU**; public pricing page retired 2026-09-11 | pivoting to RL/agents |
| Supervisely | Pro **€199/mo** | CV-focused |
| Segments.ai | ~**$9.6k/yr** team | 3D/sensor niche |
| Hugging Face | Free; PRO **$9/mo**; Team $20/user/mo | hub, not label QA |
| Weights & Biases | Free; Pro from **$60/mo** | tracking/artifacts |
| Arize AX | Free; Pro **$50/mo** | monitoring, not labeling |
| Encord, Voxel51 Team/Enterprise, SuperAnnotate Pro, V7, Kili Grow, Snorkel, Scale | quote-only | opaque pricing is a documented pain point |

## 3. What is actually differentiated (and what is repackaged)

- Most "auto-label" features are foundation models + thresholds + vote — proprietary value sits in UX,
  distribution and customer environments, not in a secret algorithm.
- Consensus, QA analytics, audit logs and immutable versions are **enterprise-only** at the major
  vendors; no self-serve product sells a defensible *accuracy certificate*.
- Data-rights evidence is becoming a requirement (EU AI Act Art. 10; DPI's licence-omission finding),
  while public URL ≠ licence.
- Practitioner pain points (G2/forum-derived): opaque pricing, vendor risk, latency at scale, UI
  complexity, and label-quality claims without denominators.

## 4. Where Curlset aims (honest positioning)

Targeted gap: **a local-first, auditable dataset workbench** where generation, labeling, review,
quality, versioning and export share one provenance chain. Specifically:

1. Self-contained, deterministic exports with per-record provenance (including an `image_bundle` with
   real pixels + labels + hashes).
2. Explicit provenance and review rules: machine output can never silently become human-approved.
3. Measured, bounded automation: job limits, measured ETA (never fabricated), image generation capped at
   25/run, unknown prices reported as unknown.
4. Evidence-first labeling: routing bands, per-model votes and research-backed limits documented rather
   than marketed.
5. Local-first: manual annotation, validation, versioning and export work with **no provider** and no
   network.

What we do **not** claim: better accuracy than the best model, beyond-human labeling, legal clearance,
certified 95%, or feature parity with enterprise annotation suites. The research explicitly retires
those claims ([RESEARCH](RESEARCH.md) §3).

## 5. Feature-parity reality

| Capability | Vendors | Curlset |
|---|---|---|
| Image/text annotation UX | mature, polished | functional; keyboard-first, canvas verified |
| Auto-labeling | yes, gated | classification + SAM box proposals, pending review |
| Consensus/QA analytics | enterprise-only | ensemble routing + per-model votes; no QA certificate |
| Immutable versions | enterprise-only, hash manifests rare | shipped, deterministic manifests + byte-deterministic exports |
| Provenance chain | partial | shipped end to end (origin/status/revisions/lineage) |
| Self-contained image export with labels | rare | shipped (`image_bundle`) |
| Scale/enterprise deployment | yes | not yet (SQLite single-process; roadmap E1–E6) |
| Price transparency | mixed | local-first, no SaaS pricing |

## 6. Sources

See `docs/research/R7-competitive-landscape.md` §9 for the full URL list (Roboflow, Label Studio, CVAT,
Labelbox, Encord, SuperAnnotate, V7, Segments, Kili, Supervisely, Hugging Face, W&B, Arize, Galileo,
WhyLabs, DagsHub, Lilac, DVC, FiftyOne, Snorkel, Scale). Re-verify prices before external publication.
