---
change: plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and
artifact: design
---

# Design

- **Where:** `plugins/fledge/core.ts`, next to the Fledge plugin bridge it
  shares `spawnCapped` and `cleanText` with; re-exported from
  `plugins/fledge/index.ts`; `loadBuiltins` calls
  `loadFledgeCorePlugins()` (after git, before the autonomous extras).
- **Names** mirror fledge's command line: `fledge lanes list` →
  `fledge-lanes-list`, `lanes validate` → `fledge-lanes-validate`, `lanes
  run` → `fledge-lanes-run`, `run` → `fledge-run`. They share the
  `fledge-` prefix with the plugin bridge; builtins load first, so a Fledge
  plugin command named `run` / `lanes-list` / `lanes-validate` /
  `lanes-run` is skipped by the existing collision rule (REQ-plugins-112) and
  `plugins list` prints the skip line. fledge itself already shadows a plugin
  command `run` with its own `run`.
- **Danger / tier:** list and validate only parse `fledge.toml` →
  `dangerous: false`, minTier 0 (like `specsync-list`, `git-status`).
  A lane or task runs the project's own commands with the operator's
  privileges → `dangerous: true`, minTier 2 (like `shell-exec` and the
  runners). `--dry-run` is not exposed, so there is no "safe" run variant to
  reason about.
- **argv:** fixed fledge argv built in code; the model supplies only a lane
  or task name (checked against `FLEDGE_NAME_RE`, no leading `-`) and, for
  `fledge-run`, task args placed after fledge's `--` verbatim (the fledge
  plugin bridge's pattern). Validate takes only `--strict`: a PATH positional
  would validate another directory, and `run --init` would write
  `fledge.toml` (SAFE-2). Refusals are usage errors (exit 1) that spawn
  nothing, like the runners' empty-argv error.
- **Typed results:** list and validate use fledge's `--json` and return
  parsed, cleaned, capped fields; fledge's absolute `path` is dropped (the
  command is pinned to the plugin cwd). Runs return the scrubbed output and
  exit code like `runFledgeCommand` / `runRunner` (`data` with lane / task,
  args, cwd, exitCode, timedOut, aborted, truncated, output).
- **Binary:** resolved when the command runs (not at load) on absolute PATH
  entries only, so the commands are always listed (like `specsync-*`, which
  also need a local binary) and a missing fledge is exit 127; a relative
  entry such as `.` cannot let the project choose the binary a read-only
  command starts.
- **Env / limits:** the verify lane's scrub (`buildVerifyEnv`, the env
  `fledge lanes run verify` already gets) minus `CDPATH` / `OLDPWD`, plus
  `FLEDGE_NON_INTERACTIVE=1` and `CORVIDINHO_PROJECT_ROOT`; GitHub tokens
  are dropped as for the verify lane (unlike the plugin bridge, which keeps
  them for GitHub-backed plugins). 30 s for list / validate, 10 minutes for a
  run (the runners' limit), 64 KiB per stream, process group killed on
  timeout or abort.
- **Chosen conservatively (pending Leif):** the `fledge-` names and builtin
  precedence over same-named Fledge plugin commands; the two runs are
  dangerous at code tier (not offered to the model by `task run` until
  dangerous tools are); no `--dry-run` / `--from` / `--json` passthrough;
  no new env var or config key.
