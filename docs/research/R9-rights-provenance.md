# R9 — Data rights, licensing and provenance automation

**Subject:** Curlset AI Dataset Engineering Platform, repo `C:\Users\knava\Downloads\curlset\repo` (audited commit `37d5d05`). **Date:** 2026-11-04. **Status:** engineering research.

> **This is engineering guidance, not legal advice.** Nothing here decides whether a use is lawful. It describes how to record rights evidence, encode obligations as conservative machine checks, and force ambiguous questions to a named human. The product must never present these checks as legal clearance.

**Verification note.** Standards and tool versions were checked against primary sources on 2026-11-04; package versions were read from indexes but not executed. ImageNet terms are from a secondary reproduction *(unverified at primary source)*. SPDX 3.1 was at Release Candidate stage in January 2026; 3.0.1 is the latest text I could verify. No case law or jurisdictional conclusion is offered.

---

## 1. Executive summary

- **Rights are currently decorative, and in several places false.** Ingestion writes `license_status=UNKNOWN` (`packages/dataset_io/ingestion_service.py:354`); the publish gate checks only quality (`packages/dataset_versioning/service.py:134`); synthesis writes `APPROVED_FOR_INTENDED_USE` (`packages/dataset_synthesis/service.py:254`); COCO exports a fabricated licence named "Platform Verified / Review-Required" (`packages/dataset_export/coco_exporter.py:140-146`); and the card derives synthetic disclosure from the selected annotation's origin (`packages/dataset_versioning/doc_generator.py:46,112`), so one human edit can hide synthetic data. Each violates AGENTS.md §6 ("never claim ... legally cleared") and §8 ("if permissions are unclear, mark ... unknown or review-required; do not label it approved").
- **Licence detection is evidence collection, not permission.** ScanCode, licensee and the SPDX list can tell you with high confidence that a piece of *text* is licence X. They cannot tell you that X applies to the asset, that the uploader had authority to license it, or that your intended use is permitted. Build an append-only evidence ledger with explicit "unknown", not a classifier that outputs "approved".
- **Obligations should be a small, versioned rule table keyed by SPDX identifier.** Attribution, notice, share-alike, non-commercial, research-only, no-derivatives, use restrictions and source disclosure can be checked against a declared intended use. Ownership, commerciality, fair use, derivative status and enforceability cannot.
- **Provenance should be one internal append-only hash chain, with standards as export projections.** W3C PROV, RO-Crate 1.3, Croissant 1.1, SPDX 3.0.1 and C2PA 2.5 are useful interchange formats, but none is a system of record for rights decisions.
- **The honest position is "no blocking obligation found for the declared use", never "cleared".** Unknown must block or route to review, `force` must not override rights, and synthetic/privacy disclosures must be immutable properties of records, not derived from the latest annotation.

---

## 2. Licence detection and obligations model

### 2.1 What detection can establish, and with what confidence

| Signal | Method | Match confidence | Establishes / does not establish |
|---|---|---|---|
| Full canonical text in `LICENSE`/`COPYING`/card | ScanCode exact match or SHA-256 against SPDX `license-list-data` | High | The text is present and is X / that X applies to the data or that the uploader may license it |
| Modified/partial text | ScanCode `score`/`match_coverage`, licensee similarity | Medium | Likely X, possibly modified / whether modifications are permitted or which version applies |
| SPDX id in package metadata, Croissant `license`, DCAT | `license-expression` parser | High syntactic | Someone declared X / that the declaration is accurate or authorised |
| Dataset-card prose, URL/domain/catalogue | Regex/inference plus human confirmation | Low/medium | A claim or hint exists / its scope, accuracy or applicability |
| Terms-of-service page | Fetch, hash, human extraction | Low until reviewed | A timestamped snapshot exists / whether the clause applies or is enforceable |
| C2PA / XMP `DigitalSourceType` / `cawg.training-mining` | Manifest parse and signature verification | High for the assertion | The asset carries a signed claim / that the claim is true or the signer authoritative |

**Tooling.** ScanCode Toolkit 32.5.0 is the strongest open-source text matcher: per-match `score`, `match_coverage`, `matched_rule`, `license_expression`, plus a 0-100 licence-clarity score; it does not read a site's terms or determine scope. licensee 10.0.0 uses exact, copyright, regex and dice-similarity matchers and reports percent-changed; GitHub's API returns only an SPDX id, without confidence. The SPDX License List 3.29.0 (2026-09-16) supplies canonical ids and expressions; `license-expression` parses and normalises `AND`/`OR`/`WITH`/`+`. ChooseALicense supplies curated UI metadata; ClearlyDefined and the OSS Review Toolkit curate packages, not datasets.

**The ceiling.** No detector establishes ownership, authority or legal applicability. A 100% text match means the text is MIT, not that the dataset is MIT-licensed. Store confidence as *match confidence*, never as "legal confidence"; human review is a separate state, not a higher score.

### 2.2 Representing "unknown" honestly

Separate `licence_expression` (nullable; SPDX or `LicenseRef-...`) from `rights_state`: `unknown`, `asserted` (someone declared X, with evidence), `detected` (text matched), `verified_text` (canonical text hash matched), `human_reviewed` (reviewer, scope, intended use, rationale, date), `rejected`, `expired`.

- **`unknown` is not public domain.** Map "no licence found" to SPDX `NOASSERTION`, not `NONE`. `NONE` is for cases where no licence applies; using it for "we could not find one" is a false claim.
- **Scope matters.** Rights attach to assets, records, datasets and versions. A dataset-level CC BY notice cannot override a per-image "all rights reserved". The *effective expression* is the conjunction of all applicable assertions.
- **Do not store `"unknown"` in the SPDX field; leave it `NULL`.** Unknown dominates: if any applicable record is unknown, the dataset is unknown. Evidence (a fetched ToS page) is not a decision (a human review); keep both, with separate identities and timestamps.

### 2.3 Dataset licences and ML-specific traps

| Licence | Core obligation | ML/dataset trap | Gate default |
|---|---|---|---|
| CC0-1.0 | Public-domain dedication; no attribution | Jurisdiction-specific; patents/trademarks not waived; no warranty | Pass with evidence; never call it "public domain worldwide" |
| CC BY 4.0 | Attribution, notice, indicate changes, no additional restrictions | Attribution must survive derivative datasets and model cards; per-image attribution may be impractical | Require attribution string and notice |
| CC BY-NC 4.0 | NonCommercial only | "Research" is not the same as non-commercial; internal commercial research, a later sold model or a commercial pilot can fail | `commercial=true` blocks; ambiguous cases review |
| CC BY-SA 4.0 / BY-ND 4.0 | Attribution + share-alike on adaptations / no derivatives | Whether a dataset, model or blend is an "adaptation" is contested; cleaning, augmentation, relabelling or merging may be a derivative | Outbound choice / any modification blocks or reviews |
| CDLA-Permissive-2.0 / Sharing-1.0 | Permissive notice / share-alike for data | Data-specific, not OSI software licences; patent treatment differs | Notice / outbound choice |
| ODC-BY 1.0 / ODbL 1.0 | Attribution / database share-alike | Database right is separate from copyright; ODbL scope is complex | Attribution / review |
| RAIL / OpenRAIL | Permissive grant plus behavioural restrictions | "Open" but not OSI open source; restrictions can conflict with an outbound open licence | Map restrictions to intended use; review |
| ImageNet terms | Non-commercial research/education | Commercial training or redistribution is outside the stated terms; images are third-party | `commercial=true` blocks |
| COCO terms | Annotations CC BY 4.0; images retain Flickr licences | A dataset-level licence does not cover the images; COCO does not own image copyright | Per-asset evidence; unknown images review |
| Scraped web content | Copyright + contract/ToS + database right + TDM opt-out | Public accessibility is not permission; robots.txt is not a licence; paywall/CAPTCHA bypass is forbidden | Unknown unless evidence; block on opt-out |

**Cross-cutting traps.** Media, annotations, metadata and the compilation may each carry different terms; versions drift (`GPL-2.0` vs `GPL-2.0-only`; CC 3.0 vs 4.0). A model licence does not license its training data; a dataset licence does not license model weights. OpenRAIL's "open" means openly distributed, not free of use restrictions; the OSI definition forbids discrimination against fields of endeavour.

### 2.4 Obligations as machine-checkable rules

Each rule carries an obligation code, parameter schema, automated check, default severity and curation citation.

| Obligation | Parameters | Automated check | Default |
|---|---|---|---|
| `ATTRIBUTION` | credit text, format, placement | Non-empty; present in export README/manifest | Block |
| `NOTICE` | licence name, URL, text | Included in export bundle | Block |
| `SHARE_ALIKE` | scope (adaptation/database/produced work); candidate outbound set | Outbound licence chosen from candidates | Review |
| `NO_COMMERCIAL` | none | `intended_use.commercial == false` | Block |
| `RESEARCH_ONLY` | allowed purposes | Purpose in allowlist | Block |
| `USE_RESTRICTION` | prohibited-use list | Structured match against declared purpose | Review |
| `SOURCE_DISCLOSURE` | required source fields | Export includes source list/URLs | Block |
| `HUMAN_REVIEW` | reviewer role, intended use | Review record exists for this use | Review |

Rules are data: `obligation_rules(id, spdx_id, licence_version, obligation_code, params_schema, severity, auto_check, human_only, source_url, curation_note, version, effective_from)`. Each gate evaluation pins `rules_version` and `engine_version`, so later changes cannot retroactively alter a published decision.

**Evaluation lattice.** `PASS` only when every rule passes, evidence is at least `asserted`, and a human review covers the declared use. `REVIEW_REQUIRED` blocks until a named reviewer decides; `BLOCK` is a definite incompatibility (NC vs commercial); `UNKNOWN` blocks just as firmly. Block on any unknown or definite violation, review on any human-only rule or missing evidence, otherwise pass. `force` must not collapse these states.

**Mixed and compatible licences.** The effective expression is the `AND` of all record expressions. Conservatively, any NC blocks commercial use, any SA forces a share-alike-compatible outbound licence, and any ND blocks modification; this over-blocks blends, which is the correct failure direction. `OR` requires an explicit user choice recorded against the version. No authoritative matrix covers CC, CDLA, ODC, ODbL and RAIL together: curate a "candidate outbound licences" table per inbound licence, cite the source, and mark rows `reviewed` or `draft`. `license-expression` can simplify expressions, not decide compatibility.

**Safe to automate:** SPDX syntax and unknown-ID checks; attribution/notice presence; NC vs commercial; research-only vs purpose; SA outbound choice; ND vs modification; evidence completeness; licence-text drift; unknown propagation.

**Must remain human:** ownership and authority; commerciality; derivative status; fair use/fair dealing, quotation, TDM and research exceptions; validity and enforceability; conflicting terms; database rights; jurisdiction; AI Act risk classification; final approval.

---

## 3. Provenance standards comparison

| Standard (version, date) | What it models | Serialisation / code | Fit for Curlset | Main gap |
|---|---|---|---|---|
| **W3C PROV-O** (Rec., 2013) | Entities, activities, agents, derivation, attribution, revision | RDF; PROV-JSON/XML; `prov`, `rdflib` | Good conceptual model and optional export | Verbose; no dataset packaging or licence semantics |
| **RO-Crate 1.3** (Rec., 2026-06-22; 1.2 stable 2025-06-04) | Research object: files, authors, licences, provenance, profiles | JSON-LD (`ro-crate-metadata.json`), schema.org; Python `rocrate` | Strong packaging for a version/export | Not ML-specific; no obligation engine |
| **Croissant 1.1** (MLCommons, 2026-01-29) | ML fields, splits, record sets, resources; provenance via PROV-O; governance via DUO/ODRL | JSON-LD; `mlcroissant` validator/loader | Best ML-facing metadata export | New provenance vocabulary; tooling young; not a rights registry |
| **SPDX 3.0.1** (2024; 3.1 RC 2026) | BOM, licensing, AI profile (`AIPackage`), Dataset profile (`DatasetPackage`, `intendedUse`, `knownBias`, `sensitivePersonalInformation`) | JSON-LD, SHACL, OWL; Python tooling thinner than 2.3 | Enterprise/BOM export and AI-system inventory | Heavy; 3.1 not final; no obligation evaluation |
| **Datasheets for Datasets / Data Cards** (2021 / 2022) | Human questionnaires/documentation: motivation, composition, collection, preprocessing, uses, distribution, maintenance | Markdown/PDF; no schema | Excellent UI wizard and card template | Not machine-checkable |
| **C2PA 2.5** (Oct 2026) + **CAWG training-mining 1.1** (2025-05-16) | Asset-level signed manifests: actions, ingredients, `cawg.training-mining` (`allowed`/`notAllowed`/`constrained`) | CBOR/JUMBF; `c2pa-python`, `c2patool` | Best synthetic-media marking and source signalling | Asset-level only; can be stripped; not a dataset format |
| **ODRL 2.2** (Rec., 2018) + **DUO** | Policies: permissions, prohibitions, duties; data-use terms | JSON-LD/RDF | Optional export of obligations; DUO for research-use terms | No standard mapping from CC/ODbL/RAIL to ODRL actions |

**Recommendation.** Keep one internal canonical model: SQL rows plus a per-dataset hash-chained event log. Export views: Croissant 1.1 for ML loaders, RO-Crate 1.3 for a self-describing package, SPDX 3.0.1 for BOM/AI-system interchange, C2PA for individual assets, and a Datasheets/Data Cards Markdown document for humans. No external standard is the source of truth.

---

## 4. Synthetic disclosure and privacy

### 4.1 Synthetic disclosure

**Why the current derivation is wrong.** The card counts `r.annotation.origin` from the selected annotation (`doc_generator.py:46`) and prints synthetic counts from that map (`:112`); the quality rule uses the same counter (`dataset_quality/engine.py:434`). `update_annotation_payload` rewrites origin to `human`, so one edit removes the disclosure.

**Correct model.** A record has an immutable creation origin (`human_collected`, `synthetic_generated`, `imported`, `derived`, `unknown`) and optional lineage (`generator`, `model`, `prompt_hash`, `seed`, `run_id`). An annotation has a per-revision origin; revisions are append-only and origin is never rewritten. A human edit produces a `human` annotation revision on a `synthetic_generated` record. Disclosure counts records by record origin and separately reports annotation origins.

**Marking generated content.** At generation, embed a C2PA manifest with `c2pa.actions` (`c2pa.created`), generator/model, prompt hash, seed and timestamp, signed with a per-install key; write a sidecar JSON with the same fields and asset SHA-256. At ingest, read C2PA and XMP `DigitalSourceType`; absence means *unknown*, not *human*. For text, use dataset flags, per-row metadata and export metadata. Preserve the manifest/sidecar through export and verify the asset hash before zipping. C2PA is evidence, not proof: its FAQ says manifests can be removed by stripping metadata, screenshots or re-encoding.

**What regulators expect (as of 2026-11-04).** EU AI Act Article 50(2) requires providers of systems generating synthetic audio, image, video or text to mark outputs in machine-readable form and make them detectable as artificial; Article 50(4) requires deepfake disclosure. Both apply from 2 August 2026; the Commission's Code of Practice on Transparency of AI-generated Content (October 2026) supports implementation. For GPAI providers, Article 53(1)(d) requires a public training-content summary using the AI Office template. The verified template — C(2025) 8311 final, 5 December 2025 — covers provider/model identity, modalities and size ranges, content types, collection dates, public/private/licensed/scraped/user/synthetic sources (including crawler behaviour and top-domain lists) and TDM opt-out respect. The summary obligation applied from 2 August 2025; enforcement started 2 August 2026; models placed before 2 August 2025 have until 2 August 2027. Article 53(2)'s open-source exemption covers only (a) and (b), not (c) or (d). Curlset is not a GPAI provider: it can generate the inputs, not claim compliance.

### 4.2 Privacy

**Detection.** Presidio Analyzer 2.2.366 is a reasonable local-first default for text: regex plus NER, confidence scores; it warns that detection cannot guarantee completeness. Pair it with deterministic detectors (email, phone, IBAN, national IDs, addresses, URL tokens), EXIF GPS, document metadata, OCR and transcription. Presidio Image Redactor covers OCR text only; faces need separate tooling.

**What counts as personal data.** Faces, voices, plates, health data, special-category data, children, location traces, handles, IPs and pseudonymous identifiers. Synthetic data derived from personal data can still be personal data if individuals remain identifiable; EDPB Opinion 28/2024 rejects automatic anonymity and requires a case-by-case test. Do not label synthetic data "non-personal" by default.

**GDPR-relevant flows.** Record lawful basis, purpose, data-subject categories, recipients and retention (Arts. 5, 6, 9, 13/14, 30). Support access, rectification, erasure, restriction, portability and objection. A deletion request must find every record, asset, annotation and version containing the data, then: create an `erasure_request` and `record_tombstone`; remove it from the working set; freeze a *new* version; mark prior versions `revoked` with `superseded_by`; notify recipients recorded in `export_artifacts`; retain evidence. Article 19 requires recipient notification, subject to exceptions.

**The hard problem.** A published immutable version cannot be silently rewritten without breaking its hash. Options, in order of honesty: (1) append-only revocation plus a new version and revocation manifest; (2) crypto-shredding — per-record keys destroyed on erasure, only if every copy is encrypted and key management is sound; (3) content-addressed blob deletion when no live version references the hash; (4) machine unlearning, which is not a dataset-versioning function and must not be claimed. Exported ZIPs, backups and third-party copies may survive all four. The defensible statement is: "removed from current and future versions; prior versions revoked; downstream notification recorded".

**Privacy gate.** Unreviewed PII findings block publication; special-category findings require review plus a DPIA flag; minors or sensitive locations block until a named reviewer decides. Redaction is a new derived asset with lineage, never an in-place mutation.

---

## 5. Concrete subsystem design for this codebase

### 5.1 Module layout and schema

Add `packages/dataset_rights/` (`models`, `licences`, `detection`, `obligations`, `gate`, `evidence`, `provenance`, `erasure`) and `services/api/routes/rights.py`. Keep `source_records` as a compatibility projection; stop treating its `license_status` as authoritative.

Core tables (append-only at the service layer; add database triggers or `REVOKE UPDATE, DELETE` where supported):

```python
rights_assertions(id, dataset_id, subject_type, subject_id, licence_expression,
  rights_state, assertion_source, confidence, detector, detector_version,
  evidence_id, declared_by, supersedes_id, created_at)

licence_evidence(id, assertion_id, evidence_type, url, retrieved_at,
  http_status, content_sha256, excerpt, storage_key, media_type,
  signer, tsa_token, created_at)

rights_reviews(id, subject_type, subject_id, intended_use_id, decision,
  rationale, reviewer_id, reviewer_role, evidence_ids, scope,
  created_at, expires_at, supersedes_id)

intended_use_declarations(id, dataset_id, version_id, commercial, purposes,
  deployment_context, redistribute, derivative_licence, jurisdiction,
  trains_model, generates_content, contains_personal_data,
  contains_synthetic, created_by, created_at, supersedes_id)

obligation_rules(id, spdx_id, licence_version, obligation_code, params_schema,
  severity, auto_check, human_only, source_url, curation_note, version,
  effective_from)

gate_evaluations(id, version_id, intended_use_id, result, findings,
  engine_version, rules_version, input_hash, created_at)

provenance_events(id, dataset_id, subject_type, subject_id, event_type,
  payload, actor_id, actor_type, created_at, prev_hash, event_hash)
```

Add `record_origin` and `synthetic_lineage` to `dataset_records`; add `pii_findings`, `erasure_requests`, `record_tombstones`, and `provenance_anchors` (daily Merkle root). Evidence bytes live in `data/evidence/{sha256}`; the database stores the hash and metadata. The chain is `event_hash = sha256(prev_hash || canonical_json(event))`, verified on read and at export.

### 5.2 Effective rights and gate logic

```python
def effective_expression(record) -> str:
    exprs = applicable_expressions(record)      # asset, record, dataset, version
    if any(e is None for e in exprs):
        return "NOASSERTION"                    # unknown dominates
    return " AND ".join(sorted(set(exprs)))

def evaluate(inp: GateInput) -> GateResult:
    if not inp.intended_use:                 return BLOCK("intended_use_missing")
    if inp.has_unknown:                      return BLOCK("rights_unknown")
    for rule in rules_for(inp.effective_expression):
        if rule.code == "NO_COMMERCIAL" and inp.intended_use.commercial:
            return BLOCK("noncommercial_vs_commercial_intent")
        if rule.code == "RESEARCH_ONLY" and not inp.intended_use.is_research:
            return BLOCK("research_only")
        if rule.code == "NO_DERIVATIVES" and inp.modifies_data:
            return BLOCK("no_derivatives")
        if rule.code == "ATTRIBUTION" and not inp.attribution_text:
            return BLOCK("attribution_missing")
        if rule.code == "SHARE_ALIKE" and inp.outbound not in rule.candidates:
            return REVIEW("share_alike_outbound_choice")
        if rule.human_only or not evidence_sufficient(rule, inp.evidence):
            return REVIEW("human_review_required")
    if inp.pii_findings_unreviewed:          return REVIEW("pii_review_required")
    if inp.synthetic_records and not inp.disclosure_present:
        return BLOCK("synthetic_disclosure_missing")
    return PASS   # no blocking obligation for the declared use
```

Integration points:

- `VersioningService.create_version`: evaluate before freezing; persist the `GateResult` and `input_hash` in the manifest. Remove rights from the `force` path; `force` may remain for quality-only overrides with a role, reason and audit event, never to turn `UNKNOWN` into `PASS`.
- `ExportService`: include `rights.json` (expression, obligations, evidence hashes, gate result, intended use), `provenance.jsonl` (verified chain) and the card disclosure. Fail if the chain does not verify.
- `coco_exporter.py`: derive `licenses` from the effective expression; if unknown, emit `[]` and rely on `rights.json`. Never emit "Platform Verified" or an invented name.
- `doc_generator.py` / `QualityEngine`: print "Rights status: UNKNOWN / REVIEW REQUIRED / NO BLOCKING OBLIGATION FOR DECLARED USE", the expression, obligations and evidence; print the actual manifest SHA-256 (mislabeled as `version_id` at `:138`). Replace the annotation-origin synthetic rule with record-origin counts plus lineage completeness.
- `SourceDiscoveryService.record_rights_review`: require an `intended_use_id` and evidence hash; append an immutable `rights_reviews` row. The hardcoded `APPROVED_FOR_INTENDED_USE` catalogue entry (`catalog_adapter.py:34-36`) must become a seeded review with a named reviewer, date and evidence URL, or be downgraded to `asserted`.
- `synthesis/service.py`: delete the auto-approval at `:254`; synthetic records are `asserted` at most, with lineage, and require review.

### 5.3 What the UI must ask

1. "Where did this data come from?" — upload, URL, public dataset, purchased/licensed, synthetic, derived.
2. "What licence was stated at the source?" — SPDX search, "No licence stated", "I don't know" (default), "Written permission attached".
3. "Attach the evidence you relied on." — URL plus retrieval time, licence text/file, contract or permission; show hash and timestamp.
4. "What will you do with this dataset?" — commercial or non-commercial; research; train a model; redistribute; publish derivatives; jurisdiction.
5. "Will you release a derivative dataset, and under what licence?" — required for share-alike.
6. "Does it contain personal data?" — show PII scan results and require human confirmation, including special-category and minors.
7. "Does it contain synthetic content? Which generator and model?" — pre-fill from C2PA/lineage; require disclosure if unknown.
8. "What attribution string must appear?" — required for BY/ODC-BY/CDLA; preview it in the exported card.
9. "Who reviewed this, and on what basis?" — named reviewer, role, rationale, scope, expiry.
10. "Do you understand that this records your declaration and is not legal clearance?" — an acknowledgement, not a waiver.

The UI must **refuse** to show: "Verified", "Cleared", "Copyright-free", "Safe for commercial use", "Training-ready", "Platform Verified", "GDPR compliant", "AI Act compliant", "PII-free", "Anonymous", or "Erased everywhere". It may show: "No blocking obligation found for the declared use", "Rights review required", "Blocked by licence terms", "Unknown — no evidence recorded".

### 5.4 Migration order and tests

**P0 (days):** remove synthesis auto-approval and the fabricated COCO licence; make the gate read rights and block on unknown; add record-origin immutability and fix synthetic disclosure; add `intended_use_declarations` and append-only provenance events. **P1 (weeks):** evidence ledger, ScanCode adapter, obligation rules, rights-review UI, `rights.json` in exports, C2PA read/write. **P2:** Presidio, erasure/revocation flow, Croissant/RO-Crate/SPDX export profiles.

Tests: SPDX parsing and invalid-ID rejection; unknown dominance; NC vs commercial; research-only; SA outbound choice; ND vs modification; attribution/notice presence; evidence completeness; licence-text drift; synthetic disclosure survives a human edit; COCO never fabricates a licence; `force` cannot pass rights; hash-chain verification; erasure revokes the old version; export re-parse round-trip.

---

## 6. What must NOT be automated

1. **Legal conclusions.** Ownership, authority, fair use/fair dealing, TDM/research exceptions, commerciality, derivative status, validity, database rights, ToS interpretation and jurisdiction. Record them; do not decide them.
2. **Approval.** No path may write `APPROVED_FOR_INTENDED_USE` without a named reviewer, a declared intended use and evidence, including synthesis, catalogues, imports and bulk actions.
3. **Absence and accessibility are not permission.** A missing licence file, public URL, expired copyright notice or US-federal source does not establish public domain worldwide, and HTTP 200 is not a licence (AGENTS.md §8).
4. **C2PA claims.** Never manifest a human creator, a camera capture or authority the system lacks; never treat a missing manifest as human origin.
5. **Anonymisation and erasure claims.** PII detection is probabilistic; redaction is not proof of anonymity. Do not claim deletion from distributed copies, backups or third parties; record revocation and notification, not omniscience.
6. **Compliance claims.** Do not claim GDPR, AI Act, licence or "training-safe" compliance from automated checks; AGENTS.md §6 forbids this.
7. **Crawler circumvention and synthetic assumptions.** No CAPTCHA solving, paywall/authentication bypass, rate-limit evasion or robots.txt override. Synthetic data can reproduce identifiable people; treat it as personal data until a human analysis says otherwise.

---

## 7. References

**Licensing and detection**

- SPDX License List 3.29.0 (2026-09-16): https://spdx.org/licenses
- SPDX 3.0.1: https://spdx.github.io/spdx-spec/v3.0.1/ ; AI profile: https://spdx.github.io/spdx-spec/v3.0.1/model/AI/AI/ ; Dataset profile: https://spdx.github.io/spdx-spec/v3.0.1/model/Dataset/Dataset/ ; 3.1 RC: https://spdx.dev/spdx-3-1-ontology-and-schema-available-for-review/
- ScanCode Toolkit 32.5.0: https://github.com/aboutcode-org/scancode-toolkit ; https://pypi.org/project/scancode-toolkit/
- licensee: https://github.com/licensee/licensee ; Choose a License: https://github.com/github/choosealicense.com ; license-expression: https://github.com/aboutcode-org/license-expression
- ClearlyDefined: https://clearlydefined.io/

**Dataset licences**

- Creative Commons: https://creativecommons.org/licenses/ ; CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/legalcode.en ; CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/legalcode.en ; CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
- CDLA: https://cdla.dev/ ; CDLA-Permissive-2.0: https://cdla.dev/permissive-2-0/ ; ODC: https://opendatacommons.org/licenses/odbl/1-0/ and https://opendatacommons.org/licenses/by/1-0/
- OpenRAIL: https://huggingface.co/blog/open_rail ; OSI definition: https://opensource.org/osd
- ImageNet terms (secondary; verify at source): https://huggingface.co/datasets/ILSVRC/imagenet-1k ; COCO terms: https://cocodataset.org/#termsofuse

**Provenance and documentation**

- W3C PROV-O: https://www.w3.org/TR/prov-o/ ; RO-Crate 1.3: https://www.researchobject.org/ro-crate/specification/1.3/
- Croissant 1.1: https://docs.mlcommons.org/croissant/docs/croissant-spec-1.1.html ; mlcroissant: https://pypi.org/project/mlcroissant/
- Datasheets for Datasets: https://arxiv.org/abs/1803.09010 ; Data Cards: https://arxiv.org/abs/2204.01075
- C2PA 2.5: https://spec.c2pa.org/specifications/specifications/2.5/specs/C2PA_Specification.html ; FAQ: https://c2pa.wiki/getting-started/faq/ ; c2pa-python: https://opensource.contentauthenticity.org/docs/c2pa-python/ ; CAWG 1.1: https://cawg.io/training-and-data-mining/1.1/
- ODRL 2.2: https://www.w3.org/TR/odrl-model/ ; DUO: https://www.ga4gh.org/product/data-use-ontology-duo/

**Law and regulation**

- Regulation (EU) 2024/1689: https://eur-lex.europa.eu/eli/reg/2024/1689/oj ; Art. 53: https://artificialintelligenceact.eu/article/53/ ; Art. 50: https://artificialintelligenceact.eu/article/50/
- Explanatory Notice and Template, C(2025) 8311 final, 5 Dec 2025: https://digital-strategy.ec.europa.eu/en/library/explanatory-notice-and-template-public-summary-training-content-general-purpose-ai-models ; PDF: https://ec.europa.eu/newsroom/dae/redirection/document/118480
- Code of Practice on Transparency of AI-generated Content: https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content
- Directive (EU) 2019/790, Art. 4: https://eur-lex.europa.eu/eli/dir/2019/790/oj ; GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- EDPB Opinion 28/2024: https://www.edpb.europa.eu/system/files/2024-12/edpb_opinion_202428_ai-models_en.pdf ; EDPB rights report: https://www.edpb.europa.eu/system/files/2025-01/d2-ai-effective-implementation-of-data-subjects-rights_en.pdf

**Web compliance and privacy tooling**

- RFC 9309: https://www.rfc-editor.org/rfc/rfc9309
- TDMRep Final CG Report (2024-05-10): https://www.w3.org/community/reports/tdmrep/CG-FINAL-tdmrep-20240510/ ; IETF AIPREF: https://datatracker.ietf.org/wg/aipref/about/ ; vocabulary draft: https://www.ietf.org/archive/id/draft-ietf-aipref-vocab-08.html
- Data Provenance Initiative, "Consent in Crisis": https://www.dataprovenance.org/consent-in-crisis-paper
- Microsoft Presidio: https://microsoft.github.io/presidio/ ; presidio-analyzer 2.2.366: https://pypi.org/project/presidio-analyzer/
