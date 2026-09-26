---
change: live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one
artifact: requirements
---

# Requirements

1. `corvidinho task run --output ndjson` writes exactly one JSON object per
   stdout line; every line carries `protocol` = `CORVIDINHO_PROTOCOL_VERSION`.
2. Frame types: `StateChanged`, `Text`, `ToolCall`, `ToolResult`,
   `VerifyResult` (one per AgentEvent), `usage` (running prompt / completion /
   total tokens, only when the provider reports usage), and a final `result`
   line whose `result` equals the `task run --json` `result` object.
3. `ToolCall` frames carry the plugin command `name` and an `argsSummary` that
   is truncated and secret-scrubbed; raw arguments never appear.
4. Long free text (Text, ToolResult detail, VerifyResult output) is capped and
   secret-scrubbed so a line stays bounded.
5. `--output text|json|ndjson`; `--json` stays an alias for `--output json` and
   its single-result payload is unchanged. An invalid `--output` exits 1.
6. A parser turns stdout chunks into frames, tolerating partial lines split
   across chunks, blank lines, non-JSON garbage, JSON without `protocol`, and
   an unterminated final line.
7. Discord and WATCH spawn clients run
   `task run --no-verify --task <prompt> --output ndjson`, read stdout line by
   line, forward state / current tool / token counts to `onStatus`, and take
   the summary from the `result` line; when no result line parses they fall
   back to `summarizeTaskRunOutput`.
8. `CORVIDINHO_PROTOCOL_VERSION` goes 1 -> 2 because the bridge now depends on
   the stream; DISCORD-10 lockstep refuses a protocol-1 binary.
9. Fixture tests only (no live tokens, no network, no real git worktrees).
