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
summary comment. A comment for a run with `stopReason: "turn-cap"` SHALL add
the plain line `Stopped: it reached the turn cap before it finished, so this
is its best answer so far.` after the summary (before any SAFE-13 line and
the footer), with no `stopped=` plumbing. An idle-timed-out run is a failed
run whose summary already starts with `Stopped: no output for … (idle
timeout).`, so its comment (`Failed (exit 1).`) adds nothing. WATCH runs use
the same `CORVIDINHO_MAX_TURNS` / `CORVIDINHO_IDLE_TIMEOUT_MS` as every run.

Acceptance Criteria
- A fake child whose `result` frame has `stopReason: "turn-cap"` gives `stopReason: "turn-cap"`, and `buildSummaryBody` of it contains `Here is what I found so far.`, a blank line and the turn-cap line, with no `stopped=`.
- An idle-timed-out spawn's comment is `Failed (exit 1).`, a blank line and its summary (the stop line first), without the turn-cap line; a plain run's comment has no turn-cap line.
- Fixture: `tests/agent.limits.test.ts`.
