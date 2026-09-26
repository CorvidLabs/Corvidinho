---
module: plugins
change: memory-plugins-treat-the-configured-owner-as-admin-identity-1-42-companion-the-handler-time-admin-re-check-for-memory
---

# Delta — plugins (owner is ADMIN for memory)

## Added

### REQUIREMENT REQ-plugins-042

The memory plugins' handler-time ADMIN re-check (REQ-plugins-011) SHALL treat
the configured owner (IDENTITY-1; matched by Discord snowflake from the owner
env or the allowlist `[owner]` section) as ADMIN, under the same conditions as
the bridge: the per-dispatch `CORVIDINHO_ACTING_IS_ADMIN=1` bit is still
required, and a muted or deny-listed owner is not ADMIN. With no owner and
empty admin lists nobody is ADMIN.

Acceptance Criteria
- Owner + bridge bit may run memory forget phase 1 with empty admin lists.
- Owner without the bit, a non-owner id, and a muted owner are refused.
