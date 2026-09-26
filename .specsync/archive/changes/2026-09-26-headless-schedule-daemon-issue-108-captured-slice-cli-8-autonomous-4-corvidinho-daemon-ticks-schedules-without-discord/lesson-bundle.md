# Lesson bundle — headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Headless schedule daemon (issue #108 captured slice CLI-8 / AUTONOMOUS-4): corvidinho daemon ticks schedules without Discord, single-instance lock in the data dir, clean SIGTERM/SIGINT shutdown, JSON-line logs, systemd doc; schedule ticks claim each due run atomically in SQLite so a daemon and a bridge on one data dir never double-fire or clobber each other
- **Kind**: Feature
- **Specs**: cli, discord
- **Paths**: src/daemon/, src/cli.ts, src/scheduler/, src/discord/config.ts, tests/daemon.test.ts, tests/daemon.cli.test.ts, tests/scheduler.claim.test.ts, docs/DAEMON.md, README.md, specs/cli/, specs/discord/
- **Acceptance**: corvidinho daemon ticks the SQLite schedules table on the 60s poll without a Discord token (CLI-8 / AUTONOMOUS-4); a second daemon on the same data dir refuses to start and names the holder pid, a stale lock from a dead pid is taken over; SIGTERM/SIGINT stop ticking, wait a bounded grace for in-flight runs, mark stragglers failed, release the lock and exit 0; logs are one scrubbed JSON object per line; each due run is claimed atomically in SQLite so a daemon and a bridge sharing one data dir fire it exactly once and never overwrite each other's pause/resume or run counters; docs/DAEMON.md shows a systemd unit; fixture tests + SpecSync + fledge verify green

## Evidence

- Verification commit: `0dd645345905aaabd6b42fa2be5aa2dfce85ca7d`
- Base commit: `8747a9abb99c2322ea67c40da96fb60bc69172bc`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Issue #108 asks for "one supervised daemon". Only two of its ids are captured
in `hi/`: **CLI-8** (a daemon mode keeps schedules and long autonomous work
ticking without me babysitting a REPL) and **AUTONOMOUS-4** (schedule recurring
agent work and have a daemon tick it forward without an open REPL).
OPS-3..5 (one supervised process for bridge + watch + AlgoChat + scheduler,
self-restart, per-part heartbeat in `/status`, crash DM) are DRAFT and are
not built here.

Before this change, schedules ticked only inside `discord bridge`
(`SchedulerService` started in `src/discord/bridge.ts`). That command needs a
Discord token and a channel allowlist, so no schedule moved without Discord.
`github watch` does not tick schedules. Neither command is a daemon in the
CLI-8 sense.

Constraint found while scoping: `ScheduleStore` cached rows in memory and
wrote whole rows back. A second ticker process on the same data dir would
(a) never see schedules created later via `/schedule`, (b) double-fire due
runs (each process had its own `next_run_at`), and (c) overwrite a Discord
`/schedule pause` with a stale `status = active` when its run finished.
The daemon therefore needed a store fix as well as a new command.

## From the change's design.md

# Design

New module `src/daemon/`:

- `lock.ts`: `<data dir>/daemon.lock` is created with `O_EXCL` (`wx`). It
  holds `{pid, startedAt, procStart}`, where `procStart` is field 22 of
  `/proc/<pid>/stat`. A holder counts as live when `kill(pid, 0)` succeeds
  (or fails with EPERM) and its start time still matches. A matching start
  time rules out a recycled pid. A stale lock is removed only if the file
  still holds the bytes that were read. An unreadable file younger than 5 s is
  "contended", not stale, because another starter may not have written it
  yet. `release()` removes the file only while it still names this holder.
- `log.ts`: `{ts, level, component: "daemon", event, ...fields}` per line.
  String leaves are scrubbed and reserved keys cannot be overridden.
- `daemon.ts`: `startDaemon()` takes the lock, opens the shared DB, loads the
  same allowlist as the bridge (file + env, channels ∪ `DISCORD_CHANNEL_IDS`),
  and runs the DISCORD-10 protocol check against `CORVIDINHO_BIN`. It then
  builds `SchedulerService` in manual mode and owns a ref'd `setInterval`.
  That interval keeps the process alive and lets each tick be logged.
  `stop()` is idempotent. `runDaemon()` wires SIGTERM/SIGINT; a second
  signal calls `forceStop()`.

Scheduler (shared with the bridge, no bridge.ts change):

- `ScheduleStore.refresh()` merges SQLite rows into the cached objects in
  place, so in-flight runs keep the live object, and drops deleted ids.
- `claimRun()` runs `UPDATE … WHERE id = ? AND status = 'active' AND
  next_run_at IS ?`. When zero rows change, the run was lost to another
  ticker, so the store refreshes and skips it.
- `setStatus` writes only `status/next_run_at/updated_at`. A started run
  writes `last_run_at`, `execution_count + 1`, `next_run_at` and
  `updated_at`. A finished run sets `consecutive_failures` in SQL (reset to 0,
  or +1) and reads the count back. Nothing rewrites the full row, and the
  free-text columns keep their insert-time scrub.
- `SchedulerService.tick()` refreshes, claims, then fires the run. A private
  `finish()` records each run once (WeakSet). It auto-pauses and emits
  `onRunFinished`. `drain(ms)` and `abandonInFlight(reason)` support
  graceful shutdown.

No schema change: every write uses the existing v2 `schedules` columns.
`resolveCorvidinhoBin` in `src/discord/config.ts` is exported so the daemon
spawns the same binary as the bridge.

## From the change's testing.md

# Testing

- `tests/daemon.test.ts` covers:
  - the lock: second holder refused and named, dead pid taken over, recycled
    pid taken over, young unreadable file not stolen but an old one is,
    release never removes another holder's lock;
  - the logger: JSON line with reserved keys first, secrets scrubbed;
  - `startDaemon`: headless tick, `run.finished` log and completed run row;
    a second daemon refused; stop drains or abandons stragglers as failed and
    frees the lock; `forceStop` cuts the grace; a non-allowlisted channel is
    refused without calling the agent.
- `tests/scheduler.claim.test.ts` uses two DB handles on one temp file:
  - a due run fires once across two tickers;
  - a tick sees create/pause/resume/delete made by the other process;
  - a finishing run never undoes a pause made meanwhile;
  - failures are counted in SQL;
  - in-memory `claimRun` refuses a paused schedule;
  - `abandonInFlight` records a run once.
- `tests/daemon.cli.test.ts` runs the real `bun src/cli.ts daemon` with a
  temp data dir. It checks the `daemon.started` line and the lock file, that
  a second instance exits 1 with `daemon.lock_held`, and that SIGTERM gives
  exit 0 with the lock removed. It also checks that help lists `daemon`.
- The existing scheduler, schedule, scrub and session-worktree tests still
  pass.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-cli-108 | `tests/daemon.test.ts`, `tests/daemon.cli.test.ts` |
| REQ-discord-108 | `tests/scheduler.claim.test.ts`, `tests/scheduler.service.test.ts` |

## Where these lessons go

- `specs/cli/context.md`
- `specs/discord/context.md`
