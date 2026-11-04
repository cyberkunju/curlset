# Contributing

Thanks for improving Curlset. This project values honest evidence over volume: a small, verified change
is better than a large unverified one.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows; source .venv/bin/activate elsewhere
pip install -e ".[dev]"         # backend + pytest + ruff
# optional: pip install -e ".[dev,specialist]"   (numpy + scikit-learn probe)
cd apps/web && npm install
```

Copy `.env.example` to `.env` for local runs. Never commit `.env`, keys, tokens, local databases or real
datasets.

## Before opening a PR

1. `ruff check .`
2. `pytest tests -q`
3. `cd apps/web && npm run build && npm test`
4. For UI changes: run the relevant Playwright suite (`apps/web/e2e/`) and state which one in the PR.
5. Update documentation if behaviour or scope changed — see the source-of-truth map in
   [docs/README.md](docs/README.md).

Do not weaken assertions, skip a relevant test or delete a failing test to get green. If something could
not be run, say so with the exact command and blocker.

## Rules

- **Provenance:** origin and review status are server-derived; never let machine output claim `human`
  or self-approve.
- **Honesty:** no fabricated ETAs, prices, metrics or capability claims. Unknown is reported as unknown.
  Marketing puffery is prohibited in UI copy and docs.
- **Safety:** uploads and provider output are untrusted; validate at boundaries; keep secrets out of logs.
- **Dependencies:** prefer the existing stack; justify new dependencies.
- **Architecture decisions:** record a short ADR in [docs/DECISIONS.md](docs/DECISIONS.md) for a material
  choice or reversal. If research contradicts a shipped claim, cite the research file and fix the claim.
- **Browser tests:** a UI change without a browser check is not accepted; suites fail on console errors.

## Commit style

Conventional, imperative, scoped: `feat(labeling): ...`, `fix(export): ...`, `docs(architecture): ...`,
`test(...)`, `chore(...)`. One concern per commit. Explain the why in the body when it is not obvious.

## Documentation discipline

- Capability counts come from code (`dataset_types.py`, `constants.py`, OpenAPI), never from a second
  hand-maintained list.
- Test/build numbers appear only in [docs/STATUS.md](docs/STATUS.md) and must come from a real command run.
- Plans go in [docs/ROADMAP.md](docs/ROADMAP.md); delivered work moves to [CHANGELOG.md](CHANGELOG.md).
- Research claims need a file, a measured number and a denominator; otherwise mark them as unsupported.

## Security

Report vulnerabilities per [SECURITY.md](SECURITY.md), not in a public issue. Do not include secrets,
exploits or private data in issues or PRs.

## Licence

Contributions are accepted under the MIT licence (see [LICENSE](LICENSE)).
