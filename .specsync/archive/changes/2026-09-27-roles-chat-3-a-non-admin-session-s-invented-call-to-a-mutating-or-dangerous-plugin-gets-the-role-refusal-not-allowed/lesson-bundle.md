# Lesson bundle — roles-chat-3-a-non-admin-session-s-invented-call-to-a-mutating-or-dangerous-plugin-gets-the-role-refusal-not-allowed

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: ROLES-CHAT-3: a non-ADMIN session's invented call to a mutating or dangerous plugin gets the role refusal (not allowed for your role), not the catalog refusal, and the run summary ends with a short (not allowed for your role) note once a call was refused for the caller's role
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: src/agent/execute.ts, tests/roles.chat.gates.test.ts, specs/agent/requirements.md, specs/agent/agent.spec.md, specs/agent/testing.md, docs/DISCORD-GO-LIVE.md, src/agent/events-ndjson.ts, src/agent/task-summary.ts
- **Acceptance**: In a non-ADMIN role session (CORVIDINHO_ACTING_IS_ADMIN=0), a tool call the model makes to any registered mutating or dangerous plugin it was not offered (files-write/edit/delete, shell-exec, github writes, discord-post-message, memory-forget/override and every other mutating plugin) gets exactly the role refusal runPlugin gives that caller (exit 2, 'Denied: plugin "<name>" is not allowed for your role (ROLES-CHAT-3).') instead of the 'not offered in this run's catalog' refusal, and still never runs (no file written). Once any tool call in a task run was refused for the caller's role (an invented call, or an offered call runPlugin refuses because ADMIN was lost mid-run), the run summary ends with the short line '(not allowed for your role)', added once and not when the summary already says 'not allowed for your role'; the live status (ToolCall/ToolResult progress) shows neither the refusal nor the invented name. A name that is not a registered plugin, and ADMIN or local CLI runs, keep the catalog refusal and get no note. tests/roles.chat.gates.test.ts proves it; the two behavior tests fail with main's execute.ts.

## Evidence

- Verification commit: `882b54342ac42ea1d517c505d8c519972ad9beca`
- Base commit: `0940db343de30fdb4d79d83cfa44b95c5a247681`
- Verified by: `specsync check --spec agent --spec plugins`

## From the change's context.md

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

## From the change's design.md

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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-333` | `tests/roles.chat.gates.test.ts` | "a non-ADMIN session's invented call to every mutating plugin gets the role refusal, never runs, and the summary ends with the role note": every registered mutating plugin (files-write/edit/delete, shell-exec, github writes, discord-post-message, memory-forget/override, delegate, council, …) invented in one round at code tier with `CORVIDINHO_ACTING_IS_ADMIN=0`; none offered; each ToolResult is `(unknown tool)` with exactly `runPlugin`'s role refusal for that name; tool messages carry it; nothing written; progress lines carry neither the refusal nor a name; summary = model text + `(not allowed for your role)`, kept on attempt 2. Fails on main's `execute.ts` (detail is the "not offered" refusal). |
| `REQ-agent-333` | `tests/roles.chat.gates.test.ts` | "an offered tool that runPlugin refuses for the role mid-run (owner muted, ROLES-CHAT-6) also ends the summary with the role note": catalog built as ADMIN offers `files-write`; the owner is muted before the call; `runPlugin` refuses it; nothing written; summary ends with the note. Fails on main's `execute.ts` (no note). |
| `REQ-agent-333` | `tests/roles.chat.gates.test.ts` | "a caller who loses ADMIN mid-run gets the role refusal for a mutating tool the model invents (ROLES-CHAT-6)": ADMIN at tool tier (`files-write` not offered), muted before the call; the invented call gets exactly `runPlugin`'s role refusal; nothing written; summary ends with the note. Fails on main and on the first cut (start-of-run ADMIN bit). |
| `REQ-agent-333` | `tests/roles.chat.gates.test.ts` | "a tool's own error that only quotes the role phrase adds no role note": an offered non-mutating tool fails with exit 2 and an error ending in the note; the summary is the model's text. Fails on the first cut (substring match). |
| `REQ-agent-333` | `tests/roles.chat.gates.test.ts` | "a long reply keeps the role note through the result frame cap and the chat body cap": a reply over 6000 chars; `resultFrame` gives 4001 chars ending in `…` + the note; `chatBodyFromTaskResult` of the full and the capped summary is ≤1800 chars ending in the note; a long summary without the note clips as before. Fails on main and on the first cut. |
| `REQ-agent-333` | `tests/roles.chat.gates.test.ts` | Guards that pass on main too: an unregistered name in a non-ADMIN session keeps "not offered" and no note; ADMIN and the local CLI keep "not offered" for `shell-exec` / `files-write` at tool tier and no note; a summary that already says "Not Allowed For Your Role" gets no second note. |
| `REQ-agent-128` | `tests/agent.tool-loop.test.ts`, `tests/agent.events-ndjson.test.ts`, `tests/autonomous.enabled.test.ts` | Not-offered calls outside a non-ADMIN session are still refused as "not offered" and never run; unchanged and passing. |
| `REQ-agent-roles-001` / `REQ-agent-165` | `tests/roles.chat.gates.test.ts` | The existing ROLES-CHAT-7 catalog, (a), (b) and (c) tests still pass (setup moved into shared `setUpRoles` / `tearDownRoles`). |

## Fail-on-main proof

```bash
for f in execute task-summary events-ndjson; do cp src/agent/$f.ts /tmp/$f.branch.ts; git show origin/main:src/agent/$f.ts > src/agent/$f.ts; done
bun test tests/roles.chat.gates.test.ts   # 11 pass, 4 fail (two tool-loop tests, mid-run invented call, long reply)
for f in execute task-summary events-ndjson; do cp /tmp/$f.branch.ts src/agent/$f.ts; done
bun test tests/roles.chat.gates.test.ts   # 15 pass, 0 fail
```

With the first cut's three sources (commit `4ffabfb`) the file gives 12 pass,
3 fail (mid-run invented call, quoted phrase, long reply).

## Gates

```bash
bunx tsc --noEmit
bun test
specsync check --require-coverage 100
specsync change audit
fledge lanes run verify --non-interactive
```

## Where these lessons go

- `specs/agent/context.md`
