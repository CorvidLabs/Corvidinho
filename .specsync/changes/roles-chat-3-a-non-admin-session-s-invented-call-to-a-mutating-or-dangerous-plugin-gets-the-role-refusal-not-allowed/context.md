---
change: roles-chat-3-a-non-admin-session-s-invented-call-to-a-mutating-or-dangerous-plugin-gets-the-role-refusal-not-allowed
artifact: context
---

# Context

ROLES-CHAT-3 (`hi/roles.md`, captured): "At tool-run time, non-ADMIN callers
are refused for every mutating / dangerous plugin (file write/edit/delete,
shell, github writes, discord-post, memory forget/override, allowlist/config
changes) — even if the model invents the call. Refusal is silent to the
channel except a short in-session \"not allowed for your role\" in the agent
summary."

Gap on main (`0940db3`), in `src/agent/execute.ts` `runToolLoop`:

- A non-ADMIN catalog leaves out every mutating tool (ROLES-CHAT-2), so any
  mutating call the model makes is one it invented. The loop answers every
  name that is not offered with `refused: tool "X" is not offered in this
  run's catalog (SAFE-1 / capability tier)`. It never reaches `runPlugin`'s
  role gate, so the role refusal (`ROLE_REFUSED_MESSAGE`,
  `src/plugins/roles.ts`) never appears for an invented call.
- The run summary is the model's own text. Nothing adds "not allowed for your
  role" to it, whatever was refused.

Repro on main: a fake provider asks for `files-write` in a session with
`CORVIDINHO_ACTING_IS_ADMIN=0` at code tier. The ToolResult detail is the
"not offered" refusal, and the summary is the model's text with no role note.
Nothing is written either way; the gap is the refusal and the note, not the
gate.

Scope: `src/agent/execute.ts`, plus the note-keeping caps in
`src/agent/task-summary.ts` and `src/agent/events-ndjson.ts` (plus tests,
spec and one docs bullet).
The role gate in `runPlugin`, the catalog filter and the live status labels
stay as they are. Open PRs #232 (ask-button actor gate, mute/rate for button
presses) and #233 (SAFE-3 clamp, busy-lock test timeouts) are not touched.
