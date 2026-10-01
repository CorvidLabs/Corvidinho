---
change: a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the
artifact: research
---

# Research

Every place a provider's reply body could reach a public comment or a log:

- **Summary comment** (`src/watch/summary.ts` `buildSummaryBody`): posted
  `spawn.summary` for every run. A model failure's summary is
  `LLM HTTP <status>: <body ≤400>` (`execute.ts`); a later attempt's
  model failure also appends the earlier verify failure. Fixed: a failed run
  without an ask shows only the reason line.
- **Ask text**: a run that stops on an ask (`clarify`, `stuck` after verify
  retries or a repeated failing call, `spend-cap`) carries harness question
  text; a model failure returns before any ask (`loop.ts` returns on
  `exec.error` with no ask), and a spend-cap stop's summary is
  `SPEND_CAP_SUMMARY` (exit 0). Kept as is.
- **Verify notes**: the lane output rides the summary of a verify that gave
  up (with a stuck ask — kept, it is not provider text) or of a model failure
  after a failed verify (no ask — now replaced by the reason line).
- **Model fallback note**: `modelFailureReason` gives `HTTP <status>` etc.,
  never a body; unchanged.
- **Kept conversation** (`conversation_threads`, REQ-watch-472): stored the
  run summary as the agent turn and replays it to the model on the next event
  on that issue — an indirect path to a later public comment. Fixed: the
  failed run's turn is the reason line.
- **Logs**: `[watch] spawn outcome …` prints no summary; the spawn-outcome
  JSONL `summaryPreview` (240, scrubbed) is the operator's own file under the
  data dir — chosen to keep the scrubbed summary there for diagnosis.
  `onAction` (a test hook) still gets the raw summary.
- REQ-cli-079: `SchedulerService` (`failedRunOutcome`, no `failureDm` in
  the daemon) records `summary` = the reason (owner's schedule) or
  `That didn't work.`, `error` = `failed (exit 1): <reason>`, logs
  `[scheduler] run failed …`; `startDaemon` passes no `outbound`, so the
  daemon posts nothing; its `run.finished` carries the row's error.
