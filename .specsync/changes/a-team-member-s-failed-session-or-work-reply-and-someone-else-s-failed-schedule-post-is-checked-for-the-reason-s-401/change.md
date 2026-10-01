---
id: a-team-member-s-failed-session-or-work-reply-and-someone-else-s-failed-schedule-post-is-checked-for-the-reason-s-401
state: implementing
type: bug_fix
base_commit: b84c75fc3e98ce9d51c30ea215f538d53c18ded8
---

# A team member's failed /session or /work reply, and someone else's failed schedule post, is checked for the reason's 401 with the run's own random ids masked, so an id that happens to contain 401 no longer fails the DISCORD-3.b test

## Intent

A team member's failed /session or /work reply, and someone else's failed schedule post, is checked for the reason's 401 with the run's own random ids masked, so an id that happens to contain 401 no longer fails the DISCORD-3.b test

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- tests/discord.failed-reply.test.ts checks that a team member's failed /session start and /work reply, and someone else's failed schedule post, never show the reason's 401 with the run's own random ids (session, work-task and schedule ids, and the worktree path) masked, so an id that happens to contain 401 no longer fails the test: with every crypto.randomUUID in those tests made to start with 401 the old bare check fails 90 of 90 runs and the new check passes; with natural random ids the /session and /work tests that failed 13 of 1200 runs on main (CI run 36805663978 failed on sess_e096e6401b2c480a) pass 1200 of 1200; no product code changes and the full suite passes

## No-spec Rationale

Not applicable
