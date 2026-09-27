---
module: cli
version: 55
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
  - tests/preload.ts
  - tests/preload.operator-data-dir.test.ts
  - tests/fixtures/preload-probe.ts

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
doctor always prints a `spend` line (SAFE-8 / AUTONOMOUS-8, REQ-cli-098): `info` when `CORVIDINHO_DAILY_SPEND_CAP_USD` is unset (no DB opened), otherwise rolling 24 h spend vs the cap with the percent, `warn` at the 80% warning, at the cap, for an unpriced model, an invalid value or an unreadable ledger; it never changes the doctor exit code. `task run` copies the run's 80% spend warning onto `TaskResult.spendWarning` (`--json` and the NDJSON `result` frame); a run stopped at the cap is `blocked` and exits 0, its summary is the generic `SPEND_CAP_SUMMARY`, and text output also prints the ask question (the operator details). The headless daemon, which has no Discord, logs a `warn` `spend.warning` line for a schedule run that crossed 80% and a `warn` `run.needs_human` line (with `reason`) for a run that stopped to ask; the recorded warning stays pending for a bridge to deliver.
`daemon` needs no Discord token, adds no env vars, runs at most one instance per data dir, logs scrubbed JSON lines, and on SIGTERM/SIGINT drains (≤30 s), records stragglers failed, releases the lock and exits 0. Restarts are systemd's job (docs/DAEMON.md).
`bun test` never writes the operator's state (REQ-cli-262, SAFE-5): the preload always points `CORVIDINHO_DATA_DIR` at its own temp dir, unsets `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_WATCH_SPAWN_LOG` and `WORKTREE_BASE_DIR`, and makes `Bun.spawn` / `Bun.spawnSync` without an explicit `env` pass that env to children.

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
| 2026-09-27 | tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points: Tests never write the operator data dir and the verify lane never sees operator secrets: bun test preload always points CORVIDINHO_DATA_DIR at its own temp dir and clears CORVIDINHO_AUDIT_HMAC_KEY / CORVIDINHO_WATCH_SPAWN_LOG / WORKTREE_BASE_DIR; the fledge verify runner spawns with DISCORD_*, GitHub tokens, LLM API keys, the audit key and CORVIDINHO_ACTING_* stripped (SAFE-5 / SAFE-6) |
