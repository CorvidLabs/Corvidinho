---
change: bun-test-keeps-every-temp-dir-it-makes-under-one-per-run-root-in-tmpdir-and-removes-that-root-when-the-run-ends-instead
artifact: context
---

# Context

The agent box's disk filled and blocked PR landing: `/tmp` held ~430k
entries / ~26G, almost all `corvidinho-*` dirs from `bun test`
(`corvidinho-test-data-*`, `corvidinho-delegate-proj-*`,
`corvidinho-spend-*`, `corvidinho-ask-*`, `corvidinho-council-*`,
`corvidinho-clean-err-*`, ...). The test files make ~450 `mkdtemp` dirs
under `tmpdir()` and most never remove them; the preload's own scratch data
dir was never removed either. The prove-before-done verify lane
(`fledge lanes run verify`) runs the suite on every Discord / WATCH / daemon
task, so an operator's box fills the same way.

Repro on origin/main 5093b81: full `bun test` with `TMPDIR` set to a fresh
dir leaves 519 entries (41M) in it (77 `corvidinho-team-people-*`, 24
`corvidinho-spend-proj-*`, 23 `corvidinho-ask-proj-*`, ...,
`.corvid-worktrees`, `watch-spawn-*`).

Constraint: a test-infrastructure fix only (no product surface, no new env
var, config key or command, no hi/ criteria). Fixed centrally in the
preload rather than in ~140 test files.

HI: none new; AGENTS.md verify-lane rule (the lane must keep working on the
agent box).
