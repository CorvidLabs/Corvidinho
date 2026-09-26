---
change: plugin-host-github-read-plugins-safe-1-deny-cli-plugins-surface
artifact: testing
---

# Testing

## Local gates

- `bun test` (deny-dangerous, plugins list smoke, github fixtures, GITHUB-6 gate)
- `bunx tsc --noEmit`
- `bun src/cli.ts plugins list`
- `specsync check`
- `specsync change audit`
- `fledge lanes run verify --non-interactive` (local agent gate; not in Actions)

## CI

- **ci** smoke: Bun install/test/typecheck only
- **Spec Sync**: CorvidLabs/spec-sync@v6 + `specsync change audit`

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-001 | `tests/plugins.deny.test.ts` list markings; `tests/plugins.list.smoke.test.ts` |
| REQ-plugins-002 | `tests/plugins.deny.test.ts` + `tests/plugins.deny.cli.test.ts` |
| REQ-plugins-003 | `tests/plugins.list.smoke.test.ts` github-* names; `tests/github.fixture.test.ts` |
| REQ-plugins-004 | `tests/github.deny.test.ts` + `tests/github.deny.cli.test.ts` |
| REQ-cli-004 | `tests/plugins.list.smoke.test.ts` + doctor path in `src/cli.ts` exercised by list smoke |
