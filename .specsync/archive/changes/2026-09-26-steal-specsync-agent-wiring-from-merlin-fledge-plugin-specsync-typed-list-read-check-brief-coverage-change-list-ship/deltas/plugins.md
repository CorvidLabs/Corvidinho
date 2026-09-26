---
module: plugins
change: steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship
---

# Delta — plugins (SpecSync tools)

## Added

### REQUIREMENT REQ-plugins-008

Built-ins SHALL register SpecSync agent tools `specsync-list`, `specsync-read`, `specsync-check`, `specsync-brief`, plus cheap `specsync-coverage`, `specsync-change-list`, `specsync-ship-status` that use the local SpecSync binary / project files only (SPECSYNC-1/2/3/6; Merlin fledge-plugin-specsync steal). No SpecSync API key.

Acceptance Criteria
- `plugins list` includes the SpecSync command names.
- `specsync-list` returns registered module names from `.specsync/registry.toml`.
- `specsync-read <module>` returns `specs/<module>/<module>.spec.md` contents.
- `specsync-check` runs project `spec-check` (fledge task or `specsync check` fallback) and fails non-zero on drift.
- `specsync-brief <module>` returns companion files when present.

## Modified

### SPEC SECTION Purpose

Typed plugin host including GitHub reads and SpecSync list/read/check/brief tools for the agent loop.


### SPEC SECTION Change Log

STEAL SpecSync plugins list/read/check/brief (+ coverage/change-list/ship-status) (2026-09-26, corvid-agent).
