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

Doctor SHALL say what is missing before a long-running surface fails on it
(CLI-4). The `discord` and `github-watch` checks SHALL evaluate the channel
and repo allowlists through the same loader the Discord bridge and GitHub
WATCH use (allowlist file plus env overlays, ALLOW-1..4): the bridge's channel
set (`[discord].channels`, `CORVIDINHO_DISCORD_ALLOW_CHANNELS` and
`DISCORD_CHANNEL_IDS`) and WATCH's repo set (`[github]` repos / orgs and
`CORVIDINHO_GITHUB_ALLOW_REPOS` / `_ORGS`). An entry that is also
deny-listed (file or env) SHALL NOT count (deny wins). A passing line SHALL
name where the usable entries came from (`file`, `env` or `file + env`)
and the count, never the ids, repos or tokens. An entry the gate cannot use
at all (a repo that is not OWNER/REPO) SHALL NOT count either, and the
failing line SHALL name deny wins only when every entry is deny-listed. A
token or watch login SHALL count only when it is not blank, as the bridge and
WATCH trim them. An allowlist file that exists
but does not load SHALL fail both checks, since the bridge and watch refuse to
start on it. Doctor SHALL print an `llm` line: `[ok]` when
`CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY` is set (value not shown),
otherwise `[warn]` saying `task run` uses the demo stub; the `llm` line
SHALL NOT change the exit code. Doctor SHALL print a `data-dir` line for the
shared data dir (`CORVIDINHO_DATA_DIR`, default
`~/.local/share/corvidinho`, MEMORY-1): `[ok]` when it exists and is
writable, `[info]` when it does not exist yet but its nearest existing parent
is writable (doctor SHALL NOT create it), and a failing `[fail]` line (exit 1)
when it is not a directory, is a symlink to a path that does not exist
(`mkdir -p` fails on it), cannot be created or is not writable.

Acceptance Criteria
- With `[discord] channels` and `[github] repos` only in the allowlist file (`CORVIDINHO_ALLOWLIST_FILE`), plus token and `CORVIDINHO_WATCH_USERNAME`, doctor prints `[ok] discord` and `[ok] github-watch` naming source `file`, no `[missing]` line, and exits 0 when the other checks pass; the default `~/.config/corvidinho/allowlist.toml` (no `CORVIDINHO_ALLOWLIST_FILE`) reads the same way.
- A blank (whitespace-only) Discord or GitHub token or watch login prints `[missing]`; a repo entry that is not OWNER/REPO fails `github-watch` without claiming it is deny-listed.
- Env-only entries name source `env`; entries in both name `file + env`; the line gives the usable count.
- A channel or repo that is allowlisted and also deny-listed (env deny over file allow, file deny over env allow) does not count: doctor prints `[missing]` naming deny wins and exits 1.
- A malformed allowlist file fails `discord` and `github-watch` (the bridge / watch refuse to start) even when env allowlists are set.
- No LLM key prints `[warn] llm` naming the demo stub without changing the exit code; `CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY` prints `[ok] llm` without the value.
- A writable data dir prints `[ok] data-dir`; a missing one under a writable parent prints `[info] data-dir` and is not created; a data dir that is a file, sits under a file, is a symlink to nothing or (as a non-root user) is not writable prints `[fail] data-dir` and doctor exits 1; the writable probe leaves nothing in the data dir.
- Doctor output never contains the token, LLM key, channel ids or repo / org names.

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

`corvidinho task run` SHALL drive the prove-before-done loop with an injectable
execute path: demo stub when no LLM key is configured; thin env-gated
OpenAI-compatible chat when `CORVIDINHO_LLM_API_KEY` (or documented fallback) is
set. `--no-verify` remains for **local/operator opt-out only** — Discord and
WATCH bridges MUST NOT pass it (REQ-discord-085 / REQ-watch-085 / AGENT-4).
`--json` / `--output ndjson` emit structured result+events for callers to parse.
Package version after this change is **0.0.13**.

Acceptance Criteria
- Help still documents `task run` / `--no-verify` / `--json` / `--output`.
- Without LLM key, demo execute behaves as before (verify gate exercise).
- Help / fledge.toml no longer tell bridges to pass `--no-verify` for latency.
- Package `0.0.13`.

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

The CLI SHALL accept `--tier read|tool|code` for `task run` (and SHALL honor `CORVIDINHO_LLM_TIER`) and SHALL wire `createTaskExecute` with cwd, non-interactive mode, allowlist, and event forwarding so Discord/WATCH/`task run` callers share the same LLM plugin tool loop. Bridges SHALL keep `--no-verify` available for latency; the verify gate SHALL remain available when not skipped. The tier SHALL also select the model the run calls (REQ-agent-079). Help SHALL document the optional per-tier model keys `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`, and when any of them is set the doctor `[ok] llm` line SHALL name the model each tier calls (model names only, never the API key); with none set the line SHALL read as before.

Acceptance Criteria
- Help documents `--tier` and LLM env vars (no secrets).
- task run forwards ToolCall/ToolResult when not `--json`.
- Help lists `CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE`.
- With `CORVIDINHO_LLM_MODEL=big`, `_READ=cheap` and `_CODE=big2`, doctor prints `[ok] llm: … model big; per tier: read cheap, tool big, code big2` and exits 0 without the key value; with no per-tier key the line ends `model big`.

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

Doctor SHALL print an `allowlist-file` line for the file the loader resolves
(ALLOW-4, REQ-plugins-006). A file that exists but cannot be read or parsed
SHALL be a failing `[fail]` check that shows the loader's error (path, line
and key, never list values), since the bridge, watch and daemon refuse to
start on it. A file that loads SHALL show `[ok]`, and no file SHALL show
`[info]` (env overlays only) without changing the exit code.

Acceptance Criteria
- Doctor prints an `owner` line with configured yes/no plus the display name only.
- Doctor never prints the owner Discord id, GitHub login, or tokens.
- A missing owner does not flip the doctor exit code.
- Legacy admin lists produce a `[warn] admin-lists` line without their values and without changing the exit code.
- Fixture test runs doctor with a temp allowlist file / env (no network).
- A malformed allowlist file gives `[fail] allowlist-file` with the line and key and without the values; a file that loads gives `[ok]`; no file gives `[info]`.

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

### REQ-cli-016

The project SHALL ship package version `0.0.12` covering the typed git tools
(#145) and durable WATCH sessions (#142, schema v6). CLI `version` and Discord
presence (DISCORD-12) report `0.0.12` after a restart. CHANGELOG SHALL include
verbose 0.0.12 notes with the restart step. STATUS.md SHALL record the slices.

Acceptance Criteria
- `package.json` version is `0.0.12`.
- CLI `version` prints `0.0.12`.
- CHANGELOG has a 0.0.12 section that the updater's changelog helper extracts exactly.
- STATUS records #145 and #142.

### REQ-cli-098

`corvidinho doctor` SHALL always print a `spend` line (AUTONOMOUS-8 /
SAFE-8). Without `CORVIDINHO_DAILY_SPEND_CAP_USD` it SHALL be `info` and say
no daily cap is set, without opening the database. With the variable set it
SHALL show spend in the last 24 hours against the daily cap with the percent,
the number of provider calls counted, and how many are still counted at their
estimate, and SHALL be marked `warn` at or past the 80% warning, at the cap,
when the cap value is not a plain USD amount, when the configured model has
no known price, or when the ledger cannot be read (the last three stop and
ask before every provider call). The line SHALL be informational and SHALL
NOT change the doctor exit code. `task run` SHALL copy the run's 80% spend
warning onto `TaskResult.spendWarning` in `--json` output and the NDJSON
`result` frame, and a run stopped at the cap SHALL exit 0 with state
`blocked`; in text output it SHALL print the generic summary and the ask
question. `corvidinho daemon`, which has no Discord, SHALL log a `warn`
`spend.warning` line for a schedule run that crossed 80% and a `warn`
`run.needs_human` line with the ask reason for a run that stopped to ask,
leaving the recorded warning and the ask recorded on the run row pending for
a bridge to deliver (REQ-discord-347; AUTONOMY-2 / AUTONOMOUS-7). The daemon
SHALL NOT post or take the ask itself and still needs no Discord token
(REQ-cli-108). `--help` and `.env.example` SHALL list the variable and say it
warns at 80% and stops and asks at 100%.

Acceptance Criteria
- `bun src/cli.ts doctor` without the variable prints `[info] spend: no daily cap set (CORVIDINHO_DAILY_SPEND_CAP_USD)`.
- With `CORVIDINHO_DAILY_SPEND_CAP_USD=5` it prints `[ok] spend: $0.00 of $5.00 daily cap used in the last 24h (0%; 0 provider call(s)`.
- Invalid cap, unpriced model, 80% and cap reached yield a `warn` line with `ok: true`.
- `task run --json` against a localhost mock LLM carries `result.spendWarning` on the crossing run only, and at the cap returns `blocked` with a `spend-cap` ask, the generic summary and exit 0 without calling the mock; `--output text` at the cap prints the summary and the ask question.
- The daemon logs `spend.warning` (amounts and percent) and `run.needs_human` (`reason` `spend-cap`) as `warn` lines for a schedule run that reports them.
- A stuck schedule run the daemon claims logs `run.needs_human` (`reason` `stuck`), is recorded with its ask pending, and a Discord bridge started later on the same data dir posts it to the owner once.

### REQ-cli-085

The CLI SHALL keep `--no-verify` as an explicit local skip of prove-before-done
(AGENT-4). Product bridges (Discord HEAR, GitHub WATCH) SHALL NOT use that flag
(REQ-discord-085 / REQ-watch-085). Removing the flag entirely (draft AGENT-14)
awaits HI capture. Package **0.0.13**.

Acceptance Criteria
- `corvidinho task run --no-verify --json` still exits 0 with `verifySkipped`.
- Bridge spawn clients do not pass `--no-verify` (covered under discord/watch).

### REQ-cli-108

The CLI SHALL expose `corvidinho daemon`. It ticks the shared SQLite schedules
table on the existing 60 s poll with no Discord token and no REPL (CLI-8,
AUTONOMOUS-4). It SHALL use the bridge's scheduler gates: the channel
allowlist and schedule-creator re-check (DISCORD-SCHEDULE-3, REQ-discord-020),
with the configured owner loaded at start (IDENTITY-1) so the owner's
schedules pass the creator gate as they do in the bridge, per-run worktrees
(SESSION-WORKTREE), and non-interactive agent spawns (SAFE-1). Before each
tick the daemon SHALL re-read the allowlist the way start loads it (file, env
overlays and `DISCORD_CHANNEL_IDS`) and SHALL gate that tick's runs against
it, so an `/admin` edit the bridge writes to the file applies on the next
tick without a restart. When the file exists but cannot be read or parsed the daemon SHALL
skip that tick (fail closed, ALLOW-4): log `tick.allowlist_failed` with the
loader's value-free error, start no run, and leave due schedules due. A
tick still re-reading the allowlist when stop begins SHALL start no run (the
stop only drains runs already claimed). It SHALL add no new environment
variables.

Only one daemon SHALL run per data dir. The daemon SHALL create
`<data dir>/daemon.lock` exclusively, recording its pid and Linux process
start time. A second daemon SHALL log `daemon.lock_held` naming the holder's
pid and exit 1. A lock whose pid is gone, or whose pid now belongs to
another process, SHALL be taken over.

On SIGTERM or SIGINT the daemon SHALL:
- stop ticking;
- wait up to 30 s for in-flight runs;
- kill the process tree of any run still going (the spawned agent and
  everything it started, REQ-plugins-154) and record it as failed
  (`interrupted: daemon shutdown`);
- wait up to 3 s more (a second signal does not skip this) for those runs to
  park their worktree and delete their empty `talk/schedule_*` branch (a
  branch with commits is kept, REQ-discord-346);
- remove its lock and exit 0.

A second signal SHALL skip the rest of the wait.

Before its first tick the daemon SHALL run the scheduler's start-up recovery
(REQ-discord-346): runs a dead process left `running` are recorded as failed
(`interrupted: process restarted`) and leftover worktrees of runs this data
dir recorded as ended are removed, keeping any branch with commits; runs
another live bridge or daemon on the same data dir owns are left alone, and a
schedule-run worktree whose run this data dir does not know (another data
dir's) is never touched. When it fixed something it SHALL log
`daemon.recovered` with the recovered run ids (`runs`) and the number of
worktrees removed (`worktrees`).

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
- A channel removed from the allowlist file after start, or a creator added to its `deny_users`, is refused on the next tick without running the agent (`run.finished` with `channel not allowlisted: …` / `creator not allowlisted: …`).
- A malformed allowlist file makes the next tick log `tick.allowlist_failed` and run nothing; once the file is fixed, the still-due schedule runs on the following tick.
- With a non-empty user list that omits the owner, the configured owner's schedule still runs; an unlisted non-owner creator's schedule is refused.
- A tick still re-reading the allowlist when SIGTERM stops the daemon claims no run: the due schedule gets no run row and the stop drains without abandoning anything.
- Stop after the grace records stragglers as failed and frees the lock; a forced stop skips the grace.
- A straggler spawned through the real spawn client (fake `sh` bin with a same-group and a `setsid` grandchild) has its whole tree killed at shutdown.
- Log lines parse as JSON, and secrets in fields are redacted.
- `--help` lists `daemon`.
- Stop after the grace removes an abandoned run's worktree and empty `talk/schedule_*` branch before it resolves; a branch with commits is kept.
- After `kill -9` of a daemon mid-run, the next start records that run as failed (`interrupted: process restarted`), removes its worktree and branch, and logs `daemon.recovered`.
- Start removes a leftover worktree of a run already recorded as failed and leaves worktrees with other names alone.
- Start never touches a schedule-run worktree whose run another data dir owns, even when the daemon's project root is that worktree: its uncommitted files and branch stay.

### REQ-cli-112

`corvidinho plugins list` SHALL load the project's Fledge plugins (cwd =
current directory) before listing (FLEDGE-4 / PLUGIN-6). The text view SHALL
show for each command its danger marking, minimum tier, origin when not
builtin, and approximate schema tokens, followed by the tool schema cost
summary (total vs budget, per-origin subtotals, largest, oversized) and a
Fledge status line (plugins/commands registered, or why none loaded, plus
skipped names and warnings). `plugins list --json` SHALL stay a JSON array of
entries, each adding `origin`, `schemaChars` and `approxTokens`. When fledge is
missing or fails, the command SHALL still list builtins and exit 0.
`corvidinho plugins run fledge-<command>` SHALL discover Fledge plugins only
when that name is not already registered, then run it under SAFE-1.

Before the Fledge status line the text view SHALL print the PLUGIN-4 language
runner status: `Language runners (PLUGIN-4): <name> (<binary>), …` for the
runners that loaded (or `none loaded`), then one `<name> not loaded:
<tool> not found on PATH` line per runner whose toolchain is missing
(REQ-plugins-314). A missing toolchain SHALL NOT change the exit code (0).

Acceptance Criteria
- With a fake fledge on PATH, `plugins list` shows `fledge-hello  [dangerous, tier>=2, fledge:fledge-plugin-hello@0.2.0]  ~N tok`, the cost summary and `Fledge plugins: 1 plugin(s), 1 command(s) registered`.
- `plugins list --json` is an array; `fledge-hello` has dangerous=true, minTier=2, origin, schemaChars, approxTokens; builtins have origin `builtin`.
- Without fledge on PATH, builtins list, `Fledge plugins: none loaded (fledge not on PATH)` prints, exit 0.
- `--non-interactive plugins run fledge-hello` exits 2 (SAFE-1) unless `CORVIDINHO_ALLOWLIST=fledge-hello`, which runs it in the project root.
- With no node, python3/python or cargo on PATH, `plugins list` exits 0, still lists `shell-exec`, prints `Language runners (PLUGIN-4): none loaded` and `node-exec not loaded: node not found on PATH` / `cargo-exec not loaded: cargo not found on PATH`, and lists no runner command.
- With only `cargo` on PATH, `plugins list` lists `cargo-exec  [dangerous, tier>=2]`, prints `cargo-exec (<path to cargo>)` on the runner line and names `node-exec` as not loaded.

### REQ-cli-017

The project SHALL ship package version `0.0.16` covering the headless daemon
(#157), SSRF-guarded web-fetch (#148), Fledge plugins as tools (#154), GitHub
PR diff/files (#153), CI status by ref (#158) and project instructions in the
prompt (#150). CLI `version` and Discord presence (DISCORD-12) report
`0.0.16` after a restart. CHANGELOG SHALL include verbose 0.0.16 notes with the
restart and allowlist steps. STATUS.md SHALL record the slices.

Acceptance Criteria
- `package.json` version is `0.0.16`.
- CLI `version` prints `0.0.16`.
- CHANGELOG has a 0.0.16 section that the updater's changelog helper extracts exactly.
- STATUS records #157, #148, #154, #153, #158 and #150.

### REQ-cli-019

The project SHALL ship package version `0.0.18` (ask-human + owner ping, autonomous gate + delegate). CLI `version` and Discord presence (DISCORD-12) report `0.0.18` after a restart. CHANGELOG SHALL include verbose 0.0.18 notes.

Acceptance Criteria
- `package.json` version is `0.0.18`.
- CLI `version` prints `0.0.18`.
- CHANGELOG has a 0.0.18 section that the updater's changelog helper extracts exactly.

### REQ-cli-021

The project SHALL ship package version `0.0.21` (security + correctness sweep, council tool, admin/pr-diff edges, operator guide). CLI `version` and Discord presence (DISCORD-12) report `0.0.21` after a restart. CHANGELOG SHALL include verbose 0.0.21 notes.

Acceptance Criteria
- `package.json` version is `0.0.21`.
- CLI `version` prints `0.0.21`.
- CHANGELOG has a 0.0.21 section that the updater's changelog helper extracts exactly.

### REQ-cli-244

`corvidinho task run` SHALL pass an AbortSignal to `runTask` and SHALL abort
it on the first SIGINT or SIGTERM (AGENT-3). The run's verify lane and tool
loop SHALL stop (REQ-agent-244), the structured cancelled result SHALL still
be printed in the selected output mode (text line, `--json` document, or a
final ndjson `result` frame with `cancelled: true`), and the process SHALL
exit 130 instead of dying by the signal. The handlers SHALL be removed when
the run ends; a second signal SHALL take its default action. A SIGINT or
SIGTERM this process started with ignored (a background job's SIGINT) SHALL
NOT be hooked and SHALL stay ignored, as for the process-tree hook
(REQ-plugins-154). No flag or environment variable is added.

Acceptance Criteria
- `task run --task demo --output ndjson` with a fake `fledge` on PATH (it starts a lane task and blocks), sent SIGINT or SIGTERM while verify runs, exits 130 (not by the signal), its last stdout line is a `result` frame with `cancelled: true`, `verified: false`, `state: "failed"`, and both the fake `fledge` and its lane task are gone.
- The same run started with SIGINT ignored (`sh -c 'trap "" INT; exec …'`) is still running, with its lane, 1 s after a SIGINT; a SIGTERM then exits 130 with a cancelled `result` frame and stops the lane.

### REQ-cli-023

The project SHALL ship package version `0.0.23` (stop means stop (process trees), SAFE-3 cd clamp, scrub before clip, GitHub gate reads allowlist file). CLI `version` and Discord presence (DISCORD-12) report `0.0.23` after a restart. CHANGELOG SHALL include verbose 0.0.23 notes.

Acceptance Criteria
- `package.json` version is `0.0.23`.
- CLI `version` prints `0.0.23`.
- CHANGELOG has a 0.0.23 section that the updater's changelog helper extracts exactly.

### REQ-cli-347

The box updater `scripts/corvidinho-update.sh` SHALL restart exactly one bridge through the
configured restart path. When `CORVIDINHO_BRIDGE_UNIT` is set and `CORVIDINHO_USE_PIDFILE` is
not, the unit SHALL win over a leftover pidfile: the updater SHALL restart the unit and SHALL NOT
`nohup`-start a bridge; a pidfile whose pid is gone SHALL be removed and a live pid named by it
SHALL NOT be signalled. Without a unit, an existing pidfile SHALL still select pidfile mode. The
updater SHALL source `CORVIDINHO_ENV_FILE` once, after `bun install` and before `doctor`, so
`doctor`, every restart path (pidfile, unit, command) and every rollback restart see the same
env. `CORVIDINHO_BRIDGE_CMD` SHALL run in `bash -lc` with its text passed through the
environment rather than the shell's argv, so a `pkill -f` pattern in it cannot match that shell,
and the documented `pkill -f` examples SHALL match the bridge process but not a shell whose
command line holds the example. In pidfile mode the updater SHALL count the restarted bridge
ready only when its log holds the line the gateway prints on Discord ClientReady
(`[discord] logged in as <tag>`), never on the pre-login `[discord] protocol version N OK`
line; if the bridge exits or that line does not appear within `CORVIDINHO_READY_TIMEOUT`, the
update SHALL roll back and exit 1 with log lines only. Unit mode SHALL keep its
`systemctl is-active` check.

Acceptance Criteria
- Unit set + leftover stale pidfile: `systemctl restart <unit>` runs, no `discord bridge` is started, the pidfile is removed.
- Unit set + pidfile naming a live pid: the unit is restarted and that pid is not signalled.
- No unit and no command + leftover pidfile: pidfile mode still starts the bridge.
- `doctor` and the unit restart see variables from `CORVIDINHO_ENV_FILE`; `bun install` does not.
- A rollback restart after a failed `bun install` or a failed `doctor` sees `CORVIDINHO_ENV_FILE`.
- A `CORVIDINHO_BRIDGE_CMD` containing `pkill -f '<pattern>'` completes (exit 0, no rollback) instead of killing its own shell.
- Each `pkill -f` pattern in `docs/BOX-UPDATE.md` matches `bun src/cli.ts discord bridge` and an absolute-path bridge command line, and does not match `bash -lc` holding the example.
- `log_indicates_ready` rejects a log holding only `[discord] protocol version N OK` (with or without a following login error) and accepts one holding `[discord] logged in as <tag>`, the line `src/discord/gateway.ts` prints inside its `Events.ClientReady` handler.
- Pidfile mode, a bridge that prints the protocol line and then exits 1: the update rolls back to the previous SHA and exits 1; it never logs "ready signal observed" or "OK updated".
- Pidfile mode, a bridge that prints the protocol line and never logs in: after `CORVIDINHO_READY_TIMEOUT` the updater logs a ready timeout naming the login line, rolls back and exits 1.
- Pidfile mode, a bridge that prints the login line: the update exits 0 with no rollback.
- Unit mode still runs `systemctl is-active --quiet <unit>`; an inactive unit rolls back and exits 1.

### REQ-cli-026

The project SHALL ship package version `0.0.26` (spend cap warn/ask, crash + restart recovery, allowlist fail-closed, SAFE-3 clamp, WATCH dedup). CLI `version` and Discord presence (DISCORD-12) report `0.0.26` after a restart. CHANGELOG SHALL include verbose 0.0.26 notes.

Acceptance Criteria
- `package.json` version is `0.0.26`.
- CLI `version` prints `0.0.26`.
- CHANGELOG has a 0.0.26 section that the updater's changelog helper extracts exactly.

### REQ-cli-262

The test suite SHALL NOT write the operator's Corvidinho state (SAFE-5). The
bun test preload (`tests/preload.ts`, loaded by `bunfig.toml`) SHALL always
point `CORVIDINHO_DATA_DIR` at its own temporary directory, overriding an
inherited value, and SHALL unset `CORVIDINHO_AUDIT_HMAC_KEY`,
`CORVIDINHO_WATCH_SPAWN_LOG` and `WORKTREE_BASE_DIR`, so a suite run with the
operator's env (including the prove-before-done verify lane spawned from
Discord, WATCH, the daemon or `task run`) never adds audit rows, sessions or
memory to the operator's DB and never signs a test audit row with the
operator's key. A process a test spawns with `Bun.spawn` / `Bun.spawnSync` and
no explicit `env` SHALL get the preload's env, not the environment the test
process started with. The preload SHALL also unset the run and operator
settings that change test outcomes on the bot box, so the suite runs as it
does on CI: `CORVIDINHO_NON_INTERACTIVE` and `FLEDGE_NON_INTERACTIVE` (every
Discord, WATCH and daemon task run sets the first, and its verify lane runs
the suite), `CORVIDINHO_DAILY_SPEND_CAP_USD`, and the LLM API keys
`CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY` (so `bun test` never sends a real
model call). No new env var, config key or command.

Acceptance Criteria
- With the operator's `CORVIDINHO_DATA_DIR`, `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_WATCH_SPAWN_LOG` and `WORKTREE_BASE_DIR` set, a child `bun test` writes 0 audit rows (and no file) to the operator data dir; its rows, including a CLI run it spawns, land in the preload's temp dir.
- An operator DB that already holds an audit chain keeps the same row count and last hash after the child run, and no test row is keyed with the operator's key.
- A CLI or shell a test spawns without an explicit `env` (`Bun.spawn(argv)`, `Bun.spawn({ cmd })`, `Bun.spawnSync(argv)`) resolves the preload's data dir and sees no audit key, WATCH spawn log or worktree base override.
- Full `bun test` with those operator vars set passes and leaves the operator data dir empty.
- With `CORVIDINHO_NON_INTERACTIVE`, `FLEDGE_NON_INTERACTIVE`, `CORVIDINHO_DAILY_SPEND_CAP_USD`, `CORVIDINHO_LLM_API_KEY` and `OPENAI_API_KEY` set, a child `bun test` sees none of them: it is not non-interactive and has no LLM API key; full `bun test` with them set passes.

### REQ-cli-419

A failing CLI command SHALL print one plain-language error line and a hint and
exit non-zero, never a stack trace, a code frame, a library object dump or
Bun's crash footer (CLI-4), and SHALL keep the single-JSON-result shape under
`--json` (CLI-7). The line SHALL NOT contain a secret (SAFE-6).

- `runCli(argv)` SHALL wrap `main` as the top-level error boundary (the
  `import.meta.main` entry uses it): anything `main` throws SHALL go to
  `reportCliError`, whose return value is the exit code.
- `reportCliError(err, { json })` SHALL print `corvidinho: <line>` then
  `hint: <hint>` on stderr. In JSON mode (`--json` or `--output json`
  before `--`) it SHALL print `{ "ok": false, "error": <line> }` on stdout,
  the `plugins run --json` error shape, and the hint on stderr. `<line>` is
  `formatErrorLine(err)` (REQ-discord-417). The exit code SHALL be the
  error's own integer `exitCode` in 1..255, else 1, so existing codes hold
  (`PluginNotFoundError` stays 1).
- The hint SHALL match the error: an unknown plugin names
  `corvidinho plugins list`; a filesystem error with a path, or a bun:sqlite
  error opening the DB (`SQLITE_CANTOPEN` / `SQLITE_READONLY` /
  `SQLITE_PERM` / `SQLITE_NOTADB`), names `CORVIDINHO_DATA_DIR` and its
  default `~/.local/share/corvidinho`; anything else names
  `corvidinho doctor`.
- `plugins run` SHALL catch an unknown name (including `fledge-*`) or a
  plugin handler that throws and report it through `reportCliError` (text
  and `--json`). A plugin result with `ok: false` keeps its existing output
  and exit code.
- `discord register-commands` SHALL report a failed registration as one line,
  `[discord] register-commands failed (<status>): <line>`, adding
  `— check DISCORD_TOKEN / DISCORD_BOT_TOKEN and --guild-id` on 401/403
  (`formatRegisterCommandsFailure`, REQ-discord-417), and exit 1.
- `github watch` SHALL exit with `fatal.exitCode` even when the poller's
  `stop()` rejects after the 401 halt.
- `github watch` SHALL stop the poller and exit with `fatal.exitCode` (1)
  when WATCH halts on a GitHub 401 (REQ-watch-418). SIGINT/SIGTERM still stop
  it with exit 0.

No global `unhandledRejection` handler, env var, flag or command is added.

Acceptance Criteria
- `plugins run nosuchplugin` and `plugins run fledge-nosuch` exit 1 with `corvidinho: Unknown plugin command: <name>` and a `corvidinho plugins list` hint; with `--json`, stdout is `{ok:false,error:"Unknown plugin command: nosuchplugin"}`.
- `CORVIDINHO_DATA_DIR=/proc/nope CORVIDINHO_ACTING_DISCORD_USER_ID=1 plugins run memory-recall` exits 1 with exactly two stderr lines, the error naming `/proc/nope` and a hint naming `CORVIDINHO_DATA_DIR`; with `--json` stdout is `{ok:false,error}`.
- `CORVIDINHO_DATA_DIR=/proc/nope … discord bridge` exits 1 with `corvidinho: <line>` and the data-dir hint.
- `discord register-commands --guild-id 1` with a token Discord rejects (401) exits 1 with one stderr line `[discord] register-commands failed (401): …` naming `DISCORD_TOKEN`.
- `github watch` with a token GitHub rejects (401) exits 1 by itself.
- None of these outputs contains a stack frame, a code frame, Bun's crash footer, `node_modules`, `rawError`, `requestBody` or the token value.
- `runCli` returns a thrown error's `exitCode` (or 1) and passes a normal exit code through unchanged.
- A data dir whose `corvidinho.db` cannot be opened (`SQLITE_CANTOPEN`) makes `plugins run memory-recall` exit 1 with exactly two stderr lines, `corvidinho: unable to open database file` and a hint naming `CORVIDINHO_DATA_DIR`; a `SQLITE_BUSY` error or a filesystem error with no path keeps the `corvidinho doctor` hint.

### REQ-cli-420

The project SHALL ship package version `0.0.29` (slash asks + session continuity, allowlisted-channel gates, secret-path hiding, schedule-run recovery (schema v10), clean CLI errors, doctor reads the allowlist file). CLI `version` and Discord presence (DISCORD-12) report `0.0.29` after a restart. CHANGELOG SHALL include verbose 0.0.29 notes.

Acceptance Criteria
- `package.json` version is `0.0.29`.
- CLI `version` prints `0.0.29`.
- CHANGELOG has a 0.0.29 section that the updater's changelog helper extracts exactly.

### REQ-cli-089

`corvidinho specsync <list|read|check|brief|coverage|score|change-list|ship-status>` SHALL run the matching `specsync-*` plugin command. `score` SHALL run `specsync-score`, so "are we drifting?" can be answered from the CLI with SpecSync's own score report (SPECSYNC-3). No slash command is added.

Acceptance Criteria
- `corvidinho specsync score cli --explain` runs the local `specsync score cli --explain` and prints its report, exit 0.
- `corvidinho plugins run specsync-score --json -- --format json` returns `{ok:true,data:{output}}` with the report.
- A failing `specsync score` (e.g. `--min-score 90` below the floor) exits with its code and prints the report on stderr.
- `corvidinho specsync` with no or an unknown subcommand prints the usage line (which lists `score`) and exits 1; `--help` lists `score`.

### REQ-cli-421

The project SHALL ship package version `0.0.30` (session threads, images to the model, real-diff verify, per-tier models, creator-gated schedule ticks + daemon asks reach Discord (schema v11), CI-strict spec-check, language runners, CI tags every version). CLI `version` and Discord presence (DISCORD-12) report `0.0.30` after a restart. CHANGELOG SHALL include verbose 0.0.30 notes.

Acceptance Criteria
- `package.json` version is `0.0.30`.
- CLI `version` prints `0.0.30`.
- CHANGELOG has a 0.0.30 section that the updater's changelog helper extracts exactly.

### REQ-cli-422

The project SHALL ship package version `0.0.31` (owner-only channel autocomplete, keystore and .specsync/ write protection, audited /schedule delete, per-user thread sessions, failing-step verify feedback, paused schedules ping the owner, presence on every IDENTIFY, SpecSync lists specs/). CLI `version` and Discord presence (DISCORD-12) report `0.0.31` after a restart. CHANGELOG SHALL include verbose 0.0.31 notes.

Acceptance Criteria
- `package.json` version is `0.0.31`.
- CLI `version` prints `0.0.31`.
- CHANGELOG has a 0.0.31 section that the updater's changelog helper extracts exactly.

### REQ-cli-430

`corvidinho doctor` and `corvidinho init` SHALL say what the current
directory is missing as a project before `task run` fails on it mid-task
(CLI-4), through one shared check (`projectFilesDoctorChecks`) that prints
one line per item: `fledge.toml` (present and valid TOML), `verify-lane`
(the `verify` lane, from `fledge.toml` or a `.fledge/lanes/*.toml` import,
runs spec-check: a step or a task's `deps` chain reaches the defined
`spec-check` task or runs `specsync check`), `.specsync` and `specs`
(directories). Each missing item SHALL be a `[missing]` line in plain
language naming what fails without it and, where Fledge or SpecSync has one,
the command that creates it (`fledge run --init`, `specsync init`,
`specsync generate`) — or, when the current directory is below a git
project root that has the item, that root to run from instead — and SHALL
make the command exit 1. A verify lane whose steps (or a step task's `deps`)
name a task no `[tasks]` table defines SHALL be `[missing]` naming that task,
since fledge refuses to run it. A file that cannot be read or parsed, or
that is not a regular file (never opened), SHALL be named without printing
its contents or the parser's message (SAFE-6). `init` SHALL be report only: it prints the `llm`
line (`warn` without a key, never failing), the `fledge` and `specsync` PATH
lines and the project-file lines, creates and changes nothing, exits 0 when
nothing is missing, and points to `corvidinho doctor` for Discord / GitHub
keys and allowlists. No new flag, env var, config key or slash command.

Acceptance Criteria
- In a directory with no project files, doctor (all other checks passing) prints `[missing]` for `fledge.toml`, `verify-lane`, `.specsync` and `specs` with the plain-language reason and creator command, and no other `[missing]` line; exits 1; creates nothing.
- In a complete project (and in this checkout) doctor prints `[ok] fledge.toml`, `[ok] verify-lane: [lanes.verify] runs spec-check`, `[ok] .specsync`, `[ok] specs` and still passes (exit 0).
- `corvidinho init` in an empty directory prints `corvidinho init (report only — creates nothing)`, `[warn] llm`, `[ok] fledge` / `[ok] specsync`, the four `[missing]` project lines, no Discord line, exits 1 and leaves the directory empty; in a complete project with an LLM key it exits 0 and says nothing is missing; without `fledge` / `specsync` on PATH it prints `[missing] fledge` / `[missing] specsync`.
- The verify lane counts for a `"spec-check"` step, `{ task = "spec-check" }`, `{ run = "specsync check …" }`, a `parallel` item, a task whose `deps` run `specsync check`, and a lane imported from `.fledge/lanes/`; it is `[missing]` with its own reason when there is no `[lanes.verify]`, when no step runs spec-check (`echo specsync checked` does not count), when the lane names an undefined `spec-check` task, and when a step or a step task's `deps` names any other undefined task (named in the line) even if spec-check is present; `{ run }` counts `specsync check` by path (`/usr/local/bin/specsync check`) or quoted (`sh -c 'specsync check'`).
- A `fledge.toml` that is not TOML fails `fledge.toml` and `verify-lane` naming the file, never printing its text; a broken `.fledge/lanes/*.toml` import fails `verify-lane` naming that file; a `.specsync` that is a file is `[missing]` as not a directory; a `fledge.toml` that is a FIFO is `[missing]` without being opened (doctor does not block).
- Run from a subdirectory of a git project whose root has `fledge.toml`, `.specsync/` and `specs/`, each `[missing]` line names that root (`<root> (the project root) has it — run corvidinho there`) instead of `fledge run --init` / `specsync init`; an item the root lacks keeps its creator command.

