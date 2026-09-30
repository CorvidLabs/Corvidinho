---
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
artifact: testing
---

# Testing

Mock providers only: an injected `fetchImpl` answering by `body.model`, a
localhost `Bun.serve` for the real CLI, fake `corvidinho` sh bins for the
spawn clients, the delegate core, the council command and the daemon, a
dry-run bridge with a stub agent, and the must-ask fixture deciding cards. No
network, no real key or token.

Fail-on-base proof: with the base's (507d97b) sources swapped in for the 16
modified source files (`src/agent/providers.ts` and `src/agent/types.ts`
kept so the test's imports resolve), `bun test tests/agent.fallback.test.ts`
gave 9 pass, 26 fail; restored, 35 pass, 0 fail. The 9 that pass on the base
are the providers module's 5 pure units (`callChain` ×3, the text helpers, the
validators) and the 4 "never fails over" cases (an unpriced head at the cap,
the run's own abort, a Deny, a lapsed card), which hold on the base because it
never fails over at all.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-080` | `tests/agent.fallback.test.ts` ("callChain: …") | Head 404 → next entry, called once each; second call stays on it; one hop; `failure: null` returns with no hop; the last entry's failure comes back; a keyless `anthropic:` entry skipped uncalled with `ANTHROPIC_API_KEY is not set`; the operator line, note (idempotent), log line and footer label; child failovers / usage validated, scrubbed, bounded (16), deduped. |
| `REQ-agent-080` | `tests/agent.fallback.test.ts` ("a run fails over …") | HTTP 404, 410, 500, network error, timeout, non-JSON and no-message replies each go `model-a` → `model-b` with the note, one Text event, `onModelFallback`, `onModel`; later rounds and attempt 2 stay on `model-b`; a fresh execute tries the head again; the read tier too; all failing ends `failed` with the last error and the note; per-model usage in `onUsage`. Fails on base. |
| `REQ-agent-080` | `tests/agent.fallback.test.ts` ("what is not a model failure …") | Unpriced head under a cap: nothing sent, spend-cap ask, no note; a cap stop on the fallback entry never calls the next; own abort: no hop; a denied or lapsed must-ask card: the same model answers next. The cap-after-failover case fails on base. |
| `REQ-agent-080` | `tests/agent.fallback.test.ts` ("a delegate or council worker's failover …", "the closing note survives every clip", "NDJSON …") | A `delegate` result's `modelFallback` becomes one `via: "delegate"` hop, Text event and note; `runDelegateChild` / `runCouncil` carry worker failovers; `resultFrame`, `chatBodyFromTaskResult` and `splitDiscordMessage` keep the note; `usageFrame` round-trips `model` / `byModel`. Fail on base. |
| `REQ-agent-179` | `tests/agent.providers.test.ts`, `tests/agent.fallback.test.ts` | Unchanged provider cases still pass; a list calls only its head while the head answers, and the next entry after a failure. |
| `REQ-agent-007` | `tests/agent.fallback.test.ts` ("a run fails over …") | After the first entry fails the next request goes to the list's next entry. Fails on base. |
| `REQ-agent-079` | `tests/agent.fallback.test.ts` ("a cap stop on the model it fell back to …") | Requests carry the fallback entry's model, which the SAFE-8 guard prices (an unpriced one stops and asks). Fails on base. |
| `REQ-cli-080` | `tests/agent.fallback.test.ts` ("NDJSON …", "daemon: …") | Real `task run --output ndjson` with a 404 head: Text frame, usage frames with `model` / `byModel`, a `done` result with the note, `model`, `usageByModel`, `modelFallback`; text mode with a 410 head: stderr line and note; a daemon with its own spawn client logs `llm.fallback` (session, hops, message). Fail on base. |
| `REQ-discord-080` | `tests/agent.fallback.test.ts` ("Discord: …") | Spawn client returns `model` / `modelFallback` / `usageByModel`, calls `onModelFallback`, default `[discord] llm.fallback` line; `answerSpendFor` sums each model's own price, one unpriced → unknown, kind prefix stripped; the owner's footer `gpt-4.1 (fell back from gpt-5) | 3k tokens | $<sum> | <time>`, anyone else's without tokens or `$`; the answer keeps the note. Fail on base. |
| `REQ-discord-457` | `tests/agent.fallback.test.ts` ("Discord: …"), `tests/discord.rich-replies.test.ts` | The footer's model is the one that answered with `(fell back from …)`; the existing footer cases still pass unchanged. |
| `REQ-watch-080` | `tests/agent.fallback.test.ts` ("the WATCH spawn client logs …") | A fake bin reporting a failover: the summary keeps the note and `[watch] llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1 (session w1)` is warned. Fails on base. |
| `REQ-plugins-080` | `tests/agent.fallback.test.ts` ("a council carries its voices' failovers …") | `createCouncilCommand` over a fake bin returns `data.modelFallback` once; `runDelegateChild` returns the worker's hops for `delegate` data. Fail on base. |

## Automated coverage

- `tests/agent.fallback.test.ts` (35 tests).
- Unchanged suites over the touched files still pass: `tests/agent.providers.test.ts`
  (one title reworded), `tests/agent.execute.test.ts`, `tests/agent.tool-loop.test.ts`,
  `tests/agent.events-ndjson.test.ts`, `tests/agent.ndjson-spawn.test.ts`,
  `tests/agent.spend*.test.ts`, `tests/autonomous.*.test.ts`,
  `tests/discord.rich-repl*.test.ts`, `tests/discord.spend.test.ts`,
  `tests/daemon*.test.ts`, `tests/watch.*.test.ts`, `tests/docs.operator-facts.test.ts`.
