# Lesson bundle — plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: PLUGIN-1 Fledge itself as typed builtins: fledge-lanes-list and fledge-lanes-validate (read-only) and fledge-lanes-run and fledge-run (dangerous, code tier) wrap the local fledge CLI in the project root
- **Kind**: Feature
- **Specs**: plugins, agent
- **Paths**: plugins/fledge/core.ts, plugins/fledge/index.ts, src/plugins/builtins.ts, tests/fledge.core.test.ts, tests/fledge.plugins.test.ts, docs/DISCORD-GO-LIVE.md
- **Acceptance**: PLUGIN-1 (Fledge itself as plugins with typed commands): after builtin load, plugins list and the tool catalog carry fledge-lanes-list and fledge-lanes-validate (dangerous=false, minTier 0: offered at tool and code tier, also to non-ADMIN role sessions) and fledge-lanes-run and fledge-run (dangerous=true, minTier 2: SAFE-1 non-interactive deny unless allowlisted, audited, offered only at code tier with dangerous tools to ADMIN); each runs the local fledge CLI with an argv array (no shell) in the plugin cwd: fledge --non-interactive lanes list --json / lanes validate --json [--strict] / lanes run <lane> / run <task> [-- args verbatim]; lists and validation come back typed (lanes with name, steps, description; lane count, errors, warnings), an invalid fledge.toml is ok=false with fledge's errors, a failing lane or task is ok=false with fledge's exit code and output; a lane or task name must be a plain name (no leading dash) and validate takes no path, so model argv never becomes a fledge option, else a usage error that spawns nothing; fledge is resolved on absolute PATH entries only and missing is exit 127; the child gets the verify lane's scrubbed env without CDPATH/OLDPWD, stdin closed, a timeout (124), output caps, process-tree kill on the calling run's abort (130), and secret-scrubbed output; a Fledge plugin command named run, lanes-list, lanes-validate or lanes-run is skipped (plugins list says why) and the builtin keeps the name; no new slash command, env var, config key, schema or package version; regression tests fail on main and pass on the branch

## Evidence

- Verification commit: `343a08b7e0a72e2e67cc6b1e401e174cda5d6b92`
- Base commit: `0940db343de30fdb4d79d83cfa44b95c5a247681`
- Verified by: `specsync check --spec agent --spec plugins`

## From the change's context.md

# Context

HI: PLUGIN-1 (hi/plugin.md) — "Files, search, shell, git, github, web,
memory, SpecSync, and Fledge itself are available as plugins with typed
commands." Open issue that tracks PLUGIN-1: #83 (its shell part shipped in
#140); this change is the "Fledge itself" part.

Gap on main (0940db3): `loadBuiltins()` registers 47 commands and none is
Fledge's own. `plugins/fledge/{commands,discover,index,spawn}.ts` only bridge
the project's Fledge *plugins* (`fledge plugins list` → `fledge-<command>`,
PLUGIN-3 / REQ-plugins-112..113). Fledge's own commands (`lanes list`,
`lanes validate`, `lanes run`, `run <task>`) are reachable only through
`shell-exec` (dangerous, untyped) or inside the verify gate
(src/agent/verify.ts runs `fledge lanes run verify --non-interactive`).
Repro: `bun -e 'import {loadBuiltins} from "./src/plugins/builtins.ts"; import
{list} from "./src/plugins/registry.ts"; loadBuiltins(); console.log(list().length,
list().filter(e=>/lanes|^fledge-run$/.test(e.name)))'` → `47 []`.

Constraints: no new slash command, env var or config key; no SQLite schema or
package version change; no ACCESS / bounty / MainNet surface. Open PRs #232
and #233 (ask-button gate, SAFE-3 clamp) are another worker's and are not
touched. `task run` still offers no dangerous tool to the model (that is a
separate slice), so the two run commands are reachable through
`corvidinho plugins run` (and any catalog built with dangerous tools) until
then; the two read commands are offered at tool and code tier today.

## From the change's design.md

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
- **Danger / tier:** list and validate only parse the lane sources
  (`fledge.toml`, `.fledge/lanes/*.toml`) → `dangerous: false`, minTier 0
  (like `specsync-list`, `git-status`).
- **Lane-source clamp:** fledge prints the offending line of a lane source
  it cannot parse, so a read that followed a link out of the project (or
  onto `.env`) would print that file to any session, non-ADMIN included.
  Before the reads start fledge, each lane source that exists must resolve
  inside the real project root, to a regular file (the dir to a directory),
  and not to a secret path (`isSecretPath`, as named and as resolved);
  otherwise exit 2 naming the project-relative path, like `files-read`'s
  symlink-escape and ROLES-CHAT-8 refusals and the SpecSync reads' clamp.
  A start-time check (only ADMIN code-tier tools can write the tree). The
  runs are not clamped: they are ADMIN-only code-tier tools like
  `shell-exec`.
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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | "loadBuiltins registers the four Fledge core commands with honest danger and tier": reads dangerous=false / mutating=false / minTier 0, runs dangerous / mutating / minTier 2, origin builtin. On main: not registered. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | "tool catalog: reads at tool tier; runs only at code tier with dangerous tools, ADMIN only": `buildOpenAiTools` at tool / code / dangerous / non-ADMIN / read tier. On main: the reads are missing. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | "a Fledge plugin command named run or lanes-list is skipped; the builtin keeps the name": `loadFledgePlugins` with a fake plugin offering `run`, `lanes-list`, `hello` registers only `fledge-hello`, reports both skips, `fledge-run` is still the builtin, `fledgeStatusLines` prints the skip. On main: `fledge-run` and `fledge-lanes-list` register as plugin commands. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | Read commands: `lanes list --json` argv / cwd / typed lanes with control chars cleaned; args refused before spawning; no fledge.toml and non-JSON are ok=false; `lanes validate --json` and `--strict` argv, valid ok, invalid ok=false exit 1 with errors and warnings and no fledge path; a path / other arg refused before spawning; both run non-interactively without an allowlist entry. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | Run commands: SAFE-1 deny (exit 2) with no fledge start; allowlisted `lanes run verify` argv, project cwd and scrubbed env (`gh= dc= ai= llm= audit= acting= cdpath= oldpwd= fni=1 root=<project> keep=kept`); `run test -- …` argv verbatim incl. `$(id)` and a literal `--`, no `--` without args; option-like / non-plain names and extra lanes-run args refused before spawning; exit 3 → ok=false exit 3 with output; `sk-ant-…` redacted; 200 ms timeout → 124; abort → 130. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | "lane sources stay inside the project (ROLES-CHAT-8)": `fledge.toml`, a `.fledge/lanes/*.toml` file and the `.fledge/lanes` dir linked outside the project, `fledge.toml` linked to `.env`, a `.fledge/lanes/.env.toml` and a `fledge.toml` directory are refused by both reads (exit 2, exact message, no secret or link target in the result) with no fledge call; in-project links, a non-`.toml` entry linked outside and a missing `fledge.toml` reach fledge; the runs are not clamped. Real fledge: an outside-linked `.fledge/lanes/y.toml` is refused and its contents never come back. On the branch before the clamp (real fledge prints the file's line in its TOML parse error): 4 fail. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | "fledge missing from PATH is exit 127, not a throw; a relative PATH entry is never used": all four commands exit 127 `<name>: fledge not on PATH`; `resolveFledgeBin` ignores a relative entry that does lead to a fledge. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | Real fledge (skipped where fledge is not installed, e.g. CI): a temp `fledge.toml` project's lanes are listed, validated and run, `fledge-run pwd` prints the project root, an unknown task is ok=false with fledge's error, an undefined-task lane fails validation; `bun src/cli.ts plugins run fledge-lanes-list --json` in this repo lists `verify` with 4+ steps. On main the CLI test fails (unknown plugin command). |
| `REQ-agent-112` | `tests/fledge.core.test.ts` | "a default-catalog run offers the two reads and starts no fledge process": real `createTaskExecute` (code tier, mock provider, fake fledge first on PATH); the request's `fledge-` tools are exactly `fledge-lanes-list` / `fledge-lanes-validate` and the fake records no call. On main: no `fledge-` tool offered. |
| `REQ-agent-112` | `tests/fledge.plugins.test.ts` | "default catalog (no includeDangerous) never discovers or offers Fledge commands": now expects the two core reads as the only `fledge-` tools and `fledge-hello` unregistered. The includeDangerous test ("first request offers fledge-hello") is unchanged and passes. |
| `REQ-plugins-112`, `REQ-plugins-113`, `REQ-plugins-114`, `REQ-plugins-313`, `REQ-plugins-314` | `tests/fledge.plugins.test.ts`, `tests/fledge.hardening.test.ts`, `tests/fledge.cli.test.ts`, `tests/runners.plugins.test.ts`, `tests/plugins.list.smoke.test.ts`, `tests/docs.operator-facts.test.ts` | Existing bridge, hardening, schema-cost, runner, plugins-list and operator-doc tests still pass. |

Fail-on-main proof: with origin/main's `src/plugins/builtins.ts` and
`plugins/fledge/index.ts` swapped in (the branch's `core.ts` kept so the file
loads), `tests/fledge.core.test.ts` runs 15 pass / 5 fail (registration,
catalog, collision, default-catalog run and the real CLI test); with
`core.ts` removed as well (all of main) the file cannot load (`Cannot find
module '../plugins/fledge/core.ts'`). Restored: 20 pass / 0 fail.

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check
--require-coverage 100` and `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/plugins/context.md`
- `specs/agent/context.md`
