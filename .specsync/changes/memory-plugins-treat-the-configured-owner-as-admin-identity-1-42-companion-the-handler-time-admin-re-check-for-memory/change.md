---
id: memory-plugins-treat-the-configured-owner-as-admin-identity-1-42-companion-the-handler-time-admin-re-check-for-memory
state: approved
type: feature
base_commit: 5f1db8a2a44464694bdde6d4695f6c186d29cfc0
---

# Memory plugins treat the configured owner as ADMIN (IDENTITY-1, #42 companion): the handler-time ADMIN re-check for memory forget/override/include-deleted also accepts the owner's Discord snowflake from the owner config, still requiring the bridge's per-dispatch admin bit and never for muted or deny-listed owners

## Intent

Memory plugins treat the configured owner as ADMIN (IDENTITY-1, #42 companion): the handler-time ADMIN re-check for memory forget/override/include-deleted also accepts the owner's Discord snowflake from the owner config, still requiring the bridge's per-dispatch admin bit and never for muted or deny-listed owners

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- The memory plugins' handler-time ADMIN check returns true for the configured owner's Discord snowflake (owner env or allowlist [owner]) when the bridge admin bit is set, even with empty admin user/role lists; false without the bit, for other ids, and for a muted or deny-listed owner; fixture tests + SpecSync + fledge verify green

## No-spec Rationale

Not applicable
