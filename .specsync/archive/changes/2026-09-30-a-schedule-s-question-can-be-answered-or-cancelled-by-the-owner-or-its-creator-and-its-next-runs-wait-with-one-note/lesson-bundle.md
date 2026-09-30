# Lesson bundle — a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A schedule's question can be answered or cancelled by the owner or its creator, and its next runs wait with one note (AUTONOMY-6.a): every recorded schedule run ask (clarify, stuck, spend-cap, could-not-start, auto-pause, SAFE-13 refusal) blocks the schedule until the creator or the live owner answers (Choose / private Answer form) or cancels it on Discord; its post carries Choose or Answer plus Cancel (spend-cap: Cancel only), controls never lapse while open, a channel reply does not answer it; due runs are skipped with no catch-up and one wait note pings nobody; a channel-less schedule's ask, controls and note go to the owner by DM; /schedule resume does not close it; the answer reaches the next run once; schema v15 adds the schedule_runs ask columns and closes legacy asks
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/store/db.ts, src/store/scrub.ts, src/scheduler/store.ts, src/scheduler/service.ts, src/discord/ask-buttons.ts, src/discord/ask-ping.ts, src/discord/schedule-ask.ts, src/discord/bridge.ts, tests/scheduler.ask-block.test.ts, tests/discord.schedule-ask.test.ts, tests/scheduler.ask-outbox.test.ts, tests/discord.ask-ping.test.ts, tests/discord.approval-cards.test.ts, tests/discord.forget-card.test.ts, tests/store.conversation.test.ts, tests/watch.session-store.durable.test.ts, docs/discord.md, docs/DAEMON.md, docs/DISCORD-GO-LIVE.md, docs/BOX-UPDATE.md, specs/discord
- **Acceptance**: Fixture tests (memory / temp SQLite, injected agents, recorded posts and DMs, startBridge with a null gateway and fake interactions) show: every ask a schedule run records (clarify, stuck, spend-cap, a run that could not start, the auto-pause) stays open and the schedule's next due runs are skipped with next_run_at moved to the next slot, no run row and no catch-up, in the bridge and in the daemon; one wait note goes out once per open ask after the ask (no ping, no mention, no amount), to the channel or by DM; the ask post carries Choose + Cancel (listed choices) or Answer + Cancel (free text) with custom ids cvask:open|cancel:srun_<id>, Cancel only for a spend-cap stop whose post still says only 'Work is paused for budget.', and a hint that does not invite a reply; an in-process ask post that does not go out is handed back and posted by the next tick; a schedule with no channel sends the ask, its controls and the note to the owner by DM (none without an owner); only the creator or the live owner can pick, submit the private Answer form or Cancel, in the schedule's still-allowlisted channel (or the owner's DM for a channel-less schedule), past the actor and mute / rate gates, with anyone else and a closed ask getting 'isn't for you'; a thin form answer restates privately, 'cancel' typed cancels, a non-owner's injection-like answer closes nothing and pings the owner; a pick or typed answer (SAFE-6 scrubbed) reaches the next run once, the owner's as given and the creator's fenced; the controls work on an ask days old; a channel reply does not close it; /schedule resume does not close it; schema v15 adds the eight schedule_runs ask columns forward-only and idempotently and closes asks recorded before it (superseded, never blocking or posted); ask_answer and ask_options are re-scrub targets. The new and rewritten tests fail on main's sources and pass on the branch.

## Evidence

- Verification commit: `9f8355eb617ee6786d4f386d98164fc14ad6ae4d`
- Base commit: `156cfa975c6d269b7e3a183cef3c7fdb20cab4f9`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Issue #124 (M4 "Safe autonomy"). Leif's 2026-09-28 interview, round 8
(/home/user/coord/interview-2026-09-28.md): "AUTONOMY-6: schedule asks
answerable + blocking — creator or owner can answer/cancel (Choose or free
text); later ticks skipped with one note until answered; then resume",
captured on main (hi/autonomy.md) as **AUTONOMY-6.a** "A scheduled run's
question can be answered or cancelled by me or the schedule's creator, and
the schedule's next runs wait, with one note, until it is." (parent
**AUTONOMY-6** "Session stays blocked until a substantive answer or an
explicit cancel."). Round 10 settled free-text asks as "public stub +
private modal" (DISCORD-ASK-4.a). Nothing new is captured in this change.

On main (156cfa9, schema v14) a schedule run's ask (REQ-discord-347 /
REQ-discord-353) is recorded on its `schedule_runs` row, posted once as text
with no buttons, never answered and never blocking: the schedule keeps
running every slot, re-posting the same question unpinged; a schedule with
no channel posts nothing at all.

Planned scope (/home/user/coord/pr-schedule-ask-block.json) and the
schedules-owner defaults (/home/user/coord/m34-defaults.md): every recorded
run ask blocks, including the could-not-start and auto-pause asks;
`/schedule resume` does not close an open ask; schedule ask controls never
lapse while open (DISCORD-ASK-5's ~30-minute expiry stays for session asks;
the reconciliation is recorded in REQ-discord-045); a channel-less
schedule's ask, controls and note go to the live owner by DM and presses
there skip the channel check; a channel reply does NOT answer a schedule
ask — only Choose, Answer (private modal) and Cancel. Schema v15,
forward-only, closing legacy asks. Spend-cap asks get Cancel only
(continuing is spend-caps-c) and keep #317's "Work is paused for budget."
rule. Reuse #316's `sendDm` and the DISCORD-ASK buttons and Answer modal.
Out of scope: owner-role schedule runs (schedule-owner-role),
`src/plugins/run.ts` / `must-ask.ts` and provider / tier code (other PRs
in parallel), #232/#233.

## From the change's design.md

# Design

**State on the run row.** A schedule's question is the ask its newest
finished run recorded; it is *open* while `ask_blocking = 1` and
`ask_closed_at IS NULL` and no later run of the schedule finished (the same
"newest finished run" rule REQ-discord-347 uses for staleness, so a moot ask
never blocks). Closing is one compare-and-set (`closeRunAsk`) recording
`ask_outcome` / `ask_answer` (scrubbed) / `ask_closed_by`, so two presses,
or a press and another process, close it once. Everything lives in the
shared SQLite DB, so the bridge and `corvidinho daemon` agree and the
controls survive restarts — which is why they need no expiry.

**Waiting.** `tick()` asks `openAsk` before claiming a due run; with one
open, `skipForOpenAsk` moves `next_run_at` to the next cron slot with the
claim's compare-and-set (no run row, counters unchanged; nothing is made up
once it closes) and stamps `ask_skip_at`. The delivery pass (bridge only)
then posts one wait note per open ask that waited and was posted, taken with
a compare-and-set on `ask_note_at` and handed back on failure. The note
mentions nobody, names no amount and carries the ask's controls, so an ask
whose post was lost (a crash between its claim and its post, a deleted
message) is not a permanent block (review fix).

**Posting.** Every ask post carries one button row reusing the DISCORD-ASK
custom ids with the run id as the ask id: Choose (`cvask:open`) when the
stored choices list, else Answer (same `open` id, opening the private form),
then Cancel (`cvask:cancel`, a new kind). A spend-cap stop: Cancel only, and
its content stays "💸 Work is paused for budget." (no hint). Because an open
ask blocks the schedule there is no next run to re-post it, so every
in-process post that does not go out is handed back to the delivery pass.
A schedule with no channel goes to the live owner through
`SchedulerOutbound.dm` (the bridge's `sendDm`, the #316 engine's path).

**Presses.** `handleScheduleAskPress` (src/discord/schedule-ask.ts) keeps
the session-ask gate order: channel (the schedule's channel and the press
channel still allowlisted; a channel-less schedule only in a DM), actor
gate, mute / rate, then open + creator-or-live-owner. Pick → `picked`;
Answer form → scrubbed; `cancel` typed → cancelled; thin → restated
privately (AUTONOMY-5); a non-owner's injection-like text → refused, owner
pinged (SAFE-13, scanned once here); Cancel → cancelled. Nothing runs at the
press: the next due slot does.

**The answer.** `answeredAsk` returns the newest finished run's closed
answer; `runOne` appends the question and the answer to the prompt (owner as
given, others fenced, `ask-pick` / `ask-answer`). Once that run finishes it
is the newest, so the answer reaches one run.

**Migration.** v15 adds the columns with `ALTER TABLE … ADD COLUMN` (a
present column is skipped). Inside the `version < 15` step, an earlier ask
still pending (never posted) on its schedule's newest finished run becomes
blocking, so the next delivery pass posts it with its controls instead of
dropping it (a daemon's question waiting for a bridge, a handed-back pause
ask); every other earlier ask (posted without a Cancel, or moot) closes as
`superseded`, so re-running changes nothing and no schedule starts out
waiting on a question that had no Cancel (review fix).

**Paused schedules.** Closing a question does not resume a paused schedule
(auto-pause, SAFE-13 refusal): the private ack adds
`SCHEDULE_ASK_PAUSED_NOTE` (review fix).

Risks: a press path that forgot a gate (covered by the gate tests); two
tickers skipping or noting twice (compare-and-sets); a moot ask blocking
forever (newest-finished-run rule); a channel-less schedule without an owner
waits with nobody told (documented; pending Leif).

## From the change's testing.md

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
| `REQ-discord-606` | `tests/scheduler.ask-block.test.ts` | A clarify ask blocks: due slots skipped (`{ started: [], skipped: [id] }`), `next_run_at` on the next slot, no run row, `execution_count` unchanged, one wait note with no mention and the ask's controls, and no second one; after Cancel nothing is made up and the next slot runs with no answer. |
| `REQ-discord-606` | `tests/scheduler.ask-block.test.ts` | Stuck, spend-cap and could-not-start asks block (the last never reaches the auto-pause); the auto-pause ask blocks and `/schedule resume` leaves it open; a daemon's due run waits too and the bridge posts the ask, then the note; an ask claimed but never posted still gets its controls on the note. |
| `REQ-discord-606` | `tests/scheduler.ask-block.test.ts` | Choose + Cancel / Answer + Cancel with their hints and no reply hint; a spend-cap stop Cancel only with "💸 Work is paused for budget." and a note without amounts; a failed in-process post is posted by the next tick with its controls. |
| `REQ-discord-606` | `tests/scheduler.ask-block.test.ts` | No channel: the ask, controls and note by DM to the owner, none without an owner; the owner's pick reaches the next run unfenced and once; the creator's typed answer is scrubbed at rest and fenced; a closed ask cannot close again. |
| `REQ-discord-606` | `tests/scheduler.ask-block.test.ts` | A v14 DB migrates to v15: the eight columns, earlier posted or moot asks closed `superseded` (not open, not pending) and that schedule runs, a still-pending earlier ask open and blocking and posted with Answer + Cancel, a re-run changes nothing; `ask_answer` and `ask_options` are re-scrubbed. |
| `REQ-discord-606` | `tests/discord.schedule-ask.test.ts` | Choose shows the creator the choices privately and a pick closes it `picked`; an unknown option id is expired; Answer opens the form, a thin submit restates, a typed submit closes it scrubbed, `cancel` typed cancels; someone else is refused; the owner's and the creator's Cancel close it; a spend-cap ask takes Cancel only. |
| `REQ-discord-606` | `tests/discord.schedule-ask.test.ts` | Gates: press outside the allowlisted channel and the schedule's channel off the allowlist (zero-width ack, owner tip), deny-listed and muted creator; a channel-less schedule answered in the owner's DM and refused from a guild channel; an injection-like answer closes nothing and pings the owner; a Cancel id on a session ask is refused; on a paused schedule the ack adds `SCHEDULE_ASK_PAUSED_NOTE`. |
| `REQ-discord-606` | `tests/discord.schedule-ask.test.ts` | Through the bridge's scheduler: the post carries Choose + Cancel, a channel reply leaves the ask open, Cancel closes it; a channel-less schedule DMs its ask and controls to the owner. |
| `REQ-discord-045` | `tests/discord.schedule-ask.test.ts` | A schedule ask recorded three days before the press still takes the owner's pick (no expiry); session asks keep theirs (`tests/discord.ask-ephemeral.test.ts`, unchanged). |
| `REQ-discord-347` | `tests/scheduler.ask-outbox.test.ts` | Daemon asks reach Discord through the bridge tick as before; the same question pings once after Cancel; only the newest open ask posts; a cancelled ask, a race-finished later run or a deleted schedule leaves nothing; an ask cancelled while a pass posts another is not posted. |
| `REQ-discord-353` | `tests/scheduler.ask-outbox.test.ts`, `tests/scheduler.ask-block.test.ts` | Pre-run failures and the auto-pause still record and post their stuck ask; after Cancel the same failure posts without a ping; the could-not-start ask blocks without reaching the auto-pause; resume leaves the pause ask open. |
| `REQ-discord-548` | `tests/discord.schedule-ask.test.ts`, `tests/scheduler.ask-block.test.ts` | A schedule's free-text ask posts Answer + Cancel; Answer opens the form `cvask:answer:srun_<id>`, whose submit closes the schedule's ask. |

## Where these lessons go

- `specs/discord/context.md`
