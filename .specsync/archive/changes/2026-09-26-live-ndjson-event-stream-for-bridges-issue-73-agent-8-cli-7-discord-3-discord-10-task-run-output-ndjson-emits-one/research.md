---
change: live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one
artifact: research
---

# Research

- Merlin `BREAKING-CHANGES.md`: `--output ndjson`, frozen event schema. We keep
  the frozen `AgentEvent` names (StateChanged / Text / ToolCall / ToolResult /
  VerifyResult) as frame types so the stream mirrors `src/agent/types.ts`.
- Merlin `crates/merlin-core/src/agent.rs` (`AgentEvent`): the same five
  variants already exist in Corvidinho `AgentEvent`; the producer is `runTask`
  plus `createTaskExecute` via `onEvent`.
- corvid-agent `server/process/event-bus.ts`: a fan-out bus is overkill here; a
  bridge owns one child per run, so a line reader over stdout is enough.
- Corvidinho `src/cli.ts` `taskRun` already buffers every event for `--json`;
  the stream reuses that single `handleEvent` hook.
- OpenAI-compatible chat completions return `usage.prompt_tokens` /
  `completion_tokens` / `total_tokens` on non-streaming responses; some
  providers omit it, so usage frames are emitted only when present.
- Bun: `console.log` to a pipe flushes per call, and a large final write
  before `process.exit` arrives intact (checked with a scratch parent/child).
- `src/store/scrub.ts` `scrubSecrets` (SAFE-6) already redacts vendor-key
  shapes; reuse it for argument summaries, tool detail, text and verify output.
