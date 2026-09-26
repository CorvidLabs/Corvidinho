---
id: live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one
state: approved
type: feature
base_commit: ad431a9436108288cbe4c938d3e865da957458be
---

# Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2

## Intent

Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2

## Affected Canonical Specs

- `agent`
- `cli`
- `discord`
- `watch`

## Acceptance Criteria

- task run --output ndjson writes one JSON object per stdout line, each carrying protocol=CORVIDINHO_PROTOCOL_VERSION (2): StateChanged, Text, ToolCall (plugin command name + truncated/secret-scrubbed argument summary, never raw args), ToolResult, VerifyResult, a usage line with running prompt/completion/total token counts when the OpenAI-compatible response carries usage, and a final result line whose result equals the task run --json result object; --json single-result output unchanged; Discord and WATCH spawn clients run --output ndjson, read stdout line by line, forward state / current tool / token counts to onStatus (ThinkingStatus shows real state, AGENT-8/DISCORD-3) and take the summary from the result line, falling back to summarizeTaskRunOutput; CORVIDINHO_PROTOCOL_VERSION bumps 1 to 2 so DISCORD-10 lockstep refuses a stale binary; fixture tests cover serializer shape, redaction/truncation, parser robustness to partial lines and garbage, fake-bin spawn driving onStatus, and unchanged --json; no live tokens or network

## No-spec Rationale

Not applicable
