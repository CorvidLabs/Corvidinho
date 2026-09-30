---
change: a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note
artifact: docs
---

# Docs

- `docs/discord.md`: "Questions and owner ping" — schedules post their
  question with Choose / Answer and Cancel (never expiring while open); a
  reply does not answer a schedule's question; the ping-once sentence no
  longer says a schedule re-posts every tick; DMs include a channel-less
  schedule's question; new paragraph "Scheduled questions wait for an
  answer (AUTONOMY-6.a)".
- `docs/DAEMON.md`: a channel-less schedule's question goes to the owner by
  DM; a cancelled ask is not posted; every question blocks its schedule
  (daemon and bridge skip due runs, one note, resume does not answer); the
  `tick` and `run.needs_human` log rows.
- `docs/DISCORD-GO-LIVE.md`: a bullet on scheduled questions blocking, their
  buttons and the owner DM for channel-less schedules.
- `docs/BOX-UPDATE.md`: schema v15 and that questions asked before the
  update are closed by it.
- `specs/discord/discord.spec.md`: files list (`src/discord/schedule-ask.ts`,
  the two new tests), the REQ-discord-347 / 353 paragraphs (hand-back), a new
  AUTONOMY-6.a paragraph, a scenario and the change log;
  `specs/discord/testing.md`. Requirements through the deltas.
- README and STATUS say nothing this makes false.
