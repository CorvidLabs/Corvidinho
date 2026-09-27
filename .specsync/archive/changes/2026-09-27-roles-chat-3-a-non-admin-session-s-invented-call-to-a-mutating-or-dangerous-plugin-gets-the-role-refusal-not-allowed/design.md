---
change: roles-chat-3-a-non-admin-session-s-invented-call-to-a-mutating-or-dangerous-plugin-gets-the-role-refusal-not-allowed
artifact: design
---

# Design

- `runToolLoop` gets the run's env (`roleEnv`, the one the catalog's ADMIN
  bit came from) and an `onRoleRefusal` callback.
- Dispatch order is unchanged except one branch: when the name is not offered,
  is a registered plugin (`registry.get`) and `isMutatingPlugin` says it is
  mutating, and the caller is not ADMIN at this call (`roleSessionActive` and
  not `resolveActingIsAdmin`, re-checked per call like `runPlugin`,
  ROLES-CHAT-6; review fix: the first cut used the start-of-run bit, so a
  caller muted mid-run got the catalog refusal), the tool result is
  `{ ok: false, exitCode: 2, error: 'Denied: plugin "<name>" is not allowed
  for your role (ROLES-CHAT-3).' }`, the same text `runPlugin` gives that
  caller. Nothing is run. Every other not-offered name keeps the catalog
  refusal.
- A tool result that is exactly the role refusal for the called name (`ok:
  false`, exit 2, error equal to `runPlugin`'s text) calls `onRoleRefusal`.
  That covers invented calls and offered calls that `runPlugin` refuses
  because ADMIN was lost after the catalog was built (ROLES-CHAT-6). Review
  fix: the first cut matched any exit-2 error containing the phrase, so a
  failed delegate worker whose summary carried the note could add it to an
  ADMIN lead's summary.
- `createTaskExecute` keeps one `roleRefused` flag per task run. The execute
  function returns `withRoleRefusalNote(summary)` after `spend.finish`, so
  the note also survives a spend-cap stop and later attempts of the same run.
  `withRoleRefusalNote` appends `\n\n(not allowed for your role)` unless the
  summary already contains the phrase (case-insensitive).
- The caps a long summary meets on its way to the chat keep that closing
  note: `ROLE_REFUSED_SUMMARY_NOTE` and `clipKeepingRoleNote` live in
  `src/agent/task-summary.ts` (re-exported from `execute.ts`), and
  `resultFrame` (4000) and `chatBodyFromTaskResult` (1800) cut the text
  before the note and keep the note after the cut. Review fix: both caps keep
  the head, so any reply over 1800 chars lost the note before it reached
  Discord. Text without the note is capped exactly as before.
- Not covered here (other specs): the WATCH summary comment preview (1200,
  `src/watch/summary.ts`) and the scheduled-run post (1500,
  `src/scheduler/service.ts`) re-clip the chat body, so a body of about
  1170-1800 chars can still lose the note there; a Discord run that ends in a
  clarify or spend-cap ask posts the question card without the summary.
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
