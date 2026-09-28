---
change: plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json
artifact: context
---

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
