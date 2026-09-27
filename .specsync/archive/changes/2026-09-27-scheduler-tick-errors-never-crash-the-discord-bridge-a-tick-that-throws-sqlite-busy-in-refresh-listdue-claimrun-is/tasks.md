---
change: scheduler-tick-errors-never-crash-the-discord-bridge-a-tick-that-throws-sqlite-busy-in-refresh-listdue-claimrun-is
artifact: tasks
---

# Tasks

- [x] Reproduce on `main`: a throwing `listDue` under `start()` exits a bridge-like Bun process with code 1.
- [x] `start()` interval catches a rejected `tick()` and logs `[scheduler] tick failed: …`, scrubbed with `scrubSecrets` and capped at 500 chars.
- [x] `tick()` still rejects for direct callers (daemon `tick.failed` unchanged), and its `finally` still releases the tick lock.
- [x] The fire-and-forget `runOne` promise gets a `.catch` that logs `[scheduler] run failed: …`, so it never rejects.
- [x] `runOne`'s `finally` frees the running slot in an inner `finally`, even when `parkWorktree` throws.
- [x] Regression tests in `tests/scheduler.tick-errors.test.ts`, which fail on the old code and pass on the new. The file is listed in `specs/discord/discord.spec.md` `files:`.
- [x] Added delta for REQ-discord-331.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test` and `fledge lanes run verify --non-interactive`.
