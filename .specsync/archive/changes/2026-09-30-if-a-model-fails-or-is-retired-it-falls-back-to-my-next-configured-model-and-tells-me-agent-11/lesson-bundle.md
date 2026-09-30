# Lesson bundle — if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: If a model fails or is retired it falls back to my next configured model and tells me (AGENT-11)
- **Kind**: Feature
- **Specs**: agent, cli, discord, watch, plugins
- **Paths**: .env.example, README.md, docs/DAEMON.md, docs/DISCORD-GO-LIVE.md, docs/WATCH.md, docs/discord.md, plugins/autonomous/commands.ts, plugins/autonomous/council.ts, specs/agent/agent.spec.md, specs/agent/testing.md, specs/cli/cli.spec.md, specs/cli/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/plugins/plugins.spec.md, specs/plugins/testing.md, specs/watch/testing.md, specs/watch/watch.spec.md, src/agent/events-ndjson.ts, src/agent/execute.ts, src/agent/providers.ts, src/agent/task-summary.ts, src/agent/types.ts, src/autonomous/council.ts, src/autonomous/delegate.ts, src/cli.ts, src/daemon/daemon.ts, src/discord/agent-client.ts, src/discord/bridge.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/discord/rich-reply.ts, src/discord/types.ts, src/watch/agent-client.ts, tests/agent.fallback.test.ts, tests/agent.providers.test.ts
- **Acceptance**: AGENT-11 (already captured on main in hi/agent.md from Leif's 2026-09-28 interview): 'If a model fails or is retired, it falls back to my next configured model and tells me.' A tier's configured comma list (CORVIDINHO_LLM_MODEL / _READ / _TOOL / _CODE) is a fallback chain: a run calls its first entry; when that model fails (any HTTP error, 404/410 for a retired or missing model included, a network error, a timeout, a malformed reply) the same request goes at once to the next entry with no retry or backoff, and the task-run process keeps that model for every later round and attempt; nothing persists across processes, so each new task run tries the head once; a next entry whose kind's key is unset is skipped uncalled with the key named; a SAFE-8 spend-cap stop (SpendCapRefusal), the run's own abort, and a Deny or lapsed card on a must-ask tool are not model failures and never fail over, so a cap stop asks and never routes around the cap; every failover is an '[operator] <a> failed (<reason>); falling back to <b>' Text event (stderr in text mode, a Text frame in ndjson), a closing '(model fallback: ...)' note on every later summary that the result-frame, chat-body, WATCH, schedule and Discord clips and splits keep whole, and TaskResult.modelFallback; the result names the model that answered (model) and the usage per model (usageByModel), and NDJSON usage frames carry model and byModel (optional fields, protocol 2 unchanged); delegate and council workers' failovers reach the lead's tool data, result and note marked via; the Discord answer footer names the model that answered as 'b (fell back from a)' for everyone and, on the owner's runs only (DISCORD-15.a), prices each model's tokens at its own price with one unpriced model making the cost unknown; a run that failed over logs an llm.fallback warn line in the bridge ([discord]), WATCH ([watch]) and daemon (structured llm.fallback event) logs and sends no owner DM; the 'only the first entry is called' note is gone from docs and specs; tests/agent.fallback.test.ts uses mock providers only, fails on the base sources (26 of 35) and passes on the branch

## Evidence

- Verification commit: `5219269fc6b648b3ec0959ed4452dd12917b7d6e`
- Base commit: `507d97b75b08ebe86c5e0c5ab19322ea82d683cb`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins --spec watch`

## From the change's context.md

# Context

Issue #80 (M3 "Real dev teammate"), slice providers-3 of the M3/M4 plan.
Leif confirmed AGENT-11 in the 2026-09-28 interview (round 2: "#79/#80
providers: capture all four … AGENT-11 fallback chain with notice"); it is
already captured in `hi/agent.md`: "If a model fails or is retired, it falls
back to my next configured model and tells me." Nothing new is captured here.

What was wrong on main (507d97b): #320 (AGENT-13 / AGENT-10) made the model
keys ordered comma lists (`parseModelChain`, `modelChainForTier`) but called
only the head: a retired model (404 / 410), an outage or a malformed reply
failed the run, and docs, `.env.example` and specs said "only the first entry
is called for now".

Constraints: specs only through SpecSync; smallest change on #320's
`src/agent/providers.ts`; no retries or backoff (m34 default); never fail over
on a spend-cap stop, a Deny or a card lapse (round 4: a cap stop is not a model
failure); no persistence across processes; the owner learns of a failover in a
run not theirs from the reply note and an `llm.fallback` warn log line, no DM;
tokens and cost stay owner-only (DISCORD-15.a, SAFE-14.a); v1 off-chain;
`createTaskExecute`'s role / catalog gate code, `src/agent/tools.ts` and the
shell gate are untouched (safe3a-gate builds there in parallel); #232/#233
scope untouched. Out: an owner DM on failover (only if Leif confirms), retries,
cost-based routing, AGENT-12 (idle timeout / turn cap) and AGENT-17 escalation.

## From the change's design.md

# Design

- **Chain in providers.ts.** `modelChain(env, tier)` resolves the tier's
  entries once; `callChain(chain, fn, onFallback)` calls the current entry and,
  on a result with a `ModelFailure`, records a `ModelFallback` hop, calls
  `onFallback` and moves `index` on — at once, no retry. `failure: null` (not a
  model failure) or the last entry returns as is. A next entry with no key is
  a `no-key` failure without a call. Reasons are fixed short strings
  (`modelFailureReason`), never provider output. Pure helpers for the Text
  line, the closing note, the log line, the footer label and child-result
  validation live next to it.
- **Transport.** `chatCompletions` takes a `ResolvedProvider` and returns a
  `Completion` with `failure`: `http` (any status), `network`, `timeout`,
  `malformed` (not JSON / no assistant message); `null` for
  `SpendCapRefusal` or the caller's abort. `callModels` wraps it in
  `callChain` and reports `onModel`. The image-refusal retry sits inside the
  per-model call, so it runs before a failover.
- **Run state.** One chain, the `fallbacks` list and per-model usage live in
  the `createTaskExecute` closure (like `injection` / `roleRefused`), so every
  round and attempt shares them; nothing is written anywhere. The run wrapper
  adds the note after the SAFE-13 note and before the role note (which stays
  last). `closingNotesTail` teaches `clipKeepingRoleNote` and
  `splitDiscordMessage` to keep both notes.
- **Reporting.** `onModelFallback` / `onModel` / `onUsage(…, { model, byModel
  })`; `task run` puts `model`, `usageByModel`, `modelFallback` on the result
  and `usageFrame(u, detail)` adds `model` / `byModel` (optional fields,
  protocol 2 kept: the bridge tolerates their absence).
- **Workers.** `runDelegateChild` validates the worker's `modelFallback`;
  `runCouncil` merges its voices'; the plugins put it in `data`; the lead's
  loop reports it via `onWorkerFallback` with `via`, deduped.
- **Surfaces.** Discord and WATCH spawn clients validate the new result
  fields and call `onModelFallback` (default one `[discord]` / `[watch]`
  `llm.fallback` warn line); the daemon passes its structured logger. The
  footer uses `answerModelFor` (`b (fell back from a)`, own hops only) and
  `answerSpendFor(usage, model, usageByModel)` (each model at its own price,
  one unpriced → unknown). No DM.
- **Alternatives rejected.** Retry with backoff (m34 default: none); a stored
  "dead model" list (no persistence); failing over on a cap stop (round 4);
  bumping the protocol (additive optional fields); an owner DM (not
  confirmed); a head whose key is missing falling over silently (kept as the
  AGENT-10 notice — see design choices).

## From the change's testing.md

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

## Where these lessons go

- `specs/agent/context.md`
- `specs/cli/context.md`
- `specs/discord/context.md`
- `specs/watch/context.md`
- `specs/plugins/context.md`
