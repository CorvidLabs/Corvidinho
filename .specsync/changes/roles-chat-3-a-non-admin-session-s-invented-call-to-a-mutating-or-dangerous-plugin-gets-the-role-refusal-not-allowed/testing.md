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
| `REQ-agent-333` | `tests/roles.chat.gates.test.ts` | Guards that pass on main too: an unregistered name in a non-ADMIN session keeps "not offered" and no note; ADMIN and the local CLI keep "not offered" for `shell-exec` / `files-write` at tool tier and no note; a summary that already says "Not Allowed For Your Role" gets no second note. |
| `REQ-agent-128` | `tests/agent.tool-loop.test.ts`, `tests/agent.events-ndjson.test.ts`, `tests/autonomous.enabled.test.ts` | Not-offered calls outside a non-ADMIN session are still refused as "not offered" and never run; unchanged and passing. |
| `REQ-agent-roles-001` / `REQ-agent-165` | `tests/roles.chat.gates.test.ts` | The existing ROLES-CHAT-7 catalog, (a), (b) and (c) tests still pass (setup moved into shared `setUpRoles` / `tearDownRoles`). |

## Fail-on-main proof

```bash
cp src/agent/execute.ts /tmp/execute.branch.ts
git show origin/main:src/agent/execute.ts > src/agent/execute.ts
bun test tests/roles.chat.gates.test.ts   # 10 pass, 2 fail (the two behavior tests)
cp /tmp/execute.branch.ts src/agent/execute.ts
bun test tests/roles.chat.gates.test.ts   # 12 pass, 0 fail
```

## Gates

```bash
bunx tsc --noEmit
bun test
specsync check --require-coverage 100
specsync change audit
fledge lanes run verify --non-interactive
```
