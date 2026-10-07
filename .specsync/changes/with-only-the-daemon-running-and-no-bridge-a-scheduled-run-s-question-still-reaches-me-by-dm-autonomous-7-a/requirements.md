---
change: with-only-the-daemon-running-and-no-bridge-a-scheduled-run-s-question-still-reaches-me-by-dm-autonomous-7-a
artifact: requirements
---

# Requirements

- AUTONOMOUS-7.a (captured with `hi` in this change, `hi/autonomous.md`, from
  Leif's 2026-09-28 interview, round 17): "With only the daemon running and no
  bridge, a scheduled run's question still reaches me by DM." Under
  AUTONOMOUS-7 (on main): "When autonomous work needs a human, it can reach me
  through the configured owner channel (Discord) instead of dying quietly."
- Kept: REQ-discord-347 (a bridge posts a pending ask once; the daemon never
  posts to a channel), REQ-discord-606 / AUTONOMY-6.a (the ask blocks its
  schedule until answered or cancelled; the wait note carries the controls),
  DISCORD-SCHEDULE-3 (live creator / channel gate), SAFE-6 (scrub), DISCORD-8
  (no parsed mentions), SAFE-14.a / SAFE-8 (spend details only to the owner,
  once per cap episode), REQ-cli-108 (the daemon needs no Discord token).
- Added: REQ-discord-707 (the scheduler's owner DM pass and the REST DM
  sender), REQ-cli-707 (the daemon wires it).
- Modified: REQ-discord-347 (the daemon takes an ask only through the owner DM
  pass; a DMed ask is never posted by a bridge), REQ-cli-098 (the daemon DMs
  the ask to the owner while no bridge runs).
- No env var, config key, flag, slash command, CLI command, table, schema or
  package version change.
