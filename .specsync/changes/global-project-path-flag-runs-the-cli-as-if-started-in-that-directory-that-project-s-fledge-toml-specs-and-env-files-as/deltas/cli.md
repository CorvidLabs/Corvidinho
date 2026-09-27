---
module: cli
change: global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as
---

# Delta — cli (global --project <path>, CLI-5)

## Added

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
- Started in a directory A whose `fledge.toml` keeps the verify gate on, `--project P task run --task "touch widget" --json` (and `task run … --project=../P`) exits 0 with `state` `done` and `verifySkipped` true from P's `fledge.toml`, and the Planning briefing holds P's `widget` spec.
- Started in A (whose `.env` sets a spend cap and an LLM key), `--project P doctor` prints exactly what `doctor` prints when started in P: P's `.env.local` wins over P's `.env` with `$VAR` expanded, and A's LLM key is gone (`[warn] llm`); the key value is never printed.
- Started in A, `--project P specsync check` gives the `specsync` child P's `.env` values and none of A's, exactly as `specsync check` started in P does.
- `bun --no-env-file` CLI `--project P doctor` from A prints exactly what `bun --no-env-file` CLI `doctor` prints when started in P (no cap from P's `.env`); `envFileFlags` keeps only Bun's `.env` flags, in order.
- A spend cap set in the environment still wins over P's `.env`.
- A missing path, a file and a `--project` with no path each exit 1 with exactly `corvidinho: --project …` and the hint on stderr and run no command; with `--json` stdout is `{ ok: false, error }`; `enterProject` on such a path leaves the cwd unchanged.
