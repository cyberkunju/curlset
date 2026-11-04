# W13 — Other modalities: audio, video, 3D, tabular, code, LLM fine-tuning data

**Date:** 2026-11-04. **Scope:** the six modalities and dataset types wave 1 (R1–R10) did not cover. Wave-1 findings are cited by report number, not restated. **Assumed constraints:** local-first, Python 3.12, CPU-first, core product without paid APIs.

**Legend.** **[P]** primary source read directly. **[R]** authoritative secondary surface (licence file, model card, vendor post). **[I]** inference. **[U]** unverified, flagged only.

---

## 1. Executive summary

**1. Code is the only modality here where a label can be *proved*, and it also has the largest effects.** Fine-tuning a 32B agent on 491 SWE-Gym trajectories moved SWE-bench Verified from **7.0% to 20.6%**; an inference-time verifier took it to **32.0%** [P]. Procedurally generated tasks (8.1K, built from commits with auto-generated tests) matched human-issued tasks in ablation — **27.8% vs 28.0%** — and reached **51.0%** end-to-end [P]. Test-based selection alone added **+18.8 absolute** pass@1 [P]. Nothing else here is within half that size, and nothing else has an auditable oracle.

**2. Audio is the strongest *shippable* modality today**, because `audio_transcription`, a segment schema, `RULE_AUDIO_TIMESTAMPS` and a WebVTT exporter already exist, so marginal cost is lowest. Evidence converges on **~30% synthetic with acoustic degradation**: 70/30 real-to-RIR-augmented-synthetic gave **8.45% WER vs 8.68% all-real**, and 25% of real data matched the baseline [P]; three teams report 11–35% relative WER reduction from TTS or TTS+VC in low-resource settings [P]. Synthetic-only is decisively worse: **14.1/37.6** vs **8.1/25.9** clean/other WER [P].

**3. Video, 3D and tabular should not be built now**, for three different reasons: video needs a GPU for the parts that matter and its oracle measures consistency rather than correctness; usable 3D generation is non-commercial (INRIA's reference splatting code is research-only [R]); tabular synthesis neither reliably improves models nor provides privacy.

**4. The rule that generalises.** Synthetic data pays when the generator is *stronger than the labelling function on the axis the task needs* — text coverage for ASR, layout for driving scenes, category breadth for 3D assets — and fails when it is a cheaper copy of the same distribution. Hence TTS at 30% plus impulse responses; hence layout-conditioned video adding **+2.46 mAP** on top of *full* real nuScenes [P]; hence no tabular gain, where there is no shared structure to exploit [P]. Code generators are weak too, but code *verifiers* are absolute, so the gain comes from filtering.

**5. Curlset's role here is verification, not generation.** A competitive SFT/DPO engine needs a strong teacher; a competitive video or 3D generator needs a cluster. Neither is CPU-first. Deciding which generated rows are admissible is cheap and deterministic, and that inverts the usual "synthetic data platform" pitch in a way that suits the certificate thesis in `00-SYNTHESIS.md` §4.

**6. Licences are a minefield where vendors point.** Verified: **SDV and CTGAN are Business Source License 1.1**, SDV's grant forbidding use "for a **Synthetic Data Service**" [R]; **XTTS-v2** CPML [R]; **MusicGen, AudioLDM2 and CoTracker** are CC-BY-NC (AudioLDM2 share-alike) [R]; INRIA **gaussian-splatting** research-only [R]; **TabPFN 2.5+** non-commercial [R]. Permissive and sufficient: Whisper/faster-whisper, Piper (MIT), Kokoro-82M, Qwen3-ASR, SAM 2 (Apache-2.0), XMem, mutmut (BSD-3), Kubric, gsplat, Yandex TabDDPM (MIT).

**7. Cross-modal consistency is the cheapest proven accuracy gain.** DataComp: cross-modal filtering improved ImageNet zero-shot by **+6.9 points** at 12.8B scale [P]. T-MARS: masking text inside images before scoring added **+6.5%**, motivated by **~40% of LAION images containing text overlapping the caption** [P]. That is wave 1's L2 mechanism — an independent signal that can disagree — with a measured downstream effect, computable locally.

---

## 2. Per-modality findings

### 2.1 Audio

**TTS augmentation works at a minority share, with channel degradation.** Rossenbach et al. (ICASSP 2020) trained TTS on the same transcript corpus and added the audio to LibriSpeech-100h, reporting "up to **33% relative**" WER improvement over a strong augmented baseline [P]. The mechanism is text coverage: the synthetic audio carries sentences the 100 hours lacked.

The mixture is now quantified. On LLM-based ASR, **70% real / 30% synthetic with RIR augmentation reached 8.45% WER versus 8.68% all-real**, and "LWP + RIRs matches baseline with only 25% real data (13.6 h)" [P]. The load-bearing detail is that **raw synthetic speech is too clean**: RIR convolution supplies the "necessary acoustic irregularities", without which the synthetic rows teach a channel the model will never meet [P]. The recipe also used layer-wise selection [P], implying synthetic rows belong in a separately weighted slice.

Joint TTS+VC augmentation cut WER **11% on Common Voice and 35% on LibriSpeech**, while "pitch augmentation and VC-based speaker augmentation are found to be **ineffective**" alone [P] — text and channel diversity buy what speaker diversity does not.

**The ceiling.** Synthetic-only training gives **10.0/32.2** (GMM-HMM) and **14.1/37.6** (attention encoder-decoder) WER against **8.1/25.9** for real data — 6.0 and 11.7 absolute points worse, and worse for the stronger architecture [P]. The authors conclude synthetic data is "not equally utilizable to real data", limited by speaker coverage and model size [P] — the audio instance of R6's synthetic-share ceiling. Across six Common Voice languages the crossover sits near **<1 h real speech or >10 h TTS** [P].

**Pseudo-labelling is better evidenced than TTS.** Distil-Whisper assembled **22k hours of pseudo-labelled audio** over 10 domains and 18k+ speakers, used "a simple word error rate (WER) heuristic" to keep only the best pseudo-labels, and produced a model **5.8× faster with 51% fewer parameters** within **1% WER** [P]. The load-bearing component is the *filter*. Note the common conflation: Whisper itself was trained on 680,000 hours of *weakly supervised internet transcripts*, 117,000 non-English [P] — not on pseudo-labels from a stronger model.

**Risks.**
- **Hallucination:** **187 of 13,140 segments (1.4%)** hallucinated in at least one Whisper API run, concentrated on long pauses and non-speech [P] — wrong in the worst way for a labelling product: fluent, confident, and surviving any fluency filter.
- **Channel mismatch:** synthetic-only costs 6–12 absolute WER points [P].
- **Speaker leakage:** I found **no controlled study** quantifying it [U]. The risk is real — a cloned voice spanning train and test biases test WER — but bounded, since VC-only speaker augmentation measured as ineffective [P]. The answer is a **deterministic invariant**: store `voice_id` per synthetic row and block any `voice_id` spanning train and test. One integer, one set intersection — R2's "block on deterministic invariants".
- **Audio events do not substitute.** AudioGen-trained classifiers reach **48.3%** zero-shot versus **88.6%** on real ESC-50 [P]; a DCASE 2024 study is more favourable, improving a CRNN when augmenting **200–300%** with AudioGen output [P]. Compatible readings: generation helps as augmentation of a real anchor, fails as replacement. Music is uncharacterised [U], and MusicGen's weights are CC-BY-NC-4.0 [R].

**Stack (CPU).** faster-whisper `small` int8 (MIT [R]); Silero VAD before ASR, since hallucination concentrates on silence (MIT [R]); WhisperX or Qwen3-ForcedAligner for real timestamps (BSD-2 / Apache-2.0 [R]); Kokoro-82M ONNX (Apache-2.0 [R]) — preset voices only, which makes `voice_id` enumerable; PANNs CNN14 (MIT) as a weak independent voter; Qwen3-ASR-0.6B (Apache-2.0 [R]) for audit samples, because its errors are structurally unlike Whisper's. Avoid the non-commercial XTTS-v2, MusicGen and AudioLDM2.

**Highest-value experiment (E-A1), the round-trip audit.** Take 200 approved audio records. Synthesise each transcript with two Kokoro voices, re-ASR with faster-whisper `small`, compute per-segment WER, and have a human adjudicate the same 200 for transcript errors. Measure the AUROC of round-trip WER against the human verdict. If ≥0.75, you have a **zero-marginal-cost certifier** — one modality reading another — that composes with R4's conformal machinery: the audit sample sets the threshold, the round trip scores every record. If ≈0.5, transcripts cannot self-verify, which is worth knowing before promising anything.

### 2.2 Video

**What is brittle, and why.** SAM 2 — the load-bearing tool, at "**3× fewer interactions**" than prior approaches [P] — has greedy memory: "an errored or missed mask will cascade" [P]. SAM2Long (ICCV 2025) fixes this with a training-free memory tree, confirming both the diagnosis and that the base model is unreliable over long clips [P]. Practical rule: propagation is safe over tens of frames and unsafe over hundreds, and the failure is *silent* — the mask stays plausible while drifting, so error grows with clip length. Tracks are proposals until a human confirms a keyframe, with re-confirmation at scene cuts and after occlusion.

**Synthetic video: one strong result, one weak one.** MagicDrive added synthetic frames to *full* nuScenes and improved BEVFusion (camera+LiDAR) from **65.40 to 67.86 mAP (+2.46)** and **69.59 to 70.72 NDS (+1.13)** [P] — a gain from controllable geometry, not volume, and the cleanest evidence that a generator can add *information*. Text-to-video as annotated action-recognition data improved zero-shot accuracy by **5% on HMDB-51** and "almost 10%" on BIKE/Kinetics-600, with the authors noting "real samples generally contain a richer level of information" [P] — positive, small, data-limited only. Panda-70M is the under-used complement: **70M video–caption pairs** from "multiple cross-modality teachers", i.e. captioners routed by video type plus filtering [P].

**Stack.** PyAV/FFmpeg decode (licence depends on build flags [U]); 1–2 fps plus scene-change keyframes; SAM 2.1 (Apache-2.0 [R]) or **XMem (MIT [R])** for propagation; ByteTrack for identity; no **CoTracker** commercially (CC-BY-NC-4.0 [R]). SAM 2 on CPU is audit-sample-only [I]. **Build nothing yet:** the gap between "demo" and "certified label" is largest here, so sell QA on customer-labelled video rather than labelling. **E-V1 if it ships:** 20 clips, single-box propagation, human edit rate per 100 frames against per-frame prompting, reported as a crossover clip length — and that number, not "3× fewer interactions", is what can be promised.

### 2.3 3D

**Asset scale transfers.** OpenShape, trained at Objaverse scale, reaches **46.8% zero-shot on the 1,156-category Objaverse-LVIS benchmark "compared to less than 10%"** for prior work [P] — the strongest 3D result available, where synthetic *asset* diversity produces a capability real scans did not.

**LiDAR augmentation transfers, modestly.** LiDAR-Aug (CVPR 2021) is "a plug-and-play module" that "can significantly improve 3D object detection" [P]; a realistic-scene-synthesis follow-up reports **+4.7% 3D mAP on KITTI** [P]. Single digits, single dataset — the same order as R6's 2D results. Simulators are data engines, not benchmarks: Kubric (Apache-2.0 [R]) and BlenderProc generate richly annotated scenes, but R6 already established that neither reports detection mAP, that Isaac Sim has no peer-reviewed number, and that Isaac Lab being BSD-3-Clause does not make the proprietary Isaac Sim open [R].

**3D Gaussian Splatting: interesting, disqualified.** INRIA/MPII grant use "for research purposes… 'non-commercially', i.e., for research and/or evaluation purposes only" [R]. `gsplat` is Apache-2.0 [R], but the splat-fitting pipeline most papers use is the restricted one. Evidence that 3DGS *generates training data* is thin and mostly novel-view synthesis: DrivingGaussian is evaluated on reconstruction quality, not detection mAP [P] — do not cite it as a detection result. The one clean data-generation result is robotics: RoboSplat (RSS 2025) lifts policy success from **57.2% to 87.8%**, with lighting-variation success **80–93.3% vs 10–16.7%** for collected demos [P] — a *policy* result needing a capture rig and a GPU.

**Zero-shot 3D labelling is early.** SAM2Point adapts SAM 2 to point clouds by projection, "a preliminary exploration" [P]; NVIDIA's SAL-4D does zero-shot 4D LiDAR panoptic segmentation [R]. Neither publishes verifiable label precision [U].

**Stack: none that is permissive and CPU-viable.** Support 3D as a data type (import, validate, export glTF/PLY); promise no auto-labelling. **Highest-value experiment: none** — a week here is a net negative against E-A1 or E-C1 [I].

### 2.4 Tabular

**This is where the marketing is furthest ahead of the evidence.**

**Augmentation does not reliably help.** Manousakas et al. (2023) benchmarked generative augmentation on standard tabular tasks: such augmentations "were **not capable to consistently improve the performance**" over original data alone [P]. That answers "does adding synthetic rows help a tabular model?" — sometimes, not reliably, not enough to build a claim on.

**It does not provide privacy either.** Stadler et al. (USENIX Security 2022) built two membership-inference attacks and concluded synthetic data "does not prevent inference attacks or does not retain data utility", offering **no better privacy–utility tradeoff than traditional anonymisation**, with unpredictable gains [P]. A privacy guarantee requires a differential-privacy mechanism, not a GAN.

**Fidelity is not utility.** Quality and column-shape scores measure whether the table *looks* real; the only metric that matters is TSTR/TSRTR, which is noisy at exactly the sample sizes where synthesis is proposed.

**Two things that are genuinely useful, and neither is generation.**
- **TabPFN v2** on datasets up to **10,000 samples and 500 features** "in **2.8 s**… outperforms" tuned baselines by a wide margin [P]. That is not a generator but a **cheap strong probe** — the "small local classifier whose errors are unlike an LLM's" wave 1's L2 asked for. Caveat: **TabPFN 2.5+ weights are non-commercial** [R]; v2 wants a GPU for comfort [I].
- **Constraint checking** — types, ranges, nullability, foreign keys, arithmetic identities — deterministic, free, and it catches an error class no generator would fix.

**Licence trap, from the licence files.** SDV is Business Source License 1.1, its Additional Use Grant permitting use only if you "do not use the Licensed Work… for a **Synthetic Data Service**" [R]. CTGAN — the canonical open baseline — is the same BSL 1.1 [R]. A platform that synthesises tables for customers is plausibly such a service. Permissive alternative: the **Yandex TabDDPM reference (MIT)** [R]; Gaussian copulas via scipy/sklearn carry no restriction.

**Stack:** Gaussian copula (strong baseline), Yandex TabDDPM (MIT), pandera-style constraint checks (verify per-package licence [U]), TabPFN v2 as audit probe only.

**E-T1, designed to publish a null.** Five OpenML datasets × {Gaussian copula, TabDDPM} × {0%, +50%, +100%} × 5 seeds, paired bootstrap on AUC, pre-registered prediction that the effect is null or negative outside the imbalanced regime. A credible negative is worth more to Curlset's positioning than another positive, because every competitor claims the opposite.

### 2.5 Code

**Code is the clearest "beyond human judgement" case in the programme, for a structural reason: the specification is executable.** A sentiment label needs a person; a patch label needs a CPU. That changes certification economics: instead of 59 clean audits to certify 95% (wave 1 §3), you run the suite on 100% of records at zero marginal cost. What remains is a *specification* question — do the tests mean what you claim? — and that has its own measurable answer.

The measured effects are the largest in this report: **7.0% → 20.6%** on SWE-bench Verified for a 32B agent trained on 491 trajectories, then **32.0%** with an inference-time verifier, **51.0%** end-to-end from 8.1K procedurally generated tasks, and **+18.8 absolute** pass@1 from test-based selection (CodeT) [P]. Meta's TestGen-LLM reports 75% of generated tests built, 57% passed reliably, **25% increased coverage**, and **73% accepted** by engineers; TestPilot reaches **70.2% statement / 52.8% branch** coverage against Nessie's 51.3 / 25.6 [P]. SWE-smith reports 40% single-run resolve [R].

The R2E-Gym ablation is the key number: **procedural tasks matched human-issued tasks** (27.8 vs 28.0). Everywhere else synthetic data is a degraded substitute; in code it is a peer, because both are validated by the same executable oracle.

**Why the oracle is auditable: mutation testing.** The standard objection is that passing tests only proves the tests are weak — an objection with a measurement. Just et al. (FSE 2014) found "a statistically significant correlation between mutant detection and real fault detection, **independently of code coverage**" [P]. That licences mutation score as a *certificate of oracle strength*: a suite killing 80% of mutants is materially stronger than one killing 40%, measurable before you trust a single label. No other modality has an equivalent — you cannot mutate a caption and see whether the annotator notices.

**Why it is still not free.** (1) **Specification gap:** tests are incomplete specifications; SWE-bench Verified exists because 500 of 2,294 instances had to be human-validated as well-specified and solvable [P]. (2) **Contamination:** OpenAI announced in February 2026 that it would stop evaluating SWE-bench Verified as "increasingly contaminated", citing flawed tests and training leakage [R]; LiveCodeBench collects new problems continuously for this reason [P]. (3) **Reward hacking against tests:** CodeT's dual-execution agreement beats raw sampling [P], and acceptance must include tests the generator never saw.

**Stack, all CPU and permissive.** `subprocess` sandbox with `resource` limits, tmpdir, no network, wall-clock timeout; `pytest` (MIT [R]) with JUnit XML giving `{built, passed, failed, duration}` — TestGen-LLM's 75/57 split shows "built" and "passed" are different failures; `mutmut` (BSD-3 [R]) for sampled mutation scoring; `hypothesis` (MPL-2.0 [R]) for property oracles. SWE-bench is MIT [R]. No GPU or model is needed to *verify* — only to *generate*, which should be treated as an external input.

**E-C1, mutation-gated acceptance.** One Python repo with tests: generate N candidate tests for M functions, accept only those that pass on the original and fail on ≥1 mutant, then measure precision of the accepted set against a held-out human-written suite. At ≥0.9, Curlset can ship a **structural** certificate — "labels backed by an oracle with mutation score X over N tests" — strictly stronger than the statistical certificate available for images. Laptop-scale.

### 2.6 LLM fine-tuning data (SFT/DPO)

**SFT: real gains, mostly confounded, already covered by R6/R10.** Self-Instruct, Evol-Instruct, Magpie, Genie, AlpaGasus — with the decisive control that selecting the **9K longest** Alpaca examples beats AlpaGasus-9K on five evaluation sets [R10]. The surviving rule: verifier-filtered or grounded generation, minority share, and a length-only baseline you must beat.

**Rejection sampling and verifier filtering are what a CPU-first platform can actually implement, because they are selection.**
- RFT on GSM8K: LLaMA-7B SFT **35.9% → 49.3%** (+13.4), with multi-model sample aggregation adding further [P]. The gain comes from keeping solutions that reach the right answer — an oracle, not a judge.
- OmegaPRM automates *process* supervision with divide-and-conquer MCTS, collecting "over **1.5 million** process supervision annotations" and lifting GSM8K **86.4 → 93.6** and MATH500 **51.0 → 69.4** [P].
- Tülu 3, fully open: **939K SFT prompts, ~300K preference pairs**, with RLVR contributing **+1.7 MATH, +3.3 GSM8K, +1.3 IFEval** over the same pipeline without it [P].

The pattern is consistent: **verifiable-reward data is where reliable gains live.**

**Preference data is where synthetic data most reliably goes wrong.**
- **Multi-model synthetic pairs degrade safety.** "More is Less" (COLM 2025): such data, "despite its diversity, can degrade safety by enabling reward hacking, whereas single-model data" does not to the same degree [P]. Pooling models creates style differences the optimiser exploits without learning quality — the preference-data analogue of wave 1's correlated errors.
- **Length bias is the exploit.** DPO amplifies verbosity; Park et al. (ACL Findings 2024) document and partially correct it [P]. If pairs are built by "sample N, keep the longest as chosen", you have trained a length model — AlpaGasus one level down.
- **KTO** matches or exceeds preference methods "at scales from 1B to 30B, despite only learning from a binary signal" [P]. The widely repeated "90% less data" figure was **not in the abstract I could verify** [U]; do not repeat it.

**How much does a small model gain?** Zephyr-7B-beta, SFT+DPO on synthetic AI feedback, scored **7.34 MT-Bench vs 6.86 for Llama-2-Chat-70B** [R] — the headline and the caveat, since MT-Bench is a judge-based preference benchmark and part of the result is alignment to judge style. Self-rewarding models improve on AlpacaEval 2.0 across three iterations on Llama-2-70B [P], but the judge and the model are the same system: the correlated-error structure wave 1 showed cannot manufacture information.

**Stack is for curation, not generation:** `datasets`/`pyarrow` streaming, exact + MinHash dedup (R2), length-controlled scoring, execution or checker filters where the task is verifiable. Training frameworks are permissive but out of scope for a CPU-first core; their data formats are already in this repo's export presets.

**E-L1, the length-debiased preference audit.** Take 500 synthetic pairs, report the distribution of `len(chosen) − len(rejected)`, re-judge with an explicitly length-controlled prompt, and measure win rate on a fixed 200-item held-out set before and after. If the gain disappears under length control, the pairs are a verbosity artefact and should be rejected by a deterministic gate (class-conditional length-delta quantile).

### 2.7 Cross-modal consistency

One modality as an independent reader of another; the label is only as good as the agreement between systems that do not share a failure mode. §1.7 gives the two large-scale results. The limits matter as much: **CLIPScore** has the highest correlation with human judgement among reference-free caption metrics [P], but it and successors "struggle to identify fine-grained errors" [R] — rank with it, never certify with it. The audio transfer is E-A1: synthesise the transcript, transcribe it back, treat disagreement as evidence. Independence is plausible (TTS failures are prosodic, ASR failures are omissions and hallucinations), but whether round-trip WER predicts human-labelled transcript error is what E-A1 measures first [I]. This is the only evidence source here that is cheap on CPU, proven to move downstream accuracy by points, and computable **without human labels** — wave 1's L2 tier, not the synthetic-data tier.

---

### 2.8 Evidence table

| Method | Modality | Effect | Dataset / model | Repl. |
|---|---|---|---|---|
| TTS augmentation, matched transcripts | Audio | up to **33% rel. WER** | LibriSpeech-100h [P] | direction replicated |
| Synthetic-only TTS training | Audio | **14.1/37.6** vs real **8.1/25.9** | 3 architectures [P] | consistent w/ R6 |
| 30% TTS + RIR + layer selection | Audio | **8.45** vs **8.68**; 25% real matches baseline | LLM-based ASR [P] | one paper |
| TTS+VC, 6-language crossover | Audio | **−11/−35%** WER; helps at **<1 h real** or **>10 h TTS** | Conformer-Transducer [P] | partial |
| Pseudo-label + WER filter | Audio | 22k h → 5.8× faster, −51% params, within **1% WER** | Distil-Whisper [P] | strong |
| Synthetic audio as training set | Audio ev. | **48.3%** vs **88.6%** | ESC-50, AudioGen [P] | partly contradicted [P] |
| Whisper hallucination | Audio | **1.4%** of segments | 13,140 segs [P] | setup-dependent |
| SAM 2 propagation | Video | **3× fewer** interactions; silent drift on long clips | SA-V / SAM2Long [P] | strong |
| Layout-conditioned synthetic frames | Video | **+2.46 mAP**, **+1.13 NDS** | nuScenes BEVFusion [P] | single |
| T2V for action recognition | Video | **+5%** HMDB-51, **~+10%** BIKE K600 | data-limited [P] | single |
| Asset-scale 3D pretraining | 3D | **46.8%** zero-shot, 1,156 cats, vs **<10%** | Objaverse-LVIS [P] | strong |
| Rendering LiDAR augmentation | 3D | **+4.7%** 3D mAP | KITTI [P] | single-digit |
| 3DGS demos | 3D/robotics | **87.8%** vs **57.2%** policy success | RoboSplat [P] | needs rig+GPU |
| Generative tabular augmentation | Tabular | **no consistent gain** | Manousakas 2023 [P] | consistent |
| MIA on synthetic tabular | Tabular | **no privacy–utility gain** | USENIX Sec 2022 [P] | strong |
| Tabular foundation model probe | Tabular | beats tuned baselines in **2.8 s**, ≤10k×500 | TabPFN v2 [P] | strong |
| Agent trajectories | Code | **7.0 → 20.6%**; verifier → **32.0%** | SWE-Gym 32B [P] | strong |
| Procedural SWE tasks | Code | **27.8%** vs **28.0%**; **51.0%** e2e | R2E-Gym [P] | strong |
| Test-based selection | Code | **65.8%** pass@1, **+18.8 abs** | HumanEval [P] | broad |
| LLM unit tests | Code | 75/57/**25**/**73%** accepted | TestGen-LLM [P] | industrial |
| Mutation score vs real faults | Code | correlated **independent of coverage** | Just 2014 [P] | foundational |
| Rejection sampling | LLM SFT | **35.9 → 49.3%** GSM8K | LLaMA-7B [P] | replicated |
| Automated process supervision | LLM SFT | **86.4 → 93.6**; **51.0 → 69.4** | OmegaPRM [P] | single |
| Multi-model synthetic prefs | LLM DPO | **degrades safety** | COLM 2025 [P] | single, important |
| Cross-modal filtering | Image–text | **+6.9 pp**; text-masked **+6.5%** | DataComp / T-MARS [P] | strong |

---

## 3. The verification-oracle ranking

Criteria: **A** executable specification; **B** determinism; **C** measurable completeness of the oracle itself; **D** CPU-affordable at 100% coverage.

| Rank | Modality | A | B | C | D | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Code** | yes (tests, types, properties) | yes | **yes — mutation score** | yes | Provable modulo the specification gap, and the gap is measurable. |
| 2 | **Audio** | partial (WER vs reference) | yes | partial | yes | The reference *is* the label, so the oracle is relative — but it scores the label itself, and a second reader can be manufactured. |
| 3 | **Tabular** | partial (constraints, identities) | yes | no | yes | Deterministic invariants validate the *features*; the target column has no oracle at all. |
| 4 | **3D** | partial (geometry) | yes | no | yes (geometry) | Can prove a mesh is valid, never that it is labelled right. |
| 5 | **Video** | partial (IoU, flow residual) | mostly | no | no | Measures consistency, not correctness. Consistently wrong is the default failure. |
| 6 | **Image–text** | no | n/a | no | yes | Correlates with humans, fails fine-grained errors [R]; statistical certification only. |

Only code scores yes on C. Elsewhere the certificate is *statistical*: sample, measure a precision floor, bound it (wave 1 L4). For code it can be *structural*: "100% of labels pass an oracle that kills 84% of injected faults" is a claim about the whole dataset, checkable by a third party in minutes, and it degrades gracefully as the mutation score falls. The thesis is "we refuse to publish what we cannot certify", and code is the one modality where certify means more than a confidence interval — while also showing the largest measured data-centric effects.

**Caveat.** The specification gap is not hypothetical: SWE-bench needed 500 human-validated instances [P], and OpenAI stopped evaluating it for contamination and flawed tests [R]. A mutation score says the oracle is *strong*, not *right*. Report both, version the oracle, hold out fresh tasks (LiveCodeBench is the model [P]).

---

## 4. Design for this codebase

Current state: `TaskType.AUDIO_TRANSCRIPTION` with segment schema, a correct WebVTT exporter, `RULE_AUDIO_TIMESTAMPS` as a blocking check, WAV-only ingestion, and no video/3D/tabular/code support. That decides the sequencing.

### 4.1 Audio hardening (first, ~2 weeks)

New `packages/dataset_audio/`: `asr.py` (faster-whisper, emitting `AnnotationOrigin.MODEL` + `PENDING_REVIEW`, never auto-approved); `vad.py` (Silero before ASR — the cheapest reduction in hallucination exposure [P]); `align.py` (forced alignment so timestamps are measured); `roundtrip.py` (TTS → re-ASR → per-segment WER as a `VerificationSignal`); `tts.py` (Kokoro, explicit `voice_id`).

| Rule | Severity | Logic |
|---|---|---|
| `RULE_TTS_VOICE_LEAKAGE` | BLOCKING | any `voice_id` in both train and test/val |
| `RULE_SYNTHETIC_AUDIO_SHARE` | WARNING | synthetic > 30% of a class |
| `RULE_SEGMENT_OVERLAP` | WARNING | overlap > 50 ms |
| `RULE_ROUNDTRIP_DIVERGENCE` | WARNING | round-trip WER above calibrated threshold |

Evaluation: **WER/CER as first-class metrics**, returned as `{value, n, ci:{method:"paired_bootstrap", low, high}}` per R4, computed **over utterances, not segments** (segments are not independent). Synthetic policy: cap **30% per class**, require RIR convolution, store `voice_id`, `tts_model`, `tts_revision`, `rng_seed` in provenance — without the RIR step the cap is meaningless [P].

### 4.2 Code as a new task type (second, ~3 weeks, CPU-only)

`TaskType.CODE_GENERATION`, payload `{prompt, solution, tests, language:"python"}`. `packages/dataset_code/`: `sandbox.py` (subprocess + `resource.setrlimit` for CPU/address space/file size, fresh tmpdir, no network, wall-clock timeout, no inherited env — the sandbox *is* the product); `runner.py` (pytest `--junitxml` → `{built, passed, failed, errored, duration}`); `mutation.py` (`mutmut`, N mutants per module, time-boxed → `mutation_score`); `verifier.py` (accept only on `built AND passed AND (mutation_score ≥ floor OR held_out_pass)`, else `PENDING_REVIEW`). Export `code_jsonl` plus a pytest bundle, reusing the fixed-ZIP-epoch path in `dataset_export/service.py`.

Certificate extension: each version manifest gains an `oracle` block — `{tool, version, n_tests, mutation_score, mutation_tool, held_out_n}`. R8 requires the data to be byte-reproducible; this requires the *verifier* to be reproducible too. A label certified by an unversioned test runner is not reproducible, and no competitor has closed that gap.

### 4.3 Deferred, and why

**Video:** no support — oracle and hardware, not effort; revisit only for QA on customer-labelled video. **3D:** import/validate/export only; no auto-labelling, no 3DGS (licence, GPU). **Tabular:** constraint validation and export only; no synthesis, since the BSL on SDV/CTGAN makes the obvious implementation a licensing problem and the downstream-gain evidence is absent.

**Do not build:** a synthetic-audio generator without RIR and a voice ledger (it will look fine and be worthless); an LLM-as-judge quality score for preference data (wave 1's ceiling; "More is Less" shows active harm); a tabular synthesiser on SDV (licence forbids the use case).

---

## 5. Hype and dead ends

| Claim | Why it fails | Ev. |
|---|---|---|
| Synthetic speech replaces real recordings | 6–12 absolute WER points worse; 48.3% vs 88.6% for events | [P] |
| Whisper pseudo-labels are ground truth | 1.4% hallucination, fluent and confident; the WER filter is the contribution | [P] |
| Propagated tracks are labels | Greedy memory cascades errors silently | [P] |
| 3DGS is an open data engine | Reference implementation research-only; claims are NVS, not mAP | [R] |
| Isaac Sim yields labelled perception data | No peer-reviewed mAP (R6); Isaac Lab BSD-3 ≠ Isaac Sim open | [R] |
| Synthetic tabular helps models and privacy | No consistent gain; no privacy–utility gain | [P] |
| SDV/CTGAN is the open baseline | BSL 1.1 with a "Synthetic Data Service" carve-out | [R] |
| More preference data is better alignment | Multi-model pairs enable reward hacking; DPO amplifies length | [P] |
| SWE-bench Verified measures coding | Deprecated Feb 2026 for contamination and flawed tests | [R] |
| LLM-as-judge certifies data quality | Judge shares the generator's blind spots | [P] |

---

## 6. References

**Audio.** [1] Rossenbach et al., *Generating Synthetic Audio Data for Attention-Based ASR*, ICASSP 2020, arXiv:1912.09257. [2] Hilmes, Rossenbach, Schlüter, *On the Effect of Purely Synthetic Training Data for Different ASR Architectures*, SynData4GenAI 2024, arXiv:2407.17997. [3] *How to Leverage Synthetic Speech for LLM-Based ASR*, arXiv:2606.29031. [4] *An Exhaustive Evaluation of TTS- and VC-based Data Augmentation for ASR*, arXiv:2503.08954. [5] Casanova et al., *ASR data augmentation in low-resource settings using cross-lingual multi-speaker TTS and cross-lingual voice conversion*, Interspeech 2023. [6] Hao et al., *Investigating the Role of Synthetic Data Augmentation…Low-Resource Language ASR*, LREC 2026, aclanthology.org/2026.lrec-1.442. [7] Gandhi, von Platen, Rush, *Distil-Whisper*, arXiv:2311.00430. [8] Radford et al., *Robust Speech Recognition via Large-Scale Weak Supervision*, OpenAI 2022. [9] Koenecke et al., *Careless Whisper: Speech-to-Text Hallucination Harms*, FAccT 2024, arXiv:2402.08021. [10] Feng et al., *Can Synthetic Audio From Generative Foundation Models Assist Audio Recognition?*, Interspeech 2024, arXiv:2406.08800. [11] Ronchini et al., DCASE 2024 Workshop. [12] Qwen3-ASR Technical Report, arXiv:2601.21337; Apache-2.0 model card.

**Video.** [13] Ravi et al., *SAM 2*, ICLR 2025, arXiv:2408.00714. [14] Ding et al., *SAM2Long*, ICCV 2025, arXiv:2410.16268. [15] Gao et al., *MagicDrive*, ICLR 2024, arXiv:2310.02601. [16] *The Role of Video Generation in Enhancing Data-Limited Action Recognition*, arXiv:2505.19495. [17] Chen et al., *Panda-70M*, CVPR 2024, arXiv:2402.19479. Licences: CoTracker CC-BY-NC-4.0 (LICENSE.md) [R]; XMem MIT [R]; SAM 2 Apache-2.0 [R].

**3D.** [18] Liu et al., *OpenShape*, arXiv:2305.10764. [19] Fang et al., *LiDAR-Aug*, CVPR 2021. [20] *Realistic Scene Synthesis for LiDAR Augmentation*, arXiv:2305.12853. [21] Yan et al., *DrivingGaussian*, arXiv:2312.07920. [22] Yang et al., *RoboSplat* (Novel Demonstration Generation with Gaussian Splatting), RSS 2025, arXiv:2504.13175. [23] *SAM2Point*, arXiv:2408.16768. Licences: INRIA/MPII `gaussian-splatting` LICENSE.md, non-commercial [R]; `gsplat` Apache-2.0 [R]; Kubric Apache-2.0 [R]; Isaac Lab BSD-3-Clause, Isaac Sim proprietary [R].

**Tabular.** [24] Manousakas et al., *On the Usefulness of Synthetic Tabular Data Generation*, arXiv:2306.15636. [25] Stadler, Oprisanu, Troncoso, *Synthetic Data — Anonymisation Groundhog Day*, USENIX Security 2022. [26] Kotelnikov et al., *TabDDPM*, ICML 2023, arXiv:2209.15421. [27] Hollmann et al., *Accurate predictions on small data with a tabular foundation model*, Nature 637 (2025). Licences: SDV and CTGAN BSL 1.1 (LICENSE files) [R]; Yandex TabDDPM MIT [R]; TabPFN 2.5+ non-commercial [R].

**Code.** [28] Chen et al., *CodeT*, ICLR 2023, arXiv:2207.10397. [29] Pan et al., *SWE-Gym*, ICML 2025, arXiv:2412.21139. [30] Jain et al., *R2E-Gym*, arXiv:2504.07164. [31] Alshahwan et al., *TestGen-LLM at Meta*, arXiv:2402.09171. [32] Schäfer et al., *Automated Unit Test Generation with LLMs*, IEEE TSE 50(1) 2024, arXiv:2302.06527. [33] Just et al., *Are mutants a valid substitute for real faults?*, FSE 2014. [34] Jain et al., *LiveCodeBench*, ICLR 2025, arXiv:2403.07974. [35] OpenAI, *Why we no longer evaluate SWE-bench Verified*, 2026-02-23 [R — 403 to fetch; claim from the published headline plus two independent secondary reports]. [36] SWE-bench Verified, 500 human-validated instances, swebench.com/verified.html.

**LLM fine-tuning data.** [37] Yuan et al., *Scaling Relationship on Learning Mathematical Reasoning*, arXiv:2308.01825. [38] Luo et al., *OmegaPRM*, arXiv:2406.06592. [39] Lambert et al., *Tülu 3*, arXiv:2411.15124. [40] Ethayarajh et al., *KTO*, arXiv:2402.01306. [41] Wang et al., *More is Less: The Pitfalls of Multi-Model Synthetic Preference Data in DPO Safety Alignment*, COLM 2025. [42] Park et al., *Disentangling Length from Quality in DPO*, ACL Findings 2024. [43] Yuan et al., *Self-Rewarding Language Models*, arXiv:2401.10020.

**Cross-modal.** [44] Gadre et al., *DataComp*, NeurIPS 2023, arXiv:2304.14108. [45] Maini et al., *T-MARS*, ICLR 2024, arXiv:2307.03132. [46] Hessel et al., *CLIPScore*, EMNLP 2021.

**Internal.** [47] `research/00-SYNTHESIS.md` §3–4; `R2` (deterministic invariants), `R3` §2.4, `R4` (CI contract), `R6` (synthetic conditions), `R8` (reproducibility), `R10` §2.8.
