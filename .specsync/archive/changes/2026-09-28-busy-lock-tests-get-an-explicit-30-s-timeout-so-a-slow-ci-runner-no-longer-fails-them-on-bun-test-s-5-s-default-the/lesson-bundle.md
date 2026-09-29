# Lesson bundle — busy-lock-tests-get-an-explicit-30-s-timeout-so-a-slow-ci-runner-no-longer-fails-them-on-bun-test-s-5-s-default-the

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Busy-lock tests get an explicit 30 s timeout so a slow CI runner no longer fails them on bun:test's 5 s default (the lock holder is a child bun process)
- **Kind**: BugFix
- **Paths**: tests/store.busy-lock.test.ts
- **Acceptance**: The appendAudit and rescrubDatabase busy-lock tests in tests/store.busy-lock.test.ts run with an explicit 30_000 ms timeout like the concurrent-appenders test, so a slow runner (PR #226 smoke run: 101 s suite, test at 5857 ms) no longer fails them on bun:test's 5 s default; every assertion (holder exits 0, no error, seq 2, row order and prev_hash link, verifyAudit ok; rescrub updates 1 row and redacts) is unchanged

## Evidence

- Verification commit: `6232019289110d01daf8eb91fb2ef0a271fd06e5`
- Base commit: `fc0ed8da6e47dc1db452ee51044cde096db4e8bc`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

On PR #226, CI `smoke` failed once in `tests/store.busy-lock.test.ts`:
`shared DB writers wait for another process's write lock > appendAudit waits
under busy_timeout and links after the other writer's row (SAFE-5)` timed out
after 5000ms, finishing at 5857ms. The job log is at
https://github.com/CorvidLabs/Corvidinho/actions/runs/36288261094/job/108533123082.
That runner was slow: its test step took 101 s, against about 41 s for main's
CI on the same code at the same time and 51–54 s for the PR's other runs. The
one re-run passed.

The first two tests in the file start a child `bun -e` process. The child
takes the SQLite write lock, appends a row, holds the lock for 750 ms and then
commits. Meanwhile the parent blocks synchronously in `appendAudit` /
`rescrubDatabase` under `busy_timeout = 5000`. Both tests used bun:test's
default 5 s timeout. The third test in the file, which also spawns `bun`
children, already sets `30_000`. So child start-up plus the hold can cross 5 s
on a busy runner, although nothing is wrong.

This fix only widens the time limit. Every assertion stays as it was: the
holder exits 0, the parent write does not throw, seq/order/prev_hash link
correctly, verifyAudit is ok, and rescrub updates one row and redacts it. I
could not reproduce the timeout locally, even with the test and eight busy
loops pinned to one core (6/6 runs passed), so the CI log is the evidence.

## From the change's testing.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
