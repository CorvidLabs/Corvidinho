---
change: memory-plugins-treat-the-configured-owner-as-admin-identity-1-42-companion-the-handler-time-admin-re-check-for-memory
artifact: design
---

# Design

`actingIsAdmin` loads the owner via `loadOwnerConfig({ env })` (env + allowlist `[owner]`), fail closed on errors.
