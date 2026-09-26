---
change: cover-leftover-cli-package-0-0-5-req-cli-012-paths-for-specsync-audit-after-session-worktree-archive-no-module-ac
artifact: testing
---

# Testing

- `tests/version.test.ts` and `tests/update-helpers.test.ts` already assert 0.0.5.
- `bun test` + `fledge lanes run verify --non-interactive` green on parent tip.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-cli-012 | `package.json` 0.0.5; `tests/version.test.ts`; CHANGELOG 0.0.5 section |
