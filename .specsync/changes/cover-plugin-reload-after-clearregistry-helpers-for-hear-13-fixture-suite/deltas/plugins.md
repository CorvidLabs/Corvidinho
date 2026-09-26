---
module: plugins
change: cover-plugin-reload-after-clearregistry-helpers-for-hear-13-fixture-suite
---

# Delta — plugins (reload after clearRegistry)

## Modified

### SPEC SECTION Invariants

Builtin plugin loaders MAY re-register after an in-process registry clear
(test seam). Presence of an already-registered command name skips duplicate
register. No new dangerous commands; SAFE-1 non-interactive deny unchanged.

### SPEC SECTION Change Log

Plugin reload-after-clearRegistry for HEAR #13 fixtures (2026-09-26).
