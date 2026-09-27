---
change: schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write
artifact: docs
---

# Docs

- `docs/DAEMON.md`: shutdown steps gain "kills their agents" and the 3 s
  worktree cleanup; a second signal skips only the 30 s wait; new start-up
  recovery paragraph; `daemon.recovered` in the events table.
- `docs/discord.md` (Session worktrees table): one row for a schedule run at
  bridge stop / restart.
- `specs/discord/discord.spec.md`: scheduler paragraph describes
  REQ-discord-346 (runner column, schema v10, `recoverAbandoned`,
  `settleAbandoned`); the v9 paragraph no longer pins `SCHEMA_VERSION` 9;
  `files:` lists the new test. `specs/cli/cli.spec.md`: daemon invariant and
  `files:` entry. `specs/discord/testing.md` and `specs/cli/testing.md` list
  the new tests. No operator knob, env var, slash command or CLI flag.
