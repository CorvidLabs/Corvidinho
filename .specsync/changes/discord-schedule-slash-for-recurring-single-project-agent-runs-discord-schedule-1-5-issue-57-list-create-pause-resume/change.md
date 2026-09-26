---
id: discord-schedule-slash-for-recurring-single-project-agent-runs-discord-schedule-1-5-issue-57-list-create-pause-resume
state: implementing
type: feature
base_commit: 64e3ee175f266a41f4b8181f43f1e70b01d2c396
---

# Discord /schedule slash for recurring single-project agent runs (DISCORD-SCHEDULE-1..5 / issue #57): list create pause resume delete; admin mutations; 5m min interval; steal corvid-agent schedule-commands + scheduler; ticks must not starve HEAR/WATCH ingress; no flock/council/templates/on-chain

## Intent

Discord /schedule slash for recurring single-project agent runs (DISCORD-SCHEDULE-1..5 / issue #57): list create pause resume delete; admin mutations; 5m min interval; steal corvid-agent schedule-commands + scheduler; ticks must not starve HEAR/WATCH ingress; no flock/council/templates/on-chain

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Slash /schedule list|create|pause|resume|delete works (DISCORD-SCHEDULE-1..2); create takes human cadence (cron/@hourly/every Nh) + single project + prompt; mutations ADMIN re-check at handler (empty admin=deny-all); min interval 5m enforced; ticks respect channel/user allowlists+SAFE (DISCORD-SCHEDULE-3); scheduler tick cooperative so HEAR/WATCH ingress stays ≤~1m (DISCORD-SCHEDULE-4); steal corvid-agent schedule-commands/scheduler/db/ADR (no flock/council/templates/on-chain) (DISCORD-SCHEDULE-5); SQLite schedules in shared store; fixture tests; SpecSync+fledge verify green; Made with Corvidinho

## No-spec Rationale

Not applicable
