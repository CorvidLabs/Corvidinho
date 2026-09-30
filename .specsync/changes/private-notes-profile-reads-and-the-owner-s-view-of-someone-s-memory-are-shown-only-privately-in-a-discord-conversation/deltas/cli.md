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
attempt's repeat read) kept once, the list bounded with `boundPrivateReplies`
(REQ-agent-710: at most 5, each scrubbed then cut to 6000 characters with a
visible marker, the last saying how many more were not sent) so a run of large
private reads cannot push the result frame past the parser's line cap and lose
the whole answer, absent when none — in `--json` and the
NDJSON `result` frame (protocol unchanged), for the Discord bridge to send
by direct message (REQ-discord-710). Text output SHALL NOT print them. No flag
or env var.

Acceptance Criteria
- Spawned through the Discord agent client against a fake LLM that calls `memory-profile` and `memory-recall --category private`, `task run --output ndjson` puts both texts on the result frame's `privateReplies`; the summary and every model request lack them.
- A `task run --output ndjson` whose model makes seven private reads of different notes puts the first five on its own result frame (read straight off stdout), the last saying 2 more were not sent; no model request holds the notes.
- `tests/memory.private-view.test.ts` covers it and fails on main.
