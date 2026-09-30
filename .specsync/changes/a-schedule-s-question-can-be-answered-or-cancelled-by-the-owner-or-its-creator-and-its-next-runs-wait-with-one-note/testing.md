---
change: a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note
artifact: testing
---

# Testing

Fixture tests only: in-memory or temp SQLite, injected agents, recorded
posts and DMs, `startBridge` with a null gateway and fake interactions; no
live Discord, no network, no token.

Fail-on-base proof: with main's (156cfa9) `src/store/db.ts`,
`src/store/scrub.ts`, `src/scheduler/store.ts`, `src/scheduler/service.ts`,
`src/discord/ask-buttons.ts`, `src/discord/ask-ping.ts` and
`src/discord/bridge.ts` swapped in (and `src/discord/schedule-ask.ts`
removed), the eight touched test files give 93 pass / 21 fail and both new
files (28 tests) cannot load; restored, 140 pass / 0 fail.

New — `tests/scheduler.ask-block.test.ts` (14) and
`tests/discord.schedule-ask.test.ts` (14). Rewritten for the blocking —
`tests/scheduler.ask-outbox.test.ts` (a later run cancels the open ask
first; staleness through a cancelled ask and a race-finished later run) and
the AUTONOMY-2 dedupe harness in `tests/discord.ask-ping.test.ts`; schema
assertions to v15 in `tests/discord.approval-cards.test.ts`,
`tests/discord.forget-card.test.ts`, `tests/store.conversation.test.ts` and
`tests/watch.session-store.durable.test.ts`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-606` | `tests/scheduler.ask-block.test.ts` | A clarify ask blocks: due slots skipped (`{ started: [], skipped: [id] }`), `next_run_at` on the next slot, no run row, `execution_count` unchanged, one wait note with no mention or controls and no second one; after Cancel nothing is made up and the next slot runs with no answer. |
| `REQ-discord-606` | `tests/scheduler.ask-block.test.ts` | Stuck, spend-cap and could-not-start asks block (the last never reaches the auto-pause); the auto-pause ask blocks and `/schedule resume` leaves it open; a daemon's due run waits too and the bridge posts the ask, then the note. |
| `REQ-discord-606` | `tests/scheduler.ask-block.test.ts` | Choose + Cancel / Answer + Cancel with their hints and no reply hint; a spend-cap stop Cancel only with "💸 Work is paused for budget." and a note without amounts; a failed in-process post is posted by the next tick with its controls. |
| `REQ-discord-606` | `tests/scheduler.ask-block.test.ts` | No channel: the ask, controls and note by DM to the owner, none without an owner; the owner's pick reaches the next run unfenced and once; the creator's typed answer is scrubbed at rest and fenced; a closed ask cannot close again. |
| `REQ-discord-606` | `tests/scheduler.ask-block.test.ts` | A v14 DB migrates to v15: the eight columns, earlier asks closed `superseded` (not open, not pending), the schedule runs, a re-run changes nothing; `ask_answer` and `ask_options` are re-scrubbed. |
| `REQ-discord-606` | `tests/discord.schedule-ask.test.ts` | Choose shows the creator the choices privately and a pick closes it `picked`; an unknown option id is expired; Answer opens the form, a thin submit restates, a typed submit closes it scrubbed, `cancel` typed cancels; someone else is refused; the owner's and the creator's Cancel close it; a spend-cap ask takes Cancel only. |
| `REQ-discord-606` | `tests/discord.schedule-ask.test.ts` | Gates: press outside the allowlisted channel and the schedule's channel off the allowlist (zero-width ack, owner tip), deny-listed and muted creator; a channel-less schedule answered in the owner's DM and refused from a guild channel; an injection-like answer closes nothing and pings the owner; a Cancel id on a session ask is refused. |
| `REQ-discord-606` | `tests/discord.schedule-ask.test.ts` | Through the bridge's scheduler: the post carries Choose + Cancel, a channel reply leaves the ask open, Cancel closes it; a channel-less schedule DMs its ask and controls to the owner. |
| `REQ-discord-045` | `tests/discord.schedule-ask.test.ts` | A schedule ask recorded three days before the press still takes the owner's pick (no expiry); session asks keep theirs (`tests/discord.ask-ephemeral.test.ts`, unchanged). |
| `REQ-discord-347` | `tests/scheduler.ask-outbox.test.ts` | Daemon asks reach Discord through the bridge tick as before; the same question pings once after Cancel; only the newest open ask posts; a cancelled ask, a race-finished later run or a deleted schedule leaves nothing; an ask cancelled while a pass posts another is not posted. |
| `REQ-discord-353` | `tests/scheduler.ask-outbox.test.ts`, `tests/scheduler.ask-block.test.ts` | Pre-run failures and the auto-pause still record and post their stuck ask; after Cancel the same failure posts without a ping; the could-not-start ask blocks without reaching the auto-pause; resume leaves the pause ask open. |
| `REQ-discord-548` | `tests/discord.schedule-ask.test.ts`, `tests/scheduler.ask-block.test.ts` | A schedule's free-text ask posts Answer + Cancel; Answer opens the form `cvask:answer:srun_<id>`, whose submit closes the schedule's ask. |
