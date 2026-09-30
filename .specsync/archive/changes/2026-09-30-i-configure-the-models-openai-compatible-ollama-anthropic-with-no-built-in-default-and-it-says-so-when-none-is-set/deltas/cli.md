---
module: cli
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
---

# Delta: cli (task run, the daemon and doctor / init say when no provider is set; no demo stub — AGENT-10, AGENT-13)

## Added

### REQUIREMENT REQ-cli-079

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
no model (their channel post and run row keep the usual `failed (exit 1)`
line, and this start-up line says why). `--help` SHALL list `CORVIDINHO_LLM_MODEL` as required with the
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

## Modified

### REQUIREMENT REQ-cli-003

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

### REQUIREMENT REQ-cli-006

The CLI SHALL expose `task run` with optional `--max-retries` and `--json` TaskResult output so operators and bridges can exercise the prove-before-done gate. There is no way to skip the gate (AGENT-14, REQ-cli-085): a run that changed nothing ends `done` with `verifySkipped` and the "no changes, nothing to verify" note (REQ-agent-003).

Acceptance Criteria
- `corvidinho task run --json` against a (fake) provider whose reply changes nothing exits 0 with `state` `done`, `verifySkipped` true, `filesChanged` `[]` and one `Verify gate: no changes, nothing to verify.` event, and never starts `fledge`.
- Help documents `task run` and does not list `--no-verify`.

### REQUIREMENT REQ-cli-007

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

### REQUIREMENT REQ-cli-098

`corvidinho doctor` SHALL always print a `spend` line (AUTONOMOUS-8 /
SAFE-8). Without `CORVIDINHO_DAILY_SPEND_CAP_USD` it SHALL be `info` and say
no daily cap is set, without opening the database. With the variable set it
SHALL show spend in the last 24 hours against the daily cap with the percent,
the number of provider calls counted, and how many are still counted at their
estimate, and SHALL be marked `warn` at or past the 80% warning, at the cap,
when the cap value is not a plain USD amount, when the configured model has
no known price, or when the ledger cannot be read (the last three stop and
ask before every provider call). A tier with no configured model (AGENT-10)
calls nothing, so it SHALL NOT count as an unpriced model: neither this line
nor the `/status` spend lines warn or say paused for it. The line SHALL be informational and SHALL
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
- Under a cap with no model configured, `readSpendSnapshot` is `priced` and the public `/status` spend line is absent (not "paused for budget").

### REQUIREMENT REQ-cli-262

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
the suite), `CORVIDINHO_DAILY_SPEND_CAP_USD`, the LLM API keys
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
- With `CORVIDINHO_NON_INTERACTIVE`, `FLEDGE_NON_INTERACTIVE`, `CORVIDINHO_DAILY_SPEND_CAP_USD`, `CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY` and a `schedule_*` `CORVIDINHO_DISCORD_SESSION_ID` set, a child `bun test` sees none of them: it is not non-interactive and has no LLM API key; full `bun test` with them set passes.
- With `ANTHROPIC_API_KEY`, `OLLAMA_HOST`, `CORVIDINHO_LLM_MODEL`, `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`, `CORVIDINHO_LLM_BASE_URL` and `CORVIDINHO_LLM_TIER` set too, a child `bun test` sees none of them and has no usable model provider.

### REQUIREMENT REQ-cli-430

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

### REQUIREMENT REQ-cli-505

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
