---
id: schedule-auto-pause-and-pre-run-failures-record-a-stuck-ask-on-the-run-row-so-the-owner-is-pinged-once-through-the
state: implementing
type: feature
base_commit: fbaa84b7cda1bf2b462baea44cad20ef93e0df4f
---

# Schedule auto-pause and pre-run failures record a stuck ask on the run row so the owner is pinged once through the existing schedule ask post and the bridge delivery pass (AUTONOMY-2)

## Intent

Schedule auto-pause and pre-run failures record a stuck ask on the run row so the owner is pinged once through the existing schedule ask post and the bridge delivery pass (AUTONOMY-2)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A schedule run whose failure makes FAILURE_AUTO_PAUSE (5) in a row records, in the same run-finish write, a stuck ask on its schedule_runs row saying the schedule is paused and to resume it with /schedule resume (plus the run's own question when it had one); a run that cannot start because its project cannot be resolved or its worktree cannot be created is recorded failed with the full error and a stuck ask with fixed text (no host path); the bridge posts either ask in-process at once, or its next scheduler tick posts one a daemon run left pending, once, to the schedule channel with the owner pinged once per question, and the pausing run's ask replaces its plain failure post; a run refused by the DISCORD-SCHEDULE-3 gate still posts nothing and its pause ask waits until the gate passes; tests/scheduler.ask-outbox.test.ts and tests/scheduler.service.test.ts cover each and fail on the previous code

## No-spec Rationale

Not applicable
