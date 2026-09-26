# Lesson bundle — live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2
- **Kind**: Feature
- **Specs**: agent, cli, discord, watch
- **Paths**: src/agent/events-ndjson.ts, src/agent/types.ts, src/agent/execute.ts, src/agent/index.ts, src/agent/task-summary.ts, src/cli.ts, src/discord/agent-client.ts, src/discord/protocol-version.ts, src/watch/agent-client.ts, specs/agent/, specs/cli/, specs/discord/, specs/watch/, tests/agent.events-ndjson.test.ts, tests/agent.ndjson-spawn.test.ts, tests/agent.cli.test.ts, tests/discord.bridge.cli.test.ts, tests/spawn.argv.test.ts, docs/discord.md
- **Acceptance**: task run --output ndjson writes one JSON object per stdout line, each carrying protocol=CORVIDINHO_PROTOCOL_VERSION (2): StateChanged, Text, ToolCall (plugin command name + truncated/secret-scrubbed argument summary, never raw args), ToolResult, VerifyResult, a usage line with running prompt/completion/total token counts when the OpenAI-compatible response carries usage, and a final result line whose result equals the task run --json result object; --json single-result output unchanged; Discord and WATCH spawn clients run --output ndjson, read stdout line by line, forward state / current tool / token counts to onStatus (ThinkingStatus shows real state, AGENT-8/DISCORD-3) and take the summary from the result line, falling back to summarizeTaskRunOutput; CORVIDINHO_PROTOCOL_VERSION bumps 1 to 2 so DISCORD-10 lockstep refuses a stale binary; fixture tests cover serializer shape, redaction/truncation, parser robustness to partial lines and garbage, fake-bin spawn driving onStatus, and unchanged --json; no live tokens or network

## Evidence

- Verification commit: `5c347e0ec048ca02ec7a38764c17c87b1ef408f8`
- Base commit: `ad431a9436108288cbe4c938d3e865da957458be`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec watch`

## From the change's context.md

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

## From the change's design.md

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

## From the change's testing.md

# Testing

- `tests/agent.events-ndjson.test.ts`: frame shape per AgentEvent with
  `protocol`; single-line serialization of multi-line text; ToolCall never
  contains raw args, sensitive keys are redacted, vendor-key shapes are
  scrubbed, values and the summary are truncated, unparseable args are
  summarized by length; Text / detail / verify caps; the parser handles chunks
  split mid-line, CRLF, blank lines, garbage, JSON without protocol, unknown
  type, wrong field types, and an unterminated last line; `readNdjsonStream`
  returns result + otherText; `progressFromFrame` labels; usage running totals
  from a mocked fetch that returns `usage` across two rounds (no network).
- `tests/agent.ndjson-spawn.test.ts`: a fake bin (sh script in mkdtemp)
  printing ndjson (with garbage and a stderr line) drives the Discord
  `onStatus` with state, tool and token counts and returns the summary from
  the result line; the WATCH client forwards the same; a missing result line
  falls back to `summarizeTaskRunOutput`; argv uses `--output ndjson`; the real
  `bun src/cli.ts task run --no-verify --output ndjson` (LLM env cleared)
  prints only protocol-2 frames ending in a result equal to `--json`'s result;
  an invalid `--output` exits 1.
- `tests/agent.cli.test.ts`: `--json` is still one pretty JSON document with
  `result` + `events`.
- `tests/discord.bridge.cli.test.ts` / `tests/discord.protocol-version.test.ts`:
  `--protocol-version` prints 2; a protocol-1 binary is a mismatch.
- No live tokens, no network, no real git worktrees.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-073` | `tests/agent.events-ndjson.test.ts` | Frame shapes, redaction/scrub, caps, parser edge cases, result summary cap, protocol-mismatch withholding. |
| `REQ-cli-073` | `tests/agent.ndjson-spawn.test.ts`, `tests/agent.cli.test.ts` | Real `task run --output ndjson` prints protocol-2 frames ending in the result; `--json` unchanged; bad `--output` exits 1. |
| `REQ-discord-073` | `tests/agent.ndjson-spawn.test.ts`, `tests/agent.events-ndjson.test.ts` | Fake bin drives `onStatus`; result-frame summary; fallback; a protocol-3 ToolResult never reaches the summary. |
| `REQ-watch-073` | `tests/agent.ndjson-spawn.test.ts` | WATCH client forwards the same progress from a fake bin. |
| `REQ-cli-008` | `tests/discord.bridge.cli.test.ts` | `--protocol-version` prints `CORVIDINHO_PROTOCOL_VERSION` (2) and exits 0. |
| `REQ-discord-006` | `tests/discord.protocol-version.test.ts` | Match / mismatch (protocol-1 binary) / unverifiable / timeout fixtures. |

## Automated coverage

- `bunx tsc --noEmit`
- `bun test`
- `specsync check --require-coverage 100`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/agent/context.md`
- `specs/cli/context.md`
- `specs/discord/context.md`
- `specs/watch/context.md`
