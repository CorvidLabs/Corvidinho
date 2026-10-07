---
module: agent
change: my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the
---

# Delta: agent (the memory tools' argv hint names the card, not a token — SAFE-18.a)

## Added

### REQUIREMENT REQ-agent-183

My own memory forget and override by id ask me on a DM card with Approve and
a one-time code (SAFE-18.a, captured in this change's PR from Leif's
2026-09-28 interview, round 17). What the tool loop tells the model about
them SHALL match: the argv description `toolDefForEntry` gives every
`memory-*` tool (`src/agent/tools.ts`) SHALL say that forget / override
need `--id` (override also the new text), ask the owner on a DM card and
wait, and that there are no confirm tokens; it SHALL NOT mention
`--confirm`. The tool loop runs `memory-forget` / `memory-override`
through `runPlugin` like any tool, so a call waits for the owner's card
(REQ-plugins-183) and its tool result reports the outcome. Nothing else in
the tool definitions changes.

Acceptance Criteria
- `toolDefForEntry` for a `memory-*` tool names the DM card and no `--confirm`.
- A fake model's `memory-forget` call through `createTaskExecute` waits for the owner's card and its `ToolResult` reports the forget once approved with the code.
