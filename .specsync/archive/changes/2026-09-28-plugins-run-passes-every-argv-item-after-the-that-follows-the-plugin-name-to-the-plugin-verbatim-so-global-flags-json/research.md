---
change: plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json
artifact: research
---

# Research

- `src/cli.ts` `parseGlobalFlags` (exported, tested in
  `tests/cli.task-argv.test.ts`) had no notion of a passthrough separator.
- `splitRunArgs` was only reached with `rest`, which `parseGlobalFlags` had
  already stripped of `--json`, so its own `--json` filter only ever removed
  plugin args after `--`.
- The help check read raw argv, so `task run --task -h` also printed help even
  though REQ-cli-143 keeps `-h` as task text.
- The fake `fledge` in the CLI tests echoes every argv item, so it shows end to
  end exactly what a plugin receives.
