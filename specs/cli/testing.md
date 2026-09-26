---
spec: cli.spec.md
---

## Automated Tests

- `tests/cli.smoke.test.ts` — `--help` exits 0; `version` exits 0 with semver.

## Fixtures

- None; smoke spawns `bun src/cli.ts` against the repo root.

## Manual QA

- Run `bun src/cli.ts doctor` with and without Discord token env; confirm secret values never appear in output.
- Run `fledge lanes run verify --non-interactive` after CLI changes.
