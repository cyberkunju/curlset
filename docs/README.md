# Documentation Index

This directory is the documentation source of truth for Curlset. Each topic has exactly one
authoritative document; if two documents disagree, the one listed here wins and the other is a bug.

## Reading order

| # | Document | Audience | Answers |
|---|---|---|---|
| 1 | [README](../README.md) | everyone | What is this, what works today, how do I run it? |
| 2 | [REQUIREMENTS](REQUIREMENTS.md) | product, engineering | What is in scope, what is explicitly deferred, acceptance criteria |
| 3 | [ARCHITECTURE](ARCHITECTURE.md) | engineering | How the system is built, where state lives, what the boundaries are |
| 4 | [MODALITIES](MODALITIES.md) | engineering, users | What each supported modality can do end to end |
| 5 | [LABELING](LABELING.md) | data teams, engineering | Manual review, auto-labeling, ensemble math, specialist rescue |
| 6 | [UI](UI.md) | design, frontend | Routes, Simple vs Advanced mode, design tokens, accessibility |
| 7 | [OPERATIONS](OPERATIONS.md) | operators | Setup, configuration, providers, backups, troubleshooting |
| 8 | [TESTING](TESTING.md) | contributors | How the suite is organized and how to verify a change |
| 9 | [STATUS](STATUS.md) | everyone | Current measured state: tests, lint, build, known limitations |
| 10 | [ROADMAP](ROADMAP.md) | product, engineering | Only the work that is *not* done yet |
| 11 | [DECISIONS](DECISIONS.md) | engineering | ADR log: context, decision, alternatives, consequences |
| 12 | [EXAMPLES](EXAMPLES.md) | users, engineering | One runnable tutorial plus the fixture index |
| 13 | [RESEARCH](RESEARCH.md) | product, research | The measured research behind the design and its limits |
| 14 | [COMPETITIVE_ANALYSIS](COMPETITIVE_ANALYSIS.md) | product | Verified market/pricing snapshot and where the gaps are |
| — | [CHANGELOG](../CHANGELOG.md) | everyone | Dated delivery record (no forward-looking claims) |

## Source-of-truth rules

- **Capability counts** (dataset types, export formats, task types, API routes) come from code:
  `packages/dataset_core/dataset_types.py`, `packages/dataset_core/constants.py`, and the FastAPI
  OpenAPI schema. Never hand-maintain a second list.
- **Test/build numbers** live only in [STATUS](STATUS.md) and are copied from an actual command run.
- **Plans** live only in [ROADMAP](ROADMAP.md); delivered work moves to [CHANGELOG](../CHANGELOG.md).
- **ADRs** live only in [DECISIONS](DECISIONS.md); a superseded decision stays listed with a status.
- **Research claims** are allowed only with a source file and a measured denominator. The research
  corpus is shipped read-only under [`research/`](research/README.md); the synthesis documents
  (`00-SYNTHESIS.md`, `00-SYNTHESIS-WAVE2.md`) are the entry points.

## Historical material

Earlier UI audits, phase work-package plans and interim status notes were consolidated into the
documents above and removed to keep one source of truth. Their full text remains in Git history.
