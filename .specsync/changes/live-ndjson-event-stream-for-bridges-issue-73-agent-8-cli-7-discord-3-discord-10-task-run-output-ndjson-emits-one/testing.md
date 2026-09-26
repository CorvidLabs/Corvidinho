---
change: live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one
artifact: testing
---

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

## Automated coverage

- `bunx tsc --noEmit`
- `bun test`
- `specsync check --require-coverage 100`
- `fledge lanes run verify --non-interactive`
