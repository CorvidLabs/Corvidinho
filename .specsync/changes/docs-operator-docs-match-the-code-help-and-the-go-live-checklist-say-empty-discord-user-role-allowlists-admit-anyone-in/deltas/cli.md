---
module: cli
change: docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in
---

# Delta: cli (--help and docs/DAEMON.md match the code)

## Modified

### REQUIREMENT REQ-cli-005

Help/STATUS/README SHALL document bot-VM allowlist file + env overlays, default-deny (empty = refuse), and that AlgoChat/wallet ACT is deferred until a wallet allowlist exists (ALLOW-4, WALLET-1..3).

Acceptance Criteria
- `corvidinho --help` mentions allowlist file/env vars.
- STATUS/README note how to set allowlists on the bot VM; wallets deferred.
- `corvidinho --help` says an empty Discord channel list refuses start, users and roles both empty admit anyone in an allowlisted channel, and once either is set only those users, role holders and the owner (REQ-discord-043); no `--help` row naming the Discord `_USERS` / `_ROLES` allowlists says empty = refuse or deny-all.

### REQUIREMENT REQ-cli-108

The CLI SHALL expose `corvidinho daemon`. It ticks the shared SQLite schedules
table on the existing 60 s poll with no Discord token and no REPL (CLI-8,
AUTONOMOUS-4). It SHALL use the bridge's scheduler gates: the channel
allowlist and schedule-creator re-check (DISCORD-SCHEDULE-3, REQ-discord-020),
with the configured owner loaded at start (IDENTITY-1) so the owner's
schedules pass the creator gate as they do in the bridge, per-run worktrees
(SESSION-WORKTREE), and non-interactive agent spawns (SAFE-1). Before each
tick the daemon SHALL re-read the allowlist the way start loads it (file, env
overlays and `DISCORD_CHANNEL_IDS`) and SHALL gate that tick's runs against
it, so an `/admin` edit the bridge writes to the file applies on the next
tick without a restart. When the file exists but cannot be read or parsed the daemon SHALL
skip that tick (fail closed, ALLOW-4): log `tick.allowlist_failed` with the
loader's value-free error, start no run, and leave due schedules due. A
tick still re-reading the allowlist when stop begins SHALL start no run (the
stop only drains runs already claimed). It SHALL add no new environment
variables.

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
(`interrupted: process restarted`) and leftover worktrees of runs this data
dir recorded as ended are removed, keeping any branch with commits; runs
another live bridge or daemon on the same data dir owns are left alone, and a
schedule-run worktree whose run this data dir does not know (another data
dir's) is never touched. When it fixed something it SHALL log
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
- A channel removed from the allowlist file after start, or a creator added to its `deny_users`, is refused on the next tick without running the agent (`run.finished` with `channel not allowlisted: …` / `creator not allowlisted: …`).
- A malformed allowlist file makes the next tick log `tick.allowlist_failed` and run nothing; once the file is fixed, the still-due schedule runs on the following tick.
- With a non-empty user list that omits the owner, the configured owner's schedule still runs; an unlisted non-owner creator's schedule is refused.
- A tick still re-reading the allowlist when SIGTERM stops the daemon claims no run: the due schedule gets no run row and the stop drains without abandoning anything.
- Stop after the grace records stragglers as failed and frees the lock; a forced stop skips the grace.
- A straggler spawned through the real spawn client (fake `sh` bin with a same-group and a `setsid` grandchild) has its whole tree killed at shutdown.
- Log lines parse as JSON, and secrets in fields are redacted.
- `--help` lists `daemon`.
- Stop after the grace removes an abandoned run's worktree and empty `talk/schedule_*` branch before it resolves; a branch with commits is kept.
- After `kill -9` of a daemon mid-run, the next start records that run as failed (`interrupted: process restarted`), removes its worktree and branch, and logs `daemon.recovered`.
- Start removes a leftover worktree of a run already recorded as failed and leaves worktrees with other names alone.
- Start never touches a schedule-run worktree whose run another data dir owns, even when the daemon's project root is that worktree: its uncommitted files and branch stay.
- The `docs/DAEMON.md` Logs table has a row for every event `src/daemon/daemon.ts` logs, including `daemon.start_failed` (start refused, exit 1, `message` gives the reason) and `spend.warning` (warn, `spentMicroUsd`, `capMicroUsd`, `percent`).
- The `docs/DAEMON.md` Configuration row for the allowlists says an empty channel list refuses every schedule that has a channel and that users and roles both empty leave only the channel gate and the deny lists, so any creator's schedule runs (REQ-discord-020); it never says empty means deny-all.
