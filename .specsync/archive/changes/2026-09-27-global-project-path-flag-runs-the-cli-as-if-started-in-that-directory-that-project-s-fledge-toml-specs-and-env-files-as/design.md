---
change: global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as
artifact: design
---

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
