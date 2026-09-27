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
