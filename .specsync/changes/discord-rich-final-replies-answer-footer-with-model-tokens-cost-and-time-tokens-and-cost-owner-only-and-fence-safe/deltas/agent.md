---
module: agent
change: discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe
---

# Delta — agent (the stream collector keeps the run's usage and an optional body cap, DISCORD-15/16)

## Modified

### REQUIREMENT REQ-agent-073

The agent SHALL provide a versioned NDJSON event stream contract in
`src/agent/events-ndjson.ts` so bridges can see what state a run is in while it
works (AGENT-8). The module SHALL own `CORVIDINHO_PROTOCOL_VERSION` (now `2`)
and every frame SHALL carry it as `protocol`. Frames SHALL be one per
`AgentEvent` using the AgentEvent type names (`StateChanged`, `Text`,
`ToolCall`, `ToolResult`, `VerifyResult`) plus stream-only `usage` (running
`promptTokens` / `completionTokens` / `totalTokens`) and a final `result`
frame whose `result` is the `TaskResult`. `ToolCall` frames SHALL carry the
plugin command `name` and a truncated, secret-scrubbed `argsSummary` and SHALL
never carry the raw tool arguments (SAFE-6). Text, ToolResult detail and
VerifyResult output SHALL be secret-scrubbed and length-capped. A parser SHALL
turn stdout chunks into frames, tolerating partial lines split across chunks,
blank lines, garbage, JSON without `protocol`, unknown types, wrong field
types, and an unterminated final line. `createTaskExecute` SHALL report
running token totals through `onUsage` when the OpenAI-compatible response
carries `usage`; `AgentEvent` itself stays unchanged.

`collectTaskRunStream` SHALL return the last `usage` frame it read (prompt /
completion / total) as `usage`, so a bridge can price the run (DISCORD-15), and
SHALL cap the chat body it takes from the `result` frame at an optional
`bodyMax` (default `CHAT_BODY_MAX`, 1800 characters, unchanged for WATCH and
delegates); `chatBodyFromTaskResult` SHALL take the same optional cap and keep
a closing role note under any cap (REQ-agent-333). The Discord spawn client
passes a larger cap and splits the answer into messages itself (DISCORD-16,
REQ-discord-075). The wire protocol is unchanged.

Acceptance Criteria
- Each AgentEvent serializes to one line with `protocol` and its AgentEvent `type`.
- ToolCall frame never contains the raw args; sensitive keys print `[redacted]`, vendor-key shapes are scrubbed, values and the summary are truncated.
- Unparseable tool args are summarized by length only.
- Parser returns frames across split chunks and ignores garbage / unversioned / malformed lines.
- `readNdjsonStream` returns the result frame and the non-frame text for fallback.
- `progressFromFrame` maps states to planning / working / verifying / done / failed, ToolCall to the current tool, and usage to token totals.
- Mocked fetch with `usage` over two rounds yields running totals via `onUsage` (no network).
- A stream with a `usage` frame and a result summary over 1800 characters: `collectTaskRunStream` with `bodyMax` 6000 (the Discord spawn client) returns the summary uncut and `usage` equal to the frame; without `bodyMax` (WATCH) the body is cut at 1800 as before.
