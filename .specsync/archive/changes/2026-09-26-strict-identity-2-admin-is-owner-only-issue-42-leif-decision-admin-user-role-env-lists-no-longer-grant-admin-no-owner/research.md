---
change: strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner
artifact: research
---

# Research

- Leif's decision is on issue #42 ("IDENTITY-2 (owner-only admin) stays").
- Call sites of `resolvePermissionLevel`: the Discord slash handler and the
  bridge's message dispatch (which sets `CORVIDINHO_ACTING_IS_ADMIN`). Both
  already pass `owner` from the loaded bridge config (#138).
- The memory handler loads the owner with `loadOwnerConfig({ env })`, which
  requires a numeric snowflake; tests therefore use numeric owner ids.
