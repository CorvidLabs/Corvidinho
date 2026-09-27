---
change: task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-244` | `tests/agent.cli.test.ts` | "SIGINT during verify: cancelled result frame, exit 130, verify lane stopped" and the SIGTERM twin. These run `task run --task demo --output ndjson` with a fake `fledge` on PATH that starts a lane task (`sleep 30 &`) and waits, then signal the pid once both pids are written. The run exits 130 with `signalCode` null, the last stdout line is a `result` frame with `cancelled: true`, `verified: false`, `state: "failed"`, and both the fake fledge and its lane task are gone. On the base commit SIGINT died by the signal (`signalCode "SIGINT"`) and SIGTERM exited 143, with no result frame. With the signal wired but no tree kill, fledge died and its lane task survived. |
| `REQ-agent-244` | `tests/agent.cli.test.ts` | Same tests: the verify lane's own task is killed with fledge (process group plus `/proc` descendants), not left in the background. |
| `REQ-agent-244` | `tests/agent.loop.test.ts` | "abort while verify runs → cancelled, not a failed verify or stuck ask (AGENT-3)". A verify runner aborts the signal and returns a failed lane with `maxRetries: 0`. The result is `cancelled=true`, `state: "failed"`, no `ask`, one execute call and no `VerifyResult` event. On the base commit it returned `cancelled=false` (failed with a stuck ask). |
| `REQ-agent-244` | `tests/agent.execute.test.ts` | "headers then a trickle: the request times out instead of hanging". A local `Bun.serve` sends headers and then one byte every 50ms. A read-tier execute with `llmTimeoutMs: 300` returns `LLM request timed out after 300ms` within 3s. On the base commit it hung until bun's 5s test timeout. |
| `REQ-agent-244` | `tests/agent.execute.test.ts` | "no response at all: the tool loop's request times out too". A fetch that never answers makes a tool-tier execute with `llmTimeoutMs: 200` return `LLM request timed out after 200ms` after one request. On the base commit it hung until bun's 5s test timeout. |
| `REQ-agent-244` | `tests/agent.execute.test.ts` | "a caller abort still stops the request and is not reported as a timeout". A caller abort after 50ms (timeout 60s) returns within 3s with an `LLM request failed:` summary that does not contain "timed out". |
| `REQ-agent-003` | `tests/agent.loop.test.ts` | Existing "AbortSignal cancels promptly (AGENT-3)" and the verify pass / fail / retry tests still pass. |
| `REQ-agent-008` | `tests/agent.tool-loop.test.ts` | Existing tool-loop tests still pass, including "AbortSignal stops between tool rounds (AGENT-3)". |
| `REQ-cli-073` | `tests/agent.ndjson-spawn.test.ts`, `tests/agent.cli.test.ts` | Existing ndjson / `--json` task run tests still pass; the protocol is unchanged. |

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`
and `fledge lanes run verify --non-interactive` pass.
