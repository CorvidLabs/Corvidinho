---
module: cli
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
---

# Delta — cli (task run carries private replies)

## Added

### REQUIREMENT REQ-cli-710

`task run` carries text shown only privately (MEMORY-7.a, #101). It SHALL
pass `onPrivateReply` to `createTaskExecute` and put each text it gets on
`TaskResult.privateReplies` in order, a text already there (a retried
attempt's repeat read) kept once, absent when none — in `--json` and the
NDJSON `result` frame (protocol unchanged), for the Discord bridge to send
by direct message (REQ-discord-710). Text output SHALL NOT print them. No flag
or env var.

Acceptance Criteria
- Spawned through the Discord agent client against a fake LLM that calls `memory-profile` and `memory-recall --category private`, `task run --output ndjson` puts both texts on the result frame's `privateReplies`; the summary and every model request lack them.
- `tests/memory.private-view.test.ts` covers it and fails on main.
