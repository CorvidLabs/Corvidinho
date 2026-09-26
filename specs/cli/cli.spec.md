---
module: cli
version: 50
status: draft
files:
  - src/cli.ts
  - src/version.ts
  - src/attribution.ts
  - src/daemon/daemon.ts
  - src/daemon/lock.ts
  - src/daemon/log.ts
  - src/daemon/index.ts
  - .env.example
  - STATUS.md

db_tables: []
depends_on:
  - plugins
  - agent
---

# Cli

## Purpose

Operator surface includes Discord HEAR, GitHub WATCH, the headless schedule daemon, attribution, and task run with optional LLM plugin tool loop.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `main` | `argv: string[]` | `Promise<number>` | CLI entry; exit code |
| `attribution` | `format?: "markdown" or "plain"` | `string` | Return the canonical footer in the requested format |
| `startDaemon` | `opts?: StartDaemonOptions` | `Promise<StartDaemonResult>` | Take the data-dir lock and arm the headless schedule ticker (CLI-8 / AUTONOMOUS-4) |
| `runDaemon` | `opts?: StartDaemonOptions` | `Promise<number>` | `corvidinho daemon`: start, then stop cleanly on SIGTERM/SIGINT |
| `acquireDaemonLock` | `opts: AcquireDaemonLockOptions` | `AcquireDaemonLockResult` | Exclusive `<data dir>/daemon.lock`; stale dead/recycled pid taken over |
| `daemonLockPath` | `dataDir: string` | `string` | Lock file path |
| `isHolderAlive` | `holder, procStartOf?` | `boolean` | Pid alive and same /proc start time |
| `readProcStart` | `pid: number` | `string or null` | Field 22 of /proc/<pid>/stat |
| `createDaemonLogger` | `opts?: DaemonLoggerOptions` | `DaemonLogger` | JSON-line logger (scrubbed) |
| `formatDaemonLogLine` | `level, event, fields?, now?` | `string` | One scrubbed JSON log line |

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

### Exported Types

| Type | Description |
|------|-------------|
| `AttributionFormat` | Supported attribution output formats |
| `StartDaemonOptions` / `StartDaemonResult` / `DaemonStopSummary` | Daemon start/stop contract (test seams: agent, db, poll, grace, lock) |
| `DaemonLock` / `DaemonLockHolder` / `AcquireDaemonLockOptions` / `AcquireDaemonLockResult` | Single-instance lock |
| `DaemonLogger` / `DaemonLogLevel` / `DaemonLogFields` / `DaemonLoggerOptions` | JSON-line logger |

## Invariants

task run honors --no-verify, --tier, and agent config; bridges may skip verify for latency.
plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count.
Attribution output uses only the project name and repository link and contains no account handle.
`daemon` needs no Discord token, adds no env vars, runs at most one instance per data dir, logs scrubbed JSON lines, and on SIGTERM/SIGINT drains (≤30 s), records stragglers failed, releases the lock and exits 0. Restarts are systemd's job (docs/DAEMON.md).

## Behavioral Examples

### Scenario: Github watch missing token

- **Given** no GITHUB_TOKEN / GH_TOKEN
- **When** the operator runs `corvidinho github watch`
- **Then** exit non-zero naming the token env and go-live checklist

### Scenario: Second daemon on one data dir

- **Given** `corvidinho daemon` is running with data dir D
- **When** the operator starts another `corvidinho daemon` with data dir D
- **Then** it logs `daemon.lock_held` naming the first daemon's pid and exits 1

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown command | Print error + help; exit 1 |
| Attribution command | Print the canonical markdown footer; exit 0 |
| Doctor missing tools/env | Print per-check status; exit 1 (no secrets) |
| Task verify exhausted | Exit 1; JSON verified false |
| Daemon lock held by a live daemon | `daemon.lock_held` log line; exit 1 |
| Daemon `CORVIDINHO_BIN` protocol mismatch | `daemon.protocol_mismatch` log line; lock released; exit 1 |

## Dependencies

Consumes plugins module for loadBuiltins/list/size/runPlugin/helpers.
Consumes agent module for runTask / loadAgentConfig.
Daemon consumes discord module scheduler (`ScheduleStore`, `SchedulerService`), allowlist/config helpers, spawn agent client and protocol check, plus the shared store (`openCorvidinhoDb`, `resolveDataDir`, `scrubSecrets`).

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
| 2026-09-26 | discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still: Discord and WATCH spawns always run prove-before-done (AGENT-4 / FLEDGE-2): stop passing --no-verify; empty filesChanged still skips verify; CLI --no-verify local opt-out only; package 0.0.13 (#85 slice) |
| 2026-09-26 | headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord: Headless schedule daemon (issue #108 captured slice CLI-8 / AUTONOMOUS-4): corvidinho daemon ticks schedules without Discord, single-instance lock in the data dir, clean SIGTERM/SIGINT shutdown, JSON-line logs, systemd doc; schedule ticks claim each due run atomically in SQLite so a daemon and a bridge on one data dir never double-fire or clobber each other |
