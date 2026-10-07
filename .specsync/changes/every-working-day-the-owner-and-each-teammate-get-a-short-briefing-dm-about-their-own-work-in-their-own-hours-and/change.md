---
id: every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and
state: verifying
type: feature
base_commit: a74ad96ce7cf05e5b6727417755611e0be1cffa2
---

# Every working day the owner and each teammate get a short briefing DM about their own work, in their own hours and timezone (COS-1, COS-2, COS-2.a; #102)

## Intent

Every working day the owner and each teammate get a short briefing DM about their own work, in their own hours and timezone (COS-1, COS-2, COS-2.a; #102)

## Affected Canonical Specs

- `discord`
- `agent`

## Acceptance Criteria

- COS-1, COS-2 and COS-2.a (hi/cos.md, captured in this change's PR from Leif's 2026-09-28 interview record, round 17): every working day (Monday to Friday in their time zone) the owner and each declared team member get one short briefing DM about their own work - what changed (their GitHub PRs and issues in allowlisted repos since the last briefing, matched by their numeric GitHub id), what's blocked (their blocked /work tasks), what needs them (review requests, their schedules' open questions, the owner's waiting Approve cards) and what it did for them (their /work tasks and schedule runs finished since the last briefing) - at the start of their working hours in their time zone; zone and hours come from optional timezone / working_hours keys on the declared person (settable with the audited /admin people add), and without them the owner's declared zone (else UTC) and 09:00. Days with nothing to say are skipped; never twice a day (cos_briefings claim); DM only through the bridge's sendDm; written by one read-tier no-tools model call bounded to that person's facts, scrubbed, under the spend caps (a cap stop skips the day and goes to the owner's spend DM). Tests tests/cos.briefing.test.ts and tests/identity.briefing-hours.test.ts (fake LLM, fake clock, fake GitHub, fake DM) fail on the base and pass on the branch.

## No-spec Rationale

Not applicable
