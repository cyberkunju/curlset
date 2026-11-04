# R7 — Competitive Landscape (verified 2026-11-04)

**Scope.** Open-source and commercial dataset tooling, the algorithms vendors market, published pricing, and the eight candidate differentiators. Licences, releases and prices were checked on 2026-11-04 against vendor pages, the GitHub API, or a named third party. **[3P]** = third-party estimate; **[quote]** = quote-only. Prices change; re-verify before quoting publicly. Repo findings are a snapshot: the working tree runs ahead of dossier commit 37d5d05 (for example, the ZIP determinism fix).

**Legend.** V = versioning; QA = quality audit; Exp = exports. "No" means no documented native capability, not "impossible with scripts".

---

## 1. Executive summary

- **Annotation is commoditised; quality is the paywall.** Label Studio, CVAT and FiftyOne are healthy and permissively licensed (1.23.2 / 2.81.0 / 1.22.1, Sep–Oct 2026). In each, consensus, quality analytics, audit logs and/or immutable versions are Enterprise-only — the incumbents' monetisation line, and the opening.
- **Nobody sells a defensible, self-serve certificate of auto-label precision.** CVAT samples 5–15% of data for QA but reports no confidence intervals. Cleanlab and FiftyOne flag suspected label errors. Kili sells statistical human-QA. Apple's acceptance-sampling research cuts audit samples up to 50%, but none of this is a product that gates publication.
- **Correlated-error auditing is genuine whitespace — and Curlset's own data proves why it matters.** On a 300-record hard set in `repo/data/hard.db`: gpt-6-luna 87.4 macro-F1, DeepSeek-V4.1-Flash 86.9, muse-spark 83.8 (successful calls), plurality 86.3; 31 records (10.3%) are wrong in all three votes; pairwise error phi 0.77–0.80; even a perfect split resolver caps at 89.7%. Model voting cannot reach 99% here. No platform exposes this; Roboflow's 2-of-3 consensus never tests independence.
- **Versioning is table stakes at file level** (DVC, HF revisions, W&B Artifacts) **and paid at annotation level** (FiftyOne Enterprise, Roboflow snapshots). Byte-reproducible exports are rare. Curlset's ZIP determinism fix is in the working tree, but the manifest still hashes wall-clock `created_at` and a random `version_id`, so the version hash is not reproducible from DB state.
- **Local-first, multimodal and presets are not differentiators in late 2026.** Label Studio is local-first and multimodal; FiftyOne is pip-local; Unsloth/Axolotl/LLaMA-Factory define the formats. Curlset's asset is the ensemble math in `packages/dataset_ensemble` — Wilson threshold solving, audit sizing, phi correlation — and it is an open loop: samples can be drawn, but results cannot be ingested, certified or bound to a version.

---

## 2. Open-source teardown

The OSS layer is strong at the top, thin in the middle, dead at the edges. Permissive licences dominate (Apache-2.0/MIT); Potato is GPLv3 and Diffgram's open-core licence is unclear. The boundary is consistent: annotation free, QA/versioning/audit paid.

| Tool (licence) | Strengths | Gaps | Activity | V/QA/Exp |
|---|---|---|---|---|
| **Label Studio OSS** (Apache-2.0) | Broadest modalities; XML configs; ML backends | No versioning; consensus/analytics/audit/SSO Enterprise-only | 1.23.2, 2026-09-29; active | No / No / Strong |
| **Label Studio Enterprise** (proprietary) | Consensus, QA analytics, audit, SSO, on-prem | No statistical precision certificate | Current | Partial / Yes / Strong |
| **CVAT Community** (MIT) | Best video/3D; tracking; serverless; 17.1k stars | QC/consensus/GT/analytics documented as Online/Enterprise only | 2.81.0, 2026-10-29; active | No / No / Strong |
| **CVAT Online/Enterprise** (proprietary) | GT jobs, consensus/replica jobs, auto-QA, analytics, on-prem | Point estimates, no CIs; human QA only | Current | Partial / Yes / Strong |
| **FiftyOne OSS** (Apache-2.0) | Brain: embeddings, similarity, uniqueness, duplicates, mistakenness, hardness | No versioning, RBAC, audit or QA scoring; Python-first; no training layer | 1.22.1, 2026-09-29; active | No / Partial / Strong |
| **FiftyOne Enterprise** (proprietary) | Immutable versions, audit logs, annotation workflows/rework, quality scans | Quote-only; heavier deployment | Current | Yes / Yes / Strong |
| **Argilla** (Apache-2.0) | LLM feedback, responses, agreement metrics | Text-only; no CV/versioning/certification | 2.8.0, 2025-03-11; stalled | No / Partial / Weak |
| **Cleanlab OSS** (Apache-2.0) | Confident learning, Datalab, ObjectLab, TLM | Library only: no UI, versioning, audit workflow or exports | 2.9.0, 2026-01-13; slowing | No / Partial / None |
| **Lilac** (Apache-2.0) | Embeddings/search/clustering/PII for text | Archived after Databricks acquisition | Dead since 2024-03-19 | No / No / None |
| **DVC / DagsHub** (Apache-2.0; SaaS tiers) | Content hashes; Git-like workflow; free tier | File-level only; no annotation semantics or label QA | DVC 3.67.1, 2026-03-31; active | Yes (file) / No / None |
| **Diffgram** (open-core, NOASSERTION) | Annotation + predictions + workflow datastore | Last release 2024-10-14; effectively stalled | Stalled | Partial / Partial / Partial |
| **Kili / Supervisely / Segments SDKs** (Apache/MIT) | Useful API automation | SDKs only; platform, QA and versioning stay closed | Kili 26.2.4; Supervisely 6.74.52; Segments active | n/a |
| **VoTT** (MIT) | Historical bounding-box tool | Archived 2021 | Dead | No / No / Weak |
| **Potato** (GPLv3) | YAML annotation; LLM-judge calibration (ECE/Brier/kappa) | Text-first; no CIs, versioning or CV QA; GPLv3 | Active, ACL 2026 | No / Partial / Weak |

**What this means.** The best free stack is Label Studio/CVAT + FiftyOne + Cleanlab + DVC: four tools and data models, no shared version identity. Free tools can *find* suspicious labels; none can *certify* a precision floor or bind it to an artifact — quality and versioning are what the paid editions sell. The Label Studio ML backend (Apache-2.0, active) supplies predictions and pre-annotations, not audit.

---

## 3. Commercial teardown

The market has split three ways. **Annotation platforms** (Roboflow, Encord, Labelbox, SuperAnnotate, V7, Segments, Kili) are adding agents and moving up-market. **Observability/quality** players (Arize, Galileo, WhyLabs, Cleanlab Studio, Humanloop) mostly do not label, and several were acquired. **Hub/training** players (Hugging Face, W&B) version artifacts and train models but do not audit labels. Consolidation is heavy: Humanloop sunset 2025-09-08; WhyLabs went to Apple (Jan 2025); W&B to CoreWeave (2025-05-05); Galileo to Cisco (announced 2026-04-09; now Splunk Agent Observability [3P]); Scale sold 49% to Meta and lost its CEO (June 2025); Labelbox raised a $100M Series E in 2026 and now leads with RL environments and agent "fleets".

| Platform | Wedge and algorithms | Proprietary vs repackaged | Quality / versioning | Published price | Status |
|---|---|---|---|---|---|
| **Roboflow** | Auto Label (SAM 3, Gemini, GPT), 2-of-3 consensus, active learning | Foundation models + thresholds + vote; moat is UX/distribution | Snapshot versions; no CI-backed QA | Free 10 credits/mo; Core $39/mo to $1,399/mo; auto-label 1 credit/1,000 images; export free; labeling from $0.10/box | Very active |
| **Encord** | Consensus QA, ontologies, Agents, Index | Standard consensus/IAA; agents wrap foundation models | Consensus/review; versioning n/v | Quote only | Active |
| **Labelbox** | Benchmark, Consensus, model runs, Evals, Horizon/WorldSim | Standard QA; new moat is customer environments/agents | Benchmark/consensus; batch lineage, no hash manifest | Free 500 LBU/mo; $0.10/LBU; pricing page retired 2026-09-11 | Pivoting to RL/agents; $100M Series E |
| **Scale AI** | Managed labeling, RLHF, GenAI data | Workforce and ops, not algorithms | Contractual SLA; no self-serve certificate | No public pricing | 49% Meta-owned; CEO left |
| **SuperAnnotate** | Annotation + Agent Hub + workforce | Repackaged models + managed labor | QA management; versioning n/v | Free Starter; Pro/Enterprise quote [3P ~$62/user/mo] | Active |
| **V7** | Darwin CV annotation + V7 Go document agents | Standard CV; V7 Go is the growth product | Consensus/review; versioning n/v | Quote; Darwin from $5,400 [3P] | Pivoted to V7 Go |
| **Segments.ai** | Image + point-cloud labeling for robotics | Standard AL; moat is 3D/sensor fusion | QA/versioning n/v | Team ~$9.6k/yr; Enterprise 150k h; free academic | Active, niche |
| **Kili** | Quality-first annotation + LLM eval; Quality Match | QA workflows + workforce; human statistical QA | Strong human QA; on-prem; no auto-label certificate | Free $0 (2–5 seats); Grow ≤20 seats; Enterprise custom | Active |
| **Snorkel Flow** | Labeling functions, generative label model | Published weak supervision; moat is deployment | Probabilistic labels, not CI-certified precision | Enterprise only; six figures [3P] | Enterprise-only |
| **Cleanlab Studio** | No-code label-error/data-quality platform; TLM | Published algorithms; moat is productisation | Issue scores; no versioning/annotation workflow | OSS free; Studio trial/usage (not verified) | OSS slowing |
| **Humanloop** | LLM eval/observability | n/a | n/a | Sunset 2025-09-08 | Dead |
| **Arize / Galileo / WhyLabs** | Drift, embeddings, eval, guardrails | Standard monitoring; Galileo Luna was proprietary | Monitoring, not labeling/certification | Arize AX Free/$50 Pro; Phoenix free self-host (ELv2); others enterprise | Consolidating |
| **Hugging Face** | Hub + AutoTrain + git revisions | Open models + managed compute; moat is the hub | Git revisions; dataset-level licence tags; no label QA | Free; PRO $9/mo; Team $20/user/mo; compute extra | Very active |
| **W&B** | Tracking, Artifacts, Weave | Standard tracking; moat is ecosystem | Content-addressed artifacts; no label QA | Free; Pro from $60/mo; Enterprise quote | CoreWeave-owned |

### 3.1 What is actually proprietary

Almost none of the marketed algorithms. Auto-labeling is foundation models plus confidence thresholds — Roboflow names SAM 3, Gemini and GPT. Active learning is embedding diversity plus uncertainty. Consensus is IoU matching plus majority vote. "Confident learning" is Northcutt et al.'s published algorithm, productised by Cleanlab. Snorkel's label model is published weak supervision. The moats are workforces, customer data/environments, integrations, compliance and distribution (Roboflow Universe, HF Hub). Compete on *verifying* auto-labeling, not generating it.

### 3.2 Pricing and positioning

Entry points cluster: Label Studio Starter $99/mo + $49/additional user (12-user cap); CVAT Online Free (1 project/3 tasks/1 GB), Solo $33/mo ($23 annual), Team $66/mo ($46 annual); Roboflow Core $39/mo; Labelbox 500 free LBUs/mo then $0.10/LBU; Supervisely Pro €199/mo; Segments ~$9.6k/yr; HF PRO $9/mo; W&B Pro from $60/mo; Arize AX Pro $50/mo; DagsHub Team $99/user/mo annual [3P]. Encord, Voxel51 Team/Enterprise, SuperAnnotate Pro, V7, Kili Grow, Snorkel and Scale are quote-only; Voxel51 publishes no dollar figure.

The pattern: **free or cheap annotation, expensive quality and governance.** Individuals are well served for labeling, poorly for verification; enterprises only with procurement. The missing middle — a 3–30 person team needing a defensible quality number, versioning and licence provenance without a six-figure contract — is the segment to own.

---

## 4. Gap analysis: honest verdicts

| Candidate | Verdict | Closest existing thing | Ownable? |
|---|---|---|---|
| (a) Statistical certification (Wilson/conformal) | **Underserved end-to-end; ingredients commodity** | CVAT 5–15% sampling; Apple acceptance sampling; Kili human QA; Potato ECE/Brier; Cleanlab error scores | **Yes**, as a gate + certificate |
| (b) Correlated-error auditing | **Genuine whitespace** | 2026 research only; Roboflow consensus; Snorkel's independence assumption | **Yes**, fastest differentiator |
| (c) Immutable byte-reproducible versions | **Half commodity** | DVC, HF, W&B, LakeFS, FiftyOne Enterprise, Roboflow | Only as binding for (a)/(b)/(h) |
| (d) Local-first · (e) multimodal · (f) presets | **Commodity** | Label Studio, CVAT, FiftyOne, Labelbox, Encord, Supervisely; Unsloth/LLaMA-Factory/Axolotl | No |
| (g) Dataset diff | **Partially underserved** | DVC/LakeFS file diff; CVAT job consensus; Roboflow model compare | Demo, weak moat |
| (h) Rights/licence provenance | **Underserved at record level** | HF cards, Croissant 1.1 (dataset-level), DPI audits | **Yes**, with enforced gate |

**(a) Statistical certification.** The maths is not novel. Wilson intervals are textbook; conformal prediction has mature libraries (MAPIE); Apple's acceptance-sampling work shows single/double sampling and SPRT cut required samples up to 50%; "Conformal Annotation with Randomized Expert Review" (arXiv, Oct 2026) proposes calibration-plus-review. CVAT says 5–15% of data is "typically good enough" for quality estimation, but reports point estimates, not bounds, and only for human labels. Kili's Quality Match sells statistical human QA; Potato calibrates LLM judges (ECE/Brier/kappa). **What nobody sells is the closed loop:** per-class target precision, threshold on held-out gold, a random audit sample, ingested audit results, Wilson lower bound, a publish block if below target, and a certificate bound to an immutable version. A product gap, not a maths gap.

**(b) Correlated-error auditing.** The strongest whitespace, and Curlset has the evidence. 2026 research documents judges failing together (arXiv 2605.29800), family-correlated errors cutting an ensemble to 2.5–3.6 effective voters (2603.17111), and consensus helping only when errors are not correlated (2607.10139). Curlset's 300-record experiment is cleaner: gpt-6-luna 87.4, DeepSeek-V4.1-Flash 86.9, muse-spark 83.8 macro-F1 (successful calls), plurality 86.3, 31/300 wrong in all three, pairwise phi 0.77–0.80, perfect-resolver ceiling 89.7%. The ensemble never beat the best single model, and voting cannot reach 99%; the residual needs independent evidence, not another voter. No vendor exposes pairwise phi, family clustering or effective-voter count. Roboflow's consensus is a vote, not an independence test; Snorkel assumes conditional independence. Curlset already computes phi on gold errors and widens review above 0.6 (`dataset_ensemble/service.py`, `selection.py`).

**(c) Byte-reproducible versions.** File-level versioning is solved: DVC hashes content, HF uses git commits, W&B Artifacts are content-addressed, LakeFS offers Git-like commits. Annotation-level versioning is sold by FiftyOne Enterprise and Roboflow snapshots. Byte-reproducible *exports* are rare: ZIP timestamps, ordering and compression break reproducibility, which is why `repro-zipfile` exists and best practice is to hash the payload manifest, not the archive. Curlset's ZIP determinism fix is in the working tree, but the manifest still includes random `version_id` and wall-clock `created_at`, so the hash is not reproducible from DB state. Treat (c) as a prerequisite for (a), not a headline.

**(d) Local-first, (e) multimodal, (f) presets — all commodity.** Label Studio is local-first and multimodal; CVAT self-hosts and added audio/3D; FiftyOne is pip-local; Labelbox, Encord, Kili and Supervisely are multimodal; Unsloth, LLaMA-Factory and Axolotl define the preset formats, and Roboflow/Label Studio export them. The only remaining edges are zero-telemetry defaults and one export carrying COCO/YOLO plus chat records with token budgets — trust and convenience, not categories.

**(g) Dataset diff.** Partially underserved. DVC/LakeFS diff files; CVAT compares jobs/consensus; Roboflow compares trained models, not annotation versions. A visual annotation-aware diff (added/removed/moved records, per-box IoU shift, split changes) is uncommon and demos well, but is easy to copy and not defensible alone.

**(h) Rights provenance.** Underserved at the level that matters. Dataset-level licence metadata is commoditised: HF cards carry licence tags, the dataset viewer emits Croissant, and Croissant 1.1 (Feb 2026) adds provenance via W3C PROV-O plus DUO/ODRL. The Data Provenance Initiative found licence omission above 70% and error rates above 50%, but audits are dataset-level. No annotation platform we found tracks per-record consent/licence, inheritance through augmentation/synthesis, and blocks publication when rights are unknown. EU AI Act Article 10 requires data governance (Annex III from Dec 2027, Annex I from Aug 2028). Curlset has the fields, but the publish gate never checks licence and synthesis auto-approves rights — schema, not enforcement.

---

## 5. What "exceptional" means: practitioner pain points

1. **Quality is paywalled.** Label Studio puts consensus/agreement, quality analytics and audit logs in Enterprise; CVAT marks quality control "Available in: CVAT Online, CVAT Enterprise"; FiftyOne Enterprise adds versions, audit and annotation workflows. A solo developer can label for free but cannot prove quality for free.
2. **Quality numbers are unfalsifiable.** Labelbox markets Benchmark ("measures labeling accuracy") and Consensus ("measures labeling consistency"); Encord concedes "agreement does not equal correctness"; a 2026 SLA guide states "99% accuracy is not a standard; it is a number with no denominator, no task definition and no audit method behind it."
3. **Auto-labeling is cheap; verification is not.** Roboflow charges 1 credit per 1,000 auto-labeled images and gives 10 credits free monthly. Consensus multiplies human cost; Encord lists cost as a consensus limitation. The economics push teams to accept volume and skip audit.
4. **Versioning is file-level or paid, never annotation-aware.** DVC tracks files; HF tracks commits; FiftyOne snapshots are Enterprise; Roboflow versions are preprocessing snapshots. Label Studio issue #10012 (Oct 2026) asks for "versioned offline review packages with conflict-aware reimport" — basic round-trips are still missing in the most popular OSS labeler.
5. **Tool sprawl.** The free stack is Label Studio/CVAT + FiftyOne + Cleanlab + DVC + a trainer, each with its own data model and no shared version. FiftyOne has no training layer; DagsHub exists to glue Label Studio to DVC-style versioning; Encord archived its open-source Active toolkit in May 2025.
6. **Opaque pricing, vendor risk, performance.** Labelbox retired its public pricing page on 2026-09-11; Encord, Voxel51 Team/Enterprise, SuperAnnotate Pro, V7 and Snorkel are quote-only. Humanloop shut down; WhyLabs went to Apple; Galileo to Cisco; W&B to CoreWeave. G2-derived reviews cite latency at scale (Encord) and UI complexity (Labelbox); Label Studio has ~90 "slow" issues. DPI's 70%+ licence-omission finding and EU AI Act Article 10 add a rights-evidence requirement.

In users' words: "Tell me the precision of these auto-labels with a number I can defend; show me the sample; refuse to publish if it fails; give me a byte-identical artifact and a certificate; run offline; export to my trainer." No product does all six.

---

## 6. Feature parity matrix

Yes = native/documented; Partial = limited or paid; No = absent; n/v = not verified.

| Tool | Versioning | QA | Stat. cert | Visual diff | Local | Multimodal | Presets | Rights |
|---|---|---|---|---|---|---|---|---|
| Label Studio OSS | No | No (paid) | No | No | Yes | Yes | Partial | No |
| CVAT Community | No | No (paid) | Partial (sample, no CI) | Partial (consensus) | Yes | Yes | Partial | No |
| FiftyOne OSS | No | Partial (mistakenness) | No | No | Yes | Vision-first | No | No |
| FiftyOne Enterprise | Yes | Yes | No | Partial | Yes | Vision-first | No | No |
| Cleanlab OSS | No | Partial | Partial (error scores) | No | Yes | Text/tabular/image | No | No |
| DVC / DagsHub | Yes (file) | No | No | File-level | Yes | n/a | No | No |
| Roboflow | Yes (snapshot) | Partial | No | No | No | Vision | Yes | No |
| Encord | n/v | Yes | No | n/v | On-prem | Yes | Partial | No |
| Labelbox | Partial | Yes | No | No | On-prem | Yes | Partial | No |
| Kili | n/v | Yes | Partial (human QA) | n/v | On-prem | Yes | Partial | No |
| Snorkel Flow | No | Partial | Partial (probabilistic) | No | Enterprise | Text/tabular | No | No |
| Potato | No | Yes | Partial (ECE/Brier) | No | Yes | Text/audio/video | No | No |
| HF + AutoTrain | Yes (git) | No | No | No | Partial | Yes | Yes | Partial |
| **Curlset (target)** | **Partial** | **Partial** | **Partial (open loop)** | **Yes** | **Yes** | **Yes** | **Yes (9)** | **Partial (schema)** |

Curlset is competitive on commodity axes and unique-ish only where the market is underserved; it is not yet credible on certification, independence or provenance without closing the loops.

---

## 7. Recommended positioning

**Category.** Not "another annotation tool" but **the open, local-first dataset certification workbench**: bring labels from anywhere, prove quality statistically, bind the proof to an immutable version, export anywhere. The buyer is the ML lead who must defend a dataset to a model owner, customer or auditor.

**Wedge.** The auto-label audit. Auto-labeling is cheap and universal (Roboflow gives it away at 1 credit per 1,000 images; every platform has agents). The bottleneck moved from *generating* labels to *deciding which to trust*. Own the decision.

**The three certificates.**
1. **Quality certificate** — per-class target precision; threshold solved on held-out gold; stratified random audit sized by Wilson/acceptance sampling; audit ingestion; Wilson lower bound; publish gate; certificate in the version manifest. Upgrade: SPRT, conformal sets for multi-label records.
2. **Independence certificate** — pairwise phi, family/lineage clustering, effective-voter estimate, routing that widens review when models are clones, and the honest ceiling: 89.7% on Curlset's hard set even with a perfect split resolver. No competitor markets this.
3. **Provenance certificate** — per-record source, licence/consent, transformations, inheritance; block publication when rights are unknown; export Croissant 1.1 metadata plus a payload manifest. The compliance buyer's reason to adopt, with an EU AI Act tailwind.

Bind all three to one immutable version hash and one artifact. That — three certificates, one artifact — is the "nothing else exists" story that is true, because each individually has prior art.

**Do not build.** Do not out-label Label Studio/CVAT, out-curate FiftyOne, out-scale Roboflow's inference, or build a managed workforce. Do not market "confident learning" as novel (Cleanlab owns the term). Do not claim byte-reproducibility until the version hash stops hashing random/wall-clock fields, or rights enforcement until the publish gate checks licence.

**Proof plan.** (1) Quality: use a public label-error benchmark; show the audit recovers true precision within the Wilson interval and the gate rejects a degraded batch. (2) Independence: reproduce the hard.db result (phi 0.77–0.80, ceiling 89.7%), then compare same-family versus cross-family models. (3) Reproducibility: export twice on two machines/timezones; match manifest and payload hashes. (4) Risks: buyer statistical literacy (one-page explainer, "audit receipt"); small gold sets (honest "insufficient evidence"); incumbents copying UI (own the protocol and open certificate format); sustainability (open-core the workbench, sell hosted attestation and compliance exports, not the maths).

---

## 8. Critique of `NEW_COMPETITOR_KILLER_FEATURES.md`

The document is strategically inverted: most "killer" features are commodity or misimplemented, and the novel asset (the ensemble audit) lives elsewhere.

- **Confident learning / label-error finder:** Cleanlab owns the term; FiftyOne has mistakenness; Cleanlab has ObjectLab. Curlset's implementation is k-NN majority vote over text n-gram/box-count features — no out-of-sample probabilities, no class-conditional confusion matrix — and collapses on image-only records. Do not market it.
- **Smart-box / Sobel edge-snap:** CVAT, Roboflow, Label Studio and Supervisely all ship AI-assisted/magnetic annotation; the implementation is a 1-px central difference, not Sobel. Table stakes.
- **1-click Unsloth/Axolotl/LLaMA-Factory/Ultralytics exports:** those frameworks already define and convert the formats; Roboflow and Label Studio export the vision formats. Convenience only.
- **Cross-modal semantic alignment and cluster map:** the first is keyword negation matching ("scratch/dent" vs "no damage"); the second duplicates FiftyOne/Lilac/Lightly/Encord Index and, per the dossier, collapses to (0,0). Neither is a differentiator.
- **Geometry-aware augmentation and visual git-diff:** Albumentations/Kornia/Roboflow do the first; DVC/LakeFS diff files and CVAT compares jobs, so the second is uncommon but low-moat. Keep the visual diff as a demo.

Demote all seven to "workbench quality-of-life" and promote the ensemble work. Wilson threshold solving, audit sizing, calibrated weights, Fleiss kappa and phi correlation are the only pieces in the repository that are both technically substantive and commercially scarce.

---

## 9. References

**Open source** (GitHub API, 2026-11-04)
- Label Studio: github.com/HumanSignal/label-studio · labelstud.io/guide/enterprise_features · humansignal.com/pricing/
- CVAT: github.com/cvat-ai/cvat · cvat.ai/pricing/cvat-online · docs.cvat.ai/docs/qa-analytics/quality-control/ · docs.cvat.ai/docs/qa-analytics/auto-qa/
- FiftyOne: github.com/voxel51/fiftyone · docs.voxel51.com/enterprise/overview.html · docs.voxel51.com/brain/ · voxel51.com/pricing
- Argilla: github.com/argilla-io/argilla · docs.v1.argilla.io/en/latest/practical_guides/collect_responses.html
- Cleanlab: github.com/cleanlab/cleanlab · cleanlab.ai/blog/learn/object-detection/
- Lilac: github.com/databricks/lilac · DVC: github.com/treeverse/dvc · dagshub.com/pricing/ · dagshub.com/docs/integration_guide/label_studio/
- Diffgram: github.com/diffgram/diffgram · LS ML backend: github.com/HumanSignal/label-studio-ml-backend
- Kili SDK: github.com/kili-technology/kili-python-sdk · kili-technology.com/pricing · Supervisely: github.com/Supervisely/supervisely · supervisely.com/pricing/
- Segments: github.com/segments-ai/segments-ai · segments.ai/pricing/ · VoTT: github.com/microsoft/VoTT
- Potato: github.com/davidjurgens/potato · potatoannotator.readthedocs.io/en/latest/comparison/
- LS issues: github.com/HumanSignal/label-studio/issues/10012 · .../issues/6430
- Encord Active (archived): github.com/encord-team/encord-active

**Commercial** (pricing/status checked 2026-11-04)
- Roboflow: roboflow.com/pricing · roboflow.com/credits · docs.roboflow.com/datasets/versions/dataset-versions · roboflow.com/blog/multi-model-auto-labeling-for-segmentation
- Encord: encord.com/pricing/ · encord.com/blog/data-labeling-quality-control/ · docs.encord.com/release-notes/releasenotes-2026
- Labelbox: labelbox.com/ · docs.labelbox.com/horizon/guides/limits · labelbox.com/guides/how-to-create-a-quality-strategy-for-your-data-labeling-project/ · usagepricing.com/blueprint/activity/labelbox-2026-09-11-pricing-page-retired · dealroom.co/news/162716-labelbox-lands-100m-series-e-to-push-reinforcement-learning-and-ai-agent/
- Scale/Meta: cnbc.com/2025/06/12/scale-ai-founder-wang-announces-exit-for-meta-part-of-14-billion-deal.html
- SuperAnnotate: superannotate.com/pricing · superannotate.com/blog/agent-hub-launch · V7: v7labs.com/pricing · trustradius.com/products/v7labs/pricing
- Snorkel: snorkel.ai/data-centric-ai/programmatic-labeling/ · usagepricing.com/blueprint/snorkel-ai
- Humanloop: humanloop.com/docs/changelog/2025/08 · techcrunch.com/2025/08/13/anthropic-nabs-humanloop-team-as-competition-for-enterprise-ai-talent-heats-up/
- Arize: arize.com/pricing/ · arize.com/docs/phoenix/self-hosting/license · Galileo/Cisco: blogs.cisco.com/news/cisco-announces-the-intent-to-acquire-galileo · WhyLabs/Apple: geekwire.com/2025/founders-at-seattle-startup-whylabs-join-apple-following-an-under-the-radar-acquisition/
- W&B/CoreWeave: investors.coreweave.com/news/news-details/2025/CoreWeave-Completes-Acquisition-of-Weights--Biases/default.aspx · wandb.ai/pricing
- Hugging Face: huggingface.co/pricing · huggingface.co/docs/autotrain/cost

**Standards, research, pain-point evidence**
- Pervasive label errors: arxiv.org/abs/2103.14749
- Correlated errors: arxiv.org/html/2605.29800v1 · Hidden Clones: arxiv.org/html/2603.17111 · LLMs as a Jury: arxiv.org/html/2607.10139v2 · Conformal Annotation: arxiv.org/html/2610.40252v1
- Apple statistical quality estimation: machinelearning.apple.com/research/quality-estimation-data-annotation · AQL: asq.org/quality-resources/sampling/attributes-variables-sampling
- MAPIE: github.com/scikit-learn-contrib/MAPIE · repro-zipfile: github.com/drivendataorg/repro-zipfile
- Croissant 1.1: mlcommons.org/2026/02/croissant-1-1-standard/ · Data Provenance Initiative: arxiv.org/abs/2310.16787
- EU AI Act Art. 10: artificialintelligenceact.eu/article/10/ · timeline: mckennaconsultants.com/eu-ai-act-high-risk-compliance-a-technical-readiness-guide-for-august-2026/
- SLA critique: lifewood.com/blogs/annotation-accuracy-standard-sla · buyer's guide: humansintheloop.org/best-enterprise-data-annotation-platforms-2026/
