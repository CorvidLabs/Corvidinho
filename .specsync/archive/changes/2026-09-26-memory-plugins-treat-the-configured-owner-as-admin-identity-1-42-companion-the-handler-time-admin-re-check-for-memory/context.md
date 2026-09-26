---
change: memory-plugins-treat-the-configured-owner-as-admin-identity-1-42-companion-the-handler-time-admin-re-check-for-memory
artifact: context
---

# Context

#138 makes the configured owner resolve to ADMIN in the bridge (REQ-discord-042), so the bridge sets the per-dispatch admin bit for the owner. The memory plugins' own handler-time re-check (REQ-plugins-011) only consulted the admin user/role lists, so an owner not listed there was still refused forget/override. This aligns the plugin check with the bridge.
