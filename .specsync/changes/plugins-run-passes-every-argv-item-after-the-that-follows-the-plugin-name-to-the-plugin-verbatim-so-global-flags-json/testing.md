---
change: plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json
artifact: testing
---

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
