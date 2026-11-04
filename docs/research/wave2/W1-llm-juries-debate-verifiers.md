# W1 — Multi-model cross-judging: juries, debate, verifiers, and what actually moves the ceiling

**Date:** 2026-11-04 · **Scope:** aggregation theory, debate, juries, verifiers, test-time compute, cross-judging tricks, patents, practitioner reports · **Inputs:** `00-SYNTHESIS.md`, `R1`, `R10`, new measurements on `repo/data/hard.db`.

**Tags.** **[P]** cited paper's own experiment · **[R]** measured here · **[I]** inference · **[U]** unverified/anecdotal.

**New versus R1.** R1 killed vendor diversity, α-sharpening and role prompts. This memo adds a measurable bound on every re-querying protocol; a re-analysis showing four aggregators emit the same label on 289–290 of 290 records; confidence ranking errors at AUC 0.74 *inside* the unanimous band without ever changing a label; a power analysis showing R1's 1.5-point gate is below the detection limit; and five methods absent from the literature.

---

## 1. Executive summary

- **No cross-judging method beats the best single model on genuinely hard classification with a CI excluding zero.** A 9-judge, 7-family panel supplies ≈2 effective votes and the best single judge matches or beats it; panel lift on three NLI sets is **+0.2 / −6.5 / −2.5 pts** (Kohli 2026). Here, plurality, confidence-sum, log-odds and drop-lowest emit the *same label on 289–290 of 290 records* [R]. The only aggregator that moves is a supervised per-class confusion matrix: **86.4% → 87.9%, +1.5 pts, CI [0.00, +2.8]** [R] — right sign, inside noise, below best-single plus any defensible margin.
- **Every positive result lives in one of three regimes we do not have.** Debate and verifiers win when the judge is *weaker* than the advocates (48% → 76%, Khan 2024); when the answer carries a **certificate** (GenRM 5% → 45.3%; a jury reaches the AIME-24 oracle, 56.7% vs 36.7% for self-consistency); or when the output lives in a **metric space** where a proper scoring rule guarantees the pool beats the average member (a 12-LLM forecasting ensemble is statistically indistinguishable from a human crowd). A 4-way intent label has none of the three.
- **The reason is not correlation alone — 0-1 accuracy has no proper-scoring-rule guarantee.** For Brier or log loss the pool provably beats the *average* member. For argmax accuracy it beats nothing, because the comparator is the *maximum* member, and the pool converges to the modal answer of a correlated family — which on hard items is the shared mistake.
- **Every re-querying protocol is bounded by a number nobody measures.** With ρ⁺ = P(re-elicitation correct | all k wrong) and ρ⁻ = P(it wrong | all k right), Δ = c·ρ⁺ − (1−c)·ρ⁻. At c = 10.33%, ρ⁺ = 0.30 buys 3.1 pts; ρ⁻ = 0.02 gives back 1.8. Debate, juries and verifiers all have ρ⁻ > 0, and **the bound costs 90 calls to estimate**.
- **Power, not method quality, is the binding constraint.** At n = 300 with 39 errors, McNemar needs ~10 net discordant records for p < 0.05 — an **MDE of ≈3.3 pts** against 2.4 pts of remaining headroom. No aggregation experiment on this gold set can pass a two-sided test at α = 0.05. R1's "best single + 1.5 pts" gate is below the detection limit.

---

## 2. Breakthrough candidates, and why each is unexplored

All change *what is asked* or *what evidence exists*, never merely *how votes are combined*.

### C1 — Error-recoverability audit (ERA): measure the bound before building the method

Re-query the 31 all-wrong records under three maximally different elicitations (free rationale, forced binary choice, generation: "write a message that would be labelled X") and measure ρ⁺; re-query 40 unanimously-correct records for ρ⁻; compute Δ = c·ρ⁺ − (1−c)·ρ⁻ with a paired bootstrap.

It is the only experiment that can retire the whole branch in ~90 calls, and its answer applies to every method here at once. ρ⁺ ≤ 0.15 caps accuracy at 88.8%, below the bar; ρ⁺ ≥ 0.40 puts 4+ points on the table. It is unexplored because every paper reports *mean accuracy over a benchmark* and none stratifies by "all members wrong": He et al. (2026) study *divergent* cases, "When LLMs Agree, Are They Right?" (2026) audits agreement as a predictor, and the quantity that sets the ceiling is never reported. **Cost** 90–210 calls. **Kill** ρ⁺ ≤ 0.15 with upper 95% bound < 0.25.

### C2 — Conditioned dissent auditing: rationale divergence *inside* the unanimous band

The hard label destroys information: three distributions collapse to one symbol and 29 of 31 errors hide in that collapse [R]. Re-elicit 2–3 rationales per unanimous record, measure divergence at the level of *reasons* (semantic-entropy clustering, or which span each cites), and use it as a **veto on auto-accept**, measuring AUROC for the all-wrong indicator *conditioned on unanimity*.

Answer-level variance is identically zero in this band, so any signal must come from below the answer; semantic entropy is the best-validated uncertainty signal available (Kuhn 2023; Farquhar 2024). AUROC 0.70 lets you reject 15% of the band and remove ~40% of its errors, moving the certified ceiling from 89.7% to ≈92% at 85% yield — the largest realistic gain without new evidence. Unexplored because uncertainty work measures AUROC *globally*, where answer variance dominates, and ensemble work measures agreement *globally*; nobody conditions on the degenerate stratum where the marginal signal is zero by construction. **Cost** 801 calls. **Kill** conditional AUROC < 0.60.

### C3 — Bradley–Terry over the label set, with Condorcet cycles as an ambiguity certificate

Replace one 4-way judgement with three binary ones; aggregate by Copeland/Bradley–Terry. Two outputs: a label, and a **cycle indicator** — if A beats B beats C beats A, no consistent ranking exists, which is a *proof* of ambiguity rather than a low score.

Pairwise elicitation has better psychometrics than absolute labels, and the advantage is largest where the judge is weak ("in the weak judge regime, pairwise preference based rankings substantially outperform direct LLM evaluation", ICML 2026). It neutralises class-prior bias — our panel over-predicts `technical_support` 94 vs 73 [R], which frequency-driven pointwise prompting cannot correct — and the cycle flag is a **new kind of certificate**: not "we are unsure" but "the preference relation is intransitive, so no label is defensible". Unexplored because pairwise is used for *ranking models*, almost never for *assigning a label to an item*; cycles have no pointwise analogue. **Cost** 3 calls/record. **Kill** pairwise ≤ pointwise on a paired test, or cycle rate at the permutation null.

### C4 — Submodular error-coverage selection: optimise the union of correct answers

With A_i the items source *i* gets right, the ceiling is |∪_i A_i|/n = 1 − c. Choosing sources is therefore **maximum coverage** — monotone submodular, greedy (1−1/e)-optimal, same guarantee under a budget with a density rule (Khuller 1999).

Every selection rule in use — most accurate, most diverse, accuracy-weighted — optimises a proxy. Coverage of the error mass is the quantity in the ceiling identity and it is cheap: a 78%-accurate rule set with 40% novel coverage beats an 86%-accurate fourth LLM with 2%. It also explains retrospectively why all three decorrelation attempts failed: they optimised correlation, not coverage. Ensemble selection in the literature maximises validation accuracy (Caruana 2004) or diversity indices, and no LLM-labeling paper surveyed states the coverage objective. **Cost** zero calls. **Kill** coverage-greedy fails to beat accuracy-greedy on held-out 1−c.

### C5 — Feature-informed IRT: a per-item probability that the whole panel is wrong

Fit P(correct_ij) = σ(a_j(θ_j − b_i)) with b_i = w·φ(x_i); predict P(all wrong) as Π_j(1 − p_ij) corrected by an estimated co-error inflation (the independence product under-estimates c at φ = 0.78 — that correction is the novel part). The output targets c directly, not per-member accuracy.

This is the only model class here that is *identified* at k = 3. Dawid–Skene has 36 free parameters and, without gold, a likelihood flat along the "one source counted three times" direction — exactly our data. IRT replaces 290 item intercepts with a 16-parameter difficulty regression over 870 observations, and its difficulty axis is what predicts the blind spot; it also yields a *reason* per item. Unexplored because IRT ranks models and prunes benchmarks but is never used to estimate per-item all-wrong probability; the annotation literature is dominated by DS and descendants (GLAD, MACE), none with a difficulty axis that generalises. **Cost** zero calls. **Kill** out-of-fold AUROC < 0.65 or calibration slope outside [0.7, 1.3].

### Secondary

**C6 — Span-grounded verification.** Require the decisive span per label and check it with an independent small model plus a hand-written rule — the only way to open a generator–verifier gap on a task that has none (Zhou 2025). Risk: CoT rationales are often unfaithful (Turpin 2023).

---

## 3. Method findings, with the math

### 3.0 The direct answer

| Setting | Beats best single? | Effect | Status |
|---|---|---|---|
| 4-way intent, 3 correlated LLMs, n=300 (here) | **No** | −0.7 (plurality) to +0.6 (supervised CM, CI includes 0) | **[R]** |
| 3-way NLI, 9 judges / 7 families | **No** — best single matches or beats panel everywhere | +0.2 / −6.5 / −2.5 pts | [P] Kohli 2026, single-author preprint |
| Math candidate selection | **Yes** | 56.7% vs 36.7% SC, equals oracle | [P] Liu 2026, *selection not classification* |
| Weak judge, strong debaters | **Yes** | 48% → 76% | [P] Khan 2024 |
| Best-of-N, trained verifier | **Yes, large** | 5% → 45.3%; 73% → 93.4% | [P] Zhang 2024 |
| Forecasting, 12 LLMs | Ties human crowd | not statistically different | [P] Schoenegger 2024 |

Positive results need a weaker judge, a checkable answer, or a metric-space output. Hard classification has none. **On genuinely hard data, cross-judging does not beat the best member; it cannot, for the reason in §3.1.**

### 3.1 Why the ceiling is structural, and why ensemble theory does not apply

**Ceiling theorem.** Let c = P(all k members wrong). Any aggregator M is a function of the k votes, so it is correct only if some vote is correct:

> acc(M) ≤ 1 − c, for every M. (exact, assumption-free)

At c = 0.1033 this caps everything at 89.7%; the oracle over observed votes is 89.3% because two splits are also all-wrong.

**Why proper scoring rules do not save you.** For any strictly proper S, the pool f̄ = (1/k)Σf_i satisfies E[S(f̄,y)] ≤ (1/k)ΣE[S(f_i,y)] — the ensemble beats the *average* member, always. Accuracy is not a proper scoring rule: the plug-in accuracy of argmax f̄ is not bounded by max_i acc(argmax f_i) and, with correlated members, is usually below it, because f̄ concentrates on the shared prior. Every ensemble-theory argument quoted in favour of LLM panels is a proper-scoring-rule result applied to a 0-1 problem. This is the commonest error in the vendor literature [I].

**Why weighting cannot help.** With k = 3 the label depends on the vote pattern alone; the argmax is invariant to any weight vector inside the normal cone of the winning pattern, and the margin is at least one vote, so the set of weights that changes *any* label is a thin shell. Measured [R]:

| aggregator | accuracy (n=290) | differs from plurality |
|---|---|---|
| plurality | 86.55% | — |
| confidence-sum | 86.55% | **1 record** |
| log-odds pooling | 86.55% | **1 record** |
| drop least-confident, then plurality | 86.55% | 6 records |
| single most-confident vote | 85.17% | many |
| supervised per-class confusion matrix (cross-fitted) | **87.94%** | ~12% of records |

Log-odds pooling is byte-identical to confidence-summing here. The repo's headline aggregator and a naive weighted count are the same function — not a tuning problem, but what "the vote is a sufficient statistic" looks like.

**Prior correction also fails.** The panel over-predicts `technical_support` (94 vs 73) [R], so matching the predicted marginal to the design prior via IPF looks promising. Cross-fitted it gives **86.19% vs 86.55%** — a loss, 5–95% across splits [0.66, 0.91] [R]. At n = 150 per half, four bias parameters cost more variance than they remove: **at n = 300 a learned combiner with more than ~2 parameters cannot be validated.**

### 3.2 Condorcet with correlated voters: more judges can be worse

The classical theorem needs independence and p > ½. Under exchangeable correlation the jury still improves with k but converges below 1, set by the common factor (Ladha 1992). Stronger and less quoted: **monotonicity can fail** — with dependent voters, adding a voter can reduce the probability of a correct majority (Berend & Sapir 2007). "More judges" is not merely useless; it is not guaranteed harmless.

Two-regime mixture: with probability r the item is a shared blind spot and everyone errs; otherwise independent errors at q. Then e = r + (1−r)q and majority accuracy → 1 − r. Here r = 10.3% and n_eff = 1.17 of a possible 1.28 — 91% of the maximum any number of same-distribution voters could supply.

**Wisdom-of-crowds conditions, checked.** Independence: violated (60% agreement conditional on both erring, Kim 2025). Diversity: *nominal* vendor diversity is not *evidential* diversity — the three models disagree on 22/290 records and are wrong together on 31. Decentralisation: satisfied by parallel voting, **destroyed by debate**. Aggregation: saturated. Three of four fail; the fourth has no headroom.

### 3.3 Aggregation theory, method by method

**Majority/plurality.** Optimal only under 0-1 loss, symmetric competence, independence. Here it is within 0.3 pts of the split oracle.

**Weighted vote and log-odds.** Log-odds is the Bayesian product of experts — correct if members are calibrated and conditionally independent. Neither holds; it changes one label in 290 [R]. Treat any claim that log-odds beats majority on a 4-class task with k ≤ 5 as a bug until shown otherwise.

**Dawid–Skene.** Right model class, wrong estimator here: 36 parameters, no gold, flat likelihood under correlation, unidentified up to permutation. Supervised, it works: the cross-fitted per-class confusion matrix is the **only** aggregator here that beats plurality, **+1.51 pts** (86.42 → 87.94), CI [0.00, +2.83], P(Δ>0) = 0.91 [R]. The mechanism is legible — it learns that one model confuses `billing` with `technical_support` and stops trusting it there — but 12 parameters on 145 rows is what a variance-limited fit looks like. **CROWDLAB** (Goh 2022) is the shippable version: a trained classifier's per-item prediction folded into the annotator model, with a per-label quality score; it beats DS and majority on crowdsourcing benchmarks [P, magnitudes unstated] *because the classifier adds an independent view*.

**Bayesian combination with a known prior.** Label-shift correction tested and failed (§3.1); hierarchical competence priors reduce to shrunk DS, and at k=3 the shrinkage collapses the posterior to plurality.

**IRT and cycle-based aggregation.** GLAD (Whitehill 2009) and MACE (Hovy 2013) assume many annotators with heterogeneous reliability, which we do not have; the parameterisation is the transplantable part (C5). Condorcet over the existing votes is identical to plurality at k=3; over the *label set* it becomes a new elicitation (C3). Surprisingly popular is −21.3% error vs majority in humans [P] but needs a knowledge asymmetry LLM panels lack.

### 3.4 Debate: where it works, where it is theatre

Du et al. (ICML 2024) report large gains (biography 74% vs 66%) against a *single greedy decode*, on tasks where a wrong answer can be locally repaired. Three replications do not survive better baselines:

- Smit et al. (ICML 2024): MAD "do[es] not reliably outperform" self-consistency and ensembling.
- Wang et al. (ACL 2024): gains attributed to multi-agent discussion are largely reproduced by multi-prompt/self-consistency baselines.
- He et al. (2026): in 25% of divergent cases the minority is right and majority voting suppresses it (*Minority Truth*); their meta-classifier reaches **81.2% flip precision** across six benchmarks. Here minority-right is **40.9% (9/22)** [R] — so majority on splits is barely better than a coin flip.

**Why debate cannot help a 4-way label.** Debate is information-*destroying* when agents share evidence: each posterior is a function of the same text, so the only stable fixed point is agreement on the pooled prior. Hence conformity (FREE-MAD documents correct agents flipping) and "over-deliberation drift" with more rounds (L-MAD 2026, which still reports up to +8% over single agents on legal entailment). Debate raises accuracy only when agents hold *different private evidence*, at which point you should aggregate the evidence, not the rhetoric. Debate with judges (Hu, NeurIPS 2025) reports gains over majority with the caveat that they "might not be significant". **Verdict:** theatre for categorical decisions with shared context — k× rounds, destroyed independence, ρ⁻ > 0.

### 3.5 Juries and panels

**PoLL** (Verga 2024): three small different-family models beat one large judge at 7× lower cost with less intra-model bias. The mechanism is *bias averaging* (position, verbosity, self-preference) and the metric is judge–human agreement, not label accuracy — the best evidence that panels help *evaluation*, and it does not transfer to annotation.

**Nine judges, two effective votes** (Kohli 2026) is the decisive negative: nine frontier models, seven families, three NLI sets, 100 human annotations per item. n_eff ≈ 2.18/2.35/2.48; the panel falls **8–22 points** short of independent voting; the best single judge matches or beats it in all conditions; and "neither adding more judges nor using smarter aggregation algorithms helps — established methods close at most 11% of this gap, **even with access to the correct answers**." That last clause is §3.1 restated: even an oracle-tuned aggregator cannot rescue a correlated panel.

**"LLMs as a Jury"** (Liu 2026) is the strongest recent positive: 3–4 cross-family models on AIME-24, 56.7% vs 36.7% for self-consistency, closing the entire gap to an oracle selector across seven benchmarks. Real, and not our problem: math answers are self-verifying, self-consistency at 36.7% is a weak baseline, and the jury needs only one member to be right — the coverage logic of §3.1, exploited rather than defeated. **Effect sizes overall:** +0 to +8 pts where answers are checkable and the baseline is weak, +0.2 to −6.5 pts on classification. No replicated case beats the best member by >2 pts on a 4-class text task with correlated members.

### 3.6 Verifiers and reward models: when can a verifier beat its generator?

**Theory.** A verifier wins when a short certificate exists that can be checked in less compute than finding one — arithmetic, code, proofs, retrieval-grounded claims. It is **false for a k-way semantic label**: checking "is this the right intent?" is the same decision as producing it, with the same evidence, so there is no complexity gap; and the verifier is usually the same family, so errors correlate by construction.

**Evidence.** GenRM (Zhang 2024) lifts best-of-N 5% → 45.3% algorithmic and 73% → 93.4% GSM8K, because the answer is checkable and the verifier is *trained*. PRMs (Lightman 2024) reach 78% on a MATH subset with 800k step labels — again verifiable, densely supervised. Neither has an analogue in free-text classification, and no paper surveyed reports one.

**The scaling law that kills naive verification.** Zhou et al. (2025, ICLR 2026): verification closes the gap only when the verifier is stronger than the generator, and **errors made by strong generators are harder to detect**. Our generators are at 87%; their residual errors are the hard tail. A same-family verifier catches the easy errors and misses exactly the ones that matter at this accuracy. Over-optimising against any such proxy also *lowers* the true score after an early peak (Gao 2023) — the mechanism behind "self-correction without external feedback degrades accuracy" (Huang 2024) and the survey conclusion that only external signals work (Kamoi 2024).

### 3.7 Self-consistency and test-time compute on hard classification

Self-consistency (Wang 2023) buys +17.9 GSM8K, +11.0 SVAMP, +12.2 AQuA, +6.4 StrategyQA, +3.9 ARC-c — because reasoning has many valid paths to one answer. A 4-way classification has four possible outputs; k samples yield at most four answers and the majority converges after ~5, so the variance-reduction mechanism has nothing to reduce, and at temperature 0 (what this repo runs) the effect is exactly zero [I]. Coverage and selection are also different problems: repeated sampling raises pass@k while majority saturates (Brown 2024), and more calls can *reduce* accuracy because easy and hard queries benefit differently (Chen 2024, derived and confirmed empirically).

### 3.8 Cross-judging tricks, assessed

**Restricted information.** LLMs are sycophantic and agree with a stated position even when wrong (Sharma 2024), so showing the candidate label anchors the verifier toward "yes". But blinding also removes the *contrast*: a blinded verifier re-derives from scratch and is a second generator. The useful middle is a **forced contrast** — show the text and *two* labels only, ask which fits and which span decides (C3 plus a span). [I for the gain; P for sycophancy]

**Counterfactual / devil's advocate.** Produces fluent objections, not *correct* ones, because the advocate holds no evidence the judge lacks. Self-correction without external feedback degrades (Huang 2024); only external signals work (Kamoi 2024). [P]

**Confidence: a good selector, a useless voter.** Verbalised confidence is overconfident (Xiong 2024), which is why the calibration layer exists — but the distinction the project has not made is decisive [R]: as a *weight*, confidence changes 1 label in 290 and 0 accuracy; as a *rank within the unanimous band*, mean confidence gives **AUC 0.743** (min-confidence 0.755) over 267 records with 29 errors. The risk–coverage curve is broadly monotone — 70% coverage → 96.3% (7/187); cross-fitted thresholds give **93.2% at 63.7% coverage**, 5–95% across splits [0.909, 0.947], and only 3% of half-splits can certify 95% at n = 150. So **confidence carries real ranking information inside the unanimous band (0.74, not 0.5) but cannot become a 95% certificate at this n.** The earlier "non-monotone" finding reflects the aggregated `log-odds` confidence, not the signal, and should be re-checked before gating is abandoned.

**Pairwise vs absolute.** Pairwise is more reliable than absolute scores (Zheng 2023; Liusie 2024), most so where the judge is weak (ICML 2026) — the basis of C3. **Agreement as confidence** is weak: ρ = 0.20–0.59, "not a standalone confidence score" (2026).

### 3.9 Patents, industry practice, and what practitioners report

The patent record confirms "consensus labeling + model-vs-consensus disagreement as a sampling signal" is **prior art**: **US9754216B2** creates a consensus label set from multiple labelers and trains on it [verified via Google Patents snippet]; **US20250021864A1** selects samples where an automatic annotation does not match an "expected unified label" [verified title/abstract]; and a Kanungo (Amazon) family covers "consensus label among the plurality of expert labels" compared against a model's label [U: numbers not retrieved; Justia 403].

Industry claims are about *cost*, not accuracy: AWS's Ground Truth launch is headlined "Build Highly Accurate Datasets and **Reduce Labeling Costs by up to 70%**", with multiple workers per item as the accuracy mechanism. No major vendor publishes precision with a confidence interval for auto-labels — consistent with R7, and it leaves the whitespace unchanged: **the certificate, not the ensemble.**

**Practitioner reports.** Forum evidence is anecdotal but consistent: the recurring r/MachineLearning complaint is an ensemble landing *below* its better member; "Your Six AI Models Are Really Two" popularised the Kim et al. arithmetic for engineers; and eval-tool practitioners converge on "use a judge at least as capable as your generator", matching the verification-dynamics result [U]. Nobody reports a *measured* panel win on classification, or any recoverability rate on the all-wrong set. The silence is itself evidence.

---

## 4. Evidence table

| Method | Venue / year | Effect (as stated) | Dataset | Replication |
|---|---|---|---|---|
| Majority, dependent | Ladha 1992; Berend & Sapir 2007 | limit < 1; **monotonicity can fail** | theory | [P] |
| 9-judge panel | Kohli 2026 | n_eff 2.18/2.35/2.48; best single ≥ panel; ≤11% gap closable | MNLI/SNLI/αNLI | single-author preprint [P] |
| Panel lift | Kohli 2026 | **+0.2 / −6.5 / −2.5 pts** | same | [P] |
| LLM jury, selection | Liu 2026 | 56.7% vs 36.7% SC; = oracle | AIME-24 + 6 | [P] |
| PoLL | Verga 2024 | beats one large judge, 7× cheaper | judge benchmarks | [P], judge agreement |
| MAD | Du 2024 | bio 74% vs 66% | arithmetic/bio/MMLU | contested [P] |
| Debate vs SC | Smit 2024 | no reliable gain; sometimes worse | MedQA+ | [P] replicated negative |
| Discussion ≈ SC | Wang ACL 2024 | gains attributable to SC | reasoning | [P] |
| Persuasive debate | Khan 2024 | **48% → 76%** | MMLU/QuALITY | [P], weak-judge setting |
| Minority Truth | He 2026 | 25% minority-right; 81.2% flip precision | 6 benchmarks | [P]; **40.9%** here [R] |
| Judge debate + stability | Hu 2025 | beats majority; "might not be significant" | judge tasks | [P] |
| GenRM | Zhang 2024 | **5% → 45.3%**, **73% → 93.4%** | algorithmic, GSM8K | [P] |
| Verification dynamics | Zhou 2026 | verifier wins only if stronger than generator | reasoning | [P] |
| RM overoptimisation | Gao 2023 | gold peaks then declines | synthetic RLHF | [P] |
| Compound scaling | Chen 2024 | accuracy can **decrease** with more calls | theory + exp. | [P] |
| Self-consistency | Wang 2023 | +17.9 GSM8K, +11.0 SVAMP | reasoning | [P]; zero at T=0 [I] |
| CROWDLAB | Goh 2022 | beats DS and MV | crowdsourcing | [P], magnitudes unstated |
| Surprisingly popular | Prelec 2017 | **−21.3% error** vs majority | human trivia | [P]; untested on LLMs |
| Silicon crowd | Schoenegger 2024 | ≈ human crowd | forecasting | [P] |
| Self-correction | Huang 2024 | **degrades** accuracy | reasoning | [P] |
| Pairwise > pointwise | Remeli 2026 | "substantially outperform" | LLM eval | [P], preprint |
| **Aggregator identity (here)** | this memo | 4 rules → same label on **289–290/290** | hard.db | **[R]** |
| **Supervised confusion matrix** | this memo | **+1.51 pts**, CI [0.00, +2.83] | hard.db | **[R]** |
| **Confidence risk–coverage** | this memo | AUC **0.743**; 93.2% @ 63.7% cov | hard.db | **[R]** |
| **Prior correction** | this memo | **−0.36 pts** cross-fitted | hard.db | **[R]** |

---

## 5. Negative results and hype to retire

1. **"Add a fourth/ninth model."** n_eff → 1/φ̄ = 1.28. Nine judges give two effective votes.
2. **"A better aggregation algorithm."** Four standard rules are one function here (289–290/290). The 2026 panel paper closes ≤11% of the gap *with the correct answers*. Nothing hides in the vote matrix.
3. **"Debate until consensus."** Destroys the independence it depends on, has ρ⁻ > 0, ties self-consistency at best. Majority is right on only 59% of splits here.
4. **"An LLM verifier checking the label."** Same family, same evidence, no certificate, and verification is harder for strong generators. Self-correction without feedback degrades.
5. **"Adversarial / devil's-advocate pass."** Fluent objections, not evidence. No published label-accuracy gain.
6. **"Confidence-weighted voting" and "ensembles provably beat their members."** One label in 290; and the proof holds only for proper scoring rules, not 0-1 accuracy.
7. **"A jury matches an oracle."** True on AIME-24, where answers are checkable and the baseline is weak. Not a classification result.
8. **"Calibrate the marginals to the class balance" and "more test-time compute."** The first loses 0.4 pts cross-fitted; the second has nothing to average on a 4-way label, and more calls can hurt (Chen 2024).
9. **"Our panel reached 95%."** Ask for coverage. 93.2% at 63.7% coverage is a coverage claim wearing an accuracy number.

---

## 6. Design for this codebase

### 6.1 Fix power before anything ships

At n=300 and 39 errors McNemar needs ~10 net discordant records — MDE 3.3 pts, larger than the 2.4-pt headroom. R1's "best single + 1.5 pts" gate is therefore **impossible to pass**, and a failure would be uninformative. Replacements: gate on `c` (a count) rather than accuracy; pre-register a one-sided test on the discordant subset with exact McNemar p; and grow gold to ≥800 records before any "beats best single" claim (MDE falls to ~2.0 pts, inside the headroom).

### 6.2 Module map

| Where | What | Cost |
|---|---|---|
| `types.py` | add `source_type`, `abstain`, `elicitation`, `rationales` | — |
| **new** `recoverability.py` | `recoverability(records, reask_fn) -> Report(c, rho_plus, rho_minus, delta, ci)` | 90–210 calls |
| **new** `dissent.py` | `rationale_divergence()`; `audit_unanimous() -> (auroc, prec_at_rejection)` | 801 calls |
| **new** `pairwise.py` | `pairwise_tournament() -> (winner, copeland, cycles)` | 3 calls/record |
| **new** `coverage.py` | `correct_matrix()`; `greedy_coverage(A, costs, budget)` | 0 |
| **new** `irt.py` | `fit_2pl_feature()`; `p_all_wrong(item)` | 0 |
| `aggregation.py` | add `supervised_cm()`, `oracle_ceiling()`, `label_identity_rate()` | 0 |
| `selection.py` | add `risk_coverage_curve()` + monotonicity test; `cross_fitted_certify()` | 0 |
| `service.py` | emit `c`, `rho_plus`, `rho_minus`, `ceiling`, `label_identity_rate` | — |

All CPU-first and provider-agnostic; C4/C5 make no calls.

### 6.3 Experiments, in order

**E2a (free, already run — formalise).** Recompute the five aggregators; log the label-identity rate. Report `c`, the unanimous-band risk–coverage curve, and 93.2% @ 63.7% cross-fitted. Deliverable: "our aggregator family is one function; confidence is a selector, not a voter."

**E2b (90–210 calls) — ERA.** Re-elicit the 31 all-wrong under three protocols; 40 unanimous-correct for ρ⁻. **Pass** ρ⁺ ≥ 0.30, lower CI > 0.15. **Kill** ρ⁺ ≤ 0.15, upper CI < 0.25 → publish the negative, stop protocol work. Run first: its answer decides whether E2c–E2e are worth running.

**E2c (801 calls) — conditioned dissent.** 267 × 3 rationales, one model. **Pass** conditional AUROC ≥ 0.70 and, at 15% rejection, ≥35% of all-wrong removed (CI excluding zero). **Kill** AUROC < 0.60.

**E2d (450 calls) — pairwise labels.** 150 records, single elimination, position-swapped repeat on 50. **Pass** pairwise ≥ pointwise + 1.5 pts on discordant records *and* cycle rate differs from a permutation null at p < 0.05. **Kill** cycle rate at the null, or position bias > 5 pts.

**E2e (free) — coverage selection.** Use R1's E1f correctness matrix; compare coverage-greedy against accuracy-greedy and diversity-greedy on held-out 1−c. **Pass** ≥90% of the oracle union at ≤60% of budget, and +2 pts of 1−c over accuracy-greedy.

**E2f (free) — feature-IRT.** Fit on 150 gold, evaluate the all-wrong indicator on 150. **Pass** AUROC ≥ 0.70, calibration slope in [0.7, 1.3]. **Kill** AUROC < 0.65.

### 6.4 What not to build

A debate loop, a nine-judge panel, an LLM verifier pass, temperature sampling for self-consistency, an adversarial stage, confidence-weighted voting, or marginal calibration. Each is measured to fail here or be a no-op, and the two most expensive carry ρ⁻ > 0 — they can make labels worse while appearing thorough.

### 6.5 Product consequence

If E2b returns ρ⁺ ≈ 0.2, the defensible product is not "higher accuracy" but **"c = 10.3%, ceiling = 89.7%, certified at 93% precision on 64% of the data, refusing the rest."** That is a stronger claim than any vendor's unqualified "95%", because it is the only one that survives arithmetic.

---

## 7. References

1. Ladha, K. K. (1992). The Condorcet Jury Theorem, Free Speech, and Correlated Votes. *AJPS* 36(3). https://www.jstor.org/stable/2111584
2. Berend, D., Sapir, L. (2007). Monotonicity in Condorcet's Jury Theorem with dependent voters. *Soc. Choice Welf.* 28(3):507–528. https://link.springer.com/article/10.1007/s00355-006-0179-y
3. Prelec, D., Seung, H. S., McCoy, J. (2017). A solution to the single-question crowd wisdom problem. *Nature* 541:532–535. https://www.nature.com/articles/nature21038 (21.3%: https://news.mit.edu/2017/algorithm-better-wisdom-crowds-0125)
4. Kim, E., Garg, A., Peng, K., Garg, N. (2025). Correlated Errors in Large Language Models. ICML 2025. https://arxiv.org/abs/2506.07962
5. Kohli, G. (2026). Nine Judges, Two Effective Votes. arXiv:2605.29800. https://arxiv.org/abs/2605.29800
6. Liu, N. (2026). LLMs as a Jury. arXiv:2607.10139. https://arxiv.org/abs/2607.10139
7. Du, Y. et al. (2024). Improving Factuality and Reasoning through Multiagent Debate. ICML 2024. https://arxiv.org/abs/2305.14325
8. Smit, A. P. et al. (2024). Should we be going MAD? ICML 2024. https://proceedings.mlr.press/v235/smit24a.html
9. Wang, Q. et al. (2024). Rethinking the Bounds of LLM Reasoning. ACL 2024. https://aclanthology.org/2024.acl-long.331/
10. Khan, A. et al. (2024). Debating with More Persuasive LLMs. ICML 2024. https://arxiv.org/abs/2402.06782
11. Khan, A. et al. (2024). On scalable oversight with weak LLMs judging strong LLMs. https://arxiv.org/abs/2407.04622
12. He, C. et al. (2026). When to Overturn Majority Voting in Multi-Agent LLM Debates. arXiv:2606.29270. https://arxiv.org/abs/2606.29270
13. L-MAD (2026). A Systematic Evaluation of Multi-Agent Debate. arXiv:2607.09099. https://arxiv.org/abs/2607.09099
14. Hu, T. et al. (2025). Multi-Agent Debate for LLM Judges with Adaptive Stability Detection. NeurIPS 2025. https://arxiv.org/abs/2510.12697
15. Cui, Y. et al. FREE-MAD. https://openreview.net/pdf?id=46jbtZZWen
16. Verga, P. et al. (2024). Replacing Judges with Juries. https://arxiv.org/abs/2404.18796
17. Zhang, L. et al. (2024). Generative Verifiers. https://arxiv.org/abs/2408.15240
18. Lightman, H. et al. (2024). Let's Verify Step by Step. ICLR 2024. https://arxiv.org/abs/2305.20050
19. Zhou, Y. et al. (2026). Understanding Verification Dynamics in LLMs. ICLR 2026. https://arxiv.org/abs/2509.17995
20. Gao, L., Schulman, J., Hilton, J. (2023). Scaling Laws for Reward Model Overoptimization. ICML 2023. https://proceedings.mlr.press/v202/gao23h.html
21. Brown, B. et al. (2024). Large Language Monkeys. https://arxiv.org/abs/2407.21787
22. Chen, L. et al. (2024). Are More LLM Calls All You Need? NeurIPS 2024. https://arxiv.org/abs/2403.02419
23. Li, J. et al. (2024). More Agents Is All You Need. TMLR. https://arxiv.org/abs/2402.05120
24. Wang, X. et al. (2023). Self-Consistency Improves CoT Reasoning. ICLR 2023. https://arxiv.org/abs/2203.11171
25. Schoenegger, P. et al. (2024). Wisdom of the silicon crowd. *Sci. Adv.* 10(45). https://www.science.org/doi/10.1126/sciadv.adp1528
26. Goh, H. W., Tkachenko, U., Mueller, J. (2022). CROWDLAB. https://arxiv.org/abs/2210.06812
27. Dawid, A. P., Skene, A. M. (1979). MLE of Observer Error-Rates Using EM. *JRSS C* 28(1):20–28.
28. Whitehill, J. et al. (2009). GLAD. NeurIPS 2009.
29. Hovy, D. et al. (2013). Learning Whom to Trust with MACE. NAACL 2013.
30. Sharma, M. et al. (2024). Towards Understanding Sycophancy. ICLR 2024. https://arxiv.org/abs/2310.13548
31. Huang, J. et al. (2024). LLMs Cannot Self-Correct Reasoning Yet. ICLR 2024. https://arxiv.org/abs/2310.01798
32. Kamoi, R. et al. (2024). When Can LLMs Actually Correct Their Own Mistakes? TACL. https://arxiv.org/abs/2406.01297
33. Xiong, M. et al. (2024). Can LLMs Express Their Uncertainty? ICLR 2024.
34. Zheng, L. et al. (2023). Judging LLM-as-a-Judge with MT-Bench. NeurIPS 2023 D&B.
35. Liusie, A., Manakul, P., Gales, M. (2024). A Product of Experts Framework for Pairwise Comparisons. EMNLP 2024. https://aclanthology.org/2024.emnlp-main.389/
36. Remeli, M. et al. (2026). Pairwise Comparisons Reveal Accuracy Rankings. ICML 2026. https://arxiv.org/abs/2606.09409
37. When LLMs Agree, Are They Right? (2026). arXiv:2607.08065. https://arxiv.org/abs/2607.08065
38. Turpin, M. et al. (2023). Language Models Don't Always Say What They Think. NeurIPS 2023.
39. Farquhar, S. et al. (2024). Detecting hallucinations using semantic entropy. *Nature* 630. https://www.nature.com/articles/s41586-024-07421-0
40. Kuhn, L., Gal, Y., Farquhar, S. (2023). Semantic Uncertainty. ICLR 2023.
41. Khuller, S., Moss, A., Naor, J. (1999). The Budgeted Maximum Coverage Problem. *IPL* 70(1):39–45.
42. Caruana, R. et al. (2004). Ensemble Selection from Libraries of Models. ICML 2004.
43. US9754216B2. https://patents.google.com/patent/US9754216B2/en
44. US20250021864A1. https://patents.google.com/patent/US20250021864A1/en
45. AWS (2018). SageMaker Ground Truth. https://aws.amazon.com/blogs/aws/amazon-sagemaker-ground-truth-build-highly-accurate-datasets-and-reduce-labeling-costs-by-up-to-70/
46. r/MachineLearning, "Is it possible for two ensembled models to ALWAYS…" https://www.reddit.com/r/MachineLearning/comments/ip6vtq/ [U]
47. "Your Six AI Models Are Really Two", Towards Data Science. https://towardsdatascience.com/your-six-ai-models-are-really-two-the-math-of-correlated-mistakes/ [U]
48. DeepEval vs Ragas (2026), practitioner heuristic on judge capability. https://qaskills.sh/blog/deepeval-vs-ragas-2026/ [U]

---

### Appendix — reproduction, and what would falsify this

All [R] numbers from `repo/data/hard.db` (`ensemble_votes`, 900 rows; `annotations`, 300 gold, exactly 75/75/75/75). 290 records have three non-null votes; 10 have one failed call and are excluded from ranking analyses.

```
plurality 251/290 = .8655 | confidence-sum .8655 (1 label differs) | log-odds .8655 (0 differ)
drop-lowest .8655 (6 differ) | most-confident vote .8517
supervised per-class CM .8794 (Δ +.0151, CI [0.000, +0.028], P(Δ>0)=.91) | IPF prior .8619 (Δ −.0036)
unanimous band 267 records, 29 wrong, 89.14% | AUC mean-conf .743 (min-conf .755)
risk–coverage 70% → 96.3% (7/187); 80% → 93.0% | cross-fitted 93.2% @ 63.7% coverage
splits 22: majority right 13, minority right 9 (40.9%)
```

**Independence check.** The 300 texts share 22 parenthetical qualifiers (5–21 records each), so the effective unit of analysis needed checking. Every qualifier group contains multiple gold labels, and the between-group accuracy SD (0.092) equals the binomial expectation at m ≈ 13 — no measurable design effect, so n_eff ≈ n and the MDE arithmetic stands.

**Falsifiers.** (i) A vote-only method reducing `c` on the unanimous band by ≥3 points with a paired CI excluding zero. (ii) ρ⁺ ≥ 0.40 on the all-wrong set under re-elicitation. (iii) A replicated panel beating its best member by >2 points on a 4-class text task at φ > 0.6. None exists as of 2026-11-04.
