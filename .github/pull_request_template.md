<!-- Keep this short; details belong in the commits. -->

## What changed

<!-- One paragraph: the problem and the fix. -->

## Why

<!-- Link an ADR, roadmap item, research file or issue. -->

## Verification

- [ ] `ruff check .`
- [ ] `pytest tests -q`
- [ ] `cd apps/web && npm run build && npm test`
- [ ] Browser suite: <!-- name of e2e suite, or "n/a" -->

Commands actually run and their results:

```
```

## Safety / honesty checklist

- [ ] No secrets, `.env`, local databases or private datasets committed
- [ ] No fabricated ETAs, prices, metrics or capability claims
- [ ] Origin/status changes stay server-derived (machines never write `human` / self-approve)
- [ ] Docs updated where behaviour or scope changed (see docs/README.md source-of-truth map)
- [ ] New architecture decision recorded in docs/DECISIONS.md (if material)
