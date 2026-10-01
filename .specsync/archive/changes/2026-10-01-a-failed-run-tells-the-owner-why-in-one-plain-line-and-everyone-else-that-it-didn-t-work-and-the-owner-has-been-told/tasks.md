---
change: a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told
artifact: tasks
---

# Tasks

- [x] Capture DISCORD-3.b with `hi` in its own commit; `hi check` passes.
- [x] `TaskResult.error` / `ExecuteResult.failureReason`; `modelCallFailedLine` from the chain's last failure (status and host, never the body); `runTask` sets `error` on provider and verify failures; spend-cap stops carry none.
- [x] `collectTaskRunStream` keeps `stderrTail`; the spawn client hands over `failureReason` and a failed run's `stderrTail`.
- [x] `src/discord/failure-reason.ts`: reason order, scrub-then-cut one line, owner DM with one-hour dedup, log line, reply body.
- [x] Surfaces: chat and ask-resume bodies and throws in `bridge.ts`, `/session start`, `/work`, schedule posts (owner rule = `byOwner`); one shared `failureDm` wired into the slash context and the bridge's scheduler.
- [x] `tests/discord.failed-reply.test.ts`; three tests updated for the new line; fail-on-base proof recorded in testing.md.
- [x] docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/DAEMON.md, spec prose, deltas and module testing evidence updated.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
