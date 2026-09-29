---
change: nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per
artifact: design
---

# Design

- `src/store/backup.ts` (new): config (`resolveBackupConfig`,
  `backupDirRefusal`/`gitWorkTreeAbove`), snapshot (`snapshotName`,
  `takeSnapshot`: `ensureScrubbed` → `VACUUM INTO ?` temp under umask 077 →
  chmod 0600 → fsync → `checkDbFile` → rename → dir fsync → `rotateSnapshots`),
  `listSnapshots` (name pattern only, newest first), `checkDbFile`
  (read-only: integrity_check, version 1..SCHEMA_VERSION, current tables via a
  cached in-memory migrate, counts), `restoreSnapshot` (name pattern, source
  check, `processesHolding` = `/proc/<pid>/fd` scan + live `daemon.lock` for
  `corvidinho.db`, force rule, copy next to target, fsync, re-check holders,
  drop old sidecars, rename, re-check), `runRestoreTest` (mkdtemp, restore,
  compare counts with the ones recorded at snapshot time, always rm).
- State in `schema_meta` (`ops_backup_night`, `ops_backup_last_snapshot`
  {snapshot, counts}, `ops_<job>_{last_ok_at,failing_since,last_error,notice}`,
  `ops_restore_test_last_at`); `claimBackupNight` / `recordJobFailure` /
  `recordJobSuccess` in IMMEDIATE transactions; `claimBackupNotice`
  compare-and-delete, `releaseBackupNotice` INSERT OR IGNORE.
- `createBackupTicker({ db, env, log, notify?, tmpRoot? })`: `tick(now)` claims
  the night (only when configured), runs snapshot + restore test (skipped
  when no snapshot yet), records + logs, then delivers pending notices through
  `notify` (one pass in flight; fixed text `formatBackupNotice`; hand back
  and `owner_not_told` once when not sent). Never throws.
- Review fixes: `backupDirRefusal` also checks the path with the nearest
  existing ancestor's symlinks resolved; `takeSnapshot` removes our own
  snapshot temp files older than an hour; `ops_backup_running` marks the
  night's job (pid + process start) and `takeInterruptedBackupRun` records a
  dead process's unfinished run as that job's failure; the ticker has
  `stop()` and `settle(timeoutMs)` (hands the in-flight notice back on a
  timeout), and the bridge's `stop()` uses both; the daemon ticks the backup
  on a `tick.allowlist_failed` tick; doctor warns while no `/announce`
  channel is set.
- `SchedulerService`: optional `backup`, called in `tick()` after runs are
  claimed. Daemon: `createBackupTicker({ db, env, log })` (no notify),
  `backup` field on `daemon.started`, `now` test seam. Bridge: ticker with
  `consoleBackupLog` and a `notify` posting to the announce channel via the
  gateway reply with `<@owner>` + `mentionUserIds` [owner]; `schedulerNow`
  test seam.
- CLI: `backup list`, `backup restore <snapshot> <target> [--force]`, help +
  env lines; doctor `backupDoctorCheck` after `data-dir` (`[warn]`, never
  failing: the box updater rolls back on a failing doctor).
- Rejected: a DM to the owner (no DM path; DISCORD-5), riding the SAFE-8
  outbox on every post (touches every post site), a new table / schema bump,
  a rotation-count or hour env var (not needed by the captured text), bun:ffi
  to the C backup API (`VACUUM INTO` is SQLite's online-consistent snapshot),
  encryption (local dir; pending Leif), a `backup now` / `backup test` command.
