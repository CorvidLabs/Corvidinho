---
change: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
artifact: testing
---

# Testing

Mock LLMs only (a scripted `fetchImpl`, and a localhost `Bun.serve` for the
real CLI in a scratch non-git project), test plugins registered in-process,
in-memory SQLite, the WATCH poller with injected events, a stub agent and the
echo ack client, a fake `corvidinho` sh bin for the spawn client, and a
dry-run bridge whose gateway stub captures `sendDm`. No network, no real key
or token, and no test runs the repo's own verify lane.

Fail-on-base proof: with the base's (5093b81) six modified source files
swapped in (`src/agent/execute.ts`, `src/watch/{poller,agent-client,types}.ts`,
`src/discord/bridge.ts`, `src/store/scrub.ts`; the three new modules kept
so imports resolve), `bun test tests/agent.loop-guards.test.ts
tests/watch.stuck-ask.test.ts` gave 16 pass, 17 fail; restored, 33 pass,
0 fail. The 16 that pass on the base are the pure units of the new modules
(`callSignature`, `changedState` and its classification test, the guard,
the steer / ask text, the no-DB note, the bridge mark, the DM text and three
delivery units) and the "changes approach" guard (a different call after the
steer runs and the reply stands); every tool-loop, runTask, CLI, poller,
spawn-client, scrub-target and bridge-wiring case fails on the base (no
steer, no ask, nothing recorded, no DM).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` ("callSignature", "changedState") | argv spellings of one call match, other args / tools differ; every registered dangerous or mutating builtin is in exactly one set; a successful write / git commit / issue comment is a change, a failed write, reads, `web-fetch`, `council`, `danger-ping`, `fledge-lanes-run` are not; a failed `delegate` reporting `filesChanged` is; a Fledge plugin command's success is. |
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` ("createRepeatFailureGuard") | 2nd identical failure steers; same round runs; next round asks; another call in between changes nothing; a change resets every count; own success resets its own; a new conversation keeps counts but steers once more before asking; the steer quotes a scrubbed, 200-char excerpt; the ask names only the label. |
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` ("tool loop …") | A tool that always fails, called three rounds: runs twice, the 2nd tool message ends with the steer after the whole result (no raw token after the mark), the 3rd never runs; `ask` = `repeatedFailureAsk("flaky-read")`, summary `Needs your input: …` without the error, a `ToolResult` with `REPEAT_FAILURE_BLOCK_DETAIL`, an `[operator] AGENT-16` line with `[redacted:github-token]`. Three in one batch all run (2nd and 3rd steered), the next round asks. A different call after the steer runs and the reply stands. A change in between: four runs, second steer, then the ask; `filesChanged` kept. A non-offered tool: ask with `(unknown tool)`, no tool name or SAFE-1 text in the summary. A verify retry: attempt 2's first identical call runs and steers ("failed 3 times"), the next asks. A `council` stand-in failing twice with an injection hit: the worker's text stays inside the fence and the steer says `STEER_FENCED_ERROR_NOTE`, quoting none of it (SAFE-12). Fail on base (no steer, no ask). |
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` ("runTask", "task run CLI") | runTask ends `blocked` with the stuck ask, verified false, the verify runner never called. The real CLI `task run --output ndjson` against a localhost mock repeating a missing `files-read`: exit 0, `blocked` result frame, `ask` = `repeatedFailureAsk("files-read")`, exactly three LLM requests. Fail on base (the loop runs out its rounds). |
| `REQ-watch-086` | `tests/watch.stuck-ask.test.ts` ("WATCH: …") | An assignment ending stuck: no GitHub post, one `watch_owner_asks` row (thread id, repo, number, event id / type, link, ask), the exact "could not be sent — no Discord bridge is running …" log line. With a live bridge mark, an issue comment's stuck ask is queued (log) and the summary comment carries `Needs your input: …`. A review request's verify-exhausted stuck ask gets the thread URL. A later run with no ask drops it; a clarify ask never queues; a spawn that throws leaves it. No owner Discord id: nothing stored, IDENTITY-3 log line. No DB: one log line, no throw. `bridgeRunning` true only for a live marked process; `clearBridgeRunning` clears only its own mark. The stored question is scrubbed, `watch_owner_asks.question` is in `SCRUB_TARGETS` and re-scrubbed; a clarify ask is never stored. Fail on base (nothing recorded). |
| `REQ-watch-086` | `tests/watch.stuck-ask.test.ts` ("the WATCH spawn client …") | A fake bin printing a `blocked` result frame: `runChat` returns `ask` = the stuck ask. Fail on base (no `ask`). |
| `REQ-discord-086` | `tests/watch.stuck-ask.test.ts` ("Discord bridge: …") | `formatWatchStuckAskDm` is the GitHub line, the stuck headline and the quoted question, no `<@`. Delivery: a failed DM hands the ask back and waits `WATCH_ASK_RETRY_MS`; then the owner's id gets the DM, the ask is taken, `owner DMed` logged, a later pass sends nothing. No owner / no `sendDm`: stays pending; past a day given up (`expired`), never sent. A stop while the DM hangs: `settle` false and the ask is pending again. A dry-run bridge with a `sendDm` stub marks itself, DMs the owner once for an assignment ask within a few ticks, takes it, and clears its mark on stop. Fail on base (no mark, no DM). |

## Automated coverage

- `tests/agent.loop-guards.test.ts` (18 tests) and
  `tests/watch.stuck-ask.test.ts` (15 tests).
- Unchanged suites that cover the touched files still pass:
  `tests/agent.tool-loop.test.ts`, `tests/safe.injection.test.ts`,
  `tests/agent.ask.test.ts`, `tests/agent.ndjson-spawn.test.ts`, every
  `tests/watch.*.test.ts`, `tests/ops.backup-wiring.test.ts`,
  `tests/discord.forget-card.test.ts`, `tests/store.scrub.test.ts`,
  `tests/scheduler.ask-outbox.test.ts`.
