---
module: cli
version: 59
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
  - tests/cli.clean-errors.test.ts
  - tests/fixtures/fake-http-401.ts

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
| `runCli` | `argv: string[], run?: (argv) => Promise<number>` | `Promise<number>` | Top-level error boundary around `main` (REQ-cli-419) |
| `reportCliError` | `err: unknown, opts?: { json?: boolean }` | `number` | One scrubbed error line + hint; returns the exit code (REQ-cli-419) |
| `cliErrorHint` | `err: unknown` | `string` | Next step for the operator matched to the error kind (data-dir hint for a filesystem error with a path or a bun:sqlite DB open error) |
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
| `llmDoctorCheck` | `env?` | `DoctorCheck` | Doctor `llm` line; `warn` (demo stub) without a key, never fails |
| `dataDirDoctorCheck` | `env?, home?` | `DoctorCheck` | Doctor `data-dir` line: exists + writable / creatable / `fail` |

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
| `DoctorCheck` | One doctor line: name, ok, detail, optional printed mark |
| `DoctorAllowlist` / `AllowlistUsage` / `AllowlistSource` | Doctor allowlist load result, listed / usable / deny-listed entry counts and source (`file` / `env`) |

## Invariants

task run honors --no-verify, --tier, and agent config; bridges may skip verify for latency.
plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count.
`specsync <list|read|check|brief|coverage|score|change-list|ship-status>` runs the matching `specsync-*` plugin through `plugins run`; `score` is `specsync-score`, the local `specsync score` report (SPECSYNC-3, REQ-cli-089).
plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count. The `plugins list` text view also prints which PLUGIN-4 language runners loaded (with their binary) and one `<name> not loaded: <tool> not found on PATH` line per missing toolchain, and still exits 0 (REQ-cli-112).
doctor reads what the long-running surfaces read (CLI-4, REQ-cli-003): the `discord` and `github-watch` checks load allowlists through the bridge / WATCH loader (allowlist file + env overlays, `mergeChannelIds` / `expandWatchRepos`), drop deny-listed entries (deny wins) and entries the gate cannot use (a repo that is not OWNER/REPO; the line names deny wins only when every entry is deny-listed), count a token / watch login only when not blank (as the bridge / WATCH trim), and name the source (`file`, `env`, `file + env`) and count, never ids, repos or tokens; a file that does not load fails both. The `llm` line is `ok` with `CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY` (value not shown) and `warn` (task run uses the demo stub) without, never changing the exit code. The `data-dir` line probes the shared data dir with a temp dir it removes: `ok` exists + writable, `info` missing but creatable (not created), `fail` otherwise, including a symlink to nothing (exit 1).
Attribution output uses only the project name and repository link and contains no account handle.
doctor always prints a `spend` line (SAFE-8 / AUTONOMOUS-8, REQ-cli-098): `info` when `CORVIDINHO_DAILY_SPEND_CAP_USD` is unset (no DB opened), otherwise rolling 24 h spend vs the cap with the percent, `warn` at the 80% warning, at the cap, for an unpriced model, an invalid value or an unreadable ledger; it never changes the doctor exit code. `task run` copies the run's 80% spend warning onto `TaskResult.spendWarning` (`--json` and the NDJSON `result` frame); a run stopped at the cap is `blocked` and exits 0, its summary is the generic `SPEND_CAP_SUMMARY`, and text output also prints the ask question (the operator details). The headless daemon, which has no Discord, logs a `warn` `spend.warning` line for a schedule run that crossed 80% and a `warn` `run.needs_human` line (with `reason`) for a run that stopped to ask; the recorded warning stays pending for a bridge to deliver.
`daemon` needs no Discord token, adds no env vars, runs at most one instance per data dir, logs scrubbed JSON lines, and on SIGTERM/SIGINT drains (≤30 s), records stragglers failed, gives them ≤3 s to park their worktree, releases the lock and exits 0. Before its first tick it fails runs a dead process left "running" and removes leftover worktrees of its data dir's ended schedule runs, never another data dir's (`daemon.recovered`, REQ-discord-346). Before every tick it re-reads the allowlist (file, env overlays, `DISCORD_CHANNEL_IDS`) into the scheduler's gate in place, so `/admin` edits apply without a restart, and it passes the configured owner so the owner's schedules pass the creator gate (DISCORD-SCHEDULE-3 / REQ-cli-108); a file that does not load skips that tick (`tick.allowlist_failed`), and a tick still re-reading it when stop begins claims no run. Restarts are systemd's job (docs/DAEMON.md).
No command ends in a stack trace, a library object dump or Bun's crash footer (REQ-cli-419, CLI-4 / CLI-7 / SAFE-6): `runCli` sends anything `main` throws, and `plugins run` sends an unknown name or a throwing handler, to `reportCliError`, which prints `corvidinho: <line>` and `hint: …` on stderr (`--json`: `{ "ok": false, "error": <line> }` on stdout, hint on stderr) and exits with the error's own `exitCode` or 1. `<line>` is `formatErrorLine` (first message line, SAFE-6 scrubbed, secret env values redacted, capped). `discord register-commands` failures and `github watch` 401 stops are one line too.
`daemon` needs no Discord token, adds no env vars, runs at most one instance per data dir, logs scrubbed JSON lines, and on SIGTERM/SIGINT drains (≤30 s), records stragglers failed, releases the lock and exits 0. Restarts are systemd's job (docs/DAEMON.md).
`bun test` never writes the operator's state (REQ-cli-262, SAFE-5): the preload always points `CORVIDINHO_DATA_DIR` at its own temp dir, unsets `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_WATCH_SPAWN_LOG` and `WORKTREE_BASE_DIR` plus the run settings that change test outcomes (`CORVIDINHO_NON_INTERACTIVE`, `FLEDGE_NON_INTERACTIVE`, `CORVIDINHO_DAILY_SPEND_CAP_USD`, `CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`), and makes `Bun.spawn` / `Bun.spawnSync` without an explicit `env` pass that env to children.

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
| `specsync` with no or an unknown subcommand | Usage line naming every subcommand (`score` included); exit 1 |
| `plugins run` unknown name (incl. `fledge-*`) | `corvidinho: Unknown plugin command: <name>` + `hint:` (`plugins list`); exit 1; `--json` → `{ok:false,error}` |
| A command throws (plugin handler, unusable data dir, …) | One scrubbed line + `hint:`; exit the error's `exitCode` or 1; no stack, no crash footer |
| `discord register-commands` rejected | `[discord] register-commands failed (<status>): <line>` (+ token hint on 401/403); exit 1 |
| `github watch` token rejected (GitHub 401) | Poller stops with one line naming `GITHUB_TOKEN / GH_TOKEN`; exit 1 |
| Attribution command | Print the canonical markdown footer; exit 0 |
| Doctor missing tools/env | Print per-check status; exit 1 (no secrets) |
| Doctor: allowlists only in the allowlist file | `[ok] discord` / `[ok] github-watch` naming source `file` (values not shown) |
| Doctor: every allowlisted channel / repo also deny-listed, or allowlist file does not load | `[missing] discord` / `[missing] github-watch`; exit 1 |
| Doctor: no LLM key | `[warn] llm` (task run uses the demo stub); exit code unchanged |
| Doctor: data dir not a directory, a symlink to nothing, not creatable or not writable | `[fail] data-dir`; exit 1 |
| Doctor: blank (whitespace-only) Discord / GitHub token or watch login | `[missing] discord` / `[missing] github-watch` (bridge / WATCH trim them); exit 1 |
| Task verify exhausted | Exit 1; JSON verified false |
| Task run gets SIGINT / SIGTERM | Run aborted (verify lane and tool loop stopped); cancelled result printed (ndjson `result` frame); exit 130 |
| Task run started with SIGINT ignored (background job) | SIGINT stays ignored; SIGTERM still cancels (exit 130) |
| Daemon lock held by a live daemon | `daemon.lock_held` log line; exit 1 |
| Daemon `CORVIDINHO_BIN` protocol mismatch | `daemon.protocol_mismatch` log line; lock released; exit 1 |
| Daemon: allowlist file does not load at a tick | `tick.allowlist_failed` log line (loader error, no list values); tick skipped, nothing runs, due schedules stay due; the daemon keeps running |

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
| 2026-09-26 | task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out: Task run stops on SIGINT/SIGTERM with a cancelled result and a stopped verify lane, and a stalled LLM request times out (agent-loop-4) |
| 2026-09-27 | task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an: Task run leaves a SIGINT it started with ignored alone, and an interrupted verify lane stops waiting on a pipe an escaped lane process holds (agent-loop-4 follow-up) |
| 2026-09-27 | release-0-0-26-spend-cap-warn-ask-crash-restart-recovery-allowlist-fail-closed-safe-3-clamp-watch-dedup: Release 0.0.26: spend cap warn/ask, crash + restart recovery, allowlist fail-closed, SAFE-3 clamp, WATCH dedup |
| 2026-09-27 | tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points: Tests never write the operator data dir and the verify lane never sees operator secrets: bun test preload always points CORVIDINHO_DATA_DIR at its own temp dir and clears CORVIDINHO_AUDIT_HMAC_KEY / CORVIDINHO_WATCH_SPAWN_LOG / WORKTREE_BASE_DIR; the fledge verify runner spawns with DISCORD_*, GitHub tokens, LLM API keys, the audit key and CORVIDINHO_ACTING_* stripped (SAFE-5 / SAFE-6) |
| 2026-09-27 | schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write: Schedule runs never stay running forever: bridge stop abandons in-flight runs like the daemon, a failed run-outcome write is retried once then logged and counted failed, bridge and daemon start fail runs a dead process left running and remove leftover schedule worktrees, and stop waits a short bounded grace for aborted runs to park their worktree |
| 2026-09-27 | clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or: Clean CLI errors: a failing command prints one scrubbed line plus a hint and exits non-zero instead of a stack trace or Bun crash footer; discord bridge login failure exits cleanly naming DISCORD_TOKEN; github watch stops with exit 1 on a GitHub 401 |
| 2026-09-27 | box-updater-pidfile-mode-counts-the-bridge-ready-only-on-its-discord-login-line-discord-logged-in-as-not-the-pre-login: Box updater pidfile mode counts the bridge ready only on its Discord login line ([discord] logged in as), not the pre-login protocol version OK line, so a bridge that dies on login rolls back |
| 2026-09-27 | doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and: Doctor reads channel and repo allowlists through the bridge and watch loader (allowlist file plus env, deny wins) and names the source, warns when no LLM key is set (task run uses the demo stub) and checks the data dir is writable |
| 2026-09-27 | release-0-0-29-slash-asks-session-continuity-allowlisted-channel-gates-secret-path-hiding-schedule-run-recovery-schema: Release 0.0.29: slash asks + session continuity, allowlisted-channel gates, secret-path hiding, schedule-run recovery (schema v10), clean CLI errors, doctor reads the allowlist file |
| 2026-09-27 | local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to: Local spec-check runs at the CI Spec Sync strictness (specsync check --require-coverage 100), specsync-check falls back to specsync check when the project defines no Fledge spec-check task, and a read-only specsync-score tool reports SpecSync spec scores (SPECSYNC-2/3, issue 89) |
| 2026-09-27 | schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live: Schedule ticks re-check the creator against the live Discord user allowlist, and the daemon ticks against the live allowlist (DISCORD-SCHEDULE-3) |
| 2026-09-27 | plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on: PLUGIN-4 language runner plugins: node-exec, python-exec and cargo-exec register when node, python3/python or cargo is on PATH and degrade cleanly when the toolchain is missing (dangerous, code tier, argv only, cwd pinned to the project root) |
