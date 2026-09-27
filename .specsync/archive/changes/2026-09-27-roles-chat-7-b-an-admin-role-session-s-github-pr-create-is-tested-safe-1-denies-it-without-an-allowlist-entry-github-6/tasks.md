---
change: roles-chat-7-b-an-admin-role-session-s-github-pr-create-is-tested-safe-1-denies-it-without-an-allowlist-entry-github-6
artifact: tasks
---

# Tasks

- [x] Re-check the gap on current main: no test runs `github-pr-create` as an ADMIN role session
- [x] Add the "(b) admin github-pr-create" test to `tests/roles.chat.gates.test.ts` (SAFE-1 deny without an allowlist entry, GITHUB-6 refusal without a repo allowlist, dry-run ok with both)
- [x] Clear and restore the GitHub allow/deny, dry-run and token env keys per test in that file
- [x] Prove the test catches regressions main's suite misses (M1 SAFE-1 skipped for ADMIN, M2 GITHUB-6 skipped for ADMIN, M3 role gate refuses ADMIN), then restore the sources
- [x] Add REQ-agent-165 delta and fill context, tasks and testing
- [x] `specsync check --require-coverage 100`, `specsync change audit`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green
