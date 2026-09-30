---
change: capture-agent-3-b-in-hi-after-a-stop-messages-that-were-waiting-still-run-in-order-leif-2026-09-30
artifact: context
---

# Context

Leif decided on 2026-09-30 (round 13 of the interview record
`/home/user/coord/interview-2026-09-28.md`, "Stop and the queue (AGENT-3.a):
waiting messages still run in order after a stop") what happens to messages
that wait behind a run that is stopped. Per PROCESS-1 a confirmed want is
captured into `hi/` before it is built, so this change records the
`hi AGENT-3.b "After I stop a run, messages that were waiting still run, in
order."` capture (its own commit on the branch), which also moved the
`INTENT.md` index count.

The build (the per-session queue and the stop/cancel text, REQ-discord-301 /
302) is the sibling change
`a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after`
in the same PR (Part of #122). Nothing else in `hi/` changes: AGENT-3 and
AGENT-3.a were already captured on main.
