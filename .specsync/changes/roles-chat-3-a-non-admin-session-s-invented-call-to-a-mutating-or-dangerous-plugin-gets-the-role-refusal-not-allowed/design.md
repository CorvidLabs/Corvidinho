---
change: roles-chat-3-a-non-admin-session-s-invented-call-to-a-mutating-or-dangerous-plugin-gets-the-role-refusal-not-allowed
artifact: design
---

# Design

- `runToolLoop` gets the run's `actingIsAdmin` bit (already computed by
  `createTaskExecute` for the catalog; false only in a non-ADMIN role session)
  and an `onRoleRefusal` callback.
- Dispatch order is unchanged except one branch: when the name is not offered,
  is a registered plugin (`registry.get`) and `isMutatingPlugin` says it is
  mutating, and the session is non-ADMIN, the tool result is
  `{ ok: false, exitCode: 2, error: 'Denied: plugin "<name>" is not allowed
  for your role (ROLES-CHAT-3).' }`, the same text `runPlugin` gives that
  caller. Nothing is run. Every other not-offered name keeps the catalog
  refusal.
- A tool result that is the role refusal (`ok: false`, exit 2, error contains
  `ROLE_REFUSED_MESSAGE`) calls `onRoleRefusal`. That covers invented calls
  and offered calls that `runPlugin` refuses because ADMIN was lost after the
  catalog was built (ROLES-CHAT-6).
- `createTaskExecute` keeps one `roleRefused` flag per task run. The execute
  function returns `withRoleRefusalNote(summary)` after `spend.finish`, so
  the note also survives a spend-cap stop and later attempts of the same run.
  `withRoleRefusalNote` appends `\n\n(not allowed for your role)` unless the
  summary already contains the phrase (case-insensitive).
- ToolCall / ToolResult event names are unchanged: an invented name still
  shows as `(unknown tool)`, and the progress line never carries the
  refusal text.
- Design choice pending Leif: the note is exactly `(not allowed for your
  role)` on its own line and names no tool, the most literal reading of the
  captured "short ... 'not allowed for your role'".
- Design choice pending Leif: an unregistered name is not a plugin, so it keeps
  the catalog refusal and gets no note.
- Design choice pending Leif: once set, the note stays on every summary of the
  same task run (later verify attempts, spend-cap stop, ask), not only the
  attempt that saw the refusal.
