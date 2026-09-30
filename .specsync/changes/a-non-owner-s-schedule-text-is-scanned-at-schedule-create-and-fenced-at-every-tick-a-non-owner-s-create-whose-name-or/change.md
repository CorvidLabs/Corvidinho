---
id: a-non-owner-s-schedule-text-is-scanned-at-schedule-create-and-fenced-at-every-tick-a-non-owner-s-create-whose-name-or
state: approved
type: bug_fix
base_commit: 5aaf7f0d471a19ac310b9dcc68fc7754207345ea
---

# A non-owner's schedule text is scanned at /schedule create and fenced at every tick: a non-owner's create whose name or prompt looks like an injection stores nothing, gets a private refusal, pings only the owner and appends an injection-suspected audit row; each tick re-resolves the creator's role, fences a non-owner's stored name and prompt as untrusted data, and stored text that trips the detector runs nothing, pauses the schedule and tells the owner once; the owner's own schedules are unchanged (SAFE-12/13)

## Intent

A non-owner's schedule text is scanned at /schedule create and fenced at every tick: a non-owner's create whose name or prompt looks like an injection stores nothing, gets a private refusal, pings only the owner and appends an injection-suspected audit row; each tick re-resolves the creator's role, fences a non-owner's stored name and prompt as untrusted data, and stored text that trips the detector runs nothing, pauses the schedule and tells the owner once; the owner's own schedules are unchanged (SAFE-12/13)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Through the slash dispatcher and SchedulerService (tests/scheduler.injection.test.ts): a community user's and a declared team member's /schedule create whose prompt (or name alone) trips the SAFE-13 detector stores no schedule, gets one ephemeral refusal that never quotes the text, produces exactly one post in the channel pinging only the owner (allowed mentions the owner only) and appends one injection-suspected / denied row (actor the user, surface discord:/schedule); an ordinary non-owner create is still the quiet ephemeral not-authorized with no post or row; the owner's create is never scanned. On every tick the creator's role is re-resolved (resolveDiscordActingRole with the live people list and mute set): a benign community schedule runs with its name and prompt inside the UNTRUSTED_DATA fence (role: community, source=schedule-prompt) and the name not outside it, a declared team member's as role: team (community when muted); the owner's schedule reads exactly as before, unfenced and unscanned; a pre-existing stored community or team schedule whose prompt or name trips the detector runs nothing, is recorded failed with a stuck ask, is paused, posts one ask pinging only the owner that never quotes the text, and appends one denied row (surface scheduler:<id>); a later tick posts nothing more; a daemon tick (no outbound) leaves that ask pending and a bridge tick posts it; through startBridge the row lands on the bridge's audit_log. The new tests fail on main and pass on the branch; schedule posts, asks and SAFE-3.a are unchanged; no env var, config key, table, column or schema version.

## No-spec Rationale

Not applicable
