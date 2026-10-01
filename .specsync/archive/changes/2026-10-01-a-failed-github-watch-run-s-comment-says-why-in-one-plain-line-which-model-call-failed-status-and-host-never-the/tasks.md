---
change: a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the
artifact: tasks
---

# Tasks

- [x] WATCH `AgentSpawnResult.failureReason` / `stderrTail`; the spawn client hands them over on a failed run.
- [x] `watchFailureReason` (DISCORD-3.b's `failureReasonFor`); a failed run's comment is that line, never the summary.
- [x] Poller: `[watch] run failed (…)` log line; the kept agent turn is the reason; the JSONL keeps the scrubbed summary.
- [x] `tests/watch.failed-comment.test.ts`, `tests/daemon.no-provider-run.test.ts`; `tests/watch.summary-scrub.test.ts` and `tests/watch.reliability.test.ts` updated; fail-on-main proof recorded.
- [x] `docs/WATCH.md`, `watch.spec.md` / `cli.spec.md` files and prose, deltas (REQ-watch-009, REQ-watch-472, REQ-watch-080, REQ-cli-079), module testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
