---
change: daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once
artifact: docs
---

# Docs

- `docs/DAEMON.md`: "Running next to the Discord bridge" says a daemon run
  that stops to ask records its question and the bridge's next tick posts it
  once (owner for stuck / spend-cap, creator for clarify; only the newest;
  none once a later run finished; waits for a bridge when only the daemon
  runs); the log events table lists `run.needs_human`.
- `docs/DISCORD-GO-LIVE.md` (E.4): the daemon never posts itself, but a
  daemon run that asks a human is posted by the bridge's next tick.
- `docs/BOX-UPDATE.md`: the shared DB is schema v11.
- `specs/discord/discord.spec.md`: needs-human outbox paragraph (schema v11,
  store and service API), `files:` lists the new test; the v10 sentence no
  longer pins `SCHEMA_VERSION`. `specs/cli/cli.spec.md`: the daemon's
  `run.needs_human` leaves the ask pending for a bridge.
  `specs/discord/testing.md` and `specs/cli/testing.md` list the new tests.
- No operator knob, env var, slash command or CLI flag.
