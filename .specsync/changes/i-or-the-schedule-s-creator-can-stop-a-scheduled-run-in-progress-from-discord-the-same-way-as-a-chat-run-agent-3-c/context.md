---
change: i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c
artifact: context
---

# Context

Part of #124 (M4 "Safe autonomy"); slice schedule-stop of the M3/M4 plan.
Leif confirmed in the 2026-09-28 interview record
(`/home/user/coord/interview-2026-09-28.md`, round 13, 2026-09-30, "Stop
schedule runs (AGENT-3.a/DISCORD-SCHEDULE-1.a)"): "the owner or the
schedule's creator can stop a schedule run in progress from Discord, like a
chat run." It is captured in this change's PR with the `hi` CLI as AGENT-3.c
(`hi/agent.md`, under AGENT-3; the `INTENT.md` index moved to 27 AGENT
criteria): "I or the schedule's creator can stop a scheduled run in progress
from Discord, the same way as a chat run."

What was missing on main (8bf4422): AGENT-3.a's Stop button and stop words
(#332, #341) covered chat, ask pick / Answer, `/session start` and `/work`
runs; REQ-discord-302 / 303 said stopping a schedule's run from Discord was a
later slice. A schedule run had no progress message at all — only its result
or question post after it ended — and its only abort was the shutdown
abandon (`abandonInFlight`).

Constraints: reuse the AGENT-3.a stop path (`SessionRunControl`, the
`cvstop:<runId>` button, the stop words from the owner or the requester),
never a second mechanism; the schedule's creator plays the requester; a stop
ends that run only and the schedule's next tick runs normally; record it on
the `schedule_runs` row with existing states and columns (no schema bump);
no new slash command, env var or config key; a schedule with no channel uses
the conservative option consistent with the text (the owner's DM, already
used for schedule asks) and is listed as a design choice pending Leif; stay
compatible with main as it is (#350 plugin toggles and #347 are separate);
#232 / #233 untouched; v1 off-chain.
