---
change: cover-plugin-reload-after-clearregistry-helpers-for-hear-13-fixture-suite
artifact: context
---

# Context

Support path for HEAR #13 fixture suite: `clearRegistry()` in
`tests/plugins.deny.test.ts` left builtins unloadable because sticky
`loaded` flags skipped re-register. Switch loaders to `get()`-guard so
`loadBuiltins()` restores commands after clear. Primary product AC remains
on the discord change (REQ-011/012).
