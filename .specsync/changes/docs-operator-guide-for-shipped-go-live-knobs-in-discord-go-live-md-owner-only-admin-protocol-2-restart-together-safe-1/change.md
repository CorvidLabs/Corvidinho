---
id: docs-operator-guide-for-shipped-go-live-knobs-in-discord-go-live-md-owner-only-admin-protocol-2-restart-together-safe-1
state: implementing
type: documentation
base_commit: cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f
---

# Docs: operator guide for shipped go-live knobs in DISCORD-GO-LIVE.md (owner-only ADMIN, protocol 2 restart-together, SAFE-1 CORVIDINHO_ALLOWLIST entries with registry flags, daemon under systemd, AUTONOMOUS-1 gate, ROLES-CHAT for non-owners, audit and spawn log locations) plus stale-fact fixes in BOX-UPDATE.md and .env.example (issue #5)

## Intent

Docs: operator guide for shipped go-live knobs in DISCORD-GO-LIVE.md (owner-only ADMIN, protocol 2 restart-together, SAFE-1 CORVIDINHO_ALLOWLIST entries with registry flags, daemon under systemd, AUTONOMOUS-1 gate, ROLES-CHAT for non-owners, audit and spawn log locations) plus stale-fact fixes in BOX-UPDATE.md and .env.example (issue #5)

## Affected Canonical Specs

- None

## Acceptance Criteria

- docs/DISCORD-GO-LIVE.md has an operator guide section covering owner-only ADMIN, protocol 2 restart-together, the SAFE-1 CORVIDINHO_ALLOWLIST entries with dangerous/minTier/mutating flags printed from the plugin registry, corvidinho daemon under systemd, the AUTONOMOUS-1 fledge.toml gate, ROLES-CHAT behavior for non-owner users, and where the audit log and spawn logs live; every command, env var and config key named exists in code on main; docs/BOX-UPDATE.md and .env.example no longer state stale facts (slash count and names, schema version, admin wording, restart modes); no source file changes

## No-spec Rationale

Operator documentation only: describes behavior already shipped on main and verified against the code; no requirement, public contract, or source file changes.
