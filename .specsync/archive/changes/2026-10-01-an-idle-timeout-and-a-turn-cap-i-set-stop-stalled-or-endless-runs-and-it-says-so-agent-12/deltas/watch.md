---
module: watch
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
---

# Delta: watch (a WATCH comment says when a limit I set stopped the run — AGENT-12)

## Added

### REQUIREMENT REQ-watch-125

AGENT-12 on GitHub. The WATCH spawn client SHALL read the `result` frame's
`stopReason` through `stopReasonFromUnknown` into
`AgentSpawnResult.stopReason`, and the poller SHALL pass it to the run
summary comment. A comment that shows the summary of a run with
`stopReason: "turn-cap"` SHALL add the plain line `Stopped: it reached the
turn cap before it finished, so this is its best answer so far.` after the
summary (before any SAFE-13 line and the footer), with no `stopped=`
plumbing; a turn-capped run that failed without an ask of its own posts its
one reason line instead (REQ-watch-009), without the turn-cap line. An
idle-timed-out run is a failed run whose `result` frame's `error` is
`Stopped: no output for … (idle timeout).`, so its comment is `Failed (exit
1).` and that one reason line (REQ-watch-009), never its summary, with
nothing added. WATCH runs use the same `CORVIDINHO_MAX_TURNS` /
`CORVIDINHO_IDLE_TIMEOUT_MS` as every run.

Acceptance Criteria
- A fake child whose `result` frame has `stopReason: "turn-cap"` gives `stopReason: "turn-cap"`, and `buildSummaryBody` of it contains `Here is what I found so far.`, a blank line and the turn-cap line, with no `stopped=`.
- A fake child exiting 1 whose `result` frame has `stopReason: "idle-timeout"` and the stop line as `error` gives `failureReason` the stop line, and its comment is `Failed (exit 1).`, a blank line and the stop line, without its summary or the turn-cap line; a failed turn-capped run's comment is its reason line without the turn-cap line; a plain run's comment has no turn-cap line.
- Fixture: `tests/agent.limits.test.ts`.
