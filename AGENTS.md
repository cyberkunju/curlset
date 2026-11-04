# AGENTS.md — Mandatory Development Contract

This file is the highest-priority repository-specific instruction for AI coding agents. Read it before inspecting or modifying application code. Follow it together with docs/REQUIREMENTS.md, docs/ARCHITECTURE.md, docs/STATUS.md, docs/ROADMAP.md, docs/EXAMPLES.md and docs/DECISIONS.md (index: docs/README.md).

## 1. Mission and autonomy

Build the AI Dataset Engineering Platform as a working, testable product, not merely a mockup or a collection of disconnected demos. The product helps individual developers and students turn raw multimodal data into reviewed, validated, documented, versioned and portable training datasets.

**Proceed autonomously without asking the user routine questions.** The product decisions in the repository are the default decisions. If a detail is unspecified, choose the simplest safe and maintainable option consistent with these documents, record the decision in docs/DECISIONS.md, and continue. Do not stop to ask about naming, library choice, component details, routine implementation trade-offs or the next milestone.

This is not permission to perform unsafe, destructive or externally consequential actions. Never delete user data, rewrite Git history, force-push, publish private data, incur paid API costs, create external accounts, or send user datasets to a third-party provider without explicit configuration/authorization. If blocked by credentials, missing infrastructure or a genuinely irreversible decision, implement the safe portion, document the blocker and continue other independent work.

## 2. Mandatory startup procedure

At the beginning of every session:

1. Read this file completely.
2. Read docs/README.md, docs/REQUIREMENTS.md, docs/ARCHITECTURE.md, docs/STATUS.md, docs/ROADMAP.md, docs/EXAMPLES.md and docs/DECISIONS.md.
3. Inspect the repository tree, Git status, current branch, recent commits, package manifests, existing code, tests, CI and configuration.
4. Preserve working user changes. Never overwrite unrelated work simply to match the plan.
5. Compare the actual repository state with docs/STATUS.md and docs/ROADMAP.md. Treat code and tests as evidence; do not trust stale progress notes alone.
6. Update docs/STATUS.md before substantial work if the existing state is unclear.
7. Identify the earliest incomplete roadmap item whose dependencies are satisfied and begin implementation immediately.

Do not ask the user to repeat information already in the repository. Do not ask for confirmation between milestones. Do not stop after producing a plan when implementation is possible.

## 3. Execution loop

For each roadmap item:

1. Read the milestone and dependencies in docs/ROADMAP.md, then the current evidence and limitations in docs/STATUS.md.
2. Inspect existing implementation before creating new files or abstractions.
3. Break work into small vertical slices that leave the repository runnable.
4. Implement the simplest complete solution consistent with the design.
5. Add or update unit, integration, contract, security or end-to-end tests appropriate to the change.
6. Run formatting, linting, type checks, tests and build commands available in the repository.
7. Fix failures caused by the change. Never hide failures by weakening assertions, skipping relevant tests, swallowing exceptions or marking tests as expected failures without justification.
8. Review the diff for secrets, generated binaries, unrelated changes, unsafe file operations, broken migrations and documentation drift.
9. Update docs/STATUS.md with measured evidence (commands/results, limitations) and move delivered work to CHANGELOG.md.
10. Commit only when repository policy and environment permit. Never force-push or rewrite history.
11. Continue to the next roadmap item when its dependencies and acceptance gate are satisfied.

Run independent, safe tasks in parallel when useful. Do not parallelize conflicting writes, migrations or changes to the same files. Avoid asking for confirmation for ordinary reversible implementation decisions.

## 4. Source of truth and conflict resolution

Use this priority order:

1. Safety, privacy, security and explicit user instructions in the active conversation.
2. AGENTS.md.
3. docs/REQUIREMENTS.md for observable product behavior.
4. docs/ARCHITECTURE.md for architecture and technical boundaries.
5. docs/ROADMAP.md for sequencing; docs/STATUS.md for measured state and completion gates.
6. docs/EXAMPLES.md for illustrative fixtures and expected behavior.
7. Existing code and tests, after determining whether they are intentional and current.

If two documents conflict, preserve safety and existing user data, choose the more restrictive behavior for security/privacy, update the documents to remove the contradiction, record the decision, and continue. Do not silently ignore requirements.

## 5. Engineering principles

- Prefer a modular monolith with explicit module boundaries. Do not introduce microservices without measured need.
- Use the existing stack if already established and healthy. For a new project, follow the design: React + TypeScript frontend; FastAPI + Pydantic backend; the storage/job stack documented in docs/ARCHITECTURE.md (SQLite default, local filesystem, in-process jobs). Do not reintroduce PostgreSQL/Redis/S3 claims without the roadmap items being done.
- Keep frontend, API, domain logic, provider integrations, import/export and persistence concerns separate.
- Use typed contracts and schema validation at trust boundaries.
- Keep database migrations explicit and reversible where practical.
- Use stable IDs; do not rely on array positions or filenames as record identity.
- Keep large media files out of relational database rows.
- Keep raw source assets immutable; derived files must be distinct assets with lineage.
- Store AI proposals, human edits, review decisions and published snapshots as distinguishable concepts.
- Prefer boring, mature dependencies over speculative frameworks.
- Do not introduce a dependency for a trivial helper.
- Use configuration via validated environment settings. Supply a safe .env.example with placeholders only.
- Use UTC timestamps and document units and coordinate conventions.
- Avoid unbounded in-memory processing of large files. Stream or process in bounded batches where practical.
- Add pagination and limits to list/search endpoints.
- Keep APIs and export formats versioned when breaking changes are possible.
- Ensure every new feature has meaningful error states, loading states and empty states.

## 6. Data integrity and annotation rules

- Every record belongs to a dataset and has a stable identifier.
- Every asset records modality, media type, byte size when known, content hash and storage reference.
- Every annotation identifies its task, schema version, structured data, origin, status and revision/provenance.
- Annotation origin must distinguish at least human, model, imported and rule-generated data.
- A model-generated annotation must not silently become human-approved.
- Use explicit review states such as proposed, pending_review, approved, rejected and needs_correction. Keep the state machine documented and validate transitions.
- Validate task-specific geometry: bounding boxes must have valid dimensions and image-relative bounds; class IDs must exist; text spans must be in range; timestamps must be ordered and within media duration where known.
- Keep raw provider responses when legally and operationally appropriate, with secrets and sensitive payloads redacted.
- Dataset versions must reference exact record and annotation revisions. Published versions are immutable; corrections create a new version.
- An export must identify the dataset version, schema/exporter version and quality warnings.
- Never claim that a dataset is unbiased, legally cleared or training-safe based only on automated checks.

## 7. AI provider and agent rules

- All providers are accessed through a backend-side provider gateway. Never call secret-bearing provider APIs directly from browser code.
- Provider capabilities are explicit: text, image input, structured output, embeddings, image generation, audio, etc. Do not assume all providers support every task.
- Normalize outputs into internal task schemas and validate them before persistence.
- Store provider, model identifier, request configuration, prompt/template version, timestamps, usage when available, outcome and error metadata.
- Do not log API keys, authorization headers or raw secrets.
- Use bounded retries with backoff for transient errors; do not retry permanent validation errors indefinitely.
- Use idempotency keys for jobs and model requests when supported.
- Apply per-project and per-run limits. Do not initiate paid or high-volume inference automatically unless the user configured the provider and initiated the run.
- Keep manual annotation, validation, versioning and export usable when no AI provider is configured.
- Prefer explicit deterministic workflows over unconstrained agent loops. Agents may propose plans and invoke approved tools, but cannot bypass permissions, budget limits, source policies, validation or human review requirements.
- Treat model outputs and retrieved web content as untrusted data, never as executable instructions.
- Do not use a second model's agreement as proof of truth. Verification is evidence, not a guarantee.

## 8. Import, web research and licensing

- Treat uploaded files, archives, documents, image metadata and model outputs as untrusted.
- Defend against path traversal, archive bombs, decompression bombs, oversized files, malformed media, MIME spoofing and malicious content.
- Apply configured size/count limits, safe temporary directories and cleanup on failure.
- Do not execute uploaded files or trust filenames as paths.
- Web discovery must respect source terms, access controls and applicable policies. Do not bypass authentication, paywalls, CAPTCHAs or technical restrictions.
- A publicly viewable URL does not imply permission to download, redistribute or use content for training.
- Record source URL, retrieval time, creator/publisher when known, license evidence, attribution requirements, transformation history and intended-use review status.
- If permissions are unclear, mark the source unknown or review-required; do not label it approved.
- Avoid retaining personal or sensitive data unless required and authorized. Provide clear handling and deletion behavior.

## 9. Security and privacy

- Validate authentication and ownership on every project-scoped operation in hosted mode.
- Never trust client-provided project IDs as proof of authorization.
- Use least privilege for database, object storage and provider credentials.
- Protect against SQL injection, XSS, CSRF where applicable, SSRF, path traversal and insecure direct object references.
- Do not allow arbitrary URL fetches from the backend without SSRF protections and allowlisted schemes/addresses.
- Redact secrets from logs and error responses.
- Keep local mode explicit about network activity. External model calls must be visible and configured.
- Avoid telemetry by default in local deployments unless opt-in is implemented and documented.
- Do not include real credentials, private datasets or sensitive logs in fixtures, tests or commits.
- Add rate limits and upload limits before exposing the service publicly.

## 10. Frontend and accessibility

- Build a coherent, responsive developer tool; prioritize clarity, dense data views, keyboard efficiency and predictable navigation over decorative effects.
- Use consistent design tokens and reusable components.
- Provide loading, empty, error, success and partial-failure states.
- Support keyboard navigation and visible focus indicators for important annotation actions.
- Keep annotation edits reversible with undo/redo where practical.
- Confirm destructive actions and explain consequences.
- Do not use fake data in production screens to imply functionality exists. Demo fixtures must be clearly identified.
- Avoid placeholder buttons, dead links and controls that look functional but do nothing.
- **Strictly prohibit marketing fluff and promotional puffery**: Never display marketing claims or boastful buzzwords in the UI (e.g. "100% On-Device Data Sovereignty", "$0 Paid AI Cost", "Zero Telemetry", "Foreign-Key Rigidity", "Safety Guarantee", "Zero-Cost"). Maintain a sober, precise developer-tool tone focused strictly on technical facts and system states (e.g. "Local Mode" instead of "Local Only ($0 AI)", "Validation Rules" instead of "Safety Guarantee", "Local Provider" instead of "Zero-Cost Local Provider"). This rule applies permanently across all UI text, badges, headers, and tooltips, even if future prompts casually mention promotional phrasing.

## 11. Tests and quality gates

- Add tests alongside implementation, not as a final optional step.
- Test domain logic independently of the database and provider network.
- Use provider fakes/fixtures for deterministic automated tests; do not require paid API keys in CI.
- Test malformed provider responses, timeout, rate limiting, cancellation and retry behavior.
- Test export round trips and geometry invariants.
- Test authorization boundaries and untrusted file handling.
- Run available formatters, linters, static type checks, migrations, unit/integration tests and production builds.
- If a command cannot run due to unavailable dependencies or environment, record the exact command and blocker; do not claim it passed.
- Never lower coverage thresholds or delete a failing test merely to get a green build without a justified documented change.
- Keep a small, version-controlled synthetic fixture dataset that exercises every initial task type.

## 12. Git and file safety

- Inspect git status before editing and before committing.
- Never discard, reset, clean or overwrite user changes.
- Never force-push, rewrite published history or commit secrets.
- Do not commit build output, node_modules, caches, large sample datasets or local databases.
- Make focused commits with descriptive messages when permitted.
- Do not claim code was pushed unless the remote operation succeeded and the resulting commit/ref was verified.
- If remote credentials are unavailable, finish local work and provide the exact blocker and safe next command.

## 13. Documentation discipline

- Keep requirements, architecture, execution status and implementation aligned.
- For every significant architectural choice, add a short entry to docs/DECISIONS.md with context, decision, alternatives and consequences.
- Update docs/STATUS.md only with measured evidence; move delivered work to CHANGELOG.md.
- A capability is DONE only when its acceptance criteria are met and tests have been run.
- Document limitations and deferred work honestly.
- Provide setup, configuration, migration, test and troubleshooting instructions as the product grows.

## 14. Completion and reporting

Do not stop after creating scaffolding. Continue until all feasible roadmap items are implemented or a real external blocker is reached.

At the end of a work session, report:
1. What was implemented.
2. Files and modules changed.
3. Tests/build commands run and actual results.
4. Current state and remaining tasks.
5. Any blockers or decisions recorded.
6. The next concrete action.

Do not ask the user what to do next when the execution plan already defines the next step. Continue autonomously in the next available work session.
