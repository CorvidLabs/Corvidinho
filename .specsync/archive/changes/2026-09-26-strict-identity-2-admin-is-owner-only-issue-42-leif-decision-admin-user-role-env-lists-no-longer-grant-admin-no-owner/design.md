---
change: strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner
artifact: design
---

# Design

- `resolvePermissionLevel` (src/discord/permissions.ts): the only ADMIN path
  is `isOwnerDiscord(opts.owner, opts.userId)`, after the muted / deny-list
  BLOCKED checks. The admin user/role branches are removed. The
  `adminUserIds` / `adminRoleIds` option fields stay (documented as ignored)
  so callers and config parsing keep compiling; this keeps the diff small.
- Memory handler re-check (`actingIsAdmin` in plugins/memory/commands.ts):
  still requires the bridge's per-dispatch `CORVIDINHO_ACTING_IS_ADMIN=1`,
  then requires the acting user to be the owner loaded from the same env /
  allowlist file as the bridge; muted / deny-listed never ADMIN; any load
  error fails closed. Admin lists are no longer read.
- Operator visibility: the bridge logs a start-up warning when the legacy
  lists are set, and another when no owner is configured. `corvidinho doctor`
  adds a `[warn] admin-lists` line when either list is set; it never echoes
  ids and never changes the exit code.
- No schema change, no new slash command, no new env var.
