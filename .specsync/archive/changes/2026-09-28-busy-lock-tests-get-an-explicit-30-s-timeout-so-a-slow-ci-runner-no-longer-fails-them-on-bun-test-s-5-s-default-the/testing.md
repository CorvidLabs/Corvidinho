---
change: busy-lock-tests-get-an-explicit-30-s-timeout-so-a-slow-ci-runner-no-longer-fails-them-on-bun-test-s-5-s-default-the
artifact: testing
---

# Testing

- **Evidence:** CI job 108533123082 (PR #226, head 59eea59). The appendAudit
  lock test timed out after 5000 ms and finished at 5857 ms; the suite took
  101 s. The one re-run of the same commit passed. Main's CI on the same base
  was green.
- **Locally, Bun 1.4.2 (the CI pin):** `bun test tests/store.busy-lock.test.ts`
  passes 3/3 tests, with the file taking about 3–4 s. The timeout did not
  reproduce locally even with the test and eight busy loops pinned to one core
  (original file 3/3 runs passed, fixed file 3/3 runs passed). This change
  widens the time limit only.
- **Gates:** `bunx tsc --noEmit`, `specsync check --require-coverage 100`,
  `specsync change audit` and `fledge lanes run verify --non-interactive`.
