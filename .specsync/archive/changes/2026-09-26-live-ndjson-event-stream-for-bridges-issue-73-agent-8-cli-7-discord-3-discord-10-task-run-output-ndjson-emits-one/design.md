---
change: live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one
artifact: design
---

# Design

## New module `src/agent/events-ndjson.ts` (agent spec)

- Owns `CORVIDINHO_PROTOCOL_VERSION = 2` (wire protocol of the agent binary);
  `src/discord/protocol-version.ts` re-exports it so DISCORD-10 callers and
  `--protocol-version` keep one source of truth.
- `NdjsonFrame` union: AgentEvent frames keep their AgentEvent `type` names;
  stream-only frames are `usage` and `result`. Every frame has `protocol`.
  - `{protocol, type:"StateChanged", state}`
  - `{protocol, type:"Text", text, truncated?}`
  - `{protocol, type:"ToolCall", name, argsSummary}`
  - `{protocol, type:"ToolResult", name, success, detail?}`
  - `{protocol, type:"VerifyResult", success, output}`
  - `{protocol, type:"usage", promptTokens, completionTokens, totalTokens}`
  - `{protocol, type:"result", result: TaskResult}`
- `summarizeToolArgs(raw)`: parse JSON; objects become `key=value` pairs,
  arrays / argv become space-joined items; sensitive keys (token, secret,
  password, key, auth, cookie, credential) print `[redacted]`; every value is
  `scrubSecrets`-ed and cut to 48 chars; the whole summary is cut to 160
  chars. Unparseable input becomes `(N chars, unparsed)`; raw text never
  passes through.
- `frameFromEvent`, `usageFrame`, `resultFrame`, `serializeFrame` (single line;
  JSON escapes newlines), `createNdjsonWriter(writeLine)`.
- `parseNdjsonLine` (null for garbage / missing protocol / unknown type / wrong
  field types), `createNdjsonParser()` with `push(chunk)` / `end()` and a
  1 MiB unterminated-line cap, `readNdjsonStream(stream, onFrame)` returning
  `{ result?, otherText, frames }` where `otherText` holds non-frame lines for
  the fallback summary.
- `progressFromFrame(frame)`: StateChanged -> message (planning / working /
  verifying / done / failed); ToolCall -> tool + "calling tool X"; ToolResult
  -> tool + "tool X ok|failed"; VerifyResult -> "verify passed|failed"; usage
  -> totalTokens. Text and result produce no status.

## Producer

- `AgentTokenUsage` type in `src/agent/types.ts`.
- `createTaskExecute({ onUsage })`: `chatCompletions` reads `usage` from each
  OpenAI-compatible response; the execute closure keeps running totals across
  rounds and attempts and calls `onUsage(totals)`. AgentEvent stays frozen, so
  `--json` `events` is unchanged.
- `src/cli.ts`: global `--output text|json|ndjson`; `task run` in ndjson mode
  writes a frame per event, a usage frame per `onUsage`, then the result frame;
  stderr stays quiet like `--json`. Exit codes unchanged.

## Consumers

- `src/discord/agent-client.ts` and `src/watch/agent-client.ts` spawn with
  `--output ndjson`, read stdout via `readNdjsonStream` (stderr read in
  parallel), map `progressFromFrame` to `onStatus` (Discord:
  `{ tool, tokens: { estimated: total }, message }`; WATCH gains an optional
  `onStatus` receiving the plain progress object), and summarize with
  `summarizeTaskResult(result)` or fall back to
  `summarizeTaskRunOutput(otherText, stderr, exitCode)`.
- `summarizeTaskResult` is split out of `summarizeTaskRunOutput` in
  `src/agent/task-summary.ts` (same text).

## Protocol

- `CORVIDINHO_PROTOCOL_VERSION` 1 -> 2. A stale binary would print human text
  for an unknown `--output`, and the bridge would quietly misparse; DISCORD-10
  refuses the mismatch at bridge start instead. Bridge and binary restart
  together.
