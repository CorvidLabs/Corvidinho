---
change: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
artifact: testing
---

# Testing

## Local (agent)

- `specsync check --force` exits 0 (draft warning OK without --strict)
- `specsync change audit` exits 0
- `fledge lanes run verify --non-interactive` green (local gate; not in GHA yet)

## CI

- **ci** smoke: Bun install + smoke + test + typecheck only
- **Spec Sync**: Action check (coverage 100, not strict) + `specsync change audit`

## Rejection signal

SpecSync curl|bash install, Fledge required in GHA, or `sdd.json` enabled false.
