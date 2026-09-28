# Lesson bundle — plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Plugins run passes every argv item after the -- that follows the plugin name to the plugin verbatim, so global flags, --json and -h there are never taken by the Corvidinho CLI
- **Kind**: BugFix
- **Specs**: cli
- **Paths**: src/cli.ts, tests/cli.plugins-run-argv.test.ts, tests/cli.project-path.test.ts
- **Acceptance**: Every argv item after the first -- that follows plugins run <name> reaches the plugin verbatim, including --json, --no-verify, --non-interactive, --task, --tier, --max-retries, --help, -h and a second --; global flags and --json before that -- still apply; --help before it still prints help; task run --task -h runs the task instead of printing help; fixture tests fail before the fix and pass after

## Evidence

- Verification commit: `4b70e072ba89345d1282e1efd751738f00360ee7`
- Base commit: `544fe131ad199fa46e0ff7ea573b83a920db0bbf`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Found after PR #186 (plugins-exec-3) fixed the plugin-level parsers in
`plugins/files`, `plugins/search` and `plugins/shell`: the CLI still dropped
plugin arguments that come after the `--` in
`corvidinho plugins run <name> [--json] [-- ...args]`.

- `parseGlobalFlags` walked all of argv and consumed `--non-interactive`,
  `--json`, `--no-verify`, `--task`, `--tier`, `--max-retries` even after `--`.
- `splitRunArgs` stripped every `--json`, including ones after `--`.
- `main()` printed help when `--help` / `-h` appeared anywhere in raw argv.

Repros: `plugins run search-grep --json -- --no-verify src` searched for `src`;
`plugins run shell-exec -- gh pr list --json number` ran `gh pr list number`;
`plugins run shell-exec -- ls -h` printed Corvidinho help.

Existing callers already put global flags before `--`
(`tests/github.live.optional.test.ts`, `tests/fledge.cli.test.ts`), and
`--task` must keep taking the next token verbatim (REQ-cli-143).

Main later added a global `--project <path>` (CLI-5, #257) that is read only
before any `--`; the passthrough keeps that rule and runs before it.

## From the change's design.md

# Design

- `parseGlobalFlags` returns `pluginArgs`. When `rest` so far is
  `plugins run <name> ...` and the current token is `--` (not a value consumed
  by `--task`), the rest of argv is returned verbatim as `pluginArgs` and
  parsing stops. `--` elsewhere keeps its old meaning (a plain token).
- `main()` runs `plugins run` with `rest[2]` as the name and
  `pluginArgs ?? rest.slice(3)` as its args; `splitRunArgs` is removed.
- Help is read from `rest`, which excludes the `--task` value and plugin args.
- Global flags and `--json` before the `--` are unchanged.

## From the change's testing.md

# Testing

tests/cli.plugins-run-argv.test.ts:
- `parseGlobalFlags`: every global flag, `--json`, `--help`, `-h` and a second
  `--` after `plugins run <name> --` land in `pluginArgs` and set no flag;
  flags before the `--` still apply; a trailing `--` gives `[]`; `--` outside
  `plugins run <name>` is not a passthrough; `--task --` still takes `--`.
- CLI end to end with a fake `fledge` that echoes argv: all those args reach
  the plugin verbatim while a `--json` before `--` still gives JSON output;
  `-- ls -h --json number` runs the plugin in text mode; `--help` before `--`
  still prints help; `task run --task -h` runs the task.

tests/cli.project-path.test.ts: `--project` after `plugins run x --` is still
never taken, and now comes back in `pluginArgs` rather than `rest`.

6 of 9 fail before the fix (help printed, args eaten), all pass after. Plus
`bun test`, `bunx tsc --noEmit`, `specsync check`, fledge verify.

## Where these lessons go

- `specs/cli/context.md`
