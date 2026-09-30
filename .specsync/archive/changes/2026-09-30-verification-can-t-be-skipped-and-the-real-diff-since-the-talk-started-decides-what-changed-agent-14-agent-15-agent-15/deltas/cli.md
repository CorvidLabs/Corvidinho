---
module: cli
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
---

# Delta: cli (task run has no verify skip; `--no-verify` is refused; a removed config key gets a doctor warning — AGENT-14)

## Modified

### REQUIREMENT REQ-cli-006

The CLI SHALL expose `task run` with optional `--max-retries` and `--json` TaskResult output so operators and bridges can exercise the prove-before-done gate. There is no way to skip the gate (AGENT-14, REQ-cli-085): a run that changed nothing ends `done` with `verifySkipped` and the "no changes, nothing to verify" note (REQ-agent-003).

Acceptance Criteria
- `corvidinho task run --json` in a project where the demo run changes nothing exits 0 with `state` `done`, `verifySkipped` true, `filesChanged` `[]` and one `Verify gate: no changes, nothing to verify.` event, and never starts `fledge`.
- Help documents `task run` and does not list `--no-verify`.

### REQUIREMENT REQ-cli-007

`corvidinho task run` SHALL drive the prove-before-done loop with an injectable
execute path: demo stub when no LLM key is configured (it changes nothing and
reports no files, REQ-agent-085); thin env-gated OpenAI-compatible chat when
`CORVIDINHO_LLM_API_KEY` (or documented fallback) is set. The verify gate is
always on for every caller: Discord, WATCH, schedules, `/work`, delegate
workers and a local operator (AGENT-14, REQ-cli-085). `--json` / `--output
ndjson` emit structured result+events for callers to parse. Package version
after this change is **0.0.13**.

Acceptance Criteria
- Help documents `task run` / `--json` / `--output` and not `--no-verify`.
- Without an LLM key the demo execute reports no files; in a talk worktree whose last run left an unverified edit, the demo run still runs the verify lane (REQ-agent-015).
- Help / fledge.toml do not mention a way to skip verification.
- Package `0.0.13`.

### REQUIREMENT REQ-cli-009

The CLI SHALL accept `--tier read|tool|code` for `task run` (and SHALL honor `CORVIDINHO_LLM_TIER`) and SHALL wire `createTaskExecute` with cwd, non-interactive mode, allowlist, and event forwarding so Discord/WATCH/`task run` callers share the same LLM plugin tool loop and the same verify gate, which no caller can skip (AGENT-14). The tier SHALL also select the model the run calls (REQ-agent-079). Help SHALL document the optional per-tier model keys `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`, and when any of them is set the doctor `[ok] llm` line SHALL name the model each tier calls (model names only, never the API key); with none set the line SHALL read as before.

Acceptance Criteria
- Help documents `--tier` and LLM env vars (no secrets).
- task run forwards ToolCall/ToolResult when not `--json`.
- Help lists `CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE`.
- With `CORVIDINHO_LLM_MODEL=big`, `_READ=cheap` and `_CODE=big2`, doctor prints `[ok] llm: … model big; per tier: read cheap, tool big, code big2` and exits 0 without the key value; with no per-tier key the line ends `model big`.

### REQUIREMENT REQ-cli-085

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

### REQUIREMENT REQ-cli-073

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

### REQUIREMENT REQ-cli-143

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
- Started in a directory A, `--project P task run --task "touch widget" --json` (and `task run … --project=../P`) exits 0 with `state` `done` (the demo run changes nothing in P), and the Planning briefing holds P's `widget` spec.
- Started in A (whose `.env` sets a spend cap and an LLM key), `--project P doctor` prints exactly what `doctor` prints when started in P: P's `.env.local` wins over P's `.env` with `$VAR` expanded, and A's LLM key is gone (`[warn] llm`); the key value is never printed.
- Started in A, `--project P specsync check` gives the `specsync` child P's `.env` values and none of A's, exactly as `specsync check` started in P does.
- `bun --no-env-file` CLI `--project P doctor` from A prints exactly what `bun --no-env-file` CLI `doctor` prints when started in P (no cap from P's `.env`); `envFileFlags` keeps only Bun's `.env` flags, in order.
- A spend cap set in the environment still wins over P's `.env`.
- A missing path, a file and a `--project` with no path each exit 1 with exactly `corvidinho: --project …` and the hint on stderr and run no command; with `--json` stdout is `{ ok: false, error }`; `enterProject` on such a path leaves the cwd unchanged.
