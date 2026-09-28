---
id: busy-lock-tests-get-an-explicit-30-s-timeout-so-a-slow-ci-runner-no-longer-fails-them-on-bun-test-s-5-s-default-the
state: archived
type: bug_fix
base_commit: fc0ed8da6e47dc1db452ee51044cde096db4e8bc
---

# Busy-lock tests get an explicit 30 s timeout so a slow CI runner no longer fails them on bun:test's 5 s default (the lock holder is a child bun process)

## Intent

Busy-lock tests get an explicit 30 s timeout so a slow CI runner no longer fails them on bun:test's 5 s default (the lock holder is a child bun process)

## Affected Canonical Specs

- None

## Acceptance Criteria

- The appendAudit and rescrubDatabase busy-lock tests in tests/store.busy-lock.test.ts run with an explicit 30_000 ms timeout like the concurrent-appenders test, so a slow runner (PR #226 smoke run: 101 s suite, test at 5857 ms) no longer fails them on bun:test's 5 s default; every assertion (holder exits 0, no error, seq 2, row order and prev_hash link, verifyAudit ok; rescrub updates 1 row and redacts) is unchanged

## No-spec Rationale

Test-only: the two shared-DB lock tests in tests/store.busy-lock.test.ts get the same explicit 30 s timeout the third test in that file already has, so a slow CI runner cannot fail them on bun:test's 5 s default. No product code or REQ behavior changes; the same waits and rows are still asserted.
