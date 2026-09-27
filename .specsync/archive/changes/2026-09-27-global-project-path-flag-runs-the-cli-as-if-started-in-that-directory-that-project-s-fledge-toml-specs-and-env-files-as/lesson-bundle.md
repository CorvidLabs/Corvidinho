# Lesson bundle — global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Global --project <path> flag runs the CLI as if started in that directory: that project's fledge.toml, specs and .env files as Bun loads them there, never the start directory's (CLI-5)
- **Kind**: Feature
- **Specs**: cli
- **Paths**: src/cli.ts, tests/cli.project-path.test.ts, README.md, .env.example, specs/cli/cli.spec.md, specs/cli/requirements.md, specs/cli/testing.md
- **Acceptance**: From another directory, corvidinho --project <path> (before or after the command, before --) makes task run read <path>/fledge.toml and <path>/specs, and loads <path>'s .env files exactly as a process started in <path> gets them (doctor output identical to running there; .env.local and $VAR expansion as Bun; set variables win; the start directory's .env values do not carry over); a missing, non-directory or empty --project prints one corvidinho: line plus hint and exits 1 before any command runs; tests/cli.project-path.test.ts covers these and fails on main

## Evidence

- Verification commit: `7748e834af25269c708eea05377d959511fd5483`
- Base commit: `1c7b6ced470e0ed87e4c854f2663111713af3fa7`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Captured HI **CLI-5** (`hi/cli.md`, not retired with CLI-1/2/6/9): "I can point
it at another project path without `cd`, and it loads that project's env and
`fledge.toml`."

Gap on main (`1c7b6ce`): `parseGlobalFlags` has no project / cwd flag, and
every command reads `process.cwd()`. `corvidinho --project P doctor` exits 1
with `Unknown command: --project`; `corvidinho task run … --project=P` drops
the flag silently (unknown flags after the command fall into `rest` and are
ignored) and runs in the start directory: its `fledge.toml`, its specs, and
the `.env` Bun auto-loaded from there.

Constraints: HI-first (no invented AC; the only captured text is CLI-5); no
slash command, env var or config key; no SQLite schema change; spawned agents
keep `bun --no-env-file --config=/dev/null` (ALLOW-4 / SAFE-1, REQ-cli-085);
secrets never printed (SAFE-6); errors follow REQ-cli-419. Open PRs #232 and
#233 are unrelated and untouched. No open issue tracks CLI-5.

Bun facts checked on 1.4.2 (Linux): Bun auto-loads `.env`,
`.env.<NODE_ENV>` (development when unset) and `.env.local` (not under
`NODE_ENV=test`) from the cwd at start; set variables win; `$VAR`
expansion runs as each file loads. Values Bun adds live only in
`process.env`: `/proc/self/environ` still holds the exec-time env.
`Bun.spawn` without `env` passes the start env, not later `process.env`
edits.

## From the change's design.md

# Design

`src/cli.ts` only:

- `parseGlobalFlags` gains `project`: `--project <path>` or
  `--project=<path>`, read only before a `--` separator (plugin args after
  `--` pass through) and never from `--task` text (`--task` consumes its
  value first); `""` when no path is given (missing, starts with `-`, or
  `--project=`), so it is reported, never ignored; the last one wins.
- `main` calls `enterProject(project)` first, before help / version and
  before `isNonInteractive` reads the env; a failure goes through
  `reportCliError(new ProjectDirError(error, hint), { json: wantsJson(raw) })`
  (REQ-cli-419 shape, exit 1). `cliErrorHint` returns the error's own hint.
- `enterProject(path, { startEnv? })`: resolve against the start cwd; stat
  (missing / not a directory / unreadable → error); base env =
  `readStartEnv()` (`/proc/self/environ`, first entry wins) or the current
  env when unreadable; `Bun.spawnSync([process.execPath,
  "--config=" + SPAWN_BUN_CONFIG, "-e", PROBE], { cwd, env: base, stdin:
  "ignore", timeout: PROJECT_ENV_TIMEOUT_MS })` whose stdout is the JSON of
  its `process.env`; non-zero exit, a throw or bad JSON → error (stdout /
  stderr never printed); then `process.chdir(dir)`; only then replace
  `process.env` (delete keys the probe does not have, assign the rest). Any
  failure returns before `process.env` or the cwd changes.
- The probe argv also carries `envFileFlags(process.execArgv)`: the CLI's
  own Bun `--no-env-file` / `--env-file` flags, so `bun --no-env-file
  src/cli.ts --project P` loads no `.env` from P, exactly as started in P
  with that flag (a `--no-env-file` process never picks up a repo's `.env`).
- After the swap, `spawnsInheritProcessEnv()` wraps `Bun.spawn` /
  `Bun.spawnSync` (once) so a call with no `env` gets `{ ...process.env }`,
  as `node:child_process` does. Bun otherwise hands such children the env it
  started with — the start directory's `.env*` values included, the
  project's missing — so `specsync`, `fledge run spec-check` and git
  children would see A's `.env` (the same wrapper `tests/preload.ts` uses).
  Spawns with an explicit `env` (agents, verify lane, delegate, plugins)
  already build it from `process.env`. Nothing else writes `process.env`,
  so the default is exactly the project's env.

Security: `--project` is operator argv only. The bridges pass untrusted text
only behind `--task`, and spawned agents never get `--project`; they keep
`--no-env-file --config=/dev/null` and their own cwd. The project's
`bunfig.toml` is never read. Env values pass through a pipe from the probe
to this process and are never logged.

Design choice pending Leif: the start directory's `.env*` values are dropped
(fail closed: an unrelated directory's allowlists / keys do not leak into the
project's run), matching `cd <path>`. Variables really set in the
environment (shell, systemd `EnvironmentFile`) still win over the project's
`.env`, as Bun does.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-505` | `tests/cli.project-path.test.ts` "task run reads the project's fledge.toml and specs, not the start dir's" | Started in A (verify on), `--project P` before and `--project=../P` after the command: exit 0, `state` `done`, `verifySkipped` true (P's `fledge.toml`), Planning holds P's `widget` spec. On main: `Unknown command: --project` (exit 1) / flag ignored (`state` `failed`, no specs). |
| `REQ-cli-505` | same file, "loads the project's .env files exactly as starting there would, not the start dir's" | `--project P doctor` from A prints exactly what `doctor` started in P prints: `$8.00` cap (P's `.env.local` over `.env`, `${P_CAP}` expanded), `[warn] llm` (A's `.env` key dropped); A alone shows `$3.00` and `[ok] llm`; the key never appears. Fails on main (empty spend line). |
| `REQ-cli-505` | same file, "children the CLI spawns get the project's env, not the start dir's .env values" | A fake `specsync` first on PATH prints `A_MARK` / `P_MARK`: started in A it sees A's mark, started in P it sees P's, and `--project P specsync check` from A prints exactly the started-in-P output. Without the spawn default it prints A's mark and not P's. |
| `REQ-cli-505` | same file, "a CLI started with --no-env-file loads no .env from the project either" | `bun --no-env-file` CLI `--project P doctor` from A equals the same started in P (`no daily cap set`, `[warn] llm`). Without the forwarded flag it shows P's `$8.00` cap. |
| `REQ-cli-505` | same file, "a variable set in the environment still wins over the project's .env" | Env cap `9.50` beats P's `.env`. Fails on main. |
| `REQ-cli-505` / `REQ-cli-419` | same file, "an unusable --project is one clean error line + hint, exit 1, nothing run" | Missing path, a file, and `doctor --project`: stderr is exactly `corvidinho: --project …` + hint, exit 1, no doctor output; `--json` → `{ok:false,error}`. Fails on main (`Unknown command` / doctor runs). |
| `REQ-cli-505` | same file, `parseGlobalFlags --project` and `readStartEnv / enterProject` blocks | Flag before/after the command, `=` form, empty value, pass-through after `--`, `--task --project` stays task text; environ parsing (first wins, bad entries skipped, missing file null); `envFileFlags` keeps only Bun's `.env` flags; an unusable path leaves the cwd alone. Fail on main (no `project` field / exports). |
| `REQ-cli-419`, `REQ-cli-085`, `REQ-cli-262` | `tests/cli.clean-errors.test.ts`, `tests/spawn.argv.test.ts`, `tests/preload.operator-data-dir.test.ts` | Unchanged and still pass (full suite). |

Fail-on-main proof: with `git show origin/main:src/cli.ts > src/cli.ts` the
file fails to load (`Export named 'enterProject' not found`); a scratch copy
of only the four CLI cases (imports removed) fails 4/4 on main; restored, the
file passes. The two review additions (child env, `--no-env-file`) each fail
with their one fix line removed and pass with it (13/13).

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` green;
`fledge lanes run verify --non-interactive` green.

## Where these lessons go

- `specs/cli/context.md`
