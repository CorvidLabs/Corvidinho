---
change: strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner
artifact: context
---

# Context

PR #138 shipped the durable owner record (IDENTITY-1) and made the owner
ADMIN, but deliberately kept `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES`
working so it would not break existing deployments. On issue #42 Leif then
confirmed "IDENTITY-2 (owner-only admin) stays": hi/identity.md IDENTITY-2
says only the configured owner may use admin slash commands, and IDENTITY-3
says an empty owner config means nobody is admin.

This change makes that strict. It is a breaking ops change: a deployment that
relied on the admin env lists and has no owner configured goes to
nobody-is-ADMIN (default-deny) until `CORVIDINHO_OWNER_DISCORD_ID` (or
allowlist `[owner].discord_id`) is set.
