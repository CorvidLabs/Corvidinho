---
id: a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note
state: archived
type: feature
base_commit: 156cfa975c6d269b7e3a183cef3c7fdb20cab4f9
---

# A schedule's question can be answered or cancelled by the owner or its creator, and its next runs wait with one note (AUTONOMY-6.a): every recorded schedule run ask (clarify, stuck, spend-cap, could-not-start, auto-pause, SAFE-13 refusal) blocks the schedule until the creator or the live owner answers (Choose / private Answer form) or cancels it on Discord; its post carries Choose or Answer plus Cancel (spend-cap: Cancel only), controls never lapse while open, a channel reply does not answer it; due runs are skipped with no catch-up and one wait note pings nobody; a channel-less schedule's ask, controls and note go to the owner by DM; /schedule resume does not close it; the answer reaches the next run once; schema v15 adds the schedule_runs ask columns and closes legacy asks

## Intent

A schedule's question can be answered or cancelled by the owner or its creator, and its next runs wait with one note (AUTONOMY-6.a): every recorded schedule run ask (clarify, stuck, spend-cap, could-not-start, auto-pause, SAFE-13 refusal) blocks the schedule until the creator or the live owner answers (Choose / private Answer form) or cancels it on Discord; its post carries Choose or Answer plus Cancel (spend-cap: Cancel only), controls never lapse while open, a channel reply does not answer it; due runs are skipped with no catch-up and one wait note pings nobody; a channel-less schedule's ask, controls and note go to the owner by DM; /schedule resume does not close it; the answer reaches the next run once; schema v15 adds the schedule_runs ask columns and closes legacy asks

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Fixture tests (memory / temp SQLite, injected agents, recorded posts and DMs, startBridge with a null gateway and fake interactions) show: every ask a schedule run records (clarify, stuck, spend-cap, a run that could not start, the auto-pause) stays open and the schedule's next due runs are skipped with next_run_at moved to the next slot, no run row and no catch-up, in the bridge and in the daemon; one wait note goes out once per open ask after the ask (no ping, no mention, no amount), to the channel or by DM; the ask post carries Choose + Cancel (listed choices) or Answer + Cancel (free text) with custom ids cvask:open|cancel:srun_<id>, Cancel only for a spend-cap stop whose post still says only 'Work is paused for budget.', and a hint that does not invite a reply; an in-process ask post that does not go out is handed back and posted by the next tick; a schedule with no channel sends the ask, its controls and the note to the owner by DM (none without an owner); only the creator or the live owner can pick, submit the private Answer form or Cancel, in the schedule's still-allowlisted channel (or the owner's DM for a channel-less schedule), past the actor and mute / rate gates, with anyone else and a closed ask getting 'isn't for you'; a thin form answer restates privately, 'cancel' typed cancels, a non-owner's injection-like answer closes nothing and pings the owner; a pick or typed answer (SAFE-6 scrubbed) reaches the next run once, the owner's as given and the creator's fenced; the controls work on an ask days old; a channel reply does not close it; /schedule resume does not close it; schema v15 adds the eight schedule_runs ask columns forward-only and idempotently and closes asks recorded before it (superseded, never blocking or posted); ask_answer and ask_options are re-scrub targets. The new and rewritten tests fail on main's sources and pass on the branch.

## No-spec Rationale

Not applicable
