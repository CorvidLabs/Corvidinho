---
change: busy-lock-tests-get-an-explicit-30-s-timeout-so-a-slow-ci-runner-no-longer-fails-them-on-bun-test-s-5-s-default-the
artifact: context
---

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
