---
spec: cli.spec.md
---

## User Stories

- As an operator on Linux, I want `corvidinho --help`, `version`, and `doctor` so I can confirm the CLI installs and see whether Discord, GitHub, Fledge, and SpecSync are usable without pasting secrets.

## Acceptance Criteria

### REQ-cli-001

`bun src/cli.ts --help` exits 0 and prints usage that names `corvidinho`, `doctor`, and `version`.

### REQ-cli-002

The CLI `version` command and shared exports SHALL read the package version from
`package.json` via the shared `src/version.ts` helper and SHALL NOT rely on a
hardcoded semver literal in the CLI. `src/version.ts` SHALL also export
`formatPresenceVersionString` returning a short `vX.Y.Z` string for Discord
presence (DISCORD-12). Existing `VERSION` / CLI version / `/status` consumers
SHALL remain compatible.

Acceptance Criteria
- Unit tests cover `readPackageVersion` / exported `VERSION`.
- `formatPresenceVersionString` returns short `vX.Y.Z` for Discord presence (DISCORD-12).
- CLI `version` prints the shared package version.

### REQ-cli-003

`bun src/cli.ts doctor` checks Discord token env presence, `gh auth status`, and whether `fledge` / `specsync` are on PATH, never printing secret values.


## Constraints

- Secrets stay out of repo and chat logs.
- Linux + Bun only for v1 bootstrap.

## Out of Scope

- Soft Discord polish (#10–14), GitHub write plugins, autonomous mode (later PRs).

### REQ-cli-004

The CLI SHALL provide `plugins list` and `plugins run <name>` and honor `--non-interactive` / CORVIDINHO_NON_INTERACTIVE / FLEDGE_NON_INTERACTIVE; doctor SHALL report loaded plugin count.

Acceptance Criteria
- `corvidinho plugins list` exits 0 and shows github + meta commands.
- Doctor includes a plugins check with command count.

### REQ-cli-005

Help/STATUS/README SHALL document bot-VM allowlist file + env overlays, default-deny (empty = refuse), and that AlgoChat/wallet ACT is deferred until a wallet allowlist exists (ALLOW-4, WALLET-1..3).

Acceptance Criteria
- `corvidinho --help` mentions allowlist file/env vars.
- STATUS/README note how to set allowlists on the bot VM; wallets deferred.

### REQ-cli-006

The CLI SHALL expose `task run` with `--no-verify`, optional `--max-retries`, and `--json` TaskResult output so operators and bridges can exercise or skip the prove-before-done gate.

Acceptance Criteria
- `corvidinho task run --no-verify --json` exits 0 with verify_skipped.
- Help documents `task run` and `--no-verify`.


### REQ-cli-007

`corvidinho task run` SHALL drive the prove-before-done loop with an injectable execute path: demo stub when no LLM key is configured; when `CORVIDINHO_LLM_API_KEY` (or documented fallback) is set, OpenAI-compatible execute including the plugin tool loop (tier tool|code) or read-tier chat. `--no-verify` remains for bridge latency. `--json` emits structured result+events for Discord/WATCH callers to parse.

Acceptance Criteria
- Help still documents task run / --no-verify / --json / --tier.
- Without LLM key, demo execute behaves as before (verify gate exercise).
- With key env documented in `.env.example` (no secret values).

### REQ-cli-008

The CLI SHALL expose `discord bridge` to start the HEAR bridge,
`discord register-commands` to full-overwrite Discord application commands
(REQ-discord-016), and `--protocol-version` printing the wire protocol integer.
Doctor SHALL note Discord token and allowlist go-live requirements without
printing secret values. Help SHALL document `DISCORD_GUILD_ID` preference for
fast guild-scoped registration.

Acceptance Criteria
- `corvidinho --protocol-version` prints `CORVIDINHO_PROTOCOL_VERSION` (currently `2`) and exits 0.
- `corvidinho discord bridge` without token exits non-zero with clean explanation.
- `corvidinho discord register-commands` without token exits non-zero naming token env.
- Help documents `discord bridge`, `discord register-commands`, and Discord env/allowlist vars including `DISCORD_GUILD_ID`.

### REQ-cli-1

The CLI SHALL export canonical markdown and plain attribution footers that link
to the Corvidinho repository and contain no account handles.

Acceptance Criteria

- The markdown and plain strings match the canonical repository URL exactly.
- Unit tests assert that neither string contains an `@` character.

### REQ-cli-2

`corvidinho attribution` SHALL print the canonical markdown footer and exit 0.

Acceptance Criteria

- The CLI output is exactly the markdown footer followed by a newline.
- The command exits with status 0.

### REQ-cli-watch-001

The CLI SHALL expose `corvidinho github watch` to start the poll loop and SHALL surface go-live checklist text on clean failure without printing secrets.

Acceptance Criteria
- Help lists `github watch`; missing token exits non-zero with checklist.

### REQ-cli-009

The CLI SHALL accept `--tier read|tool|code` for `task run` (and SHALL honor `CORVIDINHO_LLM_TIER`) and SHALL wire `createTaskExecute` with cwd, non-interactive mode, allowlist, and event forwarding so Discord/WATCH/`task run` callers share the same LLM plugin tool loop. Bridges SHALL keep `--no-verify` available for latency; the verify gate SHALL remain available when not skipped.

Acceptance Criteria
- Help documents `--tier` and LLM env vars (no secrets).
- task run forwards ToolCall/ToolResult when not `--json`.

### REQ-cli-010

The project SHALL ship package version `0.0.2` and SHALL expose a shared
version helper (`src/version.ts`) used by the CLI `version` command. STATUS.md
SHALL briefly note the 0.0.2 dogfood polish (shared version + richer Discord
`/status`).

Acceptance Criteria
- `package.json` version is `0.0.2`.
- CLI `version` prints `0.0.2` (or whatever package.json says).
- STATUS.md mentions 0.0.2 dogfood polish.
- Secrets remain out of repo; no new slash commands invented here.

### REQ-cli-011

The project SHALL ship package version `0.0.4` with the MEMORY SQLite + ACL
feature (issues #41 / #59). The shared `src/version.ts` helper SHALL continue
to read semver from `package.json` so CLI `version` and Discord presence
(DISCORD-12) report `0.0.4` after update. CHANGELOG SHALL include verbose
0.0.4 notes for MEMORY + ACL. STATUS.md SHALL mark MEMORY #41/#59 done.

Acceptance Criteria
- `package.json` version is `0.0.4`.
- CLI `version` prints `0.0.4`.
- CHANGELOG has a 0.0.4 section covering MEMORY SQLite + ACL.
- STATUS roadmap lists MEMORY #41/#59 as Done with the ship PR.
- Discord presence continues to use `formatPresenceVersionString()` (no hardcoded bridge version).

### REQ-cli-012

The project SHALL ship package version `0.0.5` with SESSION-WORKTREE isolation
(REQ-discord-022 / #58). CLI `version` and Discord presence/custom status
(DISCORD-12) report `0.0.5` after bridge update. CHANGELOG SHALL include verbose
0.0.5 notes for SESSION-WORKTREE. STATUS.md SHALL mark #58 done.

Acceptance Criteria
- `package.json` version is `0.0.5`.
- CLI `version` prints `0.0.5`.
- CHANGELOG has a 0.0.5 section covering SESSION-WORKTREE.
- STATUS marks #58 Done.



### REQ-cli-013

The project SHALL ship package version `0.0.6` with files/search plugins and
SAFE-2 protected paths (issue #81 / PLUGIN-1,2 / SAFE-2). CLI `version` and
Discord presence (DISCORD-12) report `0.0.6` after bridge update. CHANGELOG
SHALL include verbose 0.0.6 notes. STATUS.md SHALL mark #81 cut-order done.

Acceptance Criteria
- `package.json` version is `0.0.6`.
- CLI `version` prints `0.0.6`.
- CHANGELOG has a 0.0.6 section covering files/search + SAFE-2.
- STATUS ROADMAP marks #81 done; next = M3 plugins.

### REQ-cli-014

The project SHALL ship package version `0.0.7` with MEMORY Discord inject
(AGENT-7 / MEMORY-2/4). CLI `version` and Discord presence (DISCORD-12) report
`0.0.7` after bridge restart. CHANGELOG SHALL include verbose 0.0.7 notes.
STATUS.md SHALL record the slice.

Acceptance Criteria
- `package.json` version is `0.0.7`.
- CLI `version` prints `0.0.7`.
- CHANGELOG has a 0.0.7 section covering MEMORY Discord inject.
- STATUS ROADMAP marks MEMORY Discord inject done.

### REQ-cli-042

`corvidinho doctor` SHALL report whether a durable owner is configured
(IDENTITY-1, CLI-4) from the same env and allowlist file the Discord bridge
reads (`CORVIDINHO_OWNER_*` env, allowlist `[owner]` section). The line SHALL
show "configured: yes" plus the display name when set, or "configured: no"
with a plain-language hint. It SHALL never print the owner's Discord id,
GitHub login, or any token. Owner config problems (for example a non-snowflake
Discord id) SHALL be named without echoing the value. A missing owner is
informational and SHALL NOT change the doctor exit code.

Because ADMIN is owner-only (IDENTITY-2), doctor SHALL print a
`[warn] admin-lists` line when `CORVIDINHO_DISCORD_ADMIN_USERS` or
`CORVIDINHO_DISCORD_ADMIN_ROLES` is set, saying they are ignored. The line
SHALL NOT echo their values and SHALL NOT change the exit code.

Acceptance Criteria
- Doctor prints an `owner` line with configured yes/no plus the display name only.
- Doctor never prints the owner Discord id, GitHub login, or tokens.
- A missing owner does not flip the doctor exit code.
- Legacy admin lists produce a `[warn] admin-lists` line without their values and without changing the exit code.
- Fixture test runs doctor with a temp allowlist file / env (no network).
### REQ-cli-015

The project SHALL ship package version `0.0.9` with shell-exec + SAFE-3
(issue #83 / PLUGIN-1,2 / SAFE-3). CLI `version` and Discord presence
(DISCORD-12) report `0.0.9` after bridge update. CHANGELOG SHALL include
verbose 0.0.9 notes. STATUS.md SHALL mark #83 done.

Acceptance Criteria
- `package.json` version is `0.0.9`.
- CLI `version` prints `0.0.9`.
- CHANGELOG has a 0.0.9 section covering shell-exec + SAFE-3.
- STATUS ROADMAP marks #83 done; next = remaining M3 plugins (git, …).

### REQ-cli-073

`corvidinho task run` SHALL accept `--output text|json|ndjson` so output can be
human text, a single JSON result, or a stream of events (CLI-7). `--json`
SHALL remain an alias for `--output json` and its single pretty-printed
`{ result, events }` payload SHALL be unchanged. `--output ndjson` SHALL write
one JSON object per stdout line as the run progresses (AgentEvent frames,
`usage` frames when the provider reports usage) and end with a `result` frame
whose `result` equals the `--json` `result`, except that `summary` is capped at
4000 characters (the frame then carries `truncated: true`) so one line stays
bounded; human stderr progress stays quiet
in ndjson mode like `--json`. Exit codes SHALL match the other modes. An
unknown `--output` value SHALL print usage to stderr and exit 1.
`--protocol-version` SHALL print `2`.

Acceptance Criteria
- `task run --no-verify --output ndjson` prints only protocol-2 frames, starting with `StateChanged` and ending with `result`.
- The ndjson `result` equals `task run --no-verify --json` `.result` (a `summary` over 4000 chars is capped with `truncated: true`).
- `--json` output still parses as one JSON document with `result` and `events`.
- `--output bogus` exits 1 with a usage line.
- `--protocol-version` prints `2`.

### REQ-cli-143

`task run --task <text>` SHALL treat the next argv item as the task text even
when it starts with `-`, and `--task=<text>` SHALL keep text that spans
lines. The bridges pass untrusted Discord and GitHub text as that value, so
text that looks like a flag (for example `--tier=code`, `--no-verify`,
`--max-retries=9`) SHALL NOT be parsed as a CLI flag and SHALL NOT change
the capability tier, verify, or retry settings (AGENT-5, SAFE-1).

Acceptance Criteria
- A `--task` value starting with `-` is kept verbatim as the task text.
- Flag-looking task text never sets tier, max-retries, JSON, or no-verify.
- `--task=` with newlines keeps every line.
- Normal `--task TEXT --tier code --json` parsing is unchanged.

### REQ-cli-108

The CLI SHALL expose `corvidinho daemon`. It ticks the shared SQLite schedules
table on the existing 60 s poll with no Discord token and no REPL (CLI-8,
AUTONOMOUS-4). It SHALL use the bridge's scheduler gates: the channel
allowlist re-check (DISCORD-SCHEDULE-3), per-run worktrees
(SESSION-WORKTREE), and non-interactive agent spawns (SAFE-1). It SHALL add no
new environment variables.

Only one daemon SHALL run per data dir. The daemon SHALL create
`<data dir>/daemon.lock` exclusively, recording its pid and Linux process
start time. A second daemon SHALL log `daemon.lock_held` naming the holder's
pid and exit 1. A lock whose pid is gone, or whose pid now belongs to
another process, SHALL be taken over.

On SIGTERM or SIGINT the daemon SHALL:
- stop ticking;
- wait up to 30 s for in-flight runs;
- record any run still going as failed (`interrupted: daemon shutdown`);
- remove its lock and exit 0.

A second signal SHALL skip the rest of the wait.

Daemon logs SHALL be one JSON object per line on stdout
(`ts`, `level`, `component`, `event`, then fields), with every string value
scrubbed (SAFE-6). `docs/DAEMON.md` SHALL document a systemd unit and leave
restarts to systemd's own `Restart=`. Heartbeats, crash DMs and running the
bridge/watch inside the daemon are out of scope (draft OPS-3..5).

Acceptance Criteria
- `corvidinho daemon` with a temp data dir logs `daemon.started`, creates `daemon.lock`, and exits 0 on SIGTERM with the lock removed.
- A second daemon on the same data dir exits 1 with `daemon.lock_held` and the holder pid.
- A lock from a dead or recycled pid is taken over; an unreadable lock younger than 5 s is not.
- A due schedule is run headlessly and logged as `run.finished`; a non-allowlisted channel is refused without running the agent.
- Stop after the grace records stragglers as failed and frees the lock; a forced stop skips the grace.
- Log lines parse as JSON, and secrets in fields are redacted.
- `--help` lists `daemon`.

