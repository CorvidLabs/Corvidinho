---
change: live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one
artifact: context
---

# Context

Issue #73 (P1, M2 Talk anywhere, build step 4 of 9 in tracker #122). Leif
wants the Discord status message to show what the agent is doing or thinking
live (DISCORD-3). Bridges spawn `task run --json` and only see the final
result, so the thinking embed shows a static "Spawning agent..." until the run
ends and the token footer is a guess from summary length.

Captured HI this change meets: **AGENT-8** (state visible: planning, calling a
tool, verifying, done), **CLI-7** (human text, single JSON result, or a stream
of events), **DISCORD-3** (live status: time, current tool, rough token use),
**DISCORD-10** (bridge refuses a binary on a different protocol version).

Constraints:

- This is a machine contract for bridges, not a human CLI. No REPL, no mid-run
  steering, no HTTP API (issue non-goals).
- `--json` single-result output keeps its shape (`{ result, events }`).
- Never stream raw tool arguments (SAFE-6: secrets out of chat logs).
- Open PR #128 edits `src/discord/agent-client.ts`, `src/watch/agent-client.ts`
  and `src/agent/execute.ts` (non-interactive env, acting env, humanText,
  offered-tools-only dispatch); keep all of that behavior when merging.
- Not captured in HI (left for capture, not implemented): Merlin exit codes
  0-4, provider-streamed thinking/text deltas (the execute path uses
  non-streaming chat completions today), WATCH surfacing live status anywhere
  visible to a GitHub user.
