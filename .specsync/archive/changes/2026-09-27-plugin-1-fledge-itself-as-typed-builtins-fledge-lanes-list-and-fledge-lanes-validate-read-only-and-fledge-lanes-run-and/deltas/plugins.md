---
module: plugins
change: plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and
---

# Delta — plugins (PLUGIN-1 Fledge itself as typed builtins)

## Added

### REQUIREMENT REQ-plugins-461

Fledge itself SHALL be available as typed builtin plugin commands (PLUGIN-1),
registered by `loadBuiltins` whether or not fledge is installed, next to the
Fledge plugin bridge (`fledge-<command>`, REQ-plugins-112..113):
`fledge-lanes-list` and `fledge-lanes-validate` SHALL be `dangerous: false`
with `minTier` 0 (they only read the project's lane sources, `fledge.toml`
and `.fledge/lanes/*.toml`), and
`fledge-lanes-run` and `fledge-run` SHALL be `dangerous: true` with
`minTier` 2 (they run the project's own commands), so a non-interactive run
that has not allowlisted them is denied (SAFE-1), every run is audited
(SAFE-5), non-ADMIN role sessions never see or run them (ROLES-CHAT-2/3), and
the tool catalog offers them only at code tier with dangerous tools included
(PLUGIN-2). Each SHALL run the fledge binary found, when the command runs, on
the absolute PATH entries only, as an argv array (no shell) with cwd pinned to
the plugin cwd (project root / task worktree): `fledge --non-interactive lanes
list --json` (no args accepted); `fledge --non-interactive lanes validate
--json`, plus `--strict` when that is the only arg (no path or other arg
accepted); `fledge --non-interactive lanes run <lane>` (exactly one lane
name); `fledge --non-interactive run <task>`, plus `-- <args…>` verbatim when
args follow the task. A lane or task name SHALL match
`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$` (no leading `-`), so model argv never
becomes a fledge option; a refused name or arg SHALL be a usage error (exit 1)
that spawns nothing. `fledge-lanes-list` SHALL return typed lanes (name,
description, step count, fail-fast, trust tier) and `fledge-lanes-validate`
typed results (valid, strict, lane count, errors, warnings; ok=false when
fledge reports an error, or a warning under `--strict`); fledge's absolute
path is not passed on and parsed text SHALL be cleaned of control characters
and length-capped. A lane or task run SHALL return ok only on exit 0, else
ok=false with fledge's exit code and output. The child SHALL get the verify
lane's scrubbed env (no Discord config, GitHub tokens, audit key, acting
identity or LLM keys) without `CDPATH` / `OLDPWD`, with
`FLEDGE_NON_INTERACTIVE=1` and `CORVIDINHO_PROJECT_ROOT`, stdin closed, a
timeout (30 s for list / validate, 10 minutes for a run; exit 124),
per-stream output caps, and its process group killed on timeout or the
calling run's abort (exit 130); output SHALL be secret-scrubbed (SAFE-6).
Fledge missing from every absolute PATH entry SHALL return ok=false, exit
127, never a throw. Because fledge prints the offending line of a lane source
it cannot parse, before `fledge-lanes-list` or `fledge-lanes-validate` starts
fledge each lane source that exists SHALL resolve (symlinks followed) to a
regular file inside the real project root (`.fledge/lanes` to a directory
there) whose path, as named and as resolved, is not a secret path (`.env*`,
`.ssh`, keys, keystores), else the call SHALL be refused (exit 2, fledge not
started) with the project-relative path and never the link target
(ROLES-CHAT-8, as `files-read`); the lane and task runs are not clamped. A Fledge plugin command named `run`, `lanes-list`,
`lanes-validate` or `lanes-run` SHALL be skipped by the Fledge plugin load
with a reason (REQ-plugins-112) and the builtin SHALL keep the name. No new
slash command, env var or config key.

Acceptance Criteria
- After `loadBuiltins()`, `fledge-lanes-list` and `fledge-lanes-validate` are listed with dangerous=false, mutating=false, minTier=0 and `fledge-lanes-run` and `fledge-run` with dangerous=true, mutating=true, minTier=2, origin builtin.
- `buildOpenAiTools`: tool tier offers the two reads and not the runs; code tier offers the runs only with dangerous tools; a non-ADMIN session gets the reads and never the runs; read tier gets nothing.
- With a fake fledge, `fledge-lanes-list` runs `--non-interactive lanes list --json` in the project root and returns `{count, lanes}` typed, control characters cleaned; any arg is a usage error and nothing is spawned; a fledge error (no fledge.toml) or non-JSON output is ok=false with the reason.
- `fledge-lanes-validate` runs `lanes validate --json` (`--strict` passed through); valid lanes are ok with `{valid:true, laneCount, errors:[], warnings:[]}`; lanes with errors are ok=false, exit 1, with each error and warning and without fledge's path; a path or any other arg is a usage error and nothing is spawned.
- Non-interactive with an empty allowlist `fledge-lanes-run` and `fledge-run` are denied (exit 2, SAFE-1) and fledge never starts; allowlisted, `fledge-lanes-run verify` runs `--non-interactive lanes run verify` in the project root with no GitHub / Discord / LLM / audit / acting keys, no CDPATH / OLDPWD, `FLEDGE_NON_INTERACTIVE=1`, `CORVIDINHO_PROJECT_ROOT` = the root and other keys kept.
- `fledge-run` with `["test","--bail","a b","$(id)","--","; rm -rf /"]` reaches fledge as `run test -- --bail "a b" "$(id)" -- "; rm -rf /"` word for word; with only a task name no `--` is added.
- Lane or task names `--init`, `-l`, `--list`, `--lang`, `--dry-run`, `a b`, `../x`, `x/y` and empty, and extra `fledge-lanes-run` args, are usage errors and fledge never starts.
- A lane or task exiting 3 returns ok=false, exitCode 3 with fledge's output; a `sk-ant-…` key in the output is redacted; a run past a 200 ms timeout returns 124; an aborted calling run returns 130.
- With no fledge on an absolute PATH entry each command returns ok=false, exit 127 `<name>: fledge not on PATH`; a relative PATH entry that leads to a fledge is not used.
- A discovered Fledge plugin with commands `run`, `lanes-list` and `hello` registers only `fledge-hello`; `fledge-run` and `fledge-lanes-list` are skipped with `name already registered by builtin` and `plugins list` prints the skip line.
- `fledge.toml`, a `.fledge/lanes/*.toml` file or the `.fledge/lanes` dir linked outside the project, `fledge.toml` linked to `.env`, a `.fledge/lanes/.env.toml` and a `fledge.toml` directory are each refused by both reads (exit 2, `refused: <name>: <relative path> …`, neither the file's contents nor the link target in the result) and fledge never starts; links that stay inside the project, a non-`.toml` entry linked outside and a missing `fledge.toml` still reach fledge; the lane and task runs are not clamped.
- Where fledge is installed: a real project's lanes are listed, validated (a lane naming an undefined task is reported) and run, `fledge-run pwd` prints the project root, an unknown task is ok=false with fledge's error, a `.fledge/lanes/y.toml` linked to a file outside the project is refused by both reads without its contents in the result, and `corvidinho plugins run fledge-lanes-list --json` in this repo lists the `verify` lane.
