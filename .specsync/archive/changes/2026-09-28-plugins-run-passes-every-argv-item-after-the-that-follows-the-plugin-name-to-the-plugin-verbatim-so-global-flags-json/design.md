---
change: plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json
artifact: design
---

# Design

- `parseGlobalFlags` returns `pluginArgs`. When `rest` so far is
  `plugins run <name> ...` and the current token is `--` (not a value consumed
  by `--task`), the rest of argv is returned verbatim as `pluginArgs` and
  parsing stops. `--` elsewhere keeps its old meaning (a plain token).
- `main()` runs `plugins run` with `rest[2]` as the name and
  `pluginArgs ?? rest.slice(3)` as its args; `splitRunArgs` is removed.
- Help is read from `rest`, which excludes the `--task` value and plugin args.
- Global flags and `--json` before the `--` are unchanged.
