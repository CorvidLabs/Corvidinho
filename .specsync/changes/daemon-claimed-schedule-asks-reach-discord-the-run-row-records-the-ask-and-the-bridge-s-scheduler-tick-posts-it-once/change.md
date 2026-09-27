---
id: daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once
state: verifying
type: feature
base_commit: fc0ed8da6e47dc1db452ee51044cde096db4e8bc
---

# Daemon-claimed schedule asks reach Discord: the run row records the ask and the bridge's scheduler tick posts it once (AUTONOMY-2 / AUTONOMOUS-7 needs-human outbox)

## Intent

Daemon-claimed schedule asks reach Discord: the run row records the ask and the bridge's scheduler tick posts it once (AUTONOMY-2 / AUTONOMOUS-7 needs-human outbox)

## Affected Canonical Specs

- `discord`
- `cli`

## Acceptance Criteria

- A schedule run corvidinho daemon claims that stops with a stuck, clarify or spend-cap ask records the ask (reason + SAFE-6 scrubbed question) on its schedule_runs row (schema v11) and still logs run.needs_human; the bridge's next scheduler tick posts it once to the schedule's allowlisted channel with the schedule prefix and question, pinging the owner for stuck and spend-cap (once per question, and once per cap episode) and the schedule creator for clarify, carrying a pending 80% warning; only the newest pending ask of a schedule posts, none once a later run finished or the schedule was deleted; a refused channel posts nothing, a post that does not go out is retried next tick, a run the bridge posted is never posted again and two tickers never double-post; tick() never waits for delivery; tests/scheduler.ask-outbox.test.ts covers each and fails on the previous code

## No-spec Rationale

Not applicable
