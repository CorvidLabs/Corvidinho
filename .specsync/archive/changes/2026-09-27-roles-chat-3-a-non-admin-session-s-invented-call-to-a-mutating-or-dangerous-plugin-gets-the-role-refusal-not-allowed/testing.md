---
change: roles-chat-3-a-non-admin-session-s-invented-call-to-a-mutating-or-dangerous-plugin-gets-the-role-refusal-not-allowed
artifact: testing
---

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
