---
change: a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the
artifact: design
---

# Design

- **Spawn client** (`src/watch/agent-client.ts`): like the Discord client
  since #340, a failed run hands back `failureReason`
  (`failureReasonFromUnknown(result.error)`) and `stderrTail`; both are new
  optional fields on the WATCH `AgentSpawnResult` (`src/watch/types.ts`).
- **Reason** (`src/watch/summary.ts`): `watchFailureReason(spawn, env)`
  returns null for a run that did not fail or stopped on an ask of its own,
  else `failureReasonFor({ exitCode, failureReason, stderrTail }, env)` from
  `src/discord/failure-reason.ts` — one reason source for Discord and
  GitHub (the scheduler already imports it the same way). `buildSummaryBody`
  uses it in place of the clipped summary; the status line, the SAFE-13
  owner line and the footer are unchanged. `env` is the watcher's env (the
  same one its AGENT-10 start-up notice reads); default `process.env`.
- **Poller** (`src/watch/poller.ts`): keeps the spawn's `failureReason` /
  `stderrTail` (a thrown spawn's message becomes `failureReason`), computes
  the reason once, logs `formatFailureLog("[watch]", "<repo>#<n> id=<id>",
  exit, reason)`, stores the reason as the conversation's agent turn, and
  passes `ask`, the facts and `env` to `maybePostWatchSummary`. The
  spawn-outcome JSONL keeps `scrubSecrets(summary).slice(0, 240)`
  (operator-only).
- **Not changed**: a failed run with an ask (stuck ask → `Needs your input`,
  `noteWatchRunAsk` and its owner DM), spend-cap stops (exit 0), successful
  runs, the ack, the injection notice, the rate-limit backoff, SAFE-12
  fencing of the event prompt and the replayed block.
- **REQ-cli-079**: text only — it now says what #340's scheduler records for
  a daemon run; a test pins it.
