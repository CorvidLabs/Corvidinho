---
change: roles-chat-3-a-non-admin-session-s-invented-call-to-a-mutating-or-dangerous-plugin-gets-the-role-refusal-not-allowed
artifact: tasks
---

# Tasks

- [x] Re-check the gap on current main (`0940db3`): an invented `files-write` in a non-ADMIN session gets the "not offered" refusal and the summary has no role note
- [x] `runToolLoop`: a not-offered registered mutating plugin in a non-ADMIN session gets the `runPlugin` role refusal; nothing runs
- [x] Flag any role refusal (invented or from `runPlugin`) and end every summary of the run with `(not allowed for your role)`, once
- [x] Tests in `tests/roles.chat.gates.test.ts`: every mutating plugin invented, mid-run ADMIN loss, unregistered name, ADMIN and CLI unchanged, no double note
- [x] Prove the two behavior tests fail with main's `execute.ts` and pass on the branch, then restore
- [x] Update `docs/DISCORD-GO-LIVE.md`, the agent spec, requirements and testing
- [x] `specsync check --require-coverage 100`, `specsync change audit`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green
