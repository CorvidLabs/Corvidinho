# Schedule daemon — `corvidinho daemon`

A headless process that keeps `/schedule` work ticking on the Linux host
without Discord and without anyone sitting at a REPL (**CLI-8**,
**AUTONOMOUS-4**). It runs the same scheduler as the Discord bridge: a 60 s
poll, at most 2 runs at once, no catch-up, and auto-pause after 5 failures in
a row. Each run gets its own worktree (SESSION-WORKTREE). Before each tick
the daemon re-reads the allowlist (file and env), so `/admin` edits made in the
bridge apply without a restart; while the file cannot be loaded, ticks run no
schedule (`tick.allowlist_failed`; the nightly backup still runs). A run whose channel is not on the allowlist,
or whose creator fails the live-chat actor gate (deny-listed, or, when the user
or role list is non-empty, not listed by user id and not the configured owner;
a tick knows no member roles), is refused (DISCORD-SCHEDULE-3). The owner is
read at start for that gate: restart the daemon after changing it. Whether a
run is the owner's own schedule is read again at each run (DISCORD-SCHEDULE-1.a):
a schedule the owner created runs with the owner's allowlisted tools and asks on
the must-ask Approve cards (never the shell, runners or Fledge commands); a
schedule anyone else created runs read-only. Agents it spawns run
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
| Takes the nightly backup and the weekly restore test when `CORVIDINHO_BACKUP_DIR` is set (OPS-1/2, below) | Tell the owner on Discord itself: a failure's notice waits for a bridge tick |

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
  daemon claims is recorded in the run history and not posted, because the
  daemon has no Discord connection. The exception is a run that needs a
  human (next point).
- A daemon run that stops to ask a human (stuck, a clarify question, or the
  daily spend cap) records its question on the run row and logs
  `run.needs_human`. So does a run that cannot start (its project cannot be
  resolved or its worktree cannot be created: a fixed stuck question, the
  full error stays on the run row and in `run.finished`) and the run whose
  failure auto-pauses its schedule (a stuck question saying it is paused and
  to resume it with `/schedule resume`). The bridge's next scheduler tick
  (within about 60 s) posts that question to the schedule's channel once,
  with the same pings as a run the bridge claimed: the owner for stuck and
  spend-cap, the schedule's creator for clarify. A spend-cap ask posts only
  "💸 Work is paused for budget."; its details (amounts, the cap and the
  setting) go to the owner by DM (SAFE-14.a). Before a run stops at a
  spend cap it first waits up to 4 minutes on the owner's spend card
  (SAFE-8 / SAFE-8.a, when an owner is configured): the daemon cannot DM
  it, a bridge on the same data dir does; Approve plus the one-time code
  lets that one call through. With only the daemon running the card lapses,
  which is a no, and nothing is spent. A schedule with no channel
  gets its question by DM to the owner instead. Only the newest ask of a
  schedule is posted, and not at all once it was cancelled or a later run of
  that schedule has finished. With only the daemon running, the question
  waits until a bridge starts.
- Every such question blocks its schedule (AUTONOMY-6.a) until the
  schedule's creator or the owner answers or cancels it on Discord (the
  **Choose** / **Answer** and **Cancel** buttons on its post; a spend-cap
  stop has **Cancel** only). Until then each due run is skipped, in the
  daemon as in the bridge, and not made up later, and the bridge posts one
  note saying the schedule is waiting (no ping; it carries the same
  buttons). `/schedule resume` does
  not answer it. The answer goes to the schedule's next run.

## Nightly backup (OPS-1/2)

Set `CORVIDINHO_BACKUP_DIR` to an absolute local directory (created with mode 0700 on the
first backup) to back up `<data dir>/corvidinho.db` every night. Unset means no backup, as
before, and `corvidinho doctor` prints `[warn] backup: off …`. A directory inside a git work
tree is refused (snapshots hold private notes and must never be committed).

- **When.** The scheduler tick of the bridge or the daemon, at the first tick at or after
  03:00 local time, once per night per data dir. The night is claimed in SQLite, so a bridge
  and a daemon on the same data dir back up once. A box that was down at 03:00 backs up at
  its first tick that day. The daemon still backs up on a tick its allowlist file fails to
  load (`tick.allowlist_failed`: no schedule runs, the backup reads no allowlist).
- **How.** `VACUUM INTO`, SQLite's online snapshot: one read transaction, consistent while
  the bridge, daemon and agents keep writing. The copy is written under a temp name with a
  private umask, checked (`PRAGMA integrity_check`, schema version, the current schema's
  tables, row counts), fsynced and renamed to `corvidinho-<UTC time>.db` (for example
  `corvidinho-20260929T030001Z.db`, mode 0600). Rows are copied as stored, so the snapshot is
  as scrubbed as the DB (SAFE-6; re-scrubbed first when the scrub rules tightened). The newest
  7 snapshots are kept; other files in the directory are never touched, except a temp
  snapshot (`.corvidinho-<UTC time>.db.tmp`) more than an hour old, which a crashed run left.
  A directory that is, or sits below, a symlink into a git work tree is refused too.
- **Restore test.** In the same night slot, when no test ran for 7 days (or the last one
  failed), the newest snapshot is restored into a temp directory with the same code as
  `corvidinho backup restore`, opened and checked (integrity, schema version, tables, row
  counts equal to those recorded when that snapshot was taken), then deleted. With no
  snapshot yet it is skipped (`restore_test.skipped`) until the first backup succeeds.
- **Told.** Every run is logged (events below; on the bridge as `[backup] <event> {…}` lines).
  The first failure of a streak records an owner notice. The bridge's next tick posts it to
  the `/announce` channel with only the owner pinged, as fixed text (`⚠️ The nightly backup
  failed (…)` / `⚠️ The restore test failed (…)`, no host path or error). Later failures of
  the same streak are logged only; a success ends the streak. With no announcements channel
  set, or no bridge running, the notice waits and `doctor` says `owner not told yet`. A
  bridge stopping while the notice's post is in flight waits a short grace (3 s), then hands
  the notice back, so the next start posts it rather than losing it. A backup or restore
  test that never finished because its process died (crash, kill, power loss) is recorded
  as that job's failure (`interrupted: …`, `interrupted: true` in the log) at the next tick
  of a live bridge or daemon, and told like any other failure.
- **Status.** `corvidinho doctor` prints a `backup` line: the directory, snapshot count and
  newest, and the last backup and restore test, or the failure reason. It is `[warn]` while
  no `/announce` channel is set (a failure would not reach the owner). It is `[ok]` or
  `[warn]` and never fails doctor, so it never blocks a box update.

### Restore

```bash
bun src/cli.ts backup list                     # newest first
sudo systemctl stop corvidinho-daemon          # and the bridge: nothing may hold the DB
bun src/cli.ts backup restore corvidinho-20260929T030001Z.db ~/.local/share/corvidinho/corvidinho.db --force
```

`backup restore <snapshot> <target>` takes a name from `backup list`, checks the snapshot,
writes the copy next to the target (mode 0600), fsyncs it, removes the old file's
`-journal` / `-wal` / `-shm`, and renames it into place; then checks the restored file. It
refuses a target any process holds open (a `/proc` scan of open files, plus a live
`daemon.lock` for `corvidinho.db`), even with `--force`, so the live DB is never overwritten
while the bridge, daemon or an agent run uses it. Any other existing target needs `--force`.
To look at a snapshot without touching the live DB, restore it to a new path.

## Configuration

The daemon uses the same environment as the bridge and adds no variables of its own. The
optional `CORVIDINHO_BACKUP_DIR` (nightly backup, above) is read by both.

| Env | Purpose |
|-----|---------|
| `CORVIDINHO_DATA_DIR` | Data dir holding `corvidinho.db` and `daemon.lock` (default `~/.local/share/corvidinho`) |
| `CORVIDINHO_BIN` | Agent binary to spawn per run (default `<cwd>/src/cli.ts`) |
| `CORVIDINHO_ALLOWLIST_FILE`, `CORVIDINHO_DISCORD_ALLOW_CHANNELS`, `DISCORD_CHANNEL_IDS`, … | The same allowlists as the bridge. An empty channel list refuses every schedule that has a channel. Users and roles both empty leave only the channel gate and the deny lists, so any creator's schedule runs; once either is set, the creator gate above applies. Deny lists always win. |
| `CORVIDINHO_LLM_MODEL` (+ its key: `CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`; `OLLAMA_HOST` for `ollama:`) | The model the spawned `task run` calls: `openai:<model>`, `ollama:<model>` or `anthropic:<model>` (AGENT-13); a comma list is a fallback chain (AGENT-11, `llm.fallback` below). There is no built-in default: unset, every scheduled run fails (`failed (exit 1)`) and the `llm.no_provider` start line says why (never commit keys) |
| `CORVIDINHO_BACKUP_DIR` | Optional absolute local directory for the nightly backup (OPS-1/2); unset = no backup |

## Single instance

At start the daemon creates `<data dir>/daemon.lock` with `O_EXCL`. The file
holds the daemon's pid and its `/proc` start time. A second daemon on the same
data dir logs `daemon.lock_held` with the holder's pid and exits **1**.

A lock left by a crash is stale when its pid is gone or the pid now belongs to
another process (the start time differs). The next start takes a stale lock
over, so a crash never blocks a restart.

## Shutdown

On SIGTERM or SIGINT the daemon:

1. stops ticking (a tick still re-reading the allowlist starts no run);
2. waits up to 30 s for in-flight runs;
3. records any runs still going as failed (`interrupted: daemon shutdown`), so
   history never shows a run stuck at "running", and kills their whole process
   trees (each spawned `task run` has its own process group), logging
   `daemon.abandoned`;
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
| `daemon.started` | Lock taken, DB open, ticker armed; `backup` is the backup directory, `off`, or why it is unusable; `llm` is the model runs at the default tier call (`<model> @ <host>`), or `none` (AGENT-13) |
| `llm.no_provider` | (warn, at start) Some or every tier has no usable model provider (AGENT-10): `notice` says which and what to set (`CORVIDINHO_LLM_MODEL`, or the entry's missing key). Those scheduled runs fail (`failed (exit 1)`) until one is set; there is no built-in default |
| `daemon.lock_held` / `daemon.lock_failed` | Start refused (exit 1) |
| `daemon.start_failed` | Start refused (exit 1): start-up setup failed, for example an allowlist file that cannot be read or parsed or a DB that cannot open. `message` gives the reason; nothing runs and the lock is released |
| `daemon.protocol_mismatch` / `daemon.protocol_unverified` | `CORVIDINHO_BIN` speaks another wire protocol (exit 1), or could not be checked (warn) |
| `tick` | A tick started or skipped a due run. `skipped` includes runs that another ticker claimed first and runs that wait on their schedule's open question (AUTONOMY-6.a). |
| `run.finished` | One run ended: `ok`, `error`, `autoPaused` |
| `llm.fallback` | (warn) A scheduled run's model failed and it fell back to the next configured model (AGENT-11): `sessionId`, `fallbacks` (`from`, `to`, `reason` each; `via` for a delegate or council worker's) and a `message` line. The post of a run that still finished carries the same note (a failed run's post stays `failed (exit N)`); there is no DM |
| `spend.warning` | (warn) A schedule run crossed 80% of a rolling 24 h spend cap — the total (`CORVIDINHO_DAILY_SPEND_CAP_USD`, SAFE-8) or a provider's (`CORVIDINHO_PROVIDER_SPEND_CAPS_USD`, SAFE-14/15; its `message` names `provider:<id>`): `spentMicroUsd`, `capMicroUsd`, `percent` and a `message` line. The daemon has no Discord: the warning stays pending for a bridge's scheduler tick to DM to the owner (never posted in a channel, SAFE-14.a) |
| `run.needs_human` | (warn) A run stopped to ask a human: `reason` is `stuck`, `clarify` or `spend-cap`. Also `stuck` for a run that could not start and for the run that auto-paused its schedule. Its question stays on the run row until a bridge posts it, and the schedule's due runs wait until someone answers or cancels it on Discord (AUTONOMY-6.a). |
| `tick.failed` | A tick threw (for example, SQLite busy); the daemon keeps running |
| `tick.allowlist_failed` | The allowlist file could not be read or parsed, so the tick was skipped (no schedule ran; due schedules stay due; the nightly backup still runs when due). Fix the file; the next tick picks it up |
| `daemon.recovered` | At start: `runs` (ids) a dead process left running were marked failed, `worktrees` leftover schedule-run worktrees removed |
| `daemon.stopping` / `daemon.abandoned` / `daemon.stopped` | Shutdown steps |
| `backup.ok` | Tonight's snapshot: `dir`, `snapshot`, `bytes`, `schemaVersion`, `counts` (rows per table), `removed` (rotated out); `recovered: true` when it ends a failure streak |
| `backup.failed` | (error) Tonight's backup failed: `error`, `dir`; `ownerNotice` says whether this failure recorded the owner notice or the streak already has one; `interrupted: true` when a dead process left it unfinished (also on `restore_test.failed`) |
| `restore_test.ok` / `restore_test.failed` | The weekly restore test of the newest snapshot passed / (error) failed, with `snapshot` and the counts or the `error` |
| `restore_test.skipped` | (warn) No snapshot to test yet |
| `backup.owner_told` / `restore_test.owner_told` | (bridge only) The owner notice was posted; `backup.owner_not_told` / `restore_test.owner_not_told` (warn, once) when its post did not go out — retried every tick |

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
# CORVIDINHO_LLM_MODEL + its key, allowlists, CORVIDINHO_DATA_DIR, … (mode 600, not in git)
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
