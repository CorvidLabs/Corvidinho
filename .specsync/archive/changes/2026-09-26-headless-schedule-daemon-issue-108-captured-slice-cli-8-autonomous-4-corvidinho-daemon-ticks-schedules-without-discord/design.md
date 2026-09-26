---
change: headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord
artifact: design
---

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
