---
change: memory-plugins-treat-the-configured-owner-as-admin-identity-1-42-companion-the-handler-time-admin-re-check-for-memory
artifact: requirements
---

# Requirements

1. Memory plugin ADMIN = bridge bit AND (owner snowflake OR admin user id OR admin roles configured).
2. Muted / deny-listed owner is not ADMIN.
3. Empty admin lists AND no owner ⇒ nobody.
