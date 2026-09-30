---
change: a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told
artifact: design
---

# Design

- **One helper**, `src/discord/failure-reason.ts`:
  `failureReasonFor(run, env)` picks the result frame's `error`, else the
  run tier's `providerNotice` (AGENT-10), else the last meaningful stderr
  line, else the exit code (130 = interrupted); never the summary.
  `plainFailureLine` scrubs first (SAFE-6), drops ANSI codes, stack frames,
  Bun source excerpts, caret lines and runtime banners, keeps the last line
  that reads like an error (else the last one), cuts host paths to
  `…/<last segment>` (URL hosts untouched), collapses whitespace, defangs mass
  mentions and cuts to 200 at a sentence end (≥ 40 chars), else a word end,
  else hard, with `…`.
- **Owner DM**: `createFailureOwnerDm({ owner, sendDm })` → `tell()` DMs
  `❌ A run failed (<surface> in <#channel>): <reason>`; a reason told within
  the hour is not re-sent (true); a DM that failed is forgotten (false).
  One instance in the bridge, shared by chat, the slash context and the
  bridge's scheduler; the daemon wires none.
- **Reply**: `failedRunOutcome` logs `[discord] run failed (<surface>, exit
  N): <reason>` (`[scheduler]` for schedules), then returns the reason for
  the owner's run, else `FAILED_TOLD_OWNER_TEXT` when `tell` is true, else
  `FAILED_TEXT`. Surfaces call it only where they used to post the failed
  line (no ask, not stopped), so asks, stops and spend-cap stops are
  unchanged; the thrown-run paths use it with the thrown message.
- **Schedules**: the owner rule is `byOwner` (the live owner's own
  schedule); the row keeps `summary` = the posted line and `error` =
  `failed (exit N): <reason>` (scrubbed at rest, logged by the daemon's
  `run.finished`); a failed run with its own ask keeps the old row line.
- **Agent side**: `callModels` adds `reason =
  modelCallFailedLine(failure, provider)` to a failed `Completion`; the
  three `error: true` returns carry it (or the no-provider notice) as
  `failureReason`; `runTask` copies it to `TaskResult.error`, and sets
  `verifyGaveUpReason` / `VERIFY_RERUN_FAILED_REASON` on verify failures.
  `collectTaskRunStream` keeps the stderr end; the spawn client hands
  `failureReason` (validated, scrubbed, capped) and, on a failure,
  `stderrTail` to the bridge.
