# Lesson bundle — nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Nightly SQLite backup to a directory the owner sets with a weekly tested restore, a restore command and a once-per-failure-streak owner notice (OPS-1/2, #68)
- **Kind**: Feature
- **Specs**: cli, discord
- **Paths**: src/store/backup.ts, src/scheduler/service.ts, src/daemon/daemon.ts, src/discord/bridge.ts, src/cli.ts, src/doctor.ts, tests/ops.backup.test.ts, tests/ops.backup-wiring.test.ts, tests/preload.ts, .env.example, README.md, docs/DAEMON.md, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/BOX-UPDATE.md, AGENTS.md, STATUS.md, hi/ops.md, INTENT.md, specs/cli/cli.spec.md, specs/cli/requirements.md, specs/cli/testing.md, specs/discord/discord.spec.md, specs/discord/requirements.md, specs/discord/testing.md
- **Acceptance**: With CORVIDINHO_BACKUP_DIR set to an absolute local directory outside any git repo, the bridge's or daemon's scheduler tick takes one consistent VACUUM INTO snapshot of corvidinho.db per night from 03:00 local time (claimed once per data dir in SQLite; 0600 file named by UTC time, checked, fsynced, newest 7 kept, other files untouched, SAFE-6 scrubbing carried) and logs it; once a week (and each night while failing) the newest snapshot is restored into a temp dir with the same code as corvidinho backup restore, opened, checked (integrity_check, schema version, tables, row counts equal to the recorded ones) and deleted, and logged; the first failure of a streak records an owner notice that the bridge's next tick posts once as fixed text (no host path) to the /announce channel with only the owner pinged, handed back when the post does not go out, later failures logged only until a success; unset means no backup and doctor prints a [warn] backup: off line (doctor shows dir, snapshots, last backup / restore test or the failure reason and whether the owner was told, never fails doctor); corvidinho backup list prints snapshots and backup restore <snapshot> <target> [--force] checks and restores a named snapshot, refusing any target a process holds open even with --force and an existing target without --force; no new table or schema version; tests/ops.backup.test.ts and tests/ops.backup-wiring.test.ts cover each and fail on the previous code

## Evidence

- Verification commit: `9ff1216067ced9f9ff0454cde050619f68816c17`
- Base commit: `9209bda288f255dfa366d24d6ddcb96ab2d39a4f`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Issue #68 (P1, M1 "Knows everyone"): memory is about to hold people, private
notes and history, and losing the box should not lose them. Leif confirmed the
criteria in the 2026-09-28 interview (round 7), captured in this PR with `hi`
into the new family `hi/ops.md`:

- **OPS-1** "A nightly backup goes to a place I choose, and I'm told if it fails."
- **OPS-2** "A backup can be restored, and the restore is tested regularly."

Interview design call: "local dir you set (nightly SQLite online-backup snapshot
to a configured dir, rotating copies; owner told on failure; weekly restore
test into a temp dir)". Orchestrator notes: no backup when unset and doctor
says so; told once per failure streak; the run is logged; a CLI restore of a
named snapshot to a target path, never overwriting the live DB while a process
holds it; runs from the existing scheduler/daemon tick; no secrets in logs;
backups inherit the DB's scrubbing (SAFE-6).

Gap on main (310861f): nothing copies `corvidinho.db`; there is no restore
path and no doctor line; `docs/DAEMON.md` lists heartbeats / crash DMs as
draft OPS-3..5 (not touched here).

Constraints: v1 is off-chain (no on-chain backup; issue non-goal). No new
table or schema version (state in `schema_meta`, like the announce channel and
the memory confirm secret). One new optional env var only
(`CORVIDINHO_BACKUP_DIR`, needed by "a place I choose"). No DM path exists in
the bridge (DISCORD-5: it posts only in configured channels), so the owner is
told in the configured `/announce` ops channel with only the owner pinged.
#232/#233 scope untouched. The issue's "encrypted before it leaves the box"
does not apply to a local directory; left for Leif.

## From the change's design.md

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

## From the change's testing.md

# Testing

Fixture tests only: temp data and backup dirs, injected clocks (`now`,
`schedulerNow`, 03:30 local), an injected agent, a null Discord gateway that
records replies, CLI spawns with a clean env; no network, no live Discord, no
token. `tests/preload.ts` strips an inherited `CORVIDINHO_BACKUP_DIR` so the
verify lane never writes the operator's backup dir.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-680` | `tests/ops.backup.test.ts` (config, snapshot) | Unset / blank → off, relative → invalid, absolute → resolved. A snapshot taken while a second connection holds an uncommitted `BEGIN IMMEDIATE` insert holds only the 2 committed memories; name `corvidinho-20260929T030001Z.db` (UTC); file 0600 in a created 0700 dir; no temp file left; `checkDbFile` ok at `SCHEMA_VERSION`. A memory stored with an Anthropic-shaped key under an older scrub-rules version is `[redacted:anthropic-key]` in the snapshot and the key's bytes are absent from the file (SAFE-6 carried). Nine nights keep the newest 7; `notes.txt` and `corvidinho-manual.db` stay. A dir under a `.git` parent and a file path are refused with nothing created. |
| `REQ-cli-680` | `tests/ops.backup.test.ts` (restore, restore test) | `restoreSnapshot` to a new target: 0600, rows present. The live DB this process holds open is refused even with `force` (`is open in process <pid>`) and keeps its newer row; a live `daemon.lock` beside a closed `corvidinho.db` is a holder, none once removed; an idle existing target needs `force`, and with it the stale `-journal` is removed and the snapshot's rows are back; `../corvidinho.db`, a missing name, a text file under a snapshot name and a directory target are refused. `runRestoreTest` restores the newest of two snapshots (3 memories), counts match the recorded ones, the temp root is empty; recorded counts that differ (`memories 2 (backed up 5)`), a corrupted newest snapshot and an empty dir fail, the temp root still empty. |
| `REQ-cli-680` | `tests/ops.backup.test.ts` (ticker) | Unset: no log, no night claimed. Two tickers on two connections to one file: nothing at 02:59, one `backup.ok` + `restore_test.ok` at 03:00 (the other ticker and a 23:59 tick do nothing), next night `backup.ok` only, the restore test again after 7 days. A file as dir: `backup.failed` (error, `ownerNotice: recorded`), `restore_test.skipped`, notify called once with `The nightly backup failed` + `corvidinho doctor` and neither the path nor the error; next night logged with `already recorded this failure streak`, not told; a good dir ends the streak (`recovered: true`); broken again → told again. A daemon ticker (no notify) leaves `ops_backup_notice`; a bridge ticker whose post returns false keeps it pending and logs `backup.owner_not_told` once over two ticks, then delivers it (`backup.owner_told`) and posts nothing more. A restore test whose temp root is a file: `restore_test.failed`, told once (fixed text), retried the next night without a second notice. Night claim: false before 03:00, once per local day. |
| `REQ-cli-680` | `tests/ops.backup.test.ts` (doctor) | `backupDoctorCheck`: unset `[warn]` `… is not set, so there is no nightly backup`; relative and in-repo `[warn]` with the reason (ok stays true); a dir not created yet `[ok]` `(created on the first backup)`, `0 snapshot(s)`, `no backup yet`, and it is not created; after a good night `1 snapshot(s), newest corvidinho-…`, `last backup ok`, `restore test ok`; after a failing night `[warn]` `last backup FAILED (failing since …)` with `is not a directory` and `owner not told yet`, `owner told` once a notify delivered it; with no `corvidinho.db` yet it says `no backup yet (no corvidinho.db in the data dir yet)` and creates neither the data dir nor anything in the backup dir (history read read-only). |
| `REQ-cli-680` | `tests/ops.backup-wiring.test.ts` (daemon, CLI) | `startDaemon` with `now` 03:30: `daemon.started` has `backup: <dir>`; two ticks write one snapshot and log `backup.ok` (component `daemon`) and `restore_test.ok` for it. A file as dir: `backup.failed` (error, `ownerNotice: recorded`) and `ops_backup_notice` = the tick time after stop. Unset: `backup: "off"`, no `backup.*` events. CLI spawns: `--help` lists `backup list`, `backup restore <snapshot> <target> [--force]` and `CORVIDINHO_BACKUP_DIR`; `backup list` prints the snapshot; `backup restore` exits 0 and the target has the row; restoring onto the DB the test process holds, with `--force`, exits 1 with `restore refused` and `is open in process <test pid>`, rows unchanged; unset dir → exit 1 `CORVIDINHO_BACKUP_DIR is not set`; `doctor` prints `[warn] backup: off — CORVIDINHO_BACKUP_DIR is not set` and, set, `[ok] backup: <dir> — 1 snapshot(s)`. |
| `REQ-discord-680` | `tests/ops.backup-wiring.test.ts` (scheduler, bridge) | `SchedulerService.tick` passes its clock to `backup.tick` on each tick. `startBridge` (file DB, owner, `schedulerPollIntervalMs` 20, `schedulerNow` 03:30): a file as backup dir with an announce channel → exactly one reply over many ticks, to `announce-1`, starting `<@owner> ⚠️ The nightly backup failed`, `mentionUserIds` [owner], without the path; `ops_backup_notice` cleared, `ops_backup_failing_since` set. No announce channel → no reply, notice pending. A good dir → tonight's snapshot, no reply. |
| `REQ-cli-680` / `REQ-discord-680` | Fail on the base | With `src/cli.ts`, `src/daemon/daemon.ts`, `src/discord/bridge.ts`, `src/doctor.ts` and `src/scheduler/service.ts` from `origin/main` 310861f and `src/store/backup.ts` removed: `tests/ops.backup.test.ts` cannot load (module missing, its 21 tests do not run) and all 11 tests in `tests/ops.backup-wiring.test.ts` fail on their own assertions (no `backup` field, no snapshot, no post, `Unknown command: backup`, no doctor line). Branch sources restored: 31/31 pass. |
| `REQ-cli-680` / `REQ-discord-680` | Review fixes (`tests/ops.backup.test.ts`, `tests/ops.backup-wiring.test.ts`) | A symlink into a git work tree (and a dir below it not created yet) is refused, nothing written. A snapshot temp file more than an hour old is removed before the next snapshot; a recent one and `.notes.tmp` stay. A running mark of this live process is left alone; one whose process is gone (same pid, other process start) is recorded once as `restore_test.failed` (`interrupted: true`, error level, told once), the next tick finds nothing, and tonight's run clears its mark and ends the streak (`recovered`). A notice whose post outlasts `settle(20)` is pending again; a stopped ticker's tick takes nothing and claims no night; the post then going out takes it again. Doctor `[warn]` `no /announce channel set` until `AnnounceStore.setChannelId`, then `[ok]` (unit and CLI spawn). A daemon whose allowlist file turns malformed logs `tick.allowlist_failed` and still writes tonight's snapshot (`backup.ok`). A bridge whose announce reply never completes: `stop()` waits the 3 s grace, `ops_backup_notice` is pending again. Each of these fails on the pre-fix sources (62d1adc) and passes now. |
| docs / hi | `tests/docs.operator-facts.test.ts` | `AGENTS.md` and `STATUS.md` name the new `ops` hi file (19 families); `.env.example` names only env vars the code reads (`CORVIDINHO_BACKUP_DIR`). |

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `hi check` passes;
`specsync check --require-coverage 100` 100%; `fledge lanes run verify
--non-interactive` completed.

## Where these lessons go

- `specs/cli/context.md`
- `specs/discord/context.md`
