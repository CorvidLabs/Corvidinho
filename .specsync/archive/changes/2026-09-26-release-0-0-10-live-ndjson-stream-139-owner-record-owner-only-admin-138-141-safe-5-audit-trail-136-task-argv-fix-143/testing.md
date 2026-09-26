---
change: release-0-0-10-live-ndjson-stream-139-owner-record-owner-only-admin-138-141-safe-5-audit-trail-136-task-argv-fix-143
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-016` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.10; changelog helper extracts the 0.0.10 section exactly and 0.0.9 still resolves. |

## Automated coverage

- `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`
