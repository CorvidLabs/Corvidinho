---
change: scope-session-list-to-the-acting-member-and-hide-host-paths-from-non-owners
artifact: design
---

# Design

New helper module `src/discord/list-scope.ts`:

- `actorIsAdmin(ctx, interaction)` — the same `resolvePermissionLevel` call
  the dispatcher and handlers already use, `>= PermissionLevel.ADMIN`.
- `projectLabel(project)` — trims and drops trailing slashes; an absolute
  path becomes its last segment, a relative name is kept, empty/`/` is
  `undefined`.

`handleSessionList` resolves ADMIN at handler time. ADMIN keeps the old
output unchanged (every session, full project path). Anyone else gets only
sessions whose `userId` equals the acting user id, with the project shown as
`projectLabel`. A member with no own sessions gets the same
"No active sessions." line as an empty store, so nothing about other users'
activity is revealed. The header and line shape are unchanged.

`/schedule list` passes `fullProjectPath = requireAdmin(...)` to
`formatScheduleLine`; members see `projectLabel(project)`.

No new slash command, option, env var, table or column. The session store
and `list()` are unchanged; `/status` is unchanged.
