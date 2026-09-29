---
change: scheduler-refuses-a-zero-cron-step-0-a-b-0-n-0-as-a-cadenceerror-and-bounds-cron-ranges-at-the-field-maximum-so
artifact: requirements
---

# Requirements

- REQ-discord-020 (captured): cadence SHALL enforce the 5-minute minimum at
  create time; AC "Cadence `<5m` refused". A cadence that hangs the parser
  gets neither a refusal nor an acceptance.
- DISCORD-SCHEDULE-4 (captured in `hi/discord.md`): ingress responsiveness
  stays within ~1 minute for live Discord / GitHub mentions — a parser hang
  in the bridge process stops all of it.
- Leif's 2026-09-28 interview (W12 seed, no new criteria): refuse a zero cron
  step as a `CadenceError`; also guard any other step/range form that could
  loop forever; regression tests fail on main under a timeout.
- Modify REQ-discord-020 (delta `deltas/discord.md`): a zero step in any
  field is a `CadenceError` before expansion (reply, nothing created, the
  store's next-run computation throws the same); a range is expanded only up
  to its field's maximum; no cadence hangs the bridge. Two new AC bullets.
- No new REQ id, hi id, env var, config key, command, option or schema change.
