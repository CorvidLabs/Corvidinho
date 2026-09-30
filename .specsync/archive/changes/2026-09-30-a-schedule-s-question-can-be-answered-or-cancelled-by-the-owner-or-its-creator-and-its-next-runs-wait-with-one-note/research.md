---
change: a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note
artifact: research
---

# Research

Where a schedule's ask lives on main and what changes:

| Piece | Main (156cfa9) | This change |
|---|---|---|
| Run row (`src/scheduler/store.ts`) | `ask_reason`, `ask_question`, `ask_posted_at` (v11) | + `ask_options`, `ask_blocking`, `ask_closed_at`, `ask_outcome`, `ask_answer`, `ask_closed_by`, `ask_skip_at`, `ask_note_at` (v15); open = newest finished run, blocking, not closed |
| Tick (`SchedulerService.tick`) | claims every due run | skips a due run while its schedule has an open ask (`skipForOpenAsk`: the claim's CAS on `next_run_at`, no run row) |
| In-process ask post (`postOwnRunAsk`) | not retried unless the auto-pause (`handBack`) | always handed back when it does not go out (the schedule has no next run) |
| Delivery pass (`deliverPendingAsks`) | channel schedules only; no buttons | + channel-less schedules to the owner's DM; + one wait note per open ask |
| Post (`postRunAsk` → `formatAskReply`) | question as text | + `hint` and `scheduleAskComponents` (Choose/Answer + Cancel; Cancel only for spend-cap) |
| Press (`bridge.ts` `onComponent`) | session asks only (`store.findPendingAsk`) | `srun_` ask ids routed to `handleScheduleAskPress` |
| Next run prompt (`runOne`) | schedule prompt only | + the answered question and the answer (`answeredAsk`), fenced for non-owners |

Reuse: the DISCORD-ASK controls (`openCustomId`, `pickCustomId`,
`answerCustomId`, `buildChoiceComponents`, `buildAnswerModal`,
`normalizeAskAnswer`, `formatAskEphemeralContent`), the press gates
(`componentChannelAllowlisted`, `gateActor`, `gateRateOrMute`,
`resolvePermissionLevel`), AUTONOMY-5/6 helpers (`isThinAck`,
`isCancelAsk`), SAFE-12/13 (`inboundInjection`, `refuseInjectedAnswer`,
`fenceSpeakerText`) and the bridge's `sendDm` (the #316 approval engine's
DM path). The ask id is the run id (`srun_<12 hex>`), which never collides
with a session ask id (12 hex) and stays within Discord's 100-char custom_id.

Why a schema change: an open ask must be durable (the controls never lapse
and survive restarts; the daemon and the bridge share the data dir), so its
closed / skipped / noted state and the answer must live on the run row;
columns on `schedule_runs` are the smallest shape (no new table).
