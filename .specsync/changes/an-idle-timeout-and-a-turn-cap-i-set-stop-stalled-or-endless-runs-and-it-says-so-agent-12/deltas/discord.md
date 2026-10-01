---
module: discord
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
---

# Delta: discord (a stop by a limit I set shows as `stopped=…` in the footer plumbing, and an Approve-card wait holds the idle watchdog — AGENT-12)

## Added

### REQUIREMENT REQ-discord-125

AGENT-12 on Discord. The spawn client SHALL read the `result` frame's
`stopReason` through `stopReasonFromUnknown` (only `turn-cap` and
`idle-timeout`; anything else is dropped) into `AgentSpawnResult.task.stopReason`.
Chat and reply answers, ask-pick and Answer-form answers, `/session start`
and `/work` SHALL pass it to `formatTaskPlumbing`, so the answer footer and
thinking embed end with `stopped=turn-cap` or `stopped=idle-timeout`; it
SHALL never be in the channel body (AGENT-9, DISCORD-3.a): a turn-capped
run's body is its best prose so far, and an idle-timed-out run is a failed
run like any other: its result `error` is the one plain line DISCORD-3.b's
`failureReasonFor` reads, so the owner's own run is answered with
`Stopped: no output for 10 minutes (idle timeout).` and anyone else's with
"That didn't work — the owner has been told." (the owner DMed the line). A
schedule's post has no footer, so a turn-capped schedule post is only its
best prose.
`ApprovalStore.waitForDecision` SHALL hold the waiting run's idle watchdog
(`pauseIdleWatchdog`) for the whole wait — the spend card, the must-ask
gate and every other SAFE-18 card — and release it when the card is
decided, lapses or the wait is aborted; the card's own expiry bounds that
wait (REQ-agent-244).

Acceptance Criteria
- A fake child whose `result` frame has `stopReason: "turn-cap"` gives `task.stopReason: "turn-cap"` and its summary; `stopReason: "Stopped after 8 tool rounds"` gives none.
- A fake child that exits 1 with an idle-timeout `result` frame gives `failureReason` = `Stopped: no output for 10 minutes (idle timeout).` and `task.stopReason: "idle-timeout"`; the owner's own mention on that run is answered with that line (DISCORD-3.b) and a footer that contains `state=failed verified=false attempts=1 stopped=idle-timeout`.
- A mention whose run returns `task.stopReason: "turn-cap"` collapses into the answer `Here is what I found so far.` with a footer that contains `state=done verified=false verifySkipped attempts=1 stopped=turn-cap`; the body has no `stopped=` and no turn-cap text.
- Inside a run with a 250 ms idle timeout, a `waitForDecision` the owner answers after 0.9 s returns `approved` without the watchdog firing; 0.6 s after it returns, it has fired.
- Fixture: `tests/agent.limits.test.ts`.
