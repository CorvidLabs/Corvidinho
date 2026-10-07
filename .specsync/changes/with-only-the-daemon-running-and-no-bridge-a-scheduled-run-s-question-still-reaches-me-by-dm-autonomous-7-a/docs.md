---
change: with-only-the-daemon-running-and-no-bridge-a-scheduled-run-s-question-still-reaches-me-by-dm-autonomous-7-a
artifact: docs
---

# Docs

- `docs/DAEMON.md`: new section "With no bridge running: the owner gets the
  question by DM (AUTONOMOUS-7.a)"; the does / does-not table, the "Running
  next to the Discord bridge" bullet (no longer "waits until a bridge
  starts"), the Configuration intro and a row for the optional token and
  owner, the Logs table (`ownerDm` on `daemon.started`, `run.needs_human`,
  `schedule_ask.dm_sent`, `schedule_ask.dm_failed` / `schedule_ask.dm_error`,
  `schedule_ask.dm_unavailable`) and the Shutdown steps.
- `docs/DISCORD-GO-LIVE.md` E.4: the daemon reads the bot token and owner
  too, and DMs the owner a schedule's question while no bridge runs.
- `docs/discord.md`: the SAFE-13 schedule line, the ask-ping paragraph (the
  daemon's DM is one of the DMs) and a new AUTONOMOUS-7.a paragraph after the
  AUTONOMY-6.a one.
- `README.md` "Schedule daemon" and `.env.example` (the token block): one
  line each.
- Specs: `specs/discord/discord.spec.md` (files, Public API, invariant,
  scenario, change log), `specs/cli/cli.spec.md` (files, types row, invariant,
  change log), both `testing.md` evidence sections; REQ-discord-707 and
  REQ-cli-707 added, REQ-discord-347, REQ-discord-353 and REQ-cli-098 modified through the
  deltas.
- `hi/autonomous.md` and `INTENT.md` from the `hi` capture.
- No CHANGELOG, STATUS or package.json edit (the release PR writes them).
