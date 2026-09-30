---
module: cli
version: 72
status: draft
files:
  - src/cli.ts
  - src/doctor.ts
  - tests/cli.doctor-truth.test.ts
  - src/version.ts
  - src/attribution.ts
  - src/daemon/daemon.ts
  - src/daemon/lock.ts
  - src/daemon/log.ts
  - src/daemon/index.ts
  - tests/daemon.restart-recovery.test.ts
  - .env.example
  - STATUS.md
  - tests/preload.ts
  - tests/preload.operator-data-dir.test.ts
  - tests/fixtures/preload-probe.ts
  - tests/preload.tmp-cleanup.test.ts
  - tests/fixtures/preload-tmp-probe.ts
  - tests/cli.clean-errors.test.ts
  - tests/fixtures/fake-http-401.ts
  - tests/cli.project-path.test.ts
  - src/store/backup.ts
  - tests/ops.backup.test.ts
  - tests/ops.backup-wiring.test.ts

db_tables: []
depends_on:
  - plugins
  - agent
---

# Cli

## Purpose

Operator surface includes Discord HEAR, GitHub WATCH, the headless schedule daemon, attribution, and task run with its LLM plugin tool loop on the model the operator configures (AGENT-13: no built-in default; with none, `task run`, the daemon, doctor and `init` say so, AGENT-10, REQ-cli-079).

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `main` | `argv: string[]` | `Promise<number>` | CLI entry; exit code |
| `runCli` | `argv: string[], run?: (argv) => Promise<number>` | `Promise<number>` | Top-level error boundary around `main` (REQ-cli-419) |
| `reportCliError` | `err: unknown, opts?: { json?: boolean }` | `number` | One scrubbed error line + hint; returns the exit code (REQ-cli-419) |
| `cliErrorHint` | `err: unknown` | `string` | Next step for the operator matched to the error kind (data-dir hint for a filesystem error with a path or a bun:sqlite DB open error; a `ProjectDirError` carries its own) |
| `parseGlobalFlags` | `args: string[]` | `{ rest, pluginArgs, nonInteractiveFlag, json, removedFlag, maxRetries, taskText, tier, project }` | Global flags anywhere in argv; `project` is the `--project` path (`""` when given without one; only before `--`) (REQ-cli-505); `removedFlag` is `--no-verify` when read as a flag, which `main` refuses (REQ-cli-085) |
| `readStartEnv` | `path?: string` | `Record<string, string> or null` | The env this process was started with (`/proc/self/environ`), before Bun added the start directory's `.env*` values (REQ-cli-505) |
| `enterProject` | `path: string, opts?: { startEnv? }` | `EnterProjectResult` | CLI-5 `--project`: env as Bun builds it for a process started in `path` (probe pinned to `SPAWN_BUN_CONFIG`), then `chdir`; later `Bun.spawn` / `Bun.spawnSync` without `env` pass the new `process.env`; changes nothing on failure (REQ-cli-505) |
| `envFileFlags` | `execArgv: readonly string[]` | `string[]` | Bun's `--no-env-file` / `--env-file` flags from `execArgv`, in order, forwarded to the `--project` probe (REQ-cli-505) |
| `attribution` | `format?: "markdown" or "plain"` | `string` | Return the canonical footer in the requested format |
| `startDaemon` | `opts?: StartDaemonOptions` | `Promise<StartDaemonResult>` | Take the data-dir lock and arm the headless schedule ticker (CLI-8 / AUTONOMOUS-4) |
| `runDaemon` | `opts?: StartDaemonOptions` | `Promise<number>` | `corvidinho daemon`: start, then stop cleanly on SIGTERM/SIGINT |
| `acquireDaemonLock` | `opts: AcquireDaemonLockOptions` | `AcquireDaemonLockResult` | Exclusive `<data dir>/daemon.lock`; stale dead/recycled pid taken over |
| `daemonLockPath` | `dataDir: string` | `string` | Lock file path |
| `isHolderAlive` | `holder, procStartOf?` | `boolean` | Pid alive and same /proc start time |
| `readProcStart` | `pid: number` | `string or null` | Field 22 of /proc/<pid>/stat |
| `createDaemonLogger` | `opts?: DaemonLoggerOptions` | `DaemonLogger` | JSON-line logger (scrubbed) |
| `formatDaemonLogLine` | `level, event, fields?, now?` | `string` | One scrubbed JSON log line |
| `loadDoctorAllowlist` | `env?, home?` | `Promise<DoctorAllowlist>` | Allowlists as the bridge / WATCH load them (file + env; the file read once), plus the file-only and env-only halves; `ok: false` when the file does not load |
| `discordChannelUsage` | `allow, env?` | `AllowlistUsage` | Bridge channel set (`mergeChannelIds`) minus deny-listed channels: listed / usable count and sources |
| `githubRepoUsage` | `allow` | `AllowlistUsage` | WATCH repo set (`expandWatchRepos`) minus deny-listed repos / orgs and entries the gate cannot use: listed / usable / denied count and sources |
| `discordDoctorCheck` | `allow, env?` | `DoctorCheck` | Doctor `discord` line (token + usable channels, source named) |
| `githubWatchDoctorCheck` | `allow, env?` | `DoctorCheck` | Doctor `github-watch` line (token + username + usable repos, source named) |
| `llmDoctorCheck` | `env?` | `DoctorCheck` | Doctor / `init` `llm` line (AGENT-13 / AGENT-10, REQ-cli-003): `[ok]` key env present (never the value) or `no key needed` (ollama), model and host of the default tier, per-tier models; `[warn]` with the no-provider notice when a tier has no usable provider; never fails |
| `dataDirDoctorCheck` | `env?, home?` | `DoctorCheck` | Doctor `data-dir` line: exists + writable / creatable / `fail` |
| `projectFilesDoctorChecks` | `cwd?` | `DoctorCheck[]` | Doctor / `init` project-file lines for `cwd` (CLI-4, REQ-cli-430): `fledge.toml`, `verify-lane` (runs spec-check), `.specsync`, `specs`; each missing one `[missing]` in plain language; reads only |
| `removedVerifyKeyDoctorCheck` | `cwd?` | `DoctorCheck \| null` | Doctor `[warn] verify-gate` line when `cwd`'s `fledge.toml` still sets `[corvidinho] verify_before_complete` (ignored, AGENT-14); null otherwise; never fails doctor (REQ-cli-085) |
| `backupDoctorCheck` | `env?, opts?: { db? }` | `DoctorCheck` | Doctor `backup` line (OPS-1/2, REQ-cli-680): `[warn]` off / unusable dir / failing job (reason, owner told or not) / no `/announce` channel set, `[ok]` dir + snapshots + last backup and restore test; never fails doctor; creates nothing |
| `peopleGithubDoctorCheck` | `dir: PeopleDirectory` | `DoctorCheck \| null` | Doctor `people-github` line (IDENTITY-7.a, REQ-cli-367): `[warn]` naming (person ids only) the owner and declared people with a GitHub login but no GitHub numeric id; null when nobody is affected; never fails doctor |
| `resolveBackupConfig` | `env?` | `BackupConfig` | `CORVIDINHO_BACKUP_DIR`: unset → `off`, relative → `invalid`, absolute → `on` + resolved dir (src/store/backup.ts) |
| `gitWorkTreeAbove` / `backupDirRefusal` | `dir` | `string or null` | Nearest dir holding `.git`; why a dir cannot hold backups (in a git work tree as given or with symlinks resolved, not a directory, unreadable) |
| `snapshotName` | `now: number` | `string` | `corvidinho-<YYYYMMDD>T<HHMMSS>Z.db` (UTC) |
| `listSnapshots` | `dir` | `SnapshotInfo[]` | Snapshot files (name pattern only) newest first; missing dir → [] |
| `rotateSnapshots` | `dir, keep?` | `string[]` | Delete all but the newest `keep` (≥1, default 7) snapshots; returns deleted names |
| `currentSchemaTables` | — | `string[]` | Tables of a DB migrated to `SCHEMA_VERSION` (cached in-memory migrate) |
| `checkDbFile` | `path` | `DbFileCheck` | Read-only open: integrity_check ok, schema version 1..current, current tables at the current version, row counts |
| `takeSnapshot` | `db, dir, { now, keep? }` | `SnapshotResult` | `VACUUM INTO` temp (umask 077) → check → fsync → rename (0600) → rotate; `ensureScrubbed` first; never throws, no partial file |
| `processesHolding` | `path` | `number[]` | Pids holding the file or its -journal/-wal/-shm open (`/proc/<pid>/fd`), plus a live `daemon.lock` beside a `corvidinho.db` |
| `restoreSnapshot` | `RestoreOptions` | `RestoreResult` | Check a named snapshot, refuse a held target (even with `force`) or an existing one without `force`, copy next to the target, fsync, drop old sidecars, rename, re-check |
| `runRestoreTest` | `dir, { tmpRoot?, expected? }` | `RestoreTestResult` | Restore the newest snapshot into a fresh temp dir with `restoreSnapshot`, compare row counts with `expected` when it names that snapshot, always delete the temp dir |
| `localDay` | `now` | `string` | Local `YYYY-MM-DD` |
| `claimBackupNight` | `db, now` | `boolean` | Claim tonight (from 03:00 local, once per local day per data dir; IMMEDIATE transaction on `schema_meta`) |
| `recordJobFailure` / `recordJobSuccess` | `db, job, now, error?` | `boolean` | Failure: store the scrubbed reason; true (and an owner notice recorded) only when it starts a streak. Success: end the streak; true when one ended |
| `restoreTestDue` | `db, now` | `boolean` | Never ran, last attempt ≥ 7 days ago, or failing |
| `readBackupStatus` | `db` | `BackupStatus` | Night, last ok, failing since, last error, notice pending per job |
| `pendingBackupNotices` / `claimBackupNotice` / `releaseBackupNotice` | `db, notice?` | — | Owner notices recorded and not posted; compare-and-delete take; hand back (a newer one wins) |
| `formatBackupNotice` | `PendingBackupNotice` | `string` | Fixed owner text with the UTC time, never a path or the error (OPS-1 / OPS-2) |
| `createBackupTicker` | `{ db, env?, log, notify?, tmpRoot? }` | `BackupTicker` | `tick(now)`: record a run a dead process left unfinished as its job's failure, claim the night, snapshot, restore test when due, record and log, deliver notices through `notify` (one pass at a time; handed back when not sent); `settle(timeoutMs?)` (on a timeout the notice in flight is handed back); `stop()` (take nothing more); never throws |
| `markBackupRunning` / `clearBackupRunning` / `takeInterruptedBackupRun` | `db, job?, now?` | — / — / `{ job, at } or null` | The night's job in progress (`ops_backup_running`: job, time, pid, process start); cleared when the run ends; taken (compare-and-delete) only when its process is gone |
| `consoleBackupLog` | `level, event, fields?` | `void` | Bridge log sink: one scrubbed `[backup] <event> {json}` line |

### Exported Constants

| Constant | Description |
|----------|-------------|
| `VERSION` | Semver from package.json via shared helper |
| `formatPresenceVersionString` | Short `vX.Y.Z` for Discord Custom Status (DISCORD-12) |
| `CORVIDINHO_URL` | Canonical Corvidinho repository URL |
| `ATTRIBUTION_MARKDOWN` | Canonical markdown footer without account handles |
| `ATTRIBUTION_PLAIN` | Canonical plain-text footer without account handles |
| `DEFAULT_SHUTDOWN_GRACE_MS` | Daemon stop waits this long (30 s) for in-flight runs |
| `DAEMON_LOCK_FILE` | `daemon.lock` in the data dir |
| `PROJECT_ENV_TIMEOUT_MS` | Cap (15 s) on the one-off `.env` probe `--project` runs (REQ-cli-505) |
| `BACKUP_DIR_ENV` | `CORVIDINHO_BACKUP_DIR` (OPS-1, REQ-cli-680) |
| `BACKUP_KEEP` | Snapshots kept (7) |
| `BACKUP_HOUR` | Local hour from which the nightly backup is due (3) |
| `RESTORE_TEST_INTERVAL_MS` | Restore test cadence (7 days) |
| `SNAPSHOT_RE` | Snapshot file name pattern (`corvidinho-<YYYYMMDD>T<HHMMSS>Z.db`) |

### Exported Types

| Type | Description |
|------|-------------|
| `AttributionFormat` | Supported attribution output formats |
| `StartDaemonOptions` / `StartDaemonResult` / `DaemonStopSummary` | Daemon start/stop contract (test seams: agent, db, poll, grace, lock) |
| `DaemonLock` / `DaemonLockHolder` / `AcquireDaemonLockOptions` / `AcquireDaemonLockResult` | Single-instance lock |
| `DaemonLogger` / `DaemonLogLevel` / `DaemonLogFields` / `DaemonLoggerOptions` | JSON-line logger |
| `DoctorCheck` | One doctor line: name, ok, detail, optional printed mark |
| `EnterProjectResult` | `{ ok: true, dir }` or `{ ok: false, error, hint }` from `enterProject` (REQ-cli-505) |
| `ProjectDirError` | Error class for an unusable `--project`; `hint` is the operator's next step (REQ-cli-505) |
| `RemovedFlagError` / `REMOVED_NO_VERIFY_FLAG` | Error class for the removed `--no-verify` (message and `hint`, exit 1 through `reportCliError`) and the flag it names (REQ-cli-085) |
| `DoctorAllowlist` / `AllowlistUsage` / `AllowlistSource` | Doctor allowlist load result, listed / usable / deny-listed entry counts and source (`file` / `env`) |
| `BackupConfig` / `SnapshotInfo` / `SnapshotResult` / `DbFileCheck` / `RestoreOptions` / `RestoreResult` / `RestoreTestResult` | Backup config, snapshot, check, restore and restore-test results (REQ-cli-680) |
| `BackupJob` / `JobStatus` / `BackupStatus` / `PendingBackupNotice` | `backup` / `restore_test` state read from `schema_meta` |
| `BackupLog` / `BackupLogLevel` / `BackupNotify` / `BackupTicker` | Ticker log sink (daemon logger shape), owner-notice poster, ticker contract |

## Invariants

task run honors --tier and agent config (`max_retries`); it has no verify skip (AGENT-14, REQ-cli-085): `--no-verify` read as a flag (not `--task` text, not a `plugins run` argument after `--`) is refused before anything runs with one `corvidinho: --no-verify was removed: verification can't be skipped (AGENT-14)` line or `{ ok: false, error }`, exit 1, and a `[corvidinho] verify_before_complete` key is ignored with a `[warn] verify-gate` doctor line. In a delegate or council worker (`CORVIDINHO_DELEGATE_DEPTH` above 0) task run starts the real diff with `{ nested: true }`, so the worker leaves its lead's talk verified marker alone (REQ-agent-015).
plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count.
`specsync <list|read|check|brief|coverage|score|change-list|ship-status>` runs the matching `specsync-*` plugin through `plugins run`; `score` is `specsync-score`, the local `specsync score` report (SPECSYNC-3, REQ-cli-089).
plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count. The `plugins list` text view also prints which PLUGIN-4 language runners loaded (with their binary) and one `<name> not loaded: <tool> not found on PATH` line per missing toolchain, and still exits 0 (REQ-cli-112).
doctor reads what the long-running surfaces read (CLI-4, REQ-cli-003): the `discord` and `github-watch` checks load allowlists through the bridge / WATCH loader (allowlist file + env overlays, `mergeChannelIds` / `expandWatchRepos`), drop deny-listed entries (deny wins) and entries the gate cannot use (a repo that is not OWNER/REPO; the line names deny wins only when every entry is deny-listed), count a token / watch login only when not blank (as the bridge / WATCH trim; the `github` Octokit line too), and name the source (`file`, `env`, `file + env`) and count, never ids, repos or tokens; a file that does not load fails both. The `llm` line (AGENT-13 / AGENT-10) is `ok` with the default tier's model, its host and its key env present (value not shown; `no key needed` for `ollama:`) and `warn` with the no-provider notice when a tier has no usable provider (there is no demo stub or default model), never changing the exit code. The `data-dir` line probes the shared data dir with a temp dir it removes: `ok` exists + writable, `info` missing but creatable (not created), `fail` otherwise, including a symlink to nothing (exit 1).
`plugins run <name> [--json] [-- ...args]`: every argv item after the first `--` that follows the name reaches the plugin verbatim; global flags, `--json` and help are read only before it (REQ-cli-186).
Attribution output uses only the project name and repository link and contains no account handle.
doctor always prints a `spend` line (SAFE-8 / AUTONOMOUS-8, REQ-cli-098): `info` when `CORVIDINHO_DAILY_SPEND_CAP_USD` is unset (no DB opened), otherwise rolling 24 h spend vs the cap with the percent, `warn` at the 80% warning, at the cap, for an unpriced model, an invalid value or an unreadable ledger; it never changes the doctor exit code. `task run` copies the run's 80% spend warning onto `TaskResult.spendWarning` (`--json` and the NDJSON `result` frame); a run stopped at the cap is `blocked` and exits 0, its summary is the generic `SPEND_CAP_SUMMARY`, and text output also prints the ask question (the operator details). The headless daemon, which has no Discord, logs a `warn` `spend.warning` line for a schedule run that crossed 80% and a `warn` `run.needs_human` line (with `reason`) for a run that stopped to ask; the recorded warning and the ask recorded on the run row stay pending, and a bridge's next scheduler tick posts the ask to the schedule's channel (REQ-discord-347; the daemon never posts it).
`daemon` needs no Discord token, adds no env vars of its own (the nightly backup's optional `CORVIDINHO_BACKUP_DIR`, REQ-cli-680, is shared with the bridge), runs at most one instance per data dir, logs scrubbed JSON lines, and on SIGTERM/SIGINT drains (≤30 s), records stragglers failed, gives them ≤3 s to park their worktree, releases the lock and exits 0. Before its first tick it fails runs a dead process left "running" and removes leftover worktrees of its data dir's ended schedule runs, never another data dir's (`daemon.recovered`, REQ-discord-346). Restarts are systemd's job (docs/DAEMON.md).
doctor always prints a `spend` line (SAFE-8 / AUTONOMOUS-8, REQ-cli-098): `info` when `CORVIDINHO_DAILY_SPEND_CAP_USD` is unset (no DB opened), otherwise rolling 24 h spend vs the cap with the percent, `warn` at the 80% warning, at the cap, for an unpriced model, an invalid value or an unreadable ledger; it never changes the doctor exit code. `task run` copies the run's 80% spend warning onto `TaskResult.spendWarning` (`--json` and the NDJSON `result` frame); a run stopped at the cap is `blocked` and exits 0, its summary is the generic `SPEND_CAP_SUMMARY`, and text output also prints the ask question (the operator details). The headless daemon, which has no Discord, logs a `warn` `spend.warning` line for a schedule run that crossed 80% and a `warn` `run.needs_human` line (with `reason`) for a run that stopped to ask; the recorded warning stays pending for a bridge to deliver.
`daemon` needs no Discord token, adds no env vars of its own (the nightly backup's optional `CORVIDINHO_BACKUP_DIR`, REQ-cli-680, is shared with the bridge), runs at most one instance per data dir, logs scrubbed JSON lines, and on SIGTERM/SIGINT drains (≤30 s), records stragglers failed, gives them ≤3 s to park their worktree, releases the lock and exits 0. Before its first tick it fails runs a dead process left "running" and removes leftover worktrees of its data dir's ended schedule runs, never another data dir's (`daemon.recovered`, REQ-discord-346). Before every tick it re-reads the allowlist (file, env overlays, `DISCORD_CHANNEL_IDS`) into the scheduler's gate in place, so `/admin` edits apply without a restart, and it passes the configured owner so the owner's schedules pass the creator gate (DISCORD-SCHEDULE-3 / REQ-cli-108), plus a loader that re-reads the owner config (`loadOwnerConfig({ env })`) at each run, so only the owner as configured now gets the owner stamp for their own schedule (DISCORD-SCHEDULE-1.a, REQ-cli-741); a file that does not load skips that tick's schedules (`tick.allowlist_failed`; the nightly backup, REQ-cli-680, still ticks), and a tick still re-reading it when stop begins claims no run. Restarts are systemd's job (docs/DAEMON.md).
No command ends in a stack trace, a library object dump or Bun's crash footer (REQ-cli-419, CLI-4 / CLI-7 / SAFE-6): `runCli` sends anything `main` throws, and `plugins run` sends an unknown name or a throwing handler, to `reportCliError`, which prints `corvidinho: <line>` and `hint: …` on stderr (`--json`: `{ "ok": false, "error": <line> }` on stdout, hint on stderr) and exits with the error's own `exitCode` or 1. `<line>` is `formatErrorLine` (first message line, SAFE-6 scrubbed, secret env values redacted, capped). `discord register-commands` failures and `github watch` 401 stops are one line too.
`daemon` needs no Discord token, adds no env vars of its own (the nightly backup's optional `CORVIDINHO_BACKUP_DIR`, REQ-cli-680, is shared with the bridge), runs at most one instance per data dir, logs scrubbed JSON lines, and on SIGTERM/SIGINT drains (≤30 s), records stragglers failed, releases the lock and exits 0. Restarts are systemd's job (docs/DAEMON.md).
doctor and the report-only `corvidinho init` check the project files in the current dir through `projectFilesDoctorChecks` (CLI-4, REQ-cli-430), one line each: `fledge.toml` (present and valid TOML), `verify-lane` (`[lanes.verify]` in fledge.toml or a `.fledge/lanes/*.toml` import, read in directory order like fledge, runs spec-check: the defined `spec-check` task, or a step or task `deps` chain that runs `specsync check`; every task its steps and their `deps` name is defined), `.specsync` and `specs` (directories). A missing item is `[missing]` (exit 1), named in plain language with what fails without it and, where Fledge / SpecSync has one, the command that creates it (`fledge run --init`, `specsync init`, `specsync generate`); below a git project root that has the item, the line names that root to run from instead. Only regular files are opened; file contents and parser messages are never printed. `init` prints the `llm`, `fledge` and `specsync` lines plus the project-file lines, creates and changes nothing, and exits 1 only when an item is missing (the `llm` `warn` does not fail); Discord / GitHub keys and allowlists stay in doctor.

`--project <path>` (CLI-5, REQ-cli-505) runs the top-level process as if started in `<path>`: before any command, the env becomes what Bun builds for a process started there (Bun's own `.env*` loading, probed once in `<path>` from `/proc/self/environ` with the CLI's own `--no-env-file` / `--env-file` flags and Bun config pinned to `SPAWN_BUN_CONFIG`; set variables win; the start directory's `.env*` values do not carry over, to this process or to any child it starts: a `Bun.spawn` / `Bun.spawnSync` without `env` gets the new `process.env`), then the process `chdir`s there, so `fledge.toml`, specs and project files are `<path>`'s. A missing, non-directory, unreadable or empty `--project` is one `reportCliError` line (exit 1) and changes nothing. Read only before `--`, never from `--task` text; spawned agents keep `--no-env-file`.
`task run` routes the must-ask gate's one-line notes (`[operator] AUTONOMY-9|10: waiting for the owner's OK on an Approve card …` and the approval line, `setMustAskNotifier`) into the run's event stream as Text events for its duration, so text mode prints them on stderr and `--output ndjson` streams them as `Text` frames (protocol unchanged); `plugins run` and any caller without a notifier print them on stderr. A card that lapses, is denied, or cannot be raised (no owner, a worker) ends the call with a refusal saying why, and with no bridge running the lapse says the bridge DMs the card (AUTONOMY-9/10, REQ-cli-097). No flag or env var.
`task run` puts the configured model that answered, the usage per model and every model failover on `TaskResult.model` / `usageByModel` / `modelFallback` (`--json` and the NDJSON `result` frame, protocol unchanged), and each NDJSON `usage` frame names its `model` and the running `byModel`; each failover is also an `[operator] … falling back to …` line (stderr in text mode, a Text frame in ndjson) and the answer's closing note. The daemon's own spawn client logs a `warn` `llm.fallback` event (`sessionId`, `fallbacks`, `message`) for a schedule run that failed over (AGENT-11, REQ-cli-080). No flag or env var.

`task run` copies the run's SAFE-13 notice (a tool result that looked like a prompt-injection attempt: the tool name and reason ids, never the text) onto `TaskResult.injection` (`--json` and the NDJSON `result` frame, protocol unchanged), the way it copies `spendWarning`, so the Discord, WATCH and schedule surfaces can tell the owner (REQ-cli-071). No flag or env var.
`bun test` never writes the operator's state (REQ-cli-262, SAFE-5): the preload always points `CORVIDINHO_DATA_DIR` at its own temp dir, unsets `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_WATCH_SPAWN_LOG` and `WORKTREE_BASE_DIR` plus the run settings that change test outcomes (`CORVIDINHO_NON_INTERACTIVE`, `FLEDGE_NON_INTERACTIVE`, `CORVIDINHO_DAILY_SPEND_CAP_USD`, `CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, and a scheduled run's `CORVIDINHO_DISCORD_SESSION_ID`, DISCORD-SCHEDULE-3.a), and makes `Bun.spawn` / `Bun.spawnSync` without an explicit `env` pass that env to children.
`task run` copies the text a tool showed only privately (MEMORY-7.a: private notes, a profile, the owner's view of someone's memory — `privateText`, which the model never saw) onto `TaskResult.privateReplies` (`--json` and the NDJSON `result` frame, protocol unchanged; a retried attempt's repeat kept once; bounded by `boundPrivateReplies` (`src/discord/private-reply.ts`) — at most 5, each scrubbed then cut to 6000 with a marker — so large private reads cannot push the frame past the parser's line cap), for the Discord bridge to send by direct message (REQ-cli-710). No flag or env var.
`bun test` never writes the operator's state (REQ-cli-262, SAFE-5): the preload always points `CORVIDINHO_DATA_DIR` at its own temp dir, unsets `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_WATCH_SPAWN_LOG` and `WORKTREE_BASE_DIR` plus the run settings that change test outcomes (`CORVIDINHO_NON_INTERACTIVE`, `FLEDGE_NON_INTERACTIVE`, `CORVIDINHO_DAILY_SPEND_CAP_USD`, `CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`), and makes `Bun.spawn` / `Bun.spawnSync` without an explicit `env` pass that env to children.
`bun test` leaves no temp dirs behind (REQ-cli-711): the preload first makes one `corvidinho-test-run-*` root in the temp dir the run started with and points `TMPDIR` / `TMP` / `TEMP` at it, so every later `tmpdir()` / `mkdtemp` in the suite and in children it spawns without an explicit `env` (and the scratch data dir) lands under it; a watcher the preload starts removes it once that `bun test` process has exited, however it ends (pass, fail, `--bail`, `process.exit()`, a signal or SIGKILL to it), never while tests may still use it (`--rerun-each`, `--parallel --no-isolate`), touching nothing outside it, best-effort and never throwing.

Nightly backup (OPS-1/2, REQ-cli-680, `src/store/backup.ts`): with `CORVIDINHO_BACKUP_DIR` unset nothing is backed up and doctor prints `[warn] backup: off — …`; a relative path or a directory in a git work tree is never written. The scheduler tick (daemon and bridge) claims the night once per local day per data dir from 03:00 local time, writes a checked `VACUUM INTO` snapshot (umask 077, fsync, rename to `corvidinho-<UTC>Z.db`, 0600; `ensureScrubbed` first; newest 7 kept, other files untouched) and, when due (never ran, ≥7 days, or failing) and a snapshot exists, restores the newest into a temp dir through `restoreSnapshot`, checks integrity / schema version / tables / row counts against the recorded ones, and deletes it. Every run is logged (`backup.ok` / `backup.failed` / `restore_test.ok` / `restore_test.failed` / `restore_test.skipped`; the daemon adds `backup` to `daemon.started`). The first failure of a streak records an owner notice in `schema_meta` (later ones only update the scrubbed reason); the daemon never posts it (REQ-discord-680 delivers it). `backup restore` never overwrites a file a process holds open, even with `--force`; an existing idle target needs `--force`. A snapshot temp file more than an hour old (a crashed run's) is removed before the next snapshot; a backup dir reached through a symlink into a git work tree is refused. The night's job in progress is marked in `schema_meta` (pid + process start); a run whose process died before it finished is recorded as that job's failure (`interrupted: …`) at the next tick with the backup on, so it is told like any failure. The daemon's backup ticks even when its allowlist file fails to load. doctor's `backup` line is `[warn]` while no `/announce` channel is set, since the owner notice goes only there. State is `schema_meta` `ops_*` keys: no table, column or schema version.

## Behavioral Examples

### Scenario: Github watch missing token

- **Given** no GITHUB_TOKEN / GH_TOKEN
- **When** the operator runs `corvidinho github watch`
- **Then** exit non-zero naming the token env and go-live checklist

### Scenario: Init in a dir without project files

- **Given** a directory with no `fledge.toml`, `.specsync/` or `specs/`
- **When** the operator runs `corvidinho init` there
- **Then** it prints `[missing]` for `fledge.toml`, `verify-lane`, `.specsync` and `specs`, each in plain language with the command that creates it where one exists, creates nothing and exits 1
### Scenario: Another project without cd

- **Given** the operator's shell is in directory A and project P has its own `fledge.toml`, specs and `.env`
- **When** the operator runs `corvidinho --project P task run --task "…"`
- **Then** the run uses P's `fledge.toml`, plans with P's specs and has P's `.env` values (not A's), exactly as when started in P

### Scenario: Plugin args that look like Corvidinho flags

- **Given** `CORVIDINHO_ALLOWLIST=shell-exec`
- **When** the operator runs `corvidinho plugins run shell-exec --json -- ls -h --json`
- **Then** the plugin gets `ls -h --json` and the result prints as JSON, not help

### Scenario: The nightly backup fails

- **Given** `CORVIDINHO_BACKUP_DIR` names a path that is a file and the daemon ticks after 03:00 local time
- **When** the tick claims tonight's backup
- **Then** it logs `backup.failed` (error level, the reason, `ownerNotice: "recorded"`), records the owner notice for a bridge to post, and the next night's failure is logged with `ownerNotice: "already recorded this failure streak"`

### Scenario: Restoring onto the live DB while the bridge runs

- **Given** the bridge holds `<data dir>/corvidinho.db` open
- **When** the operator runs `corvidinho backup restore <snapshot> <data dir>/corvidinho.db --force`
- **Then** it prints `restore refused: … is open in process <pid> …` and exits 1; the live DB is unchanged

### Scenario: Second daemon on one data dir

- **Given** `corvidinho daemon` is running with data dir D
- **When** the operator starts another `corvidinho daemon` with data dir D
- **Then** it logs `daemon.lock_held` naming the first daemon's pid and exits 1

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown command | Print error + help; exit 1 |
| `--project` path missing, not a directory, unreadable, or no path given | `corvidinho: --project …` + `hint: pass --project the path of an existing project directory`; exit 1; no command runs; `--json` → `{ok:false,error}` (REQ-cli-505) |
| `--no-verify` read as a Corvidinho flag (any command) | `corvidinho: --no-verify was removed: verification can't be skipped (AGENT-14)` + `hint:`; exit 1 before anything runs; `--json` → `{ok:false,error}` (REQ-cli-085) |
| `fledge.toml` still sets `[corvidinho] verify_before_complete` | Ignored: the gate still runs; doctor prints `[warn] verify-gate` naming the key, never fails (REQ-cli-085) |
| `--project` `.env` probe fails | `corvidinho: --project <dir>: could not load its .env files …` + hint to check the dir and its `.env` files; exit 1; nothing changed (REQ-cli-505) |
| `specsync` with no or an unknown subcommand | Usage line naming every subcommand (`score` included); exit 1 |
| `plugins run` unknown name (incl. `fledge-*`) | `corvidinho: Unknown plugin command: <name>` + `hint:` (`plugins list`); exit 1; `--json` → `{ok:false,error}` |
| A command throws (plugin handler, unusable data dir, …) | One scrubbed line + `hint:`; exit the error's `exitCode` or 1; no stack, no crash footer |
| `discord register-commands` rejected | `[discord] register-commands failed (<status>): <line>` (+ token hint on 401/403); exit 1 |
| `github watch` token rejected (GitHub 401) | Poller stops with one line naming `GITHUB_TOKEN / GH_TOKEN`; exit 1 |
| Attribution command | Print the canonical markdown footer; exit 0 |
| Doctor missing tools/env | Print per-check status; exit 1 (no secrets) |
| Doctor: allowlists only in the allowlist file | `[ok] discord` / `[ok] github-watch` naming source `file` (values not shown) |
| Doctor: every allowlisted channel / repo also deny-listed, or allowlist file does not load | `[missing] discord` / `[missing] github-watch`; exit 1 |
| Doctor / `init`: no usable model provider (no `CORVIDINHO_LLM_MODEL`, or its kind's key unset) | `[warn] llm: No model provider is configured …` naming what to set; exit code unchanged (REQ-cli-003) |
| `task run` with no usable provider for its tier | the notice on stderr first (text output); the run calls nothing and ends `failed` with the notice as its summary; exit 1 (REQ-cli-079) |
| Daemon start with no usable provider | `llm.no_provider` warn line with the notice; `daemon.started` carries `llm: "none"` (REQ-cli-079) |
| A model fails in `task run` and the tier lists a next one | `[operator] <a> failed (<reason>); falling back to <b>` on stderr (a Text frame in ndjson); the answer ends with the `(model fallback: …)` note; the result carries `model`, `usageByModel`, `modelFallback` (REQ-cli-080) |
| A daemon schedule run failed over | `llm.fallback` warn event with `sessionId`, `fallbacks` and `message`; no DM (REQ-cli-080) |
| Doctor: the owner or a declared person has a GitHub login but no GitHub numeric id | `[warn] people-github` naming person ids only (on GitHub they read as undeclared until an id is linked); exit code unchanged (REQ-cli-367) |
| Doctor: data dir not a directory, a symlink to nothing, not creatable or not writable | `[fail] data-dir`; exit 1 |
| Doctor: blank (whitespace-only) Discord / GitHub token or watch login | `[missing] discord` / `[missing] github` / `[missing] github-watch` (bridge / WATCH / Octokit trim them); exit 1 |
| Doctor / `init`: no `fledge.toml`, no verify lane or one without spec-check, no `.specsync/` or `specs/` in the current dir | `[missing]` line per item in plain language; exit 1; nothing is created |
| Doctor / `init`: `fledge.toml` (or a `.fledge/lanes/*.toml` import) not valid TOML, or not a regular file (FIFO, device: never opened) | `[missing] fledge.toml` / `[missing] verify-lane` naming the file, never its contents; exit 1 |
| Doctor / `init`: verify lane step (or a step task's `deps`) names an undefined task | `[missing] verify-lane` naming the task (fledge refuses the lane); exit 1 |
| Doctor / `init` run in a subdirectory of a git project whose root has the project files | Each `[missing]` line names the root to run from, not a creator command; exit 1 |
| Task verify exhausted | Exit 1; JSON verified false |
| Task run gets SIGINT / SIGTERM | Run aborted (verify lane and tool loop stopped); cancelled result printed (ndjson `result` frame); exit 130 |
| Task run started with SIGINT ignored (background job) | SIGINT stays ignored; SIGTERM still cancels (exit 130) |
| Daemon lock held by a live daemon | `daemon.lock_held` log line; exit 1 |
| Daemon `CORVIDINHO_BIN` protocol mismatch | `daemon.protocol_mismatch` log line; lock released; exit 1 |
| Daemon: allowlist file does not load at a tick | `tick.allowlist_failed` log line (loader error, no list values); tick skipped, no schedule runs, due schedules stay due (the nightly backup still ticks, REQ-cli-680); the daemon keeps running |
| `backup list` / `backup restore` with `CORVIDINHO_BACKUP_DIR` unset or relative | One line (`… is not set — no nightly backup is configured` / `must be an absolute path`); exit 1 |
| `backup restore` wrong arg count or unknown subcommand | Usage line; exit 1 |
| `backup restore` name not a snapshot name, not in the dir, or snapshot fails its check | `restore refused: …`; exit 1; target untouched |
| `backup restore` target held open by a process (or a live `daemon.lock` beside `corvidinho.db`) | `restore refused: <target> is open in process <pids> …`, even with `--force`; exit 1 |
| `backup restore` existing target without `--force`, or a directory target | `restore refused: … exists — pass --force …` / `… is a directory …`; exit 1 |
| Nightly backup: dir unusable (relative, in a git work tree, not a directory, write error) or snapshot check fails | `backup.failed` log (error); no partial file; owner notice recorded once per streak; doctor `[warn] backup` with the reason |
| Restore test fails (copy, check, row counts, temp dir) | `restore_test.failed` log (error); temp dir removed; owner notice once per streak; retried next night |
| Nightly backup or restore test interrupted (its process died mid-run) | Next tick with the backup on: `backup.failed` / `restore_test.failed` (error, `interrupted: true`); owner notice once per streak |
| Doctor: backup off, unusable or failing | `[warn] backup: …`; exit code unchanged (never blocks a box update) |

## Dependencies

Consumes plugins module for loadBuiltins/list/size/runPlugin/helpers.
Consumes agent module for runTask / loadAgentConfig.
Daemon consumes discord module scheduler (`ScheduleStore`, `SchedulerService`), allowlist/config helpers, spawn agent client and protocol check, plus the shared store (`openCorvidinhoDb`, `resolveDataDir`, `scrubSecrets`).
`src/store/backup.ts` uses the shared store (`migrateCorvidinhoDb`, `SCHEMA_VERSION`, `ensureScrubbed`, `formatErrorLine`, `scrubSecrets`) and the daemon lock helpers (`daemonLockPath`, `isHolderAlive`); the scheduler (`SchedulerServiceOpts.backup`) runs its ticker in the daemon and the bridge.

## Change Log

| 2026-09-26 | files-search-plugins-issue-81: package 0.0.6 with files/search + SAFE-2 (REQ-cli-013) |
| 2026-09-26 | memory-discord-inject: package 0.0.7 with MEMORY Discord inject (REQ-cli-014) |
| 2026-09-26 | discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior: Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7 |
| 2026-09-26 | identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake: IDENTITY durable owner record (issue #42 captured slice IDENTITY-1/IDENTITY-3 + ADMIN-4 + ALLOW-4): owner Discord snowflake plus optional GitHub login and display from bot-VM env CORVIDINHO_OWNER_* or allowlist file [owner] section (env overrides file); owner resolves to ADMIN at handler time unless deny-listed or muted; existing admin env lists unchanged; empty owner means no owner; ephemeral /status and doctor show owner configured yes/no plus display only; strict owner-only admin (IDENTITY-2) left for Leif |
| 2026-09-26 | shell-exec-safe-3-issue-83: package 0.0.9 with shell-exec + SAFE-3 (REQ-cli-015) |
| 2026-09-26 | strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner: Strict IDENTITY-2: ADMIN is owner-only (issue #42, Leif decision). Admin user/role env lists no longer grant ADMIN; no owner means nobody is ADMIN (IDENTITY-3); bridge and doctor warn when legacy admin lists are set |
| 2026-09-26 | live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one: Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2 |
| 2026-09-26 | task-run-task-always-takes-the-next-argv-item-as-task-text-so-untrusted-discord-github-text-that-looks-like-a-flag-tier: Task run --task always takes the next argv item as task text, so untrusted Discord/GitHub text that looks like a flag (--tier=code, --no-verify) can never be parsed as a CLI flag; --task=TEXT may span lines |
| 2026-09-26 | release-0-0-12-typed-git-tools-145-and-durable-watch-sessions-142-package-0-0-12-changelog-status: Release 0.0.12: typed git tools (#145) and durable WATCH sessions (#142); package 0.0.12, CHANGELOG, STATUS |
| 2026-09-26 | safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a: SAFE-8 daily spend cap (issue #98 captured slice): optional CORVIDINHO_DAILY_SPEND_CAP_USD caps provider (LLM) spend over a rolling 24h; each OpenAI-compatible call is priced from a per-model table, reserved against a spend_ledger in the shared SQLite DB before it is sent and refused with a clear error when it would break the cap, then settled from provider-reported token usage; unpriced models are refused while a cap is set; no cap means no behavior change; doctor shows spend vs the cap (AUTONOMOUS-8); ledger provider/model columns are SAFE-6 scrubbed; draft SAFE-14..16 (80% warn, per-provider caps, ask at 100%) left for HI capture |
| 2026-09-26 | discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still: Discord and WATCH spawns always run prove-before-done (AGENT-4 / FLEDGE-2): stop passing --no-verify; empty filesChanged still skips verify; CLI --no-verify local opt-out only; package 0.0.13 (#85 slice) |
| 2026-09-26 | headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord: Headless schedule daemon (issue #108 captured slice CLI-8 / AUTONOMOUS-4): corvidinho daemon ticks schedules without Discord, single-instance lock in the data dir, clean SIGTERM/SIGINT shutdown, JSON-line logs, systemd doc; schedule ticks claim each due run atomically in SQLite so a daemon and a bridge on one data dir never double-fire or clobber each other |
| 2026-09-26 | call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the: Call registered Fledge plugins as tools (issue #112, FLEDGE-4/5 PLUGIN-2/3/6): discover the project's Fledge plugins via the fledge CLI, register each command as a dangerous typed plugin run through fledge plugins run with argv arrays, and show per-command tool schema cost plus a context budget line in plugins list |
| 2026-09-26 | release-0-0-16-daemon-157-web-fetch-148-fledge-plugins-as-tools-154-pr-diff-files-153-ci-by-ref-158-project: Release 0.0.16: daemon (#157), web-fetch (#148), Fledge plugins as tools (#154), PR diff/files (#153), CI by ref (#158), project instructions (#150); package 0.0.16, CHANGELOG, STATUS |
| 2026-09-26 | safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run: SAFE-8 amended (issue #98): warn at 80% of the daily spend cap and ask at 100% instead of refusing. Once per crossing a run that pushes rolling 24h spend to 80% of CORVIDINHO_DAILY_SPEND_CAP_USD emits a warning (Text event, result spendWarning, Discord reply line with owner ping); a provider call that would pass the cap is stopped before it is sent and the run ends blocked with a spend-cap ask to the owner via the AUTONOMY-1/2 ask path stating spend vs cap and how to continue; doctor and Discord /status show 24h spend vs the cap (AUTONOMOUS-8); Approve card (#96) left for HI capture |
| 2026-09-26 | release-0-0-18-ask-human-owner-ping-autonomous-gate-delegate: Release 0.0.18: ask-human + owner ping, autonomous gate + delegate |
| 2026-09-26 | release-0-0-21-security-correctness-sweep-council-tool-admin-pr-diff-edges-operator-guide: Release 0.0.21: security + correctness sweep, council tool, admin/pr-diff edges, operator guide |
| 2026-09-26 | harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own: Harden child process lifetimes and Fledge scoping (issue #112 follow-up to #154, #157, #167): fledge plugin argv after --, own process group plus tree kill on timeout or abort for Fledge runs, delegate workers and schedule runs, daemon shutdown kills abandoned runs, Fledge commands scoped to the project root they were discovered for |
| 2026-09-26 | allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are: Allowlist file TOML reader loads multi-line arrays and fails closed on anything it cannot parse, so file deny lists are never silently dropped |
| 2026-09-26 | release-0-0-23-stop-means-stop-process-trees-safe-3-cd-clamp-scrub-before-clip-github-gate-reads-allowlist-file: Release 0.0.23: stop means stop (process trees), SAFE-3 cd clamp, scrub before clip, GitHub gate reads allowlist file |
| 2026-09-26 | box-updater-a-set-corvidinho-bridge-unit-wins-over-a-leftover-pidfile-no-second-nohup-bridge-the-env-file-is-loaded: Box updater: a set CORVIDINHO_BRIDGE_UNIT wins over a leftover pidfile (no second nohup bridge), the env file is loaded once before doctor and every restart/rollback path, and CORVIDINHO_BRIDGE_CMD runs with its text off the shell argv so pkill -f cannot kill its own shell |
| 2026-09-26 | task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out: Task run stops on SIGINT/SIGTERM with a cancelled result and a stopped verify lane, and a stalled LLM request times out (agent-loop-4) |
| 2026-09-27 | task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an: Task run leaves a SIGINT it started with ignored alone, and an interrupted verify lane stops waiting on a pipe an escaped lane process holds (agent-loop-4 follow-up) |
| 2026-09-27 | release-0-0-26-spend-cap-warn-ask-crash-restart-recovery-allowlist-fail-closed-safe-3-clamp-watch-dedup: Release 0.0.26: spend cap warn/ask, crash + restart recovery, allowlist fail-closed, SAFE-3 clamp, WATCH dedup |
| 2026-09-27 | tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points: Tests never write the operator data dir and the verify lane never sees operator secrets: bun test preload always points CORVIDINHO_DATA_DIR at its own temp dir and clears CORVIDINHO_AUDIT_HMAC_KEY / CORVIDINHO_WATCH_SPAWN_LOG / WORKTREE_BASE_DIR; the fledge verify runner spawns with DISCORD_*, GitHub tokens, LLM API keys, the audit key and CORVIDINHO_ACTING_* stripped (SAFE-5 / SAFE-6) |
| 2026-09-27 | schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write: Schedule runs never stay running forever: bridge stop abandons in-flight runs like the daemon, a failed run-outcome write is retried once then logged and counted failed, bridge and daemon start fail runs a dead process left running and remove leftover schedule worktrees, and stop waits a short bounded grace for aborted runs to park their worktree |
| 2026-09-27 | clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or: Clean CLI errors: a failing command prints one scrubbed line plus a hint and exits non-zero instead of a stack trace or Bun crash footer; discord bridge login failure exits cleanly naming DISCORD_TOKEN; github watch stops with exit 1 on a GitHub 401 |
| 2026-09-27 | box-updater-pidfile-mode-counts-the-bridge-ready-only-on-its-discord-login-line-discord-logged-in-as-not-the-pre-login: Box updater pidfile mode counts the bridge ready only on its Discord login line ([discord] logged in as), not the pre-login protocol version OK line, so a bridge that dies on login rolls back |
| 2026-09-27 | doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and: Doctor reads channel and repo allowlists through the bridge and watch loader (allowlist file plus env, deny wins) and names the source, warns when no LLM key is set (task run uses the demo stub) and checks the data dir is writable |
| 2026-09-27 | release-0-0-29-slash-asks-session-continuity-allowlisted-channel-gates-secret-path-hiding-schedule-run-recovery-schema: Release 0.0.29: slash asks + session continuity, allowlisted-channel gates, secret-path hiding, schedule-run recovery (schema v10), clean CLI errors, doctor reads the allowlist file |
| 2026-09-27 | daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once: Daemon-claimed schedule asks reach Discord: the run row records the ask and the bridge's scheduler tick posts it once (AUTONOMY-2 / AUTONOMOUS-7 needs-human outbox) |
| 2026-09-27 | per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5: Per-tier model: read/tool/code runs call the model configured for that tier (AGENT-5) |
| 2026-09-27 | local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to: Local spec-check runs at the CI Spec Sync strictness (specsync check --require-coverage 100), specsync-check falls back to specsync check when the project defines no Fledge spec-check task, and a read-only specsync-score tool reports SpecSync spec scores (SPECSYNC-2/3, issue 89) |
| 2026-09-27 | schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live: Schedule ticks re-check the creator against the live Discord user allowlist, and the daemon ticks against the live allowlist (DISCORD-SCHEDULE-3) |
| 2026-09-27 | plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on: PLUGIN-4 language runner plugins: node-exec, python-exec and cargo-exec register when node, python3/python or cargo is on PATH and degrade cleanly when the toolchain is missing (dangerous, code tier, argv only, cwd pinned to the project root) |
| 2026-09-27 | release-0-0-30-session-threads-images-to-the-model-real-diff-verify-per-tier-models-creator-gated-schedule-ticks-daemon: Release 0.0.30: session threads, images to the model, real-diff verify, per-tier models, creator-gated schedule ticks + daemon asks reach Discord (schema v11), CI-strict spec-check, language runners, CI tags every version |
| 2026-09-27 | release-0-0-31-owner-only-channel-autocomplete-keystore-and-specsync-write-protection-audited-schedule-delete-per-user: Release 0.0.31: owner-only channel autocomplete, keystore and .specsync/ write protection, audited /schedule delete, per-user thread sessions, failing-step verify feedback, paused schedules ping the owner, presence on every IDENTIFY, SpecSync lists specs/ |
| 2026-09-27 | project-files-preflight-shared-by-doctor-and-a-report-only-init-doctor-and-a-new-report-only-corvidinho-init-name-a: Project-files preflight shared by doctor and a report-only init: doctor and a new report-only corvidinho init name a missing fledge.toml, verify lane with spec-check, .specsync/ and specs/ in plain language before task run fails on them mid-task (CLI-4) |
| 2026-09-27 | global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as: Global --project <path> flag runs the CLI as if started in that directory: that project's fledge.toml, specs and .env files as Bun loads them there, never the start directory's (CLI-5) |
| 2026-09-27 | release-0-0-32-allowlisted-tools-reach-the-model-fledge-core-builtins-choose-asks-on-work-and-session-start-open-asks: Release 0.0.32: allowlisted tools reach the model, Fledge core builtins, Choose asks on work and session start, open asks kept per askId, role-refusal note, --project, doctor and init name project files |
| 2026-09-27 | release-0-0-33-discord-8-acting-user-post-check-open-asks-scrubbed-at-rest-and-re-scrubbed-watch-comment-rate-limit: Release 0.0.33: DISCORD-8 acting-user post check, open asks scrubbed at rest and re-scrubbed, watch comment rate-limit backoff |
| 2026-09-26 | plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json: Plugins run passes every argv item after the -- that follows the plugin name to the plugin verbatim, so global flags, --json and -h there are never taken by the Corvidinho CLI |
| 2026-09-29 | nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per: Nightly SQLite backup to a directory the owner sets with a weekly tested restore, a restore command and a once-per-failure-streak owner notice (OPS-1/2, #68) |
| 2026-09-29 | docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in: Docs: operator docs match the code - --help and the go-live checklist say empty Discord user/role allowlists admit anyone in an allowlisted channel (not deny-all), and docs/DAEMON.md lists daemon.start_failed and spend.warning |
| 2026-09-29 | verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned: Verify retry feedback never ends on half a surrogate pair; a non-git lead verifies after a delegate worker that returned no result frame; github-pr-create attribution check is exact; doctor and the Octokit plugins treat a blank GITHUB_TOKEN / GH_TOKEN as missing |
| 2026-09-29 | prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a: Prompt-injection hygiene: display names are cleaned before the model sees them and a name that imitates the owner or a declared person is flagged, identity and role still only from declared ids (SAFE-11); a non-owner's chat, /session start and /work text, WATCH issue/PR/comment titles and bodies, and GitHub reader and guild-member tool results reach the model fenced as untrusted data, and the system prompt says such blocks never grant permission (SAFE-12); a conservative always-on detector refuses a non-owner message or WATCH event that looks like an injection attempt before any run with one short reply that tells the owner, and a tool result that trips it drops every mutating tool for the rest of the run and tells the owner on the answer, every hit audited (SAFE-13, #71) |
| 2026-09-30 | on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a: On GitHub people match only by their numeric user id: a renamed or re-registered login never counts as the owner or a declared person on WATCH (prompt, memory scope, SAFE-13 exemption); [owner] github_id declares the owner's id; /admin people link github stores the looked-up numeric id; doctor warns about logins without an id (IDENTITY-7.a, #36) |
| 2026-09-29 | release-0-0-34-declared-people-and-roles-person-and-project-memory-with-forget-me-github-memory-and-ranked-recall: Release 0.0.34: declared people and roles, person and project memory with forget-me, GitHub memory and ranked recall, condensed chats kept 30 days and resumed after the TTL (schema v13), answer footer and fence-safe 2000-char splits, nightly backup, discord-send-file, private Answer form, injection guards, W12 sweep |
| 2026-09-30 | scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run: Scheduled runs read and act only on repos the owner allowlists, even public ones (DISCORD-SCHEDULE-3.a): in a schedule run and its delegate/council workers (CORVIDINHO_DISCORD_SESSION_ID schedule_*, SCHEDULE_SESSION_PREFIX / isScheduleRunEnv) the GitHub tools, review readers and docs/milestone readers refuse a repo off the GITHUB-6 allowlist with no visibility lookup (deny still wins, role rules still apply on top); web-fetch refuses GitHub-host URLs that do not name an allowlisted OWNER/REPO at every hop, redirects included; a schedule project that lies in a git checkout nested inside the bridge root needs an allowlisted origin at /schedule create and every tick |
| 2026-09-29 | private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation: Private notes, profile reads and the owner's view of someone's memory are shown only privately: in a Discord conversation the memory plugins hand that text past the model (privateText; the model gets a sent-privately placeholder), task run carries it as privateReplies, and the bridge sends it by DM to whoever asked on chat, button pick and Answer form resumes, /session start and /work, with a short sent-privately note in the channel and never the text; refused in schedules and GitHub threads (MEMORY-7.a, #101) |
| 2026-09-30 | verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15: Verification can't be skipped and the real diff since the talk started decides what changed (AGENT-14, AGENT-15, AGENT-15.a): task run refuses --no-verify, [corvidinho] verify_before_complete is ignored, filesChanged comes from the real git diff alone (a claimed path git does not show still runs the lane), and a talk worktree whose last run did not end verified verifies from the talk branch's merge-base |
| 2026-09-30 | release-0-0-35-numeric-github-ids-dm-private-reads-github-forget-me-unskippable-verify-shell-guards-schedule-repo-gate: Release 0.0.35: numeric GitHub ids, DM private reads, GitHub forget-me, unskippable verify, shell guards, schedule repo gate |
| 2026-09-30 | bun-test-keeps-every-temp-dir-it-makes-under-one-per-run-root-in-tmpdir-and-removes-that-root-when-the-run-ends-instead: Bun test keeps every temp dir it makes under one per-run root in TMPDIR and removes that root when the run ends, instead of leaking ~500 mkdtemp dirs into /tmp per run (verify lane filled the agent box's disk) |
| 2026-09-30 | it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and: It asks me on an Approve card before touching prod or deploys or making a channel post; anything else it just does and tells me (AUTONOMY-9/9.a, AUTONOMY-10/10.a channel posts, AUTONOMY-11, #97) |
| 2026-09-30 | i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set: I configure the models (OpenAI-compatible, Ollama, Anthropic) with no built-in default, and it says so when none is set (AGENT-13, AGENT-10) |
| 2026-09-30 | if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11: If a model fails or is retired it falls back to my next configured model and tells me (AGENT-11) |
| 2026-09-30 | release-0-0-36-approval-cards-and-codes-must-ask-gate-owner-only-spend-no-default-model-tests-ran-verify-schedule-asks: Release 0.0.36: approval cards and codes, must-ask gate, owner-only spend, no default model, tests-ran verify, schedule asks |
| 2026-09-30 | a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and: A schedule the owner creates runs with the owner's tools and allowlist (never the shell, runners or Fledge commands) and asks on Approve cards where the must-ask list says so, a denied or lapsed card ending the run with a blocking ask; schedules other people create stay read-only (DISCORD-SCHEDULE-1.a) |
