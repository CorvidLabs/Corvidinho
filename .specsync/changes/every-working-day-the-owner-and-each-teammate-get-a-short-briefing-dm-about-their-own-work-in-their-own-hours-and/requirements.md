---
change: every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and
artifact: requirements
---

# Requirements

- COS-1 (captured in this PR, `hi/cos.md`): "Every working day it DMs me and
  each teammate a short briefing: what changed, what's blocked, what needs
  us, and what it did for us."
- COS-2 (captured): "Each briefing is about that person — their projects,
  their asks, their reviews — and arrives in their own working hours and
  timezone."
- COS-2.a (captured, sub-criterion of COS-2): "Each person's working hours
  and timezone come from the declared people list; without them, it uses my
  timezone and 9am."
- Interview round 17 decisions: built on the scheduler tick (no new loop);
  one briefing per declared owner / team person per working day (Monday to
  Friday in their zone) at the start of their working hours; optional
  timezone + working hours fields on each declared person, editable only
  through the existing `/admin people add` (audited like other people
  changes); missing → the owner's declared zone (else UTC) and 9am; content
  for that person only; skip a day with nothing to say; DM only through the
  bridge; written by a model call bounded to that person's data, scrubbed,
  under the spend caps; never twice a day (persisted per person, module-owned
  table, no schema bump).
- Kept: IDENTITY-7 / 7.a (stable ids; GitHub numeric ids only), IDENTITY-8 /
  10 / 12 (roles: owner and team only), IDENTITY-6 / ADMIN-3.a (only the
  owner changes people, audited), SAFE-5 (audit), SAFE-6 (scrub), SAFE-8 /
  14 / 14.a / AUTONOMY-8.a (spend caps, owner-only spend details), SAFE-12
  (external text fenced), PERSONA-1..3, DISCORD-6 / DISCORD-DENY (mute and
  deny win), PLUGIN-5.a (the schedule toggle gates schedules only).
- Added: REQ-discord-102 (briefings), REQ-agent-102 (the exported no-tools
  completion transport). Modified: REQ-discord-036 (the people keys and
  `/admin people add` options).
- No new env var, config key, slash command, CLI command, schema version or
  protocol version. New optional person keys `timezone` / `working_hours`;
  new optional `/admin people add` options `timezone` / `hours`; new
  module-owned table `cos_briefings` (CREATE TABLE IF NOT EXISTS).
