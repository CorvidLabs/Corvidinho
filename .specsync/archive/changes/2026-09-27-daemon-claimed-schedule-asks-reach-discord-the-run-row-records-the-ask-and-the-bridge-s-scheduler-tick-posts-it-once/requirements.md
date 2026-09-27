---
change: daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once
artifact: requirements
---

# Requirements

- Added REQ-discord-347 (delta `deltas/discord.md`): a schedule run's ask
  is recorded on its run row (schema v11, scrubbed, in `SCRUB_TARGETS`); a
  ticker that can post takes its own run's ask atomically before posting; a
  bridge tick delivers, without awaiting, the newest untaken ask of each
  schedule (a daemon-claimed run) to its allowlisted channel through the
  schedule ask post (owner for stuck / spend-cap, creator for clarify, once
  per question and once per cap episode, pending 80% warning), hands it back
  when the post does not go out, and never posts a moot or deleted
  schedule's ask; the daemon never takes or posts one.
- Modified REQ-discord-108 (delta `deltas/discord.md`): column ownership now
  includes the ask columns (run finish; the ask claim writes only
  `ask_posted_at` with a compare-and-set); one new acceptance bullet.
- Modified REQ-cli-098 (delta `deltas/cli.md`): the daemon's
  `run.needs_human` leaves the recorded ask pending for a bridge and the
  daemon never posts it; one new acceptance bullet.
- HI: AUTONOMY-2, AUTONOMOUS-7 (with AUTONOMY-4, SAFE-8, CLI-8,
  AUTONOMOUS-4, DISCORD-SCHEDULE-3/4, SAFE-6 unchanged). No acceptance
  criteria beyond these captured ids.
