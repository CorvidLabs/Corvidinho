---
change: plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json
artifact: tasks
---

# Tasks

- [x] Regression tests in tests/cli.plugins-run-argv.test.ts.
- [x] `parseGlobalFlags` returns verbatim `pluginArgs` after `plugins run <name> --`.
- [x] `main()` uses `pluginArgs`; `splitRunArgs` removed; help read from `rest`.
- [x] Spec delta REQ-cli-186; cli.spec.md invariant + example.
