---
change: strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner
artifact: requirements
---

# Requirements

- IDENTITY-2 (hi/identity.md): only the configured owner may use admin slash
  commands; non-owners cannot.
- IDENTITY-3: empty owner config means nobody is admin (default-deny).
- ADMIN-4 / DISCORD-7: ADMIN re-checked at handler time.
- MEMORY-ACL-4: memory forget/override stay ADMIN-only, now owner-only.

Modified canonical requirements: REQ-discord-042, REQ-plugins-011,
REQ-plugins-042, REQ-cli-042 (see deltas/).
