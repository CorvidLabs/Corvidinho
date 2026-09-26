---
id: cover-specsync-config-toml-agent-registry-entry-added-during-specsync-agent-wiring-8-pr-22
state: archived
type: bug_fix
base_commit: 8fea09f0ebc9e37aa8619e93493d0177ebfaa9af
---

# Cover .specsync/config.toml agent registry entry added during SpecSync agent wiring #8 / PR #22

## Intent

Cover .specsync/config.toml agent registry entry added during SpecSync agent wiring #8 / PR #22

## Affected Canonical Specs

- None

## Acceptance Criteria

- PR #22 diff vs main includes .specsync/config.toml agent registry entry; covered by this change; bun test + Spec Sync Action green; change archived on same PR

## No-spec Rationale

Canonical specs unchanged; config.toml [specs] agent= entry mirrors existing .specsync/registry.toml agent mapping already introduced with specs/agent/ on main via #17 — this change only covers the config.toml path left uncovered after #8 archive
