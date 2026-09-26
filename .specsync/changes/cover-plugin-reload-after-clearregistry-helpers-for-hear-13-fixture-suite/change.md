---
id: cover-plugin-reload-after-clearregistry-helpers-for-hear-13-fixture-suite
state: approved
type: bug_fix
base_commit: 23cecb17c46912e839b640d7783bdaef1ebb6042
---

# Cover plugin reload-after-clearRegistry helpers for HEAR #13 fixture suite

## Intent

Cover plugin reload-after-clearRegistry helpers for HEAR #13 fixture suite

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- Plugin loaders (builtins + github/meta/specsync/discord) re-register after clearRegistry so HEAR #13 fixture tests find discord-post-message; registry get()-guard replaces sticky module loaded flags.

## No-spec Rationale

Not applicable
