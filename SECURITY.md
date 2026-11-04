# Security Policy

## Supported versions

Only the `main` branch and the latest tagged release receive security fixes. This is a pre-1.0
project; there are no long-term-support branches.

## Reporting a vulnerability

Please use **GitHub's private vulnerability reporting** on this repository
(Security → Advisories → Report a vulnerability). Do not open a public issue for an exploit, a leaked
key or a way to bypass upload/review protections.

Include: affected version/commit, a minimal reproduction, impact and any suggested fix. You will get an
acknowledgement and a remediation note when the issue is resolved.

## Local-mode exposure warning

Curlset ships as a **local-first** application. In the default configuration:

- request identity (`X-User-Id`, default user) is **not authentication**;
- RBAC, quotas and audit middleware exist but hosted enforcement is not a supported deployment mode;
- the API binds locally and must not be exposed to the internet.

If you deploy this beyond localhost before the roadmap items for real authentication and hardened
hosting are done, you are responsible for putting it behind an authenticated reverse proxy and for
restricting network access.

## Secret handling

- Provider keys belong in environment variables (`.env`) or the server-side credential store; they are
  never returned unmasked to the browser bundle.
- Logs and error responses redact secret-bearing headers and keys.
- Never commit keys, `.env`, local databases or private datasets. If a key is exposed, rotate it — the
  project cannot revoke third-party credentials for you.

## Scope

In scope: authentication/authorization bypasses, SSRF in source discovery, path traversal or zip bombs in
ingestion, secret leakage, privilege escalation, injection, stored XSS, and provenance/review bypasses.

Out of scope: issues that require an already-compromised host, denial of service through intentionally
huge local uploads, and third-party provider outages/pricing.

## Known accepted limitations

See [docs/STATUS.md](docs/STATUS.md) §5. The most security-relevant ones: SQLite single-process
deployment, no real auth, and no migration framework. These are documented, not vulnerabilities; reports
that only restate them will be closed as known limitations.
