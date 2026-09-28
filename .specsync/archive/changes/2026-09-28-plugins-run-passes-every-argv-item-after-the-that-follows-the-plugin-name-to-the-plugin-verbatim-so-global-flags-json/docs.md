---
change: plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json
artifact: docs
---

# Docs

`--help` notes that args after `--` reach the plugin verbatim. The usage line
`plugins run <name> [--json] [-- ...args]` is unchanged; the fix makes it hold
for any args. CHANGELOG entry lands with the next 0.0.x release cut.
