# Lesson bundle — capture-agent-3-b-in-hi-after-a-stop-messages-that-were-waiting-still-run-in-order-leif-2026-09-30

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Capture AGENT-3.b in hi: after a stop, messages that were waiting still run, in order (Leif 2026-09-30)
- **Kind**: Documentation
- **Paths**: hi/agent.md, INTENT.md
- **Acceptance**: hi/agent.md holds AGENT-3.b under AGENT-3 with the exact wording Leif confirmed on 2026-09-30 (round 13 of the 2026-09-28 interview record: 'Stop and the queue: waiting messages still run in order after a stop'): 'After I stop a run, messages that were waiting still run, in order.' It was captured with the hi CLI (hi AGENT-3.b "..."), which also moved the INTENT.md index to 25 AGENT criteria; hi check passes; AGENT-3 and AGENT-3.a are unchanged; no invented criteria; no code, canonical spec or test change here.

## Evidence

- Verification commit: `b4dae7633c63babbcf6f8cbef7fb079a51f6a06c`
- Base commit: `1820fb4aa936182a4b7ca504e68ce8ada24851b1`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
