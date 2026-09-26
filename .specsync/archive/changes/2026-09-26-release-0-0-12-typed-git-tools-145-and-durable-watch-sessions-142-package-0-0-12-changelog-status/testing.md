---
change: release-0-0-12-typed-git-tools-145-and-durable-watch-sessions-142-package-0-0-12-changelog-status
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-016` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.12; the updater changelog helper extracts the 0.0.12 section exactly. |

## Automated coverage

- `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`
