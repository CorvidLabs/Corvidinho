---
change: safe-6-secret-scrub-before-persist-automatic-re-scrub-issue-66-captured-slice-scrub-vendor-key-looking-secrets-github
artifact: testing
---

# Testing

- `tests/store.scrub.test.ts`: each vendor shape redacted and idempotent;
  ordinary text untouched; sessions/work/schedules/runs/memories persist
  scrubbed; raw rows re-scrubbed on next open when the rules version is
  behind; memory-key collision suffix; second open is a no-op.
- `bun test`, `bunx tsc --noEmit`, `specsync check`,
  `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-066 | `tests/store.scrub.test.ts` |
