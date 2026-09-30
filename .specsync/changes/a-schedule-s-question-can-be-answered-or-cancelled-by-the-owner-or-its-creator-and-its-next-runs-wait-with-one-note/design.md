---
change: a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note
artifact: design
---

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
