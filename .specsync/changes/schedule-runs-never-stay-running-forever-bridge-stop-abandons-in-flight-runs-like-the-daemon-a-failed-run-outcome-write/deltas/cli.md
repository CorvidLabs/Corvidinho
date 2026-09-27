---
module: cli
change: schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write
---

# Delta — cli (daemon parks abandoned runs' worktrees and recovers at start)

## Modified

### REQUIREMENT REQ-cli-108

The CLI SHALL expose `corvidinho daemon`. It ticks the shared SQLite schedules
table on the existing 60 s poll with no Discord token and no REPL (CLI-8,
AUTONOMOUS-4). It SHALL use the bridge's scheduler gates: the channel
allowlist re-check (DISCORD-SCHEDULE-3), per-run worktrees
(SESSION-WORKTREE), and non-interactive agent spawns (SAFE-1). It SHALL add no
new environment variables.

Only one daemon SHALL run per data dir. The daemon SHALL create
`<data dir>/daemon.lock` exclusively, recording its pid and Linux process
start time. A second daemon SHALL log `daemon.lock_held` naming the holder's
pid and exit 1. A lock whose pid is gone, or whose pid now belongs to
another process, SHALL be taken over.

On SIGTERM or SIGINT the daemon SHALL:
- stop ticking;
- wait up to 30 s for in-flight runs;
- kill the process tree of any run still going (the spawned agent and
  everything it started, REQ-plugins-154) and record it as failed
  (`interrupted: daemon shutdown`);
- wait up to 3 s more (a second signal does not skip this) for those runs to
  park their worktree and delete their empty `talk/schedule_*` branch (a
  branch with commits is kept, REQ-discord-346);
- remove its lock and exit 0.

A second signal SHALL skip the rest of the wait.

Before its first tick the daemon SHALL run the scheduler's start-up recovery
(REQ-discord-346): runs a dead process left `running` are recorded as failed
(`interrupted: process restarted`) and leftover schedule-run worktrees are
removed, keeping any branch with commits; runs another live bridge or daemon
on the same data dir owns are left alone. When it fixed something it SHALL log
`daemon.recovered` with the recovered run ids (`runs`) and the number of
worktrees removed (`worktrees`).

Daemon logs SHALL be one JSON object per line on stdout
(`ts`, `level`, `component`, `event`, then fields), with every string value
scrubbed (SAFE-6). `docs/DAEMON.md` SHALL document a systemd unit and leave
restarts to systemd's own `Restart=`. Heartbeats, crash DMs and running the
bridge/watch inside the daemon are out of scope (draft OPS-3..5).

Acceptance Criteria
- `corvidinho daemon` with a temp data dir logs `daemon.started`, creates `daemon.lock`, and exits 0 on SIGTERM with the lock removed.
- A second daemon on the same data dir exits 1 with `daemon.lock_held` and the holder pid.
- A lock from a dead or recycled pid is taken over; an unreadable lock younger than 5 s is not.
- A due schedule is run headlessly and logged as `run.finished`; a non-allowlisted channel is refused without running the agent.
- Stop after the grace records stragglers as failed and frees the lock; a forced stop skips the grace.
- A straggler spawned through the real spawn client (fake `sh` bin with a same-group and a `setsid` grandchild) has its whole tree killed at shutdown.
- Log lines parse as JSON, and secrets in fields are redacted.
- `--help` lists `daemon`.
- Stop after the grace removes an abandoned run's worktree and empty `talk/schedule_*` branch before it resolves; a branch with commits is kept.
- After `kill -9` of a daemon mid-run, the next start records that run as failed (`interrupted: process restarted`), removes its worktree and branch, and logs `daemon.recovered`.
- Start removes a leftover worktree of a run already recorded as failed and leaves worktrees with other names alone.
