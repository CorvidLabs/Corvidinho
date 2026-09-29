---
change: busy-lock-tests-get-an-explicit-30-s-timeout-so-a-slow-ci-runner-no-longer-fails-them-on-bun-test-s-5-s-default-the
artifact: tasks
---

# Tasks

- [x] Read the failing CI log: 5857 ms against the 5000 ms default, on a runner running about 2.5× slow
- [x] Give the two lock tests in `tests/store.busy-lock.test.ts` the explicit `30_000` timeout the third test already uses
- [x] Assertions unchanged; `bun test tests/store.busy-lock.test.ts` green
- [x] `specsync check --require-coverage 100`, `specsync change audit`, `bunx tsc --noEmit`, `fledge lanes run verify --non-interactive` green
