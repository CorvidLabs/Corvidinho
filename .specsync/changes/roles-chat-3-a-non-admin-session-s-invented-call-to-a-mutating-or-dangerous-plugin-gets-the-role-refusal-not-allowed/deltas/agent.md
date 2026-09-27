---
module: agent
change: roles-chat-3-a-non-admin-session-s-invented-call-to-a-mutating-or-dangerous-plugin-gets-the-role-refusal-not-allowed
---

# Delta — agent (ROLES-CHAT-3: invented mutating calls get the role refusal; the summary carries the role note)

## Added

### REQUIREMENT REQ-agent-333

ROLES-CHAT-3 in the LLM tool loop. In a non-ADMIN role session
(`CORVIDINHO_ACTING_IS_ADMIN` set and `resolveActingIsAdmin` false, so the
catalog holds no mutating tool, ROLES-CHAT-2), a tool call the model makes to a
registered plugin that is mutating or dangerous (`isMutatingPlugin`,
ROLES-CHAT-5) and was not offered in the run's catalog SHALL be answered with
the role refusal `runPlugin` gives that caller: `ok: false`, exit 2, error
`Denied: plugin "<name>" is not allowed for your role (ROLES-CHAT-3).`, in
place of the "not offered in this run's catalog" refusal. It SHALL still never
run (REQ-agent-128). A not-offered name that is not a registered plugin, and
every not-offered name in an ADMIN session or with no role session (local
CLI), SHALL keep the catalog refusal.

Once any tool call in a task run is refused for the caller's role (such an
invented call, or an offered call `runPlugin` refuses because ADMIN was lost
after the catalog was built, ROLES-CHAT-6), every summary that run's execute
returns SHALL end with the line `(not allowed for your role)`, added once and
not added when the summary already contains "not allowed for your role"
(case-insensitive). The refusal SHALL NOT otherwise reach the channel: the
ToolCall / ToolResult event name for an invented call stays `(unknown tool)`,
and the live progress line carries neither the refusal nor the invented name.
No env var, config key, flag, slash command or schema is added.

Acceptance Criteria
- `tests/roles.chat.gates.test.ts` "a non-ADMIN session's invented call to every mutating plugin gets the role refusal, never runs, and the summary ends with the role note": with `CORVIDINHO_ACTING_IS_ADMIN=0` at code tier, a fake provider asks for every registered mutating plugin at once; none is in the offered catalog; each ToolResult is `(unknown tool)`, success false, with the exact error `runPlugin` gives that caller for the same name; every tool message to the model carries "not allowed for your role"; nothing is written; no progress line carries the refusal or a plugin name; the summary is the model's text plus `\n\n(not allowed for your role)`, and a second attempt of the same run keeps the note.
- "an offered tool that runPlugin refuses for the role mid-run (owner muted, ROLES-CHAT-6) also ends the summary with the role note": the catalog is built as ADMIN and offers `files-write`; the owner is muted before the call; `runPlugin` refuses it with the role refusal, nothing is written, and the summary ends with the note.
- "a non-ADMIN session naming an unregistered tool keeps the catalog refusal and gets no role note".
- "ADMIN and the local CLI keep the catalog refusal for a tool they were not offered, with no role note": `shell-exec` and `files-write` at tool tier are refused as not offered, and the summary is the model's text only.
- "a summary that already says it is not allowed for your role gets no second note".
- The first two tests fail with main's `src/agent/execute.ts` and pass on the branch.
