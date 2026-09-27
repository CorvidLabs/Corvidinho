# Schedule daemon — `corvidinho daemon`

A headless process that keeps `/schedule` work ticking on the Linux host
without Discord and without anyone sitting at a REPL (**CLI-8**,
**AUTONOMOUS-4**). It runs the same scheduler as the Discord bridge: a 60 s
poll, at most 2 runs at once, no catch-up, and auto-pause after 5 failures in
a row. Each run gets its own worktree (SESSION-WORKTREE). A run whose channel
is not on the allowlist is refused (DISCORD-SCHEDULE-3). Agents it spawns run
non-interactive, so dangerous tools stay denied unless allowlisted (SAFE-1).

```bash
cd /path/to/Corvidinho          # default project root for relative schedule projects
bun src/cli.ts daemon
```

## What it does and does not do

| Does | Does not (not captured in `hi/`) |
|------|----------------------------------|
| Ticks every active schedule in `<data dir>/corvidinho.db` | Run the Discord bridge or GitHub watch for you |
| Records each run in the schedule's run history | Post run results to Discord (only the bridge can) |
| Refuses a second daemon on the same data dir | Restart itself: restarts are systemd's `Restart=` |
| Stops cleanly on SIGTERM / SIGINT | Heartbeats, `/status` uptime per part, crash DMs (draft OPS-3..5) |

Schedules are still created, paused, resumed and deleted from Discord
(`/schedule`, ADMIN only). The daemon picks up those changes on its next tick.

## Running next to the Discord bridge

The bridge has its own schedule ticker. You can run the bridge and the daemon
on the same data dir:

- Every tick first re-reads the `schedules` table.
- Each due run is **claimed atomically in SQLite**, so it fires once, in
  whichever process claims it first.
- Updates write only the columns they own. A run that ends in the daemon
  never undoes a `/schedule pause` made in the bridge.
- A run the bridge claims is posted to the schedule's channel. A run the
  daemon claims is only recorded in the run history, because the daemon has
  no Discord connection.

## Configuration

The daemon uses the same environment as the bridge. It adds no new variables.

| Env | Purpose |
|-----|---------|
| `CORVIDINHO_DATA_DIR` | Data dir holding `corvidinho.db` and `daemon.lock` (default `~/.local/share/corvidinho`) |
| `CORVIDINHO_BIN` | Agent binary to spawn per run (default `<cwd>/src/cli.ts`) |
| `CORVIDINHO_ALLOWLIST_FILE`, `CORVIDINHO_DISCORD_ALLOW_CHANNELS`, `DISCORD_CHANNEL_IDS`, … | The same allowlists as the bridge. Empty means deny-all. |
| `CORVIDINHO_LLM_API_KEY` / … | Provider for the spawned `task run` (never commit) |

## Single instance

At start the daemon creates `<data dir>/daemon.lock` with `O_EXCL`. The file
holds the daemon's pid and its `/proc` start time. A second daemon on the same
data dir logs `daemon.lock_held` with the holder's pid and exits **1**.

A lock left by a crash is stale when its pid is gone or the pid now belongs to
another process (the start time differs). The next start takes a stale lock
over, so a crash never blocks a restart.

## Shutdown

On SIGTERM or SIGINT the daemon:

1. stops ticking;
2. waits up to 30 s for in-flight runs;
3. records any runs still going as failed (`interrupted: daemon shutdown`), so
   history never shows a run stuck at "running", and kills their agents;
4. waits up to 3 s more for those runs to remove their worktree (a `talk/`
   branch with commits of its own is kept);
5. removes the lock and exits **0**.

A second signal skips the rest of the 30 s wait (not the 3 s worktree
cleanup). Under systemd the stop signal goes to the whole control group, so a
spawned `task run` gets it too and usually finishes inside the wait.

On start, before the first tick, the daemon (like the Discord bridge) records
runs a dead process left "running" (for example after `kill -9`) as failed
(`interrupted: process restarted`) and removes the leftover worktrees of runs
its data dir recorded as ended, again keeping any branch with commits. Runs
that another live bridge or daemon on the same data dir is still running are
left alone, and a schedule-run worktree whose run this data dir does not know
(another data dir's run on the same repo) is never touched.

## Logs

The daemon writes one JSON object per line to stdout. Every string value is
scrubbed for secrets (SAFE-6).

```json
{"ts":"2026-09-26T12:00:00.000Z","level":"info","component":"daemon","event":"daemon.started","pid":4242,"version":"0.0.10","dataDir":"/home/corvid/.local/share/corvidinho","pollIntervalMs":60000,"schedulesActive":2,"schedulesPaused":0}
```

| Event | When |
|-------|------|
| `daemon.started` | Lock taken, DB open, ticker armed |
| `daemon.lock_held` / `daemon.lock_failed` | Start refused (exit 1) |
| `daemon.protocol_mismatch` / `daemon.protocol_unverified` | `CORVIDINHO_BIN` speaks another wire protocol (exit 1), or could not be checked (warn) |
| `tick` | A tick started or skipped a due run. `skipped` includes runs that another ticker claimed first. |
| `run.finished` | One run ended: `ok`, `error`, `autoPaused` |
| `tick.failed` | A tick threw (for example, SQLite busy); the daemon keeps running |
| `daemon.recovered` | At start: `runs` (ids) a dead process left running were marked failed, `worktrees` leftover schedule-run worktrees removed |
| `daemon.stopping` / `daemon.abandoned` / `daemon.stopped` | Shutdown steps |

```bash
journalctl -u corvidinho-daemon -o cat | jq 'select(.event == "run.finished")'
```

## systemd

Example unit, `/etc/systemd/system/corvidinho-daemon.service`. Change the user
and paths to match your host. Secrets go in the `EnvironmentFile`, never in git.

```ini
[Unit]
Description=Corvidinho schedule daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=corvid
WorkingDirectory=/home/corvid/Corvidinho
# LLM key, allowlists, CORVIDINHO_DATA_DIR, … (mode 600, not in git)
EnvironmentFile=/home/corvid/.config/corvidinho/daemon.env
ExecStart=/home/corvid/.bun/bin/bun src/cli.ts daemon
KillSignal=SIGTERM
# Longer than the daemon's 30 s wait for in-flight runs.
TimeoutStopSec=60
# Restarts come from systemd, not from Corvidinho.
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now corvidinho-daemon
systemctl status corvidinho-daemon
journalctl -u corvidinho-daemon -f -o cat
```

`scripts/corvidinho-update.sh` restarts only the bridge unit. After an update,
restart the daemon yourself: `sudo systemctl restart corvidinho-daemon`.
