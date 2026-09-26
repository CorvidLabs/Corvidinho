---
id: spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run
state: implementing
type: bug_fix
base_commit: cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f
---

# Spawned agents pin Bun config to a known-empty file and SAFE-2 protects bunfig.toml so a planted preload cannot run code in the agent (#133 isolation / SAFE-1)

## Intent

Spawned agents pin Bun config to a known-empty file and SAFE-2 protects bunfig.toml so a planted preload cannot run code in the agent (#133 isolation / SAFE-1)

## Affected Canonical Specs

- `agent`
- `plugins`

## Acceptance Criteria

- A bunfig.toml preload in the spawn cwd never runs in a spawned .ts agent (argv is bun --no-env-file --config=/dev/null <bin>); files-write/edit/delete refuse bunfig.toml and .bunfig.toml (SAFE-2)

## No-spec Rationale

Not applicable
