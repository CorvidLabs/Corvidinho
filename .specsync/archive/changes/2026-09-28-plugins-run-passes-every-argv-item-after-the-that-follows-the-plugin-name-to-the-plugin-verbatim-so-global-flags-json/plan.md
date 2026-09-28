---
change: plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json
artifact: plan
---

# Plan

1. Regression tests `tests/cli.plugins-run-argv.test.ts` (fail before the fix).
2. `parseGlobalFlags` returns `pluginArgs` after `plugins run <name> --`.
3. `main()` uses `pluginArgs`, drops `splitRunArgs`, checks help on `rest`.
4. Spec delta REQ-cli-186; invariant + example in `cli.spec.md`.
