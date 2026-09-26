# Lesson bundle — memory-plugins-treat-the-configured-owner-as-admin-identity-1-42-companion-the-handler-time-admin-re-check-for-memory

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Memory plugins treat the configured owner as ADMIN (IDENTITY-1, #42 companion): the handler-time ADMIN re-check for memory forget/override/include-deleted also accepts the owner's Discord snowflake from the owner config, still requiring the bridge's per-dispatch admin bit and never for muted or deny-listed owners
- **Kind**: Feature
- **Specs**: plugins
- **Paths**: plugins/memory/commands.ts, tests/memory.plugins.test.ts, specs/plugins/
- **Acceptance**: The memory plugins' handler-time ADMIN check returns true for the configured owner's Discord snowflake (owner env or allowlist [owner]) when the bridge admin bit is set, even with empty admin user/role lists; false without the bit, for other ids, and for a muted or deny-listed owner; fixture tests + SpecSync + fledge verify green

## Evidence

- Verification commit: `337de2d6597ca3ee75c41e7cd59af4cf66c23b93`
- Base commit: `5f1db8a2a44464694bdde6d4695f6c186d29cfc0`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

#138 makes the configured owner resolve to ADMIN in the bridge (REQ-discord-042), so the bridge sets the per-dispatch admin bit for the owner. The memory plugins' own handler-time re-check (REQ-plugins-011) only consulted the admin user/role lists, so an owner not listed there was still refused forget/override. This aligns the plugin check with the bridge.

## From the change's design.md

# Design

`actingIsAdmin` loads the owner via `loadOwnerConfig({ env })` (env + allowlist `[owner]`), fail closed on errors.

## From the change's testing.md

# Testing

- `tests/memory.plugins.test.ts`: owner + bit ⇒ forget phase 1 ok; owner without bit, other id, muted owner ⇒ not authorized.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-042 | `tests/memory.plugins.test.ts` |

## Where these lessons go

- `specs/plugins/context.md`
