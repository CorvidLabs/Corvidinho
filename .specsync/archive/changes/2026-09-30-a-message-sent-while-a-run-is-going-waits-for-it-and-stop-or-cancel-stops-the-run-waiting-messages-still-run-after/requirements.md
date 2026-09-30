---
change: a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after
artifact: requirements
---

# Requirements

- AGENT-3 (captured, `hi/agent.md`): "It runs a tool loop I can interrupt,
  and when I interrupt it, it actually stops instead of finishing in the
  background."
- AGENT-3.a (captured, `hi/agent.md`, Leif 2026-09-28): "In Discord I can
  stop a run with a Stop button or by saying stop or cancel, and so can the
  person who asked; a message sent while a run is going waits for it instead
  of starting a second run." Built here: the queue and the stop/cancel text.
  Not built here: the Stop button (stop-button-2) and stopping schedule runs.
- AGENT-3.b (captured in this PR with `hi`, Leif 2026-09-30, round 13):
  "After I stop a run, messages that were waiting still run, in order."
- Defaults applied (`/home/user/coord/m34-defaults.md`, stop-button rows; not
  Leif decisions): 'cancel' with nothing running keeps today's behaviour
  (clears open asks) and 'stop' stays ordinary text; no new "waiting"
  indicator — a queued message waits silently and gets its normal progress
  message when its turn starts, and its in-flight row still gives the restart
  notice (REQ-discord-311).
- Kept: SESSION-MULTI-1 (only the session's user continues it; the owner's
  stop reply continues nothing), REQ-discord-201 / 010 / 212 gates on the stop
  route, DISCORD-15 / 15.a footer (tokens and cost owner-only), SAFE-20 (a
  card nobody waits for is a no), REQ-discord-204 (busy while running),
  REQ-discord-311, AUTONOMY-6 cancel with nothing running.
- Added: REQ-discord-301 (one run at a time per session; the queue),
  REQ-discord-302 (stop / cancel). Modified: REQ-discord-002 (the stop reply
  exception), REQ-discord-044 (cancel while a run is going stops it).
- No new env var, config key, slash command, table, column or schema version.
