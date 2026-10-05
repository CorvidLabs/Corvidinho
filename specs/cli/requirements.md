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
WATCH trim them. This holds for the `github` line too: a
blank `GITHUB_TOKEN` / `GH_TOKEN` is missing for the Octokit plugins, as
they read it. An allowlist file that exists
but does not load SHALL fail both checks, since the bridge and watch refuse to
start on it. Doctor (and the report-only `init`) SHALL print an `llm` line
(AGENT-13 / AGENT-10, REQ-agent-179): `[ok]` naming the default tier's
provider — its key env present (value not shown), or `no key needed` for an
`ollama:` model — with the model and host, and each tier's model when a
per-tier key is set; `[warn]` with the no-provider notice when the default
tier has no usable provider (there is no demo stub or default model), and
`[warn]` with the provider plus the notice when only some tier has none; the
`llm` line SHALL NOT change the exit code. Doctor SHALL print a `data-dir` line for the
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
- A model whose key is unset prints `[warn] llm: No model provider is configured: <model> needs CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY, which is not set.`; a key with no model prints `[warn] llm: No model provider is configured: CORVIDINHO_LLM_MODEL is not set. Set CORVIDINHO_LLM_MODEL …`, never `gpt-4o-mini` or a demo stub; neither changes the exit code. `CORVIDINHO_LLM_MODEL` with `CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY` prints `[ok] llm: CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY present (value not shown); model <m> @ api.openai.com` without the value; per-tier keys add `; per tier: read …, tool …, code …`.
- A writable data dir prints `[ok] data-dir`; a missing one under a writable parent prints `[info] data-dir` and is not created; a data dir that is a file, sits under a file, is a symlink to nothing or (as a non-root user) is not writable prints `[fail] data-dir` and doctor exits 1; the writable probe leaves nothing in the data dir.
- Doctor output never contains the token, LLM key, channel ids or repo / org names.
- A whitespace-only `GITHUB_TOKEN` and `GH_TOKEN` print `[missing] github: missing GITHUB_TOKEN or GH_TOKEN for Octokit plugins`, never `[ok] github`; a blank `GITHUB_TOKEN` beside a real `GH_TOKEN` prints `[ok] github` without the value.
- `init` in an empty dir prints `[warn] llm: No model provider is configured: CORVIDINHO_LLM_MODEL is not set.`; with a model and its key it prints `[ok] llm`.
- `llmDoctorCheck` with an `ollama:` model prints `[ok] llm: no key needed; model ollama:<m> @ 127.0.0.1:11434`; with an `anthropic:` model and its key, `ANTHROPIC_API_KEY present (value not shown); …`; with a tier missing its key, `[warn]` naming that tier and key.

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
- `corvidinho --help` says an empty Discord channel list refuses start, users and roles both empty admit anyone in an allowlisted channel, and once either is set only those users, role holders and the owner (REQ-discord-043); no `--help` row naming the Discord `_USERS` / `_ROLES` allowlists says empty = refuse or deny-all.

### REQ-cli-006

The CLI SHALL expose `task run` with optional `--max-retries` and `--json` TaskResult output so operators and bridges can exercise the prove-before-done gate. There is no way to skip the gate (AGENT-14, REQ-cli-085): a run that changed nothing ends `done` with `verifySkipped` and the "no changes, nothing to verify" note (REQ-agent-003).

Acceptance Criteria
- `corvidinho task run --json` against a (fake) provider whose reply changes nothing exits 0 with `state` `done`, `verifySkipped` true, `filesChanged` `[]` and one `Verify gate: no changes, nothing to verify.` event, and never starts `fledge`.
- Help documents `task run` and does not list `--no-verify`.

### REQ-cli-007

`corvidinho task run` SHALL drive the prove-before-done loop with an injectable
execute path: the model the operator configures (`CORVIDINHO_LLM_MODEL`,
AGENT-13, REQ-agent-179) over the OpenAI-compatible chat API. There is no
demo stub: with no usable provider for the run's tier the run calls nothing
and fails with the no-provider notice (REQ-cli-079). The verify gate is
always on for every caller: Discord, WATCH, schedules, `/work`, delegate
workers and a local operator (AGENT-14, REQ-cli-085). `--json` / `--output
ndjson` emit structured result+events for callers to parse. Package version
after this change is **0.0.13**.

Acceptance Criteria
- Help documents `task run` / `--json` / `--output` and not `--no-verify`.
- A run whose model changes nothing reports no files; in a talk worktree whose last run left an unverified edit, such a run still runs the verify lane (REQ-agent-015).
- With no usable provider the run fails with the no-provider notice (REQ-cli-079).
- Help / fledge.toml do not mention a way to skip verification.
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

The CLI SHALL accept `--tier read|tool|code` for `task run` (and SHALL honor `CORVIDINHO_LLM_TIER`) and SHALL wire `createTaskExecute` with cwd, non-interactive mode, allowlist, and event forwarding so Discord/WATCH/`task run` callers share the same LLM plugin tool loop and the same verify gate, which no caller can skip (AGENT-14). The tier SHALL also select the model the run calls (REQ-agent-079). Help SHALL document the optional per-tier model keys `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`, and when any of them is set the doctor `[ok] llm` line SHALL name the model each tier calls (model names only, never the API key); with none set the line SHALL read as before.

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
- `task run --output ndjson` (in a scratch project where nothing changes) prints only protocol-2 frames, starting with `StateChanged` and ending with `result`.
- The ndjson `result` equals `task run --json` `.result` (a `summary` over 4000 chars is capped with `truncated: true`).
- `--json` output still parses as one JSON document with `result` and `events`.
- `--output bogus` exits 1 with a usage line.
- `--protocol-version` prints `2`.

### REQ-cli-143

`task run --task <text>` SHALL treat the next argv item as the task text even
when it starts with `-`, and `--task=<text>` SHALL keep text that spans
lines. The bridges pass untrusted Discord and GitHub text as that value, so
text that looks like a flag (for example `--tier=code`, `--no-verify`,
`--max-retries=9`) SHALL NOT be parsed as a CLI flag and SHALL NOT change
the capability tier or retry settings, nor be refused as the removed
`--no-verify` flag (AGENT-5, SAFE-1, REQ-cli-085).

Acceptance Criteria
- A `--task` value starting with `-` is kept verbatim as the task text.
- Flag-looking task text never sets tier, max-retries or JSON, and `--task --no-verify` never sets `removedFlag`.
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
SAFE-8). Without `CORVIDINHO_DAILY_SPEND_CAP_USD` and
`CORVIDINHO_PROVIDER_SPEND_CAPS_USD` it SHALL be `info` and say no daily cap
is set, without opening the database; with provider caps only it SHALL say
no total daily cap is set, with no amount (`info`, or `warn` for an unpriced
model a provider cap covers). With the total cap set it
SHALL show spend in the last 24 hours against the daily cap with the percent,
the number of provider calls counted, and how many are still counted at their
estimate, and SHALL be marked `warn` at or past the 80% warning, at the cap,
when the cap value is not a plain USD amount, when the configured model has
no known price, or when the ledger cannot be read (the last three stop and
ask before every provider call). After it, doctor SHALL print one
`spend provider:<id>` line per provider cap (SAFE-14 / SAFE-15,
REQ-agent-114): that provider's 24-hour spend against its cap with the
percent, the calls counted and those still at their estimate, marked `warn`
at or past 80% and at the cap. When `CORVIDINHO_PROVIDER_SPEND_CAPS_USD` is
invalid (a malformed entry or a provider no configured model uses) the
`spend` line SHALL be `warn` and name the setting, never its value; every
provider call then stops and asks. A tier with no configured model (AGENT-10)
calls nothing, so it SHALL NOT count as an unpriced model: neither this line
nor the `/status` spend lines warn or say paused for it. The line SHALL be informational and SHALL
NOT change the doctor exit code. `task run` SHALL copy the run's 80% spend
warning onto `TaskResult.spendWarning` in `--json` output and the NDJSON
`result` frame, and a run stopped at the cap SHALL exit 0 with state
`blocked`; in text output it SHALL print the generic summary and the ask
question. `corvidinho daemon`, which has no Discord, SHALL log a `warn`
`spend.warning` line for a schedule run that crossed 80% of a cap (a
provider cap's `message` names its `provider:<id>` scope) and a `warn`
`run.needs_human` line with the ask reason for a run that stopped to ask,
leaving the recorded warning and the ask recorded on the run row pending for
a bridge to deliver (REQ-discord-347; AUTONOMY-2 / AUTONOMOUS-7). The daemon
SHALL NOT post or take the ask itself and still needs no Discord token
(REQ-cli-108). `--help` and `.env.example` SHALL list both variables and say
each cap warns at 80% and stops and asks at 100%; for
`CORVIDINHO_PROVIDER_SPEND_CAPS_USD` they SHALL say it is a `provider=USD`
comma list keyed on the provider id (the endpoint host) and that a bad entry
or unknown provider stops every call.

Acceptance Criteria
- `bun src/cli.ts doctor` without the variable prints `[info] spend: no daily cap set (CORVIDINHO_DAILY_SPEND_CAP_USD)`.
- With `CORVIDINHO_DAILY_SPEND_CAP_USD=5` it prints `[ok] spend: $0.00 of $5.00 daily cap used in the last 24h (0%; 0 provider call(s)`.
- Invalid cap, unpriced model, 80% and cap reached yield a `warn` line with `ok: true`.
- `task run --json` against a localhost mock LLM carries `result.spendWarning` on the crossing run only, and at the cap returns `blocked` with a `spend-cap` ask, the generic summary and exit 0 without calling the mock; `--output text` at the cap prints the summary and the ask question.
- The daemon logs `spend.warning` (amounts and percent) and `run.needs_human` (`reason` `spend-cap`) as `warn` lines for a schedule run that reports them.
- A stuck schedule run the daemon claims logs `run.needs_human` (`reason` `stuck`), is recorded with its ask pending, and a Discord bridge started later on the same data dir posts it to the owner once.
- Under a cap with no model configured, `readSpendSnapshot` is `priced` and the public `/status` spend line is absent (not "paused for budget").
- With `CORVIDINHO_PROVIDER_SPEND_CAPS_USD=api.anthropic.com=2` and an Anthropic model, `doctor` prints `[info] spend: no total daily cap set (CORVIDINHO_DAILY_SPEND_CAP_USD)` and `[ok] spend provider:api.anthropic.com: $0.00 of $2.00 daily cap for api.anthropic.com used in the last 24h (0%; 0 provider call(s); CORVIDINHO_PROVIDER_SPEND_CAPS_USD, SAFE-14)`; a provider at 80% or at its cap is `warn`; an invalid provider setting is a `warn` `spend` line naming the setting and not its value.
- `--help` lists `CORVIDINHO_PROVIDER_SPEND_CAPS_USD`.

### REQ-cli-085

Verification can't be skipped (AGENT-14). The CLI SHALL NOT offer a skip of
prove-before-done: `--no-verify` is removed. Wherever `parseGlobalFlags`
would read it as a Corvidinho flag (anywhere in argv, never the `--task`
value, REQ-cli-143, and never a `plugins run <name>` argument after `--`,
REQ-cli-186) it SHALL be returned as `removedFlag`, and `main` SHALL refuse
the command before anything else runs (no `--project` entry, no help, no
plan, no execute, no verify lane): one scrubbed line `corvidinho:
--no-verify was removed: verification can't be skipped (AGENT-14)` and a
hint through `reportCliError` (REQ-cli-419; with `--json` or `--output json`
stdout is `{ ok: false, error }`), exit 1. It is never silently ignored, so
nobody believes a run was left unverified on purpose. Help and
`TASK_RUN_USAGE` SHALL NOT list it. The `[corvidinho] verify_before_complete`
key is ignored (REQ-agent-003); when the current directory's `fledge.toml`
still sets it, `corvidinho doctor` SHALL print one `[warn] verify-gate:
fledge.toml [corvidinho] verify_before_complete is ignored — verification
can't be turned off (AGENT-14); remove the key` line, which never fails
doctor. Product bridges (Discord HEAR, GitHub WATCH), schedules, `/work` and
delegate workers spawn `task run` without it (REQ-discord-085 /
REQ-watch-085). Package **0.0.13**.

Acceptance Criteria
- `corvidinho task run --no-verify --task "fix it"` exits 1 with the `corvidinho: --no-verify was removed: verification can't be skipped (AGENT-14)` line and a hint on stderr, nothing on stdout, no planning, and a fake `fledge` on PATH is never started; `corvidinho --no-verify doctor` is refused the same way.
- `task run --no-verify --json` and `task run --output json --no-verify` print exactly `{ ok: false, error: "--no-verify was removed: verification can't be skipped (AGENT-14)" }` and exit 1.
- `--task --no-verify` stays task text (no `removedFlag`), and `plugins run search-grep --json -- --no-verify src` still hands `--no-verify` to the plugin.
- Help does not contain `--no-verify`.
- A project whose `fledge.toml` sets `[corvidinho] verify_before_complete = false` runs the lane through the real CLI (fake `fledge`, exit 1, `state` `failed`), and doctor there prints the `[warn] verify-gate` line and still passes; without the key there is no such line.
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
- The `docs/DAEMON.md` Logs table has a row for every event `src/daemon/daemon.ts` logs, including `daemon.start_failed` (start refused, exit 1, `message` gives the reason) and `spend.warning` (warn, `spentMicroUsd`, `capMicroUsd`, `percent`).
- The `docs/DAEMON.md` Configuration row for the allowlists says an empty channel list refuses every schedule that has a channel and that users and roles both empty leave only the channel gate and the deny lists, so any creator's schedule runs (REQ-discord-020); it never says empty means deny-all.

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
the suite), `CORVIDINHO_DAILY_SPEND_CAP_USD` and
`CORVIDINHO_PROVIDER_SPEND_CAPS_USD` (SAFE-14), the LLM API keys
`CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` (so `bun
test` never sends a real model call), the operator's model config
`CORVIDINHO_LLM_MODEL`, `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`,
`CORVIDINHO_LLM_BASE_URL`, `CORVIDINHO_LLM_TIER` and `OLLAMA_HOST` (a keyless
`ollama:` model would call a local server, and the no-provider tests expect
no model; tests configure a fake provider themselves, AGENT-13), and `CORVIDINHO_DISCORD_SESSION_ID` (a scheduled run's
`schedule_*` id narrows the GitHub gate, DISCORD-SCHEDULE-3.a, and its verify
lane inherits it). No new env var, config key or command.

Acceptance Criteria
- With the operator's `CORVIDINHO_DATA_DIR`, `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_WATCH_SPAWN_LOG` and `WORKTREE_BASE_DIR` set, a child `bun test` writes 0 audit rows (and no file) to the operator data dir; its rows, including a CLI run it spawns, land in the preload's temp dir.
- An operator DB that already holds an audit chain keeps the same row count and last hash after the child run, and no test row is keyed with the operator's key.
- A CLI or shell a test spawns without an explicit `env` (`Bun.spawn(argv)`, `Bun.spawn({ cmd })`, `Bun.spawnSync(argv)`) resolves the preload's data dir and sees no audit key, WATCH spawn log or worktree base override.
- Full `bun test` with those operator vars set passes and leaves the operator data dir empty.
- With `CORVIDINHO_NON_INTERACTIVE`, `FLEDGE_NON_INTERACTIVE`, `CORVIDINHO_DAILY_SPEND_CAP_USD`, `CORVIDINHO_PROVIDER_SPEND_CAPS_USD`, `CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY` and a `schedule_*` `CORVIDINHO_DISCORD_SESSION_ID` set, a child `bun test` sees none of them: it is not non-interactive and has no LLM API key; full `bun test` with them set passes.
- With `ANTHROPIC_API_KEY`, `OLLAMA_HOST`, `CORVIDINHO_LLM_MODEL`, `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`, `CORVIDINHO_LLM_BASE_URL` and `CORVIDINHO_LLM_TIER` set too, a child `bun test` sees none of them and has no usable model provider.

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
line (`warn` with the no-provider notice when no model provider is usable,
AGENT-10 / REQ-cli-003; never failing), the `fledge` and `specsync` PATH
lines and the project-file lines, creates and changes nothing, exits 0 when
nothing is missing, and points to `corvidinho doctor` for Discord / GitHub
keys and allowlists. No new flag, env var, config key or slash command.

Acceptance Criteria
- In a directory with no project files, doctor (all other checks passing) prints `[missing]` for `fledge.toml`, `verify-lane`, `.specsync` and `specs` with the plain-language reason and creator command, and no other `[missing]` line; exits 1; creates nothing.
- In a complete project (and in this checkout) doctor prints `[ok] fledge.toml`, `[ok] verify-lane: [lanes.verify] runs spec-check`, `[ok] .specsync`, `[ok] specs` and still passes (exit 0).
- `corvidinho init` in an empty directory prints `corvidinho init (report only — creates nothing)`, `[warn] llm: No model provider is configured: CORVIDINHO_LLM_MODEL is not set.`, `[ok] fledge` / `[ok] specsync`, the four `[missing]` project lines, no Discord line, exits 1 and leaves the directory empty; in a complete project with a model and its key it prints `[ok] llm`, exits 0 and says nothing is missing; without `fledge` / `specsync` on PATH it prints `[missing] fledge` / `[missing] specsync`.
- The verify lane counts for a `"spec-check"` step, `{ task = "spec-check" }`, `{ run = "specsync check …" }`, a `parallel` item, a task whose `deps` run `specsync check`, and a lane imported from `.fledge/lanes/`; it is `[missing]` with its own reason when there is no `[lanes.verify]`, when no step runs spec-check (`echo specsync checked` does not count), when the lane names an undefined `spec-check` task, and when a step or a step task's `deps` names any other undefined task (named in the line) even if spec-check is present; `{ run }` counts `specsync check` by path (`/usr/local/bin/specsync check`) or quoted (`sh -c 'specsync check'`).
- A `fledge.toml` that is not TOML fails `fledge.toml` and `verify-lane` naming the file, never printing its text; a broken `.fledge/lanes/*.toml` import fails `verify-lane` naming that file; a `.specsync` that is a file is `[missing]` as not a directory; a `fledge.toml` that is a FIFO is `[missing]` without being opened (doctor does not block).
- Run from a subdirectory of a git project whose root has `fledge.toml`, `.specsync/` and `specs/`, each `[missing]` line names that root (`<root> (the project root) has it — run corvidinho there`) instead of `fledge run --init` / `specsync init`; an item the root lacks keeps its creator command.

### REQ-cli-505

The CLI SHALL take a global `--project <path>` flag (also `--project=<path>`)
that runs the top-level process as if it had been started in `<path>`, without
`cd` (CLI-5): it SHALL load that project's `.env` files and `fledge.toml`, and
every command SHALL read that project's specs and files.

- The flag SHALL be read anywhere before a `--` separator (a plugin argument
  after `--` is passed through untouched) and never from `--task` text; the
  last one wins. A relative path is resolved against the directory the CLI
  was started in.
- Before any command runs (help and version included), `<path>` SHALL be an
  existing directory. A `--project` with no path (a missing value, one
  starting with `-`, or `--project=`), a path that does not exist, is not a
  directory or cannot be read SHALL print one `corvidinho: --project …` line
  and the hint `pass --project the path of an existing project directory`
  through `reportCliError` (REQ-cli-419; `--json` gives `{ ok: false, error }`
  on stdout) and exit 1, changing nothing.
- The env SHALL become what Bun builds for a process started in `<path>`:
  Bun's own `.env*` loading (`.env`, `.env.<NODE_ENV>`, `.env.local`,
  `$VAR` expansion; variables set in the environment win) run once in
  `<path>` from the environment the CLI was started with
  (`/proc/self/environ`, before Bun added the start directory's `.env*`
  values; the current env when that cannot be read), with the CLI's own Bun
  `--no-env-file` / `--env-file` flags (a CLI started with `--no-env-file`
  loads no `.env` from `<path>` either). Values that came only from the start
  directory's `.env*` files SHALL NOT carry over. The probe SHALL pin Bun
  config to `SPAWN_BUN_CONFIG`, so the project's `bunfig.toml` is never
  read, and SHALL NOT print or log env values. A probe that fails SHALL be
  reported like an unusable path (hint: check the directory can be entered
  and its `.env` files read), changing nothing.
- Every child the CLI starts afterwards SHALL get that env, never the start
  directory's `.env*` values: a `Bun.spawn` / `Bun.spawnSync` without an
  explicit `env` (which Bun would give the env it started with) gets the
  current `process.env`, so `specsync`, `fledge run spec-check` and git
  children see the project's `.env` values.
- The process SHALL then `chdir` to `<path>`, so `task run` reads
  `<path>/fledge.toml` (`[corvidinho]`, `[corvidinho.autonomous]`) and plans
  with `<path>`'s specs, and `plugins`, `specsync`, `doctor`, `discord bridge`,
  `github watch` and `daemon` use `<path>` as their project root (their agent
  binary then defaults to `<path>/src/cli.ts`, as when started there;
  `CORVIDINHO_BIN` sets another).
- Only the top-level process: spawned agents SHALL keep
  `bun --no-env-file --config=/dev/null` (`buildCorvidinhoArgv`) and their
  own cwd. No env var, config key or slash command is added.

Acceptance Criteria
- `parseGlobalFlags` returns `project` for `--project <path>` and `--project=<path>` before or after the command, `""` for `--project` with no path, and leaves `--project` after `--` or as `--task` text alone.
- Started in a directory A, `--project P task run --task "touch widget" --json` (and `task run … --project=../P`) exits 0 with `state` `done` (its fake provider's reply changes nothing in P), and the Planning briefing holds P's `widget` spec.
- Started in A (whose `.env` sets a spend cap, an LLM key and a model), `--project P doctor` prints exactly what `doctor` prints when started in P: P's `.env.local` wins over P's `.env` with `$VAR` expanded, and A's LLM key is gone (`[warn] llm`); the key value is never printed.
- Started in A, `--project P specsync check` gives the `specsync` child P's `.env` values and none of A's, exactly as `specsync check` started in P does.
- `bun --no-env-file` CLI `--project P doctor` from A prints exactly what `bun --no-env-file` CLI `doctor` prints when started in P (no cap from P's `.env`); `envFileFlags` keeps only Bun's `.env` flags, in order.
- A spend cap set in the environment still wins over P's `.env`.
- A missing path, a file and a `--project` with no path each exit 1 with exactly `corvidinho: --project …` and the hint on stderr and run no command; with `--json` stdout is `{ ok: false, error }`; `enterProject` on such a path leaves the cwd unchanged.

### REQ-cli-423

The project SHALL ship package version `0.0.32` (allowlisted tools reach the model, Fledge core builtins, Choose asks on work and session start, open asks kept per askId, role-refusal note, --project, doctor and init name project files). CLI `version` and Discord presence (DISCORD-12) report `0.0.32` after a restart. CHANGELOG SHALL include verbose 0.0.32 notes.

Acceptance Criteria
- `package.json` version is `0.0.32`.
- CLI `version` prints `0.0.32`.
- CHANGELOG has a 0.0.32 section that the updater's changelog helper extracts exactly.

### REQ-cli-424

The project SHALL ship package version `0.0.33` (DISCORD-8 acting-user post check, open asks scrubbed at rest and re-scrubbed, watch comment rate-limit backoff). CLI `version` and Discord presence (DISCORD-12) report `0.0.33` after a restart. CHANGELOG SHALL include verbose 0.0.33 notes.

Acceptance Criteria
- `package.json` version is `0.0.33`.
- CLI `version` prints `0.0.33`.
- CHANGELOG has a 0.0.33 section that the updater's changelog helper extracts exactly.

### REQ-cli-186

`corvidinho plugins run <name> [--json] [-- ...args]` SHALL pass every argv
item after the first `--` that follows the plugin name to the plugin
verbatim. Items there that look like Corvidinho flags (`--json`,
`--no-verify`, `--non-interactive`, `--task`, `--tier`,
`--max-retries`, `--help`, `-h`, another `--`) SHALL NOT be parsed as
CLI flags. Global flags and `--json` before that `--` SHALL keep working.
Help SHALL be read only from Corvidinho's own argv, never from those plugin
args or from the `--task` value (REQ-cli-143).

Acceptance Criteria
- `plugins run search-grep --json -- --no-verify src` gives the plugin `--no-verify src` and prints JSON.
- `plugins run shell-exec -- gh pr list --json number` gives the plugin `gh pr list --json number`.
- `plugins run shell-exec -- ls -h` runs the plugin instead of printing help.
- `--non-interactive plugins run fledge-hello -- a` still runs non-interactive; `--help` before the `--` still prints help.
- `task run --task -h` runs the task with `-h` as its text.

### REQ-cli-680

OPS-1 ("A nightly backup goes to a place I choose, and I'm told if it fails.")
and OPS-2 ("A backup can be restored, and the restore is tested regularly.")
SHALL be met by `src/store/backup.ts`, run from the existing scheduler tick
(REQ-discord-680 for the bridge; `corvidinho daemon` here), with a restore
command and a doctor line.

- Place. `CORVIDINHO_BACKUP_DIR` (optional) SHALL name the backup directory.
  Unset or blank SHALL mean no backup (today's behaviour). A relative path
  SHALL be invalid. A directory at or below a directory holding `.git` SHALL
  be refused (snapshots hold private notes, SAFE-6). The directory SHALL be
  created with mode 0700 when missing. No other new env var or config key.
- Nightly snapshot. At the first scheduler tick at or after 03:00 local time,
  once per local day per data dir (the night claimed in an IMMEDIATE
  transaction on `schema_meta`, so a bridge and a daemon on one data dir back
  up once), the ticker SHALL write `VACUUM INTO` of the live connection (one
  read transaction: consistent while other processes write) to a temp name
  under umask 077, check it (`PRAGMA integrity_check` `ok`, schema version
  1..SCHEMA_VERSION, every table of the current schema at SCHEMA_VERSION, every
  table countable), fsync it and rename it to `corvidinho-<YYYYMMDD>T<HHMMSS>Z.db`
  (UTC, mode 0600). `ensureScrubbed` SHALL run first, so the snapshot carries
  the DB's SAFE-6 scrubbing. Afterwards only the newest 7 snapshots SHALL be
  kept; files not matching the snapshot name SHALL never be touched. A failure
  SHALL leave no partial file.
- Restore test. In the same night slot, when no test ran for 7 days, or the
  last one failed, and the directory holds a snapshot (none ⇒ skipped and
  logged), the newest snapshot SHALL be restored with `restoreSnapshot` into a
  fresh temp dir, checked as above, its row counts compared with the counts
  recorded when that snapshot was taken, and the temp dir deleted.
- Logged. Each run SHALL be logged: `backup.ok` (dir, snapshot, bytes,
  schemaVersion, counts, removed; `recovered` when it ends a streak),
  `backup.failed` (error; `ownerNotice`), `restore_test.ok` /
  `restore_test.failed` / `restore_test.skipped`. The daemon logs them as
  scrubbed JSON lines (REQ-cli-108 logger) and SHALL add `backup` (the
  directory, `off`, or why it is unusable) to `daemon.started`.
- Told, once per failure streak. The first failure of a job (backup or
  restore test) after a success or none SHALL record an owner notice in
  `schema_meta` and the scrubbed one-line reason; later failures of the same
  streak SHALL only update the reason and log; a success SHALL end the streak.
  The daemon has no Discord: its notices stay pending for a bridge
  (REQ-discord-680).
- Restore command. `corvidinho backup list` SHALL print the snapshots newest
  first; `corvidinho backup restore <snapshot> <target> [--force]` SHALL accept
  only a snapshot name from the configured directory, check it, and write it
  to the target (copy next to it, 0600, fsync, the old file's
  `-journal` / `-wal` / `-shm` removed, rename, then check the restored file).
  A target any process holds open (Linux `/proc/<pid>/fd`, plus a live
  `daemon.lock` next to a target named `corvidinho.db`) SHALL be refused even
  with `--force`, so the live DB is never overwritten while a process holds
  it; any other existing target SHALL need `--force`. Refusals exit 1 with one
  `restore refused: …` line. `--help` SHALL list both.
- Doctor. `corvidinho doctor` SHALL print a `backup` line: `[warn]` `off —
  CORVIDINHO_BACKUP_DIR is not set …` when unset; `[warn]` with the reason
  for an invalid, in-repo, non-directory or unwritable path; else the
  directory, snapshot count and newest, and the last backup and restore test
  (`[ok]`), or the failing job's reason and whether the owner was told
  (`[warn]`). It SHALL never fail doctor (the box updater rolls back on a
  failing doctor) and SHALL create nothing.

No new table, column or schema version: state lives in `schema_meta` `ops_*`
keys. No encryption (the directory is local); no remote target.

Acceptance Criteria
- A snapshot taken while another connection holds an uncommitted write contains only committed rows, is named by UTC time, mode 0600 in a 0700 dir, passes `checkDbFile`, and leaves no temp file.
- With stored rows from before a scrub-rules bump, the snapshot holds the redacted text, never the key.
- Nine nightly snapshots leave the newest 7; unrelated files in the directory stay.
- A directory inside a git work tree and a path that is a file are refused with no file written.
- `restoreSnapshot` restores to a new target (0600, rows present); refuses a target this process holds open even with force (live DB unchanged) and one named by a live `daemon.lock`; an existing idle target needs force and its stale `-journal` is removed; a traversal name, a missing name, a corrupt snapshot and a directory target are refused.
- `runRestoreTest` passes on the newest snapshot and leaves the temp root empty; it fails on a corrupt newest snapshot, on row counts that differ from the recorded ones, and with no snapshot.
- The ticker does nothing when unset; runs once per night from 03:00 local across two connections on one data dir; runs the restore test on the first night and again 7 days later; a failing backup is logged and tells the owner once per streak with fixed text (no path, no error), again after a success and a new failure; a daemon ticker leaves the notice pending; a failing restore test is retried nightly and told once.
- `corvidinho daemon` logs `daemon.started` with `backup`, its tick writes one snapshot and logs `backup.ok` and `restore_test.ok`; a failing dir logs `backup.failed` (error) and leaves `ops_backup_notice`; unset logs `backup: "off"` and no backup events.
- `backup list` / `backup restore` via the CLI; restore onto the DB the test process holds exits 1 with `is open in process <pid>`; unset dir exits 1; `--help` lists both; `doctor` prints `[warn] backup: off …` unset and `[ok] backup: <dir> — 1 snapshot(s)` set; the doctor line is `[warn]` (never failing) for invalid, in-repo and failing states and shows `owner not told yet` / `owner told`.

### REQ-cli-071

`task run` SHALL copy the run's SAFE-13 notice — the first tool result that
looked like a prompt-injection attempt, as `{ source, reasons }` (the tool
name and reason ids, never the text), reported by `createTaskExecute({
onInjection })` (REQ-agent-071) — onto `TaskResult.injection`, the way it
copies `spendWarning`, so `--json` and the NDJSON `result` frame carry it
(additive; the protocol version stays 2) and the Discord, WATCH and schedule
surfaces can tell the owner. A run with no hit leaves the field out. No flag,
env var or config key.

Acceptance Criteria
- A run whose tool result trips the detector reports `{ source, reasons }` once through `onInjection`; the Discord and WATCH spawn clients read it back from the result frame with `injectionNoticeFromUnknown` (tool-name source, known reason ids only) and the bridge / WATCH tests drive the owner notice from it.
- Regression tests in `tests/safe.injection.test.ts` fail on the base sources and pass after.

### REQ-cli-367

`corvidinho doctor` SHALL warn about GitHub logins with no numeric id
(IDENTITY-7.a, #36, REQ-discord-367). From the owner config (env + allowlist
file `[owner]`) and the declared people of the allowlist file the loader
resolves (read like the bridge and WATCH read them), doctor SHALL print one
`[warn] people-github` line when the owner or any declared person has a GitHub
login but no GitHub numeric id (`peopleWithoutGithubId`), naming them by
person id only (`the owner` for the built-in owner, `<id> (the owner)` for the
owner's declared person) — never a Discord id, GitHub id, login or token —
and saying that on GitHub people match only by that id, so they read as
undeclared (community) there until one is linked (`[owner] github_id` /
`github_ids` in the file, or `/admin people link person:<id> github:<login>`).
The line SHALL NOT change the exit code, and SHALL NOT be printed when nobody
is affected.

Acceptance Criteria
- An allowlist file whose `[owner]` has a `github_login` but no `github_id` and a person with only `github_logins` gives `[warn] people-github: ada, the owner: …` naming person ids only; no Discord id, GitHub id or login is printed; doctor still passes (exit 0).
- With `[owner] github_id` and `github_ids` on everyone with a login there is no `people-github` line.
- The tests in `tests/cli.doctor-truth.test.ts` fail on the base sources and pass after.
### REQ-cli-425

The project SHALL ship package version `0.0.34` (declared people and roles, person and project memory with forget-me, GitHub memory and ranked recall, condensed chats kept 30 days and resumed after the TTL (schema v13), answer footer and fence-safe 2000-char splits, nightly backup, discord-send-file, private Answer form, injection guards, W12 sweep). CLI `version` and Discord presence (DISCORD-12) report `0.0.34` after a restart. CHANGELOG SHALL include verbose 0.0.34 notes.

Acceptance Criteria
- `package.json` version is `0.0.34`.
- CLI `version` prints `0.0.34`.
- CHANGELOG has a 0.0.34 section that the updater's changelog helper extracts exactly.

### REQ-cli-710

`task run` carries text shown only privately (MEMORY-7.a, #101). It SHALL
pass `onPrivateReply` to `createTaskExecute` and put each text it gets on
`TaskResult.privateReplies` in order, a text already there (a retried
attempt's repeat read) kept once, the list bounded with `boundPrivateReplies`
(`src/discord/private-reply.ts`, REQ-discord-710: at most 5, each scrubbed then
cut to 6000 characters with a visible marker, the last saying how many more
were not sent) so a run of large private reads cannot push the result frame
past the parser's line cap and lose the whole answer, absent when none — in
`--json` and the NDJSON `result` frame (protocol unchanged), for the Discord
bridge to send by direct message (REQ-discord-710). Text output SHALL NOT
print them. No flag or env var.

Acceptance Criteria
- Spawned through the Discord agent client against a fake LLM that calls `memory-profile` and `memory-recall --category private`, `task run --output ndjson` puts both texts on the result frame's `privateReplies`; the summary and every model request lack them.
- A `task run --output ndjson` whose model makes seven private reads of different notes puts the first five on its own result frame (read straight off stdout), the last saying 2 more were not sent; no model request holds the notes.
- `tests/memory.private-view.test.ts` covers it and fails on main.

### REQ-cli-426

The project SHALL ship package version `0.0.35` (numeric GitHub ids, DM private reads, GitHub forget-me, unskippable verify, shell guards, schedule repo gate). CLI `version` and Discord presence (DISCORD-12) report `0.0.35` after a restart. CHANGELOG SHALL include verbose 0.0.35 notes.

Acceptance Criteria
- `package.json` version is `0.0.35`.
- CLI `version` prints `0.0.35`.
- CHANGELOG has a 0.0.35 section that the updater's changelog helper extracts exactly.
### REQ-cli-711

A `bun test` run SHALL NOT leave the temp dirs it makes in the OS temp dir.
The bun test preload (`tests/preload.ts`, loaded by `bunfig.toml`) SHALL
create one per-process root, `corvidinho-test-run-*`, in the temp dir the run
started with, and SHALL point `TMPDIR`, `TMP` and `TEMP` at it before any
test module loads, so every later `tmpdir()` / `mkdtemp` in the suite (also
one read at a test file's top level) and in a CLI or shell a test spawns with
no explicit `env` lands under it; the preload's scratch data dir
(REQ-cli-262) SHALL live inside it. The root SHALL be removed recursively
once the `bun test` process that made it has exited, however it ends (pass,
fail, `--bail`, a test calling `process.exit()`, a signal or SIGKILL sent to
that process), and never while its tests may still use it (`--rerun-each`
reruns the last file after the preload's `afterAll`; `--parallel
--no-isolate` fires it after every file): a watcher the preload starts waits
for a pipe only that process holds open to close, then removes the root; a
test calling `process.exit()` also removes it from the `exit` event. Removal
SHALL touch nothing outside the root (it does not follow symlinks) and SHALL
be best-effort and never throw, so it never changes a run's exit code or
hides a test failure. Killing the run's whole process tree (an aborted verify
lane) kills the watcher too and leaves that one root. No new env var, config
key or command.

Acceptance Criteria
- A child `bun test` started with `TMPDIR` set to a fresh dir reports `tmpdir()` (read inside a test and at module top level), `TMPDIR`, `TMP` and `TEMP` as one `corvidinho-test-run-*` dir directly inside it; its data dir, its `mkdtemp` dirs and a shell's `mktemp -d` spawned with no explicit `env` are all inside that root.
- Shortly after that child exits the root is gone and the fresh `TMPDIR` is empty: when its tests pass (exit 0), when a test fails (exit 1, the failure still printed; also with `--bail`), when a test calls `process.exit(7)` (exit 7) and when its bun process is SIGKILLed mid-test (exit 137).
- With `--rerun-each=2` both runs pass (the root is still there for the rerun) and the fresh `TMPDIR` is empty afterwards.
- Another run's `corvidinho-test-run-*` root in the same `TMPDIR`, and the target of a symlink the run left in its root, are untouched.
- A full `bun test` run with a fresh `TMPDIR` passes and leaves that dir empty.

### REQ-cli-097

For the run's duration, `task run` SHALL route the must-ask gate's notes into
its event stream as `Text` events (`setMustAskNotifier`: the "waiting for the
owner's OK on an Approve card" line and the approval line, each tagged with
AUTONOMY-9 or AUTONOMY-10) and restore the previous notifier after, so text
mode prints them on stderr and `--output ndjson` streams them as `Text`
frames (protocol unchanged). `plugins run` and any caller without a notifier
SHALL print them on stderr. A lapsed, denied or unraisable card SHALL end the
call with a refusal saying why: with no bridge the card lapses, which means
no, and the CLI prints why (AUTONOMY-9/10 with SAFE-18/20). No flag or env
var.

Acceptance Criteria
- The notifier receives the wait line (naming the one-time code for prod) and the approval line; with no notifier the wait line goes to stderr.
- A lapse's refusal says the running bridge DMs the card and that with no bridge it lapses.

### REQ-cli-079

With no provider set, it says so at startup (AGENT-10, captured from Leif's
2026-09-28 interview), and there is no built-in default model (AGENT-13).
`corvidinho task run` SHALL print the no-provider notice for its tier
(REQ-agent-179) as its first stderr line in text output when the tier has no
usable provider, and in every output mode the run SHALL end `failed` with that
notice as its summary, call no provider and exit 1 (`--json` / the NDJSON
`result` frame carry it; machine modes keep stderr quiet). `corvidinho
daemon` SHALL add an `llm` field to `daemon.started` — the default tier's
provider as `<model> @ <host>` (non-openai kinds as `kind:model`), or `none` —
and, when any tier has no usable provider, SHALL log one `warn`
`llm.no_provider` line with the `notice`; its scheduled runs fail and call
no model, and like any failed schedule run (DISCORD-3.b, REQ-discord-032) the
run row's `summary` is the notice on a schedule the owner created and
`That didn't work.` on anyone else's (the daemon has no owner DM path, so it
never says the owner was told), the row's `error` and the `run.finished`
`error` read `failed (exit 1): <notice>`, and one `[scheduler] run failed
(schedule <id>, exit 1): <notice>` line is logged; the daemon posts to no
channel itself (a bridge's scheduler tick posts only a run's ask, such as the
auto-pause ask, REQ-discord-353), and this start-up line says why. `--help` SHALL list `CORVIDINHO_LLM_MODEL` as required with the
`openai:` / `ollama:` / `anthropic:` forms and no built-in default, plus
`CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY`, `CORVIDINHO_LLM_BASE_URL`,
`OLLAMA_HOST` and `ANTHROPIC_API_KEY`; `.env.example`, `docs/DAEMON.md`
(including the Logs table) and `docs/DISCORD-GO-LIVE.md` (E.9, with the
upgrade note: a key-only setup must now set `CORVIDINHO_LLM_MODEL`) SHALL say
the same. No key value is printed.

Acceptance Criteria
- `task run --task hi` with only `OPENAI_API_KEY` set exits 1; its first stderr line is the "CORVIDINHO_LLM_MODEL is not set" notice; stdout has `state=failed` and the notice; no demo text and never the key value.
- `task run --json` in the same setup prints a `failed` result whose summary is the notice and `filesChanged` `[]`.
- The daemon with no model logs `daemon.started` with `llm: "none"` and a `warn` `llm.no_provider` line whose `notice` is the notice; with `CORVIDINHO_LLM_MODEL=ollama:qwen3` it logs `llm: "ollama:qwen3 @ 127.0.0.1:11434"` and no `llm.no_provider`.
- `docs/DAEMON.md`'s Logs table has a row for `llm.no_provider` (the docs test checks every logged event).
- A daemon with no model whose due schedules spawn the real `task run`: the owner's schedule's run row has `summary` = the notice and `error` = `failed (exit 1): <notice>`; another creator's has `summary` `That didn't work.` and the same `error`; each `run.finished` is a `warn` with `ok: false` and that `error`; `[scheduler] run failed (schedule <id>, exit 1): <notice>` is logged for each, never the bare `failed (exit 1)` line (`tests/daemon.no-provider-run.test.ts`).

### REQ-cli-080

If a model fails or is retired, it falls back to my next configured model and
tells me (AGENT-11, captured in `hi/agent.md` from Leif's 2026-09-28
interview; the chain is REQ-agent-080). `task run` SHALL put the configured
model that answered on `TaskResult.model`, the usage per configured model on
`TaskResult.usageByModel` and every failover (its own and, marked `via`, its
delegate or council workers') on `TaskResult.modelFallback`, in `--json` and
the NDJSON `result` frame (optional fields, protocol 2 unchanged); every NDJSON
`usage` frame SHALL name its `model` and the running `byModel` totals. Each
failover SHALL be an `[operator] <a> failed (<reason>); falling back to <b>`
line on stderr in text mode (a `Text` frame in ndjson, quiet stderr in json),
and the printed answer SHALL end with the closing `(model fallback: …)` note.
The daemon's own spawn client SHALL log each schedule run that failed over as a
`warn` `llm.fallback` event with `sessionId`, `fallbacks` (`from`, `to`,
`reason`, optional `via`) and a `message` line (`formatModelFallbackLog`);
there is no DM, and the run's post carries the note. No flag or env var is
added. `.env.example`, `docs/DISCORD-GO-LIVE.md`, `docs/DAEMON.md`,
`docs/WATCH.md`, `docs/discord.md` and `README.md` SHALL describe the list as
a fallback chain and no longer say that only its first entry is called.

Acceptance Criteria
- `task run --output ndjson` with `ollama:gone-model, ollama:fake-model` against a localhost provider answering `gone-model` 404: exit 0; a Text frame `[operator] ollama:gone-model failed (HTTP 404); falling back to ollama:fake-model`; a usage frame with `model` `ollama:fake-model` and `byModel`; a `done` result whose summary ends with the note and that carries `model`, `usageByModel` and `modelFallback`.
- `task run` (text) with a 410 head: exit 0, the operator line on stderr, the answer followed by the note on stdout.
- A daemon started without an injected agent, `CORVIDINHO_BIN` a fake bin whose result frame reports a failover: after a due schedule runs, one `llm.fallback` warn event with the schedule's session id, the hops and `llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1`.
- `tests/docs.operator-facts.test.ts` still passes with the new Logs row.
### REQ-cli-427

The project SHALL ship package version `0.0.36` (approval cards and codes, must-ask gate, owner-only spend, no default model, tests-ran verify, schedule asks). CLI `version` and Discord presence (DISCORD-12) report `0.0.36` after a restart. CHANGELOG SHALL include verbose 0.0.36 notes.

Acceptance Criteria
- `package.json` version is `0.0.36`.
- CLI `version` prints `0.0.36`.
- CHANGELOG has a 0.0.36 section that the updater's changelog helper extracts exactly.

### REQ-cli-741

The daemon reads the owner live for each schedule run (DISCORD-SCHEDULE-1.a,
#124). `startDaemon` SHALL pass the scheduler, besides the start-time owner
it already passes for the creator gate (REQ-cli-108), a `loadOwner` that
re-reads the owner config (`loadOwnerConfig({ env })`: env over the
allowlist file's `[owner]`) at each run, so only the owner as configured now
gets the owner stamp for their own schedule (REQ-discord-741) and an owner
change in the file applies to the next run without a restart. No env var,
config key, flag or log event is added.

Acceptance Criteria
- `tests/scheduler.owner-role.test.ts` ("daemon: …"): with an allowlist file naming the owner, the owner's due schedule is spawned `actingIsAdmin: true`; after the file names another owner the next due run of it is spawned `actingIsAdmin: false`, with no restart.
- The test fails with the base sources (always `false`).

### REQ-cli-428

The project SHALL ship package version `0.0.37` (owner worktree shell, model fallback, provider spend caps, SpecSync changes, owner schedules, stop and queue). CLI `version` and Discord presence (DISCORD-12) report `0.0.37` after a restart. CHANGELOG SHALL include verbose 0.0.37 notes.

Acceptance Criteria
- `package.json` version is `0.0.37`.
- CLI `version` prints `0.0.37`.
- CHANGELOG has a 0.0.37 section that the updater's changelog helper extracts exactly.

### REQ-cli-122

A CLI task run in a git repo works in its own worktree by default; --here
runs it in my current checkout (SESSION-WORKTREE-1.a, captured in
`hi/session.md` from Leif's 2026-09-28 interview, round 9; parent
SESSION-WORKTREE-1). `corvidinho task run` SHALL choose where it works with
`enterCliTaskWorkspace` (`src/worktree/cli-run.ts`) before it reads the
project's config or calls a model:

- **In place** when `--here` is given; when the start directory is not in a
  git work tree (`isGitRepo`; AGENT-1.a: the project folder itself); and in a
  child a product surface spawned, which already runs in the cwd its parent
  chose and SHALL never make a nested worktree, even from a parent that does
  not pass `--here` (`isSpawnedTaskChild`: a role session —
  `CORVIDINHO_ACTING_IS_ADMIN` present, as every Discord chat, `/session`,
  `/work`, schedule and WATCH spawn sets it — a non-empty
  `CORVIDINHO_WATCH_SESSION_ID` or `CORVIDINHO_DISCORD_SESSION_ID`, or a
  delegation depth above 0).
- **Otherwise in its own new linked worktree**, made by `ensureTalkWorkspace`
  (plain `git worktree add -b` from `HEAD`) from the repo's top level, the
  realpath of `git rev-parse --show-toplevel` (never the start directory's
  parent), with its defaults: under `WORKTREE_BASE_DIR`, else
  `dirname(repoTop)/.corvid-worktrees`; id `talk-cli_<uuid prefix>-<digest>`
  and branch `talk/cli_…` from a fresh `cli_<random uuid>` talk id. The run
  SHALL work (and `process.chdir`) in the same subdirectory relative to the
  repo top that it was started in. Nothing SHALL be copied into it (the
  checkout's uncommitted edits and untracked files, a local `.env`,
  `node_modules`) and nothing SHALL be installed there; the env is still the
  one the process started with. Its first event SHALL be the start line
  `Working in a new worktree <dir> (branch <branch>) made from HEAD:
  uncommitted and untracked files in this checkout are not included and
  nothing is installed there. Pass --here to run in this checkout.` (a
  `Text` event: stderr in text mode, a `Text` frame in ndjson, in `events`
  for `--json`).

`--here` SHALL be read only from `task run`'s own arguments before the first
`--` (`parseTaskHere` over `rest` after `task run`, which never holds the
`--task` value), so `--task --here`, `--task=--here` or `-- --here` never turn
it on, and it is no global flag of any other command.

The worktree SHALL fail closed: when it cannot be made (an unborn `HEAD` —
refused before `git worktree add`, which would otherwise make an empty orphan
worktree —, a git error, an unusable base dir) or the start subdirectory is
missing in it (untracked, ignored or uncommitted), the run SHALL call no
model, remove what it made (the worktree, and its branch when that has no
commits of its own), including what a failed `git worktree add -b` still
left under this run's own fresh names (the branch git makes before the
checkout, and the whole worktree when only a post-checkout hook failed, as
git-lfs's does without git-lfs), and exit 1 through `reportCliError` with one
scrubbed line (`task run could not make its worktree: <git's fatal: or
error: line, else its last line>` / `task run's worktree has no <subdir>: …`)
and the hint `pass --here to run in this checkout` (`--json`: `{ ok: false,
error }` on stdout); it SHALL never fall back to the checkout. SIGINT /
SIGTERM are hooked before the worktree is made (REQ-cli-244): a signal before or while it is made SHALL give exit 130
with `corvidinho: cancelled while making the task worktree`, no model call
and nothing left behind.

When the run ends (done, failed, blocked or cancelled, or the run throws),
the process SHALL `chdir` back and `finishCliTaskWorkspace` SHALL remove the
worktree only when `git status --porcelain` there is empty, and delete its
branch only when it has no commits of its own (`parkWorktree` /
`branchHasOwnCommits`); a worktree with uncommitted changes, or one git
cannot read, SHALL be kept with its branch, never force-removed. The branch
meant is the one the worktree is on at the end: its own `talk/cli_…`, or a
branch the run made and switched to (`git-branch-create`); then the
`talk/cli_…` branch SHALL be deleted when every commit on it is also on the
checkout's `HEAD` or that branch, and otherwise kept and named too (`Also kept
branch <talk>: it has commits of its own.`). What is kept SHALL be named on stderr in text mode (`Kept worktree <dir> (branch <b>): it
has uncommitted changes.` / `Removed worktree <dir>; kept branch <b>: it has
commits of its own.`) and, for every run that used its own worktree, on the
optional additive `TaskResult.workspace` `{ dir, branch, kept, branchKept }`
(`--json` and the NDJSON `result` frame; `CORVIDINHO_PROTOCOL_VERSION`
unchanged). A run in place has no `workspace`. No new env var, config key,
table or schema change.

Acceptance Criteria
- `parseTaskHere` is true for `--here` among `task run`'s args and false after `--`, for `--here=1`, and for `--task --here` / `--task=--here` read through `parseGlobalFlags`.
- In-process, a start directory reached through a symlink into `repo/sub` gets a worktree under `<repo parent>/.corvid-worktrees` named `talk-cli_<12 hex>-<16 hex>` on branch `talk/<same>`, works in its `sub`, and has neither the checkout's uncommitted edit nor its untracked file; `WORKTREE_BASE_DIR` moves the base; finishing it clean removes the worktree and the branch.
- `--here`, a non-git dir and each child env (`CORVIDINHO_ACTING_IS_ADMIN` 0 or 1, a WATCH or Discord session id, delegation depth 1) stay in place and make nothing; an empty depth is not a child.
- An untracked start subdir and an unborn HEAD fail closed with no worktree or branch left; an aborted signal before creation is `cancelled` and makes nothing.
- Uncommitted changes keep the worktree and branch (`kept: true, branchKept: true`, the stderr note); a clean worktree with a commit is removed and its branch kept (`kept: false, branchKept: true`).
- The real CLI in `repo/sub` with a fake model that writes `note.txt`: `--json` exit 0, `state` `done`, the note is in the worktree's `sub`, the checkout is unchanged (only its own untracked file), the first event is the start line, `result.workspace` names the kept worktree; text mode prints the start line and the kept line on stderr.
- `--here` writes the note in the checkout, has no `workspace`, and makes no worktree, branch or base dir.
- A run that changes nothing (`--task --here` and `-- --here`, ndjson) ends `done` with `workspace.kept` and `branchKept` false and nothing left.
- An old-bridge child (`CORVIDINHO_ACTING_IS_ADMIN=0`, no `--here`) makes no worktree.
- An untracked start subdir, a file as `WORKTREE_BASE_DIR` (`--json`: the error object and the hint on stderr) and an unborn HEAD exit 1 with the `pass --here` hint and no model call.
- SIGINT while `git worktree add` runs, to the CLI alone or to the whole process group while a post-checkout hook waits (Ctrl-C at a terminal), exits 130 with the cancelled line, no model call, and no worktree or branch left.
- A post-checkout hook that fails (as git-lfs's does without git-lfs), in-process and through the real CLI: exit 1 with the hook's line and the `pass --here` hint, no model call, and neither the worktree nor its `talk/cli_…` branch left.
- A run that switched its worktree to a branch of its own: with commits there, the worktree is removed, that branch is named and kept and the empty talk branch is deleted; dirty, the worktree is kept under that branch's name; a talk branch with commits only on it is kept and named (alone, or with `Also kept branch …` when both have commits of their own).

### REQ-cli-125

`corvidinho task run` SHALL apply the run limits I set (AGENT-12), on every
surface, since the Discord bridge, `github watch`, the daemon, schedules and
delegate / council workers all run it as a child with the parent's env:

- `CORVIDINHO_MAX_TURNS` (optional): model/tool rounds per execute attempt,
  read by `createTaskExecute` (REQ-agent-312); default 8.
- `CORVIDINHO_IDLE_TIMEOUT_MS` (optional): passed to `runTask` as
  `idleTimeoutMs` (REQ-agent-244); default 600000 (10 minutes).
- A set value that is not a positive whole number SHALL be ignored (the
  default applies) and said once as a `Text` event before the run —
  `[operator] AGENT-12: <KEY> is not a positive whole number, so the default
  <N> is used.` — never echoing the value.
- Every event the CLI prints or streams SHALL count as the run's activity
  (`noteIdleActivity` in the event handler).
- `--json` / ndjson results SHALL carry `stopReason` (`turn-cap` /
  `idle-timeout`) and, for an idle timeout, `error` (additive fields; the
  protocol version is unchanged). An idle-timed-out run SHALL exit 1 (failed,
  not cancelled). In text mode a run with `stopReason: "turn-cap"` SHALL
  print `TURN_CAP_NOTE` (`Stopped: it reached the turn cap before it
  finished, so this is its best answer so far.`) on the line after its
  summary; an idle-timed-out run's summary already starts with its line.
- `--help` SHALL list both keys with their defaults, and `.env.example`
  SHALL document both (commented out at their defaults).

Acceptance Criteria
- `task run --here --task …` with `CORVIDINHO_MAX_TURNS=2` and a fake model that always calls `files-list` sends 2 model requests, exits 0 and prints `still listing` then `TURN_CAP_NOTE`, with `[operator] Stopped after 2 tool rounds` on stderr; with `--output ndjson` the `result` frame is `state: "done"`, `stopReason: "turn-cap"`, `summary: "still listing"`.
- `CORVIDINHO_MAX_TURNS=lots` and `CORVIDINHO_IDLE_TIMEOUT_MS=off` each give their `[operator] AGENT-12: …` line on stderr (default 8 / 600000) and the value is not printed.
- `CORVIDINHO_IDLE_TIMEOUT_MS=4000` with a fake verify lane that hangs silently: exit 1, `result` frame `failed`, `cancelled: false`, `stopReason: "idle-timeout"`, `error` and summary head `Stopped: no output for 4 seconds (idle timeout).`, the fake `fledge` and its lane task gone.
- `--help` names `CORVIDINHO_MAX_TURNS` and `CORVIDINHO_IDLE_TIMEOUT_MS`; `.env.example` has `# CORVIDINHO_MAX_TURNS=8` and `# CORVIDINHO_IDLE_TIMEOUT_MS=600000`.
- Fixture: `tests/agent.limits.test.ts`.

### REQ-cli-429

The project SHALL ship package version `0.0.38` (spend approve cards, unknown-price cards, stall nudge, stop button, CLI task worktree, failed runs say why). CLI `version` and Discord presence (DISCORD-12) report `0.0.38` after a restart. CHANGELOG SHALL include verbose 0.0.38 notes.

Acceptance Criteria
- `package.json` version is `0.0.38`.
- CLI `version` prints `0.0.38`.
- CHANGELOG has a 0.0.38 section that the updater's changelog helper extracts exactly.

### REQ-cli-681

My local CLI task run may use the allowlisted shell and runners inside its
own worktree (SAFE-3.a, local CLI half; captured in `hi/safe.md` from Leif's
2026-09-28 interview: "The model may use the shell, the language runners and
Fledge lane/task runs only in my own interactive runs (chat, /session start,
/work, local CLI), only when I allowlist them, and only inside that talk's own
worktree; non-owners, WATCH and schedules never get them."; #83). A local
`corvidinho task run` SHALL offer the model the allowlisted `SAFE3A_TOOLS`
(`shell-exec`, `node-exec`, `python-exec`, `cargo-exec`,
`fledge-lanes-run`, `fledge-run`; REQ-agent-501 / REQ-agent-503) only in the
worktree it made for itself (SESSION-WORKTREE-1.a, REQ-cli-122):

- `taskRun` SHALL pass that worktree's top (`ws.dir`) to
  `createTaskExecute` as `talkWorktree` only when `enterCliTaskWorkspace`
  made this run's own worktree (`kind: "worktree"`) and the process has no
  role session (`roleSessionActive` false); it is an in-process value, never
  read from the env. In place (`--here`, a non-git folder, a spawned child)
  it SHALL pass none.
- `shellToolsGate` (REQ-agent-503) SHALL grant a run with no role session
  only when it is not a delegate or council worker (depth 0), carries no
  WATCH or schedule marker, no `CORVIDINHO_DISCORD_SESSION_ID` and no
  `CORVIDINHO_ACTING_SURFACE` stamp (every product spawn sets a role
  session, so either one means a spawn without one), no
  `CORVIDINHO_PROJECT_ROOT` (`TOOL_CHILD_ENV`: the env of every tool child —
  `shell-exec` and the runners, the Fledge core runs and Fledge plugin
  commands — carries it, so a `task run` the model starts from a granted
  shell, a runner or a Fledge run is the model's run, not my own interactive
  one, and its worktree would sit outside the parent's), and its cwd, resolved
  through symlinks, is exactly `talkWorktree` and a linked talk worktree
  whose `worktrees/talk-*` admin dir points back at it
  (`isCliRunWorktree(cwd, worktree)`, exported from
  `src/agent/shell-gate.ts`). The local operator is the owner (no role
  session to resolve); the allowlist (`CORVIDINHO_ALLOWLIST`) and code tier
  still decide.
- `--here` (the checkout), a non-git folder, a start in a repo subdirectory
  (the run's cwd is that subdirectory of its worktree), the main checkout,
  another talk's worktree, a look-alike or missing directory, a worker, WATCH,
  a schedule, a spawn without a role session and a run a tool started SHALL
  stay withheld: the
  tools are left out of the attempt's catalog, a model call is refused as not
  offered, and the run emits one `[operator] SAFE-3.a: <names> allowlisted
  but not offered: <reason>` line per run (stderr in text mode, a `Text`
  event / frame in `--json` / ndjson), never part of the reply. The reasons:
  `a local CLI run gets them only in the new worktree it made for itself, not
  with --here or outside a git repo`; `the run is not at the top of the
  worktree this CLI run made for itself`; `a run with no role session gets
  them only as a local CLI run, and this one carries a Discord session or
  surface stamp`; `a run started from inside a tool (the shell, a runner or a
  Fledge run) never gets them`.
- A role session never uses `talkWorktree` (its own talk worktree rule
  stands, REQ-agent-503).
- A granted call SHALL still go through `runPlugin` (SAFE-1, the must-ask
  gate, SAFE-5 audit) and the tool's own SAFE-3 clamp, SAFE-21 refusals and
  credential-free env. A prod or deploy command raises the must-ask Approve
  card (AUTONOMY-9); with no bridge running nobody answers it, so it lapses
  as a no (SAFE-20), nothing runs, and the run's output carries the wait line
  (`… no answer by <time> means no`) and the refusal (`no answer on the
  owner's Approve card … with no bridge running it lapses`).
- No new env var, flag, config key, table, schema or protocol version.

Acceptance Criteria
- `tests/cli.safe3a-shell.test.ts` gate rows: granted at the top of the run's own worktree (and through a symlink to it); refused in place (no or blank `talkWorktree`), in a subdirectory, the main checkout, another talk's worktree, a non-git folder, a missing dir, a look-alike borrowing the worktree's `.git` file, a main checkout or non-git folder named as the worktree, for depth 1 / 2 / junk, a WATCH marker, a `schedule_` session id, a Discord session id or any stamp without a role session, and a `CORVIDINHO_PROJECT_ROOT` (set or empty); a nested `task run` with the env `runnerChildEnv` or `fledgeCoreChildEnv` gives a tool child, in the worktree it makes from the run's worktree (outside it), is refused as started from inside a tool; the owner's chat (role session) in the CLI worktree is refused whatever `talkWorktree` says.
- Through `createTaskExecute` with `talkWorktree`: `shell-exec` and `fledge-run` are offered at code tier and `shell-exec` runs in the worktree (not the checkout), with no SAFE-3.a line and `unreportedEditTools: ["shell-exec"]`, on attempt 2 too; the checkout, a non-git folder and a subdirectory are not offered either over two attempts, both calls refused as not offered, exactly one SAFE-3.a line, none in the summaries; `kubectl get pods; touch ran.marker` raises one `mustask` destructive card, which nobody answers, so the call fails with the lapse reason, nothing runs and the wait line says no answer means no.
- The real CLI against a localhost fake model: by default `shell-exec` is offered and runs in the kept worktree, not the checkout, exit 0; `--here` (text) prints exactly one SAFE-3.a line on stderr and offers none; a non-git folder (`--json`) has exactly one SAFE-3.a `Text` event and offers none.
- With the base's sources the file cannot load; with `isCliRunWorktree` and `TOOL_CHILD_ENV` stubbed in, 11 of 12 fail (the role-session guard passes there too); with the gate as it was before the tool-child refusal, the two cases holding tool-child rows fail (granted); all pass on the branch.

### REQ-cli-092

Before the PR, a second model reviews the diff in bounded rounds, and the PR
lists what it raised and what changed (GITHUB-9); with no second model
there's no PR and the reply says why (GITHUB-9.a). `task run` SHALL pass
`runTask` the `/work` review hook (`workReviewHook` over
`createTaskExecute`'s `review` and `takeSpendAsk`, REQ-agent-092 /
REQ-plugins-092) exactly when `workReviewApplies(env, allowlist)`: the run's
surface stamp is `work` (`CORVIDINHO_ACTING_SURFACE`), the /work bit is set
(`CORVIDINHO_ACTING_WORK_TASK`), the role cap is owner or team
(`actingRoleCap`, `CORVIDINHO_ACTING_ROLE`), it is no `delegate` or
`council` worker (delegation depth 0), and the plugin allowlist has
`git-push` and `github-pr-create` (GITHUB-5), so no review is spent on a PR
that cannot open. Every other run — chat, `/session`, schedules, WATCH, a
local `task run`, workers — gets no hook. No new flag, env var or config
key.

Acceptance Criteria
- `workReviewApplies` is true for an owner and a team `/work` stamp with both plugins allowlisted, and false for community, another surface, no /work bit, a worker (`CORVIDINHO_DELEGATE_DEPTH=1`), no stamps, or either plugin missing from the allowlist.

