---
change: schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write
artifact: requirements
---

# Requirements

- Added REQ-discord-346 (delta `deltas/discord.md`): outcome writes are
  retried once and never swallowed; the bridge stop abandons in-flight runs
  like the daemon; both stops wait at most 3 s for aborted runs to park their
  worktree; each run records its runner (schema v10); bridge and daemon start
  fail runs whose runner is gone (`interrupted: process restarted`) and park
  leftover worktrees of runs this data dir recorded as ended with the existing
  safe branch cleanup, leaving a live runner's run and worktree, and any
  worktree of a run another data dir owns, alone.
- Modified REQ-cli-108 (delta `deltas/cli.md`): the daemon shutdown gains the
  bounded worktree settle step, the start gains the recovery, and the new
  `daemon.recovered` log event; four new acceptance bullets.
- HI: CLI-8, AUTONOMOUS-4, DISCORD-SCHEDULE-2, DISCORD-SCHEDULE-4,
  SESSION-WORKTREE-3. No new acceptance criteria beyond these captured ids.
