---
module: agent
version: 51
status: draft
files:
  - src/agent/types.ts
  - src/agent/config.ts
  - src/agent/verify.ts
  - src/agent/loop.ts
  - src/agent/workspace-diff.ts
  - src/agent/test-evidence.ts
  - src/agent/specLoader.ts
  - src/agent/index.ts
  - src/agent/task-summary.ts
  - src/agent/execute.ts
  - src/agent/missing-capability.ts
  - src/agent/spawn-argv.ts
  - src/agent/tier.ts
  - src/agent/tools.ts
  - src/agent/project-instructions.ts
  - src/agent/persona.ts
  - persona.md
  - src/agent/events-ndjson.ts
  - src/agent/spend.ts
  - src/agent/spend-notice.ts
  - src/agent/spend-alerts.ts
  - src/agent/spend-outbox.ts
  - src/agent/ask.ts
  - src/agent/untrusted.ts
  - src/agent/recall-guard.ts
  - src/agent/loop-guards.ts
  - src/agent/shell-gate.ts
  - src/agent/repo-ways.ts
  - tests/agent.execute.test.ts
  - tests/agent.tool-loop.test.ts
  - tests/agent.allowlisted-dangerous.test.ts
  - tests/agent.soft-land.test.ts
  - tests/agent.missing-capability.test.ts
  - tests/spawn.argv.test.ts
  - tests/agent.project-instructions.test.ts
  - tests/agent.persona.test.ts
  - tests/agent.events-ndjson.test.ts
  - tests/agent.ndjson-spawn.test.ts
  - tests/agent.spend.test.ts
  - tests/agent.spend-ask.test.ts
  - tests/agent.spend-caps.test.ts
  - tests/agent.spend-approve.test.ts
  - tests/agent.spend-unknown.test.ts
  - tests/agent.spend-reserve.test.ts
  - tests/spend.surfaces.test.ts
  - tests/agent.ask.test.ts
  - tests/agent.verify-env.test.ts
  - tests/agent.verify-feedback.test.ts
  - tests/safe.injection.test.ts
  - tests/fixtures/verify-lane-log.ts
  - agent.3md
  - tests/agent3md.smoke.test.ts
  - src/autonomous/enabled.ts
  - src/autonomous/delegate.ts
  - src/autonomous/council.ts
  - tests/autonomous.enabled.test.ts
  - tests/autonomous.worker-failure.test.ts
  - tests/agent.verify-gate.test.ts
  - tests/fixtures/talk-worktree.ts
  - tests/agent.loop-guards.test.ts
  - tests/agent.stall-nudge.test.ts
  - tests/agent.test-evidence.test.ts
  - tests/fixtures/lane-output.ts
  - src/agent/providers.ts
  - tests/agent.providers.test.ts
  - tests/agent.fallback.test.ts
  - tests/fixtures/fake-llm.ts
  - tests/agent.safe3a-gate.test.ts
  - tests/agent.safe3a-owner-shell.test.ts
  - tests/agent.repo-ways.test.ts
  - tests/agent.hi-guard.test.ts
  - src/agent/limits.ts
  - tests/agent.limits.test.ts

db_tables: []
depends_on:
  - plugins
---

# Agent

## Purpose

Root guidance-only `agent.3md` + `@corvidlabs/agent3md` packaging (REQ-agent-260): validate/route/get smoke only; agent loop does not load planes for progressive disclosure until that is HI'd separately (the captured AGENT-13 is model providers, not this).

Missing-capability soft-land (REQ-agent-742; `src/agent/missing-capability.ts`): when the task names a plugin or asks for a GIF and that capability is not offered, the run replies with the concrete gap (not installed, not allowlisted, not configured, role, or tier) and cites an HI id or open PR only when a lookup returned it. It does not invent a provider and does not ask what to install. An offered tool is left for the model. Community sessions are not given mutating tools.

Model providers (AGENT-13 / AGENT-10, REQ-agent-179; `src/agent/providers.ts`):
the operator configures every model, and none is built in as a default.
`CORVIDINHO_LLM_MODEL` and the per-tier keys hold `kind:model` entries
(`openai`, `ollama`, `anthropic`; a bare or unknown prefix is
OpenAI-compatible), each with its vendor endpoint and key, all over the one
OpenAI-compatible chat transport and the SAFE-8 guard (no headless-CLI kind
yet). With no usable provider for the run's tier the attempt calls nothing and
fails with the no-provider notice; there is no demo stub.

Model fallback (AGENT-11, REQ-agent-080; `callChain` in
`src/agent/providers.ts`): a tier's list is a chain. A run calls its first
entry; when that model fails (an HTTP error, 404 / 410 for a retired model
included, a network error, a timeout or a malformed reply) the run goes on at
once with the next entry — no retry, no backoff — and keeps it for the rest of
the process; a new `task run` process tries the head again (nothing stored). A
SAFE-8 spend-cap stop, the run's own stop, and a Deny or lapsed card on a
must-ask tool are not model failures and never fail over. Each failover is an
`[operator] <a> failed (<reason>); falling back to <b>` Text event, a closing
`(model fallback: …)` note on every later summary (clips keep it, like the
role note), and `TaskResult.modelFallback`; the result names the model that
answered (`model`) and the usage per model (`usageByModel`), and each NDJSON
`usage` frame names its `model` and the running `byModel`. A delegate or
council worker's failovers reach its lead's result the same way, marked
`via`.

Agent execute tool-loop also carries MEMORY instructions (AGENT-7 / MEMORY-2/4)
so Discord/CLI chats trust injected facts and call memory-store/recall
appropriately (REQ-agent-010), keep profiles and project memory, never tell
one person what is stored about another or repeat private notes, and route a
"forget me" to `memory-forget-me` (MEMORY-5..7 / MEMORY-ACL-6, REQ-agent-101).
They also say to search memory before saying "I don't know" (MEMORY-9) and how
memory works in a GitHub WATCH run (MEMORY-8, REQ-agent-067); the tool loop
backs the rule with a guard (`src/agent/recall-guard.ts`): a final reply that
says it doesn't know, in an attempt where the person's own memory or the
project's was not searched yet (no injected block of that kind at the head of
the task, no `memory-recall` call for it), makes the loop run the missing
`memory-recall --query` / `--project --query` itself with the request's words
through the plugin gates — nothing found, the reply stands with no extra
model call; facts found go back to the model once for one more reply, which
uses no tool round.
A tool result's `privateText` (MEMORY-7.a, REQ-agent-710: private notes, a
profile, the owner's view of someone's memory) never reaches the model: the
tool message and the `ToolResult` event are built from `data` / `message`
only (the "sent privately" placeholder), and the loop hands the text to
`onPrivateReply` for the run result; the prompt tells the model it only gets a
"sent privately" result for those reads and to point the person to their DMs.
Repeated failing calls (AGENT-16, REQ-agent-086; `src/agent/loop-guards.ts`):
the tool loop counts each call's failures (tool name + canonical argv; a
refusal counts) until something really changes; the 2nd identical failure is
followed by a harness steer to change approach or ask, and an identical call
made after the model has seen that steer does not run: the attempt ends with
the existing "stuck" ask, so every surface pings the owner (AUTONOMY-2/4).
Plan-only or empty "Done." replies (AGENT-17, nudge half, REQ-agent-087;
`src/agent/loop-guards.ts`): a final reply that is only a plan, or a short
"Done."-style or empty claim (never a plan the task asked for), when the
round offered a state-changing tool, SAFE-13 has not tripped and nothing
changed (the verify gate's real git diff, or tool-reported changes and
stored memories with no git tree), gets one harness nudge to the same model,
once per run; a second stall stands with an operator note. Moving to a
stronger model is not built yet.

## Public API

Run limits (AGENT-12, REQ-agent-244 / REQ-agent-312): `src/agent/limits.ts`
exports `MAX_TURNS_ENV` (`CORVIDINHO_MAX_TURNS`), `IDLE_TIMEOUT_ENV`
(`CORVIDINHO_IDLE_TIMEOUT_MS`), `DEFAULT_MAX_TURNS` (8),
`DEFAULT_IDLE_TIMEOUT_MS` (600000), `MAX_IDLE_TIMEOUT_MS` (2147483647),
`maxTurnsFromEnv(env)` / `idleTimeoutFromEnv(env)` → `LimitSetting`
(`{ value, invalid }`), `invalidLimitNote(key, fallback)`,
`formatIdleDuration(ms)`, `idleTimeoutLine(ms)`, `TURN_CAP_NOTE`,
`IDLE_STOP_GRACE_MS` (5000), `effectiveIdleTimeoutMs(ms)` (an unusable
value — 0, negative, NaN, Infinity — is the default),
`stopReasonFromUnknown(v)`, `startIdleWatchdog(ms, timers?)` →
`IdleWatchdog` (`timeoutMs`, `signal`, `fired`, `touch()`, `pause()` →
resume, `stop()`), and the current-run hooks `withIdleWatchdog(w, fn)`,
`noteIdleActivity()`, `pauseIdleWatchdog()` and `whileIdlePaused(fn)`
(AsyncLocalStorage; no-ops outside a run). Types: `TaskStopReason`
(`"turn-cap" | "idle-timeout"`), `ExecuteResult.stopReason?: "turn-cap"`,
`TaskResult.stopReason?` and `TaskResult.error?` (one plain line, set by an
idle timeout; additive, protocol unchanged), `RunTaskOptions.idleTimeoutMs?`.
`formatTaskPlumbing` input gains `stopReason?`.

Loop guards (REQ-agent-086, AGENT-16): `src/agent/loop-guards.ts` exports
`callSignature(name, rawArgs)` (JSON of the name and
`argvFromToolArguments(rawArgs)`), `changedState(name, result)` (true when the
result's data reports `filesChanged`, ok or not, or when a tool in
`STATE_CHANGING_TOOLS` or a Fledge plugin command, `origin` `fledge:`,
succeeds), `STATE_CHANGING_TOOLS` / `NO_STATE_CHANGE_TOOLS` (every dangerous
or mutating builtin is in exactly one), `STEER_AFTER_FAILURES` (2),
`STEER_ERROR_EXCERPT_MAX` (200), `errorExcerpt(error)`,
`repeatFailureSteer(label, failures, error)` (`error` null ⇒
`STEER_FENCED_ERROR_NOTE`), `REPEAT_FAILURE_BLOCK_DETAIL`,
`repeatedFailureAsk(label)` (a `stuck` HumanAsk) and
`createRepeatFailureGuard()` → `RepeatFailureGuard` (`newConversation`,
`before(sig, round)` → `"run" | "ask"`, `after(sig, round, result, changed)`
→ `{ failures, steer }`, `lastError(sig)`). No env var, config key, flag,
HumanAsk reason or NDJSON field is added.

Stall nudge (REQ-agent-087, AGENT-17 nudge half): `src/agent/loop-guards.ts`
also exports `isStateChangingTool(name)` (a `STATE_CHANGING_TOOLS` builtin or
a Fledge plugin command; `changedState` uses it), `stallKind(text, task?)`
→ `"plan" | "done-claim" | null`, `planWanted(task)` (the task asks for a
plan or for nothing to change yet: a plan reply is then null),
`STALL_DONE_MAX_CHARS` (60), `STALL_PLAN_MAX_CHARS` (600),
`STALL_NUDGE_MARK` (`[Corvidinho harness — AGENT-17]`),
`STALL_CHANGE_TOOLS` (`memory-store`, `memory-forget-me`) and
`changedForStall(name, result)` (`changedState`, or a successful
`STALL_CHANGE_TOOLS` call), `nothingChanged({ sawChange, unreportedEdits,
workspaceChanged? })` (async), `stallNudge(kind, askOffered)`,
`stallNudgedNote(kind)`, `stallStandsNote(kind)` and
`createStallNudgeGuard()` → `StallNudgeGuard` (`changed()` and
`sawChange()` — a change in any attempt of the run; `next()` → `"nudge"`
once, then `"stand"`). `ExecuteContext` gains the optional `workspaceChanged()` →
`Promise<string[] | null>`: `runTask` passes its `WorkspaceDiffTracker`'s
`changed` when the run has a git snapshot. No env var, config key, flag,
HumanAsk reason or NDJSON field is added.

Export `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` from `src/agent/execute.ts` (and
`src/agent/index.ts`).

NDJSON event stream (REQ-agent-073, issue #73): `src/agent/events-ndjson.ts`
owns `CORVIDINHO_PROTOCOL_VERSION` (2) and exports `frameFromEvent`,
`usageFrame`, `resultFrame`, `serializeFrame`, `createNdjsonWriter`,
`summarizeToolArgs`, `parseNdjsonLine`, `createNdjsonParser`,
`readNdjsonStream`, `progressFromFrame`, `collectTaskRunStream`,
`MUST_ASK_WAIT_TEXT_RE` and `MUST_ASK_WAIT_STATUS` (`progressFromFrame` shows
only one `Text` frame: the must-ask gate's wait line, as "waiting for the
owner's OK on an Approve card" — REQ-agent-097). Frames:
`{protocol, type}` with AgentEvent types `StateChanged` / `Text` / `ToolCall`
(`name`, `argsSummary`) / `ToolResult` / `VerifyResult`, plus `usage`
(running prompt / completion / total tokens) and a final `result`
(`TaskResult`). `createTaskExecute({ onUsage })` reports running provider
totals with `{ model, byModel }` (the model that reported it and the running
totals per configured model, AGENT-11); `usageFrame(u, detail?)` adds them to
the frame as `model` / `byModel` (validated when parsed), and
`collectTaskRunStream` returns the last frame's `byModel` as `usageByModel`.
`createTaskExecute({ onModelFallback, onModel })` reports each failover and
the model each reply came from; `task run` puts `model`, `usageByModel` and
`modelFallback` on its `TaskResult` (REQ-agent-080). `extractUsage` reads
OpenAI-compatible `usage`. `collectTaskRunStream`
returns the last `usage` frame as `usage` (the Discord answer footer prices
it, DISCORD-15) and takes an optional `bodyMax` for the result-frame chat body
(default `CHAT_BODY_MAX`, 1800; the Discord spawn client passes a larger cap
and splits the answer itself, DISCORD-16).

Per-tier model (REQ-agent-079, AGENT-5): `src/agent/tier.ts` exports
`TIER_MODEL_ENV` (`CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`) and
`modelForTier(env, tier)` (the first entry of the tier key, else of
`CORVIDINHO_LLM_MODEL`, without its `kind:` prefix; `""` when none — there is
no default model, AGENT-13). `loadLlmEnv(env, tier?)` takes an explicit tier
over `CORVIDINHO_LLM_TIER` and returns that tier's provider (`kind`,
`baseUrl`, `apiKey`, `model`) and its no-provider `notice` (null when usable);
`createTaskExecute` passes its `tier` so `--tier` picks the model.

Providers (REQ-agent-179, AGENT-13 / AGENT-10): `src/agent/providers.ts`
exports `PROVIDER_KINDS`, `parseModelEntry` / `parseModelChain` (comma list;
split on the first `:` only for a known kind), `modelChainForTier` (`[]` when
nothing is set), `resolveEntry` (openai: `CORVIDINHO_LLM_BASE_URL`, default
`https://api.openai.com/v1`, key `CORVIDINHO_LLM_API_KEY` or
`OPENAI_API_KEY`; ollama: `ollamaHostUrl` from `OLLAMA_HOST`, default
`http://127.0.0.1:11434`, `/v1`, no key; anthropic: `ANTHROPIC_BASE_URL`,
key `ANTHROPIC_API_KEY`; `usable` false when the kind's key is missing),
`providerId` (the endpoint host, as the SAFE-8 ledger records it),
`providerForTier`, `entryLabel`, `defaultProviderLabel`, `providerNotice(env,
tiers?)` (starts with `NO_PROVIDER_NOTICE`, names the tiers and the missing
setting or key, never a value), and `providerStatus`. The fallback chain
(REQ-agent-080, AGENT-11): `modelChain(env, tier)` (the tier's entries,
resolved, with the current `index` and its `fallbacks`), `callChain(chain, fn,
onFallback?)` (`ChainCall` results; `failure: null` never fails over; a next
entry without its key is skipped with `<KEY> is not set`), `ModelFailure` /
`modelFailureReason` (`HTTP <status>`, `timed out`, `network error`,
`malformed reply`), `modelFallbackEventText`, `MODEL_FALLBACK_NOTE_PREFIX`,
`modelFallbackNote`, `withModelFallbackNote`, `formatModelFallbackLog`
(`llm.fallback: …`), `answeredModelLabel` (`b (fell back from a)`),
`modelIdOfLabel`, `modelFallbackFromUnknown` / `modelUsageFromUnknown` /
`modelLabelFromUnknown` (a child's result read back: scrubbed, one line,
bounded, at most `MODEL_FALLBACK_MAX` 16), `mergeModelFallbacks` and
`addModelUsage`. `ModelUsage` and `ModelFallback` are in
`src/agent/types.ts`. The chat transport sends
`authorization: Bearer <key>` only when the kind has a key. `modelKeyForTier(env, tier)` names the key that set a tier's
model (the SAFE-8 unpriced ask names it via `createSpendGuard({ modelKey })`),
and `perTierModels(env)` lists each tier's model when any per-tier key is set
(doctor `[ok] llm`; `readSpendSnapshot` flags an unpriced tier model with its
`tier` for doctor `spend` and `/status`).
Real-diff verify gate (REQ-agent-085, AGENT-4 / AGENT-15): `src/agent/workspace-diff.ts`
exports `startWorkspaceDiff(cwd)` (a `WorkspaceDiffTracker` whose `changed()`
lists cwd-relative paths changed since the baseline, or null when git cannot
be read; null tracker outside a git work tree; an optional second argument
`WorkspaceDiffLimits` lowers the hash budget in tests; in a talk worktree the
tracker also has `settle(done)` and, when its last run did not end verified,
`carried: true` with the talk branch's merge-base as the baseline,
REQ-agent-015; an optional third argument `WorkspaceDiffRole`
`{ nested: true }`, passed by `task run` in a delegate or council worker,
never takes or writes the marker), `WORKSPACE_DIFF_MAX_OUTPUT_BYTES`,
`WORKSPACE_DIFF_HASH_MAX_BYTES`, `WORKSPACE_DIFF_HASH_BUDGET_BYTES` and
`WORKSPACE_DIFF_MAX_FILES` (real-diff paths one run adds to `filesChanged`).
`RunTaskOptions.workspaceDiff` is a test seam like `verifyRunner`, not a
product surface (`task run` sets it only in a delegate or council worker).
Tests ran and none deleted (REQ-agent-185, AGENT-15): every
`WorkspaceDiffTracker` has `testDrops()` (tests at its baseline that are
gone, or run less than they did, by name across the repo root; null when it
cannot tell), and `startWorkspaceDiffFrom(cwd, commit)` is a tracker from a given
commit with no dirt (/work's merge-base check, REQ-discord-185).
`src/agent/test-evidence.ts` exports `countExecutedTests(output)` (executed
tests from the `bun test`, jest, vitest, `cargo test`, pytest and `go test`
summaries, `TEST_SUMMARY_RUNNERS`), `isTestFilePath`, `testDeclarations(path,
source)` (`TestDecl` name + active, or conditional), `droppedTests(before, after)`,
`startTestNameWalk(dir)` (the non-git snapshot, a `TestDropCheck`),
`judgeTestEvidence(laneOutput, drops)` (`{ ok, note }`), `formatTestDrops`
and its caps (`TEST_SOURCE_MAX_BYTES`, `TEST_NAMES_BUDGET_BYTES`,
`TEST_NAMES_MAX_FILES`, `TEST_WALK_MAX_ENTRIES`, `TEST_DROPS_NAMED`,
`TEST_DROPS_MAX_CHARS`); `TestDrop` is in `src/agent/types.ts`. The gate has no switch (AGENT-14, REQ-agent-003):
`RunTaskOptions` and `AgentConfig` have no `verifyBeforeComplete`;
`src/agent/config.ts` exports `REMOVED_VERIFY_KEYS` and
`removedVerifyKeys(cwd)` (a removed `[corvidinho]` key still set, for the
doctor warning), and `src/agent/loop.ts` exports `NOTHING_TO_VERIFY_NOTE`.

LLM request timeout (REQ-agent-244): `src/agent/execute.ts` exports
`LLM_REQUEST_TIMEOUT_MS` (10 minutes), the default cap on one chat
completions request (headers and body); `createTaskExecute` takes
`llmTimeoutMs?: number` to override it. No env var.

Daily spend cap (REQ-agent-098, issue #98, SAFE-8 as amended / AUTONOMOUS-8):
`src/agent/spend.ts` exports `SPEND_CAP_ENV`
(`CORVIDINHO_DAILY_SPEND_CAP_USD`), `SPEND_WINDOW_MS` (rolling 24 h),
`SPEND_WARN_PERCENT` (80), `MODEL_PRICES_USD_PER_MTOK` (each priced model's
input/output price and its listed maximum output, `ModelPrice.maxOutputTokens`),
`priceForModel`, `REPLY_RESERVE_DEFAULT_TOKENS` (128000) and
`replyReserveTokens` (the worst-case reply a call is estimated at,
AUTONOMY-8.a, REQ-agent-298),
`parseSpendCap`, `costMicroUsd`, `estimateCallMicroUsd`, `formatUsd`,
`ensureSpendLedger`, `SpendLedger` (`reserve` / `settle` / `window` /
`noteWarning` over the module-owned `spend_ledger` and `spend_alerts` tables
in the shared DB), `SpendCapRefusal` (carries a `spend-cap` `HumanAsk`),
`createSpendGuard` (`{ fetch, finish }`: the capped provider fetch plus the
hook that turns a stopped call into the attempt's ask), `withSpendCap` (the
fetch alone; unchanged when no cap is set), `reserveFlatSpend` (a
flat-priced tool call's reservation in the same ledger — `off` with no cap at
all / `held` with `settle(billed | not-billed | unknown)` / `stopped` with the
spend-cap ask; recorded while any cap is set and counted against the total cap
only, since a SAFE-14 provider cap is keyed on a configured model provider;
`FlatSpendHold`, `FlatSpendOutcome`; a Brave `web-search` is 5000 micro-USD,
#318; a free-tier GIPHY `gif-search` is 0, a $0 row stopped only when the
window is already past the cap), `readSpendSnapshot` and
`spendDoctorCheck` (doctor line). `src/agent/spend-notice.ts` holds the
pure text: `formatSpendWarningLine`, `spendWarningFromUnknown`, the
`spendCap*Ask` question builders, `formatSpendDoctorLine`,
`formatSpendStatusLine` (the owner's Discord `/status` line), `spendPercent`,
and (SAFE-14.a) `SPEND_PAUSED_TEXT` ("Work is paused for budget."),
`spendPaused(snapshot)` (runs stop at the spend check: cap reached, unpriced
model, invalid value, unreadable ledger) and
`formatSpendPublicStatusLine(snapshot)` ("Spend: Work is paused for budget."
while paused, else undefined — the only spend line anyone but the owner sees).
`createTaskExecute` builds its fetch with `createSpendGuard`, emits the 80%
warning as a `Text` event and through `onSpendWarning`, and passes every
attempt's result through `finish`; an offered tool whose result carries a
`spend-cap` `spendAsk` (a flat-priced call stopped at the cap, never sent)
ends the attempt the same way, with `SPEND_CAP_SUMMARY` and that ask and no
further model call. `HumanAskReason` gains `spend-cap`;
`TaskResult` gains optional `spendWarning` (`SpendWarning`: integer
`spentMicroUsd` / `capMicroUsd` and `percent`). A run stopped at the cap
reports the generic `SPEND_CAP_SUMMARY` (= `SPEND_PAUSED_TEXT`, SAFE-14.a) as
its summary (no amounts or env names; the details are in `ask.question`, which
Discord shows only to the owner, by DM), and `SPEND_REARM_PERCENT` (70)
sets where the warning re-arms. `src/agent/spend-alerts.ts` owns the
`spend_alerts` table (`ensureSpendAlerts`, adding `delivered_at` to an older
table): `recordSpendWarning`, `rearmSpendAlerts`, `warnArmed`,
`capPingArmed`, `claimSpendWarnings` (claims nothing while current spend is
back under 80%, leaving the warning pending) / `releaseSpendWarnings` and
`claimSpendCapPing` (the new `cap` row's id) / `releaseSpendCapPing`.
`src/agent/spend-outbox.ts` exports `createSpendAlertOutbox`
(`SpendAlertOutbox`: `takeWarning(fallback)` → `TakenSpendWarning` with
`release()`, and `claimCapPing()` → `SpendCapPingClaim` with `release()`, or
null when the episode already pinged), the delivery side the Discord bridge
uses (its owner DM pass, `src/discord/spend-dm.ts`, takes the warning;
SAFE-14.a).

Per-provider caps (REQ-agent-114, SAFE-14 / SAFE-15): `src/agent/spend.ts`
also exports `PROVIDER_SPEND_CAPS_ENV` (`CORVIDINHO_PROVIDER_SPEND_CAPS_USD`,
a comma list of `provider=USD` keyed on the configured provider id, the
endpoint host `providerId` gives), `parseProviderCapList` (syntax only),
`configuredProviderIds` (every entry of `CORVIDINHO_LLM_MODEL` and the
per-tier keys), `parseSpendCaps` (`SpendCaps`: `off`, `invalid` with the bad
setting names, or `caps` with a nullable total and a provider map; a
malformed entry or a key no configured model uses makes the provider setting
invalid, which stops every call and is never echoed) and `spendDoctorChecks`
(the `spend` line plus one `spend provider:<id>` line per cap).
`SpendLedger.window(now, provider?)` reads one provider's spend (index
`idx_spend_ledger_provider_ts` on `(provider, ts)`), `reserve` takes an
optional total `capMicroUsd` and `providerCapMicroUsd` and refuses with
`trips` (every tripped `SpendTrip`: scope `total` / `provider:<id>`, spend,
cap) in the same IMMEDIATE transaction, and `noteWarning({ …, provider })`
checks a provider cap against its own spend. `createSpendGuard` reads every
cap: while any cap is set it records every priced call, stops a call past
its provider's cap or the total with a `spend-cap` ask naming each tripped
scope (`spendCapReachedAsk({ estimateMicroUsd, trips })`, the
`Stopped at cap: …` marker, `HumanAsk.spendScopes`), notes the 80% warning of
each cap the call counts against (a provider's `SpendWarning.scope`), and
sends an unpriced model's call unrecorded only when no cap covers it. The
stop is a `SpendCapRefusal`, which the AGENT-11 model chain treats as no
model failure, so it never falls back. `spend-alerts.ts` keeps every row's
`scope` (idempotent ALTER, scrubbed) and all arming per scope and cap value;
`claimSpendWarnings` returns one warning per scope; the outbox's
`takeWarning` returns `warnings` (one per cap) and `claimCapPing(scopes?)`
claims each tripped scope's episode. `src/agent/spend-notice.ts` adds
`TOTAL_SPEND_SCOPE`, `providerSpendScope`, `providerOfSpendScope`,
`isSpendScope`, `spendScopesOf` (an ask's scopes, else its question's
marker), `formatProviderSpendDoctorLine`, `formatSpendDoctorLines`, the
`ProviderSpend` / `SpendTrip` / `NamedSpendDoctorLine` types, per-provider
`/status` lines in `formatSpendStatusLine`, and a `SpendSnapshot` of kind
`cap` with an optional total `capMicroUsd` and `providers`. `askFromUnknown`
keeps well-formed `spendScopes` of a `spend-cap` ask.

Spend card (REQ-agent-198, SAFE-8 / SAFE-8.a / SAFE-15 / SAFE-19 / SAFE-20,
AUTONOMY-8): `src/agent/spend.ts` also exports `SPEND_CARD_KIND` (`spend`),
`SPEND_CARD_CLASS` (`money`), `SPEND_CARD_TTL_MS` (4 min, below
`COUNCIL_VOICE_TIMEOUT_MS` and `LLM_REQUEST_TIMEOUT_MS`),
`SPEND_CARD_POLL_MS` (1 s), `SPEND_CARD_TASK_MAX` (1500),
`spendCardFields` (what the card shows: title, action `send one model call
to <model> via <provider>`, target the tripped scope(s), amount that call's
estimate, and the text — who asked where, the project label, each tripped
cap's spend when it paused and the task excerpt, SAFE-6 scrubbed before it is
cut), `setSpendCardTestHooks`
(`SpendCardTestHooks`: TTL, poll and an `onRequest` hook; tests only), the
`SpendApprovalOptions` type (`taskText`, `project`, `onNote`) taken by
`createSpendGuard({ approval })`, the `SpendReserveInput` type, and
`SpendLedger.reserveApproved` (one approved call recorded at its approved
amount past the cap after a re-fit check; `trips` names the caps it still
passes; no row for an estimate over the approved amount, `reason: "amount"`,
or for a call that would now also pass a cap outside the card's target,
`reason: "target"`).
`src/agent/spend-notice.ts` adds `spendScopeLabel`, the `SpendCardNo` /
`SpendCardOutcome` types (`denied`, `expired`, `aborted`, `changed`,
`unavailable`) and
`spendCapReachedAsk({ …, card })`, whose question says what the card came to
and how to continue (ask again for a new card and code, or the operator
action) without the "replying can't lift the cap" note. `createTaskExecute`
passes `approval` (the task text, the project label from `projectKeyFor`
via `projectLabel`, never a host path, and the Text-event notes).

Unknown prices on the card (REQ-agent-199, SAFE-16 / SAFE-16.a, AUTONOMY-8):
`src/agent/spend.ts` adds `SPEND_CARD_UNKNOWN_AMOUNT`, `isUnknownSpendAmount`,
`spendCardFields({ estimateMicroUsd: null, … })` (the unknown-price card:
title `Spend at an unknown price — asks first (SAFE-16.a) · from <surface>`,
target every covering cap, amount `unknown (…)`), the `unknown` ledger status
(`SpendStatus`, `SpendSettlement` `{ status: "unknown", usage }`),
`SpendWindow.unknownCalls`, `SpendLedger.covering` (the caps that cover a call
with their spend) and `SpendLedger.recordUnknown` (one approved unknown-price
call, no amount). `createSpendGuard` holds a covered unpriced call for that
card (the shared `waitOnCard`, one card at a time per run) and ends a no with
`spendCapUnpricedAsk(…, card)`. `src/agent/spend-notice.ts` adds `formatSpend`
(`$X + unknown`), `SpendTrip.unknownCalls` and uses it in every owner spend
line (doctor, `/status`, the warning line, the stop ask); `SpendWarning`
gains `unknownCalls` (`src/agent/types.ts`), carried by `noteWarning`, the
outbox's `takeWarning` and `spendWarningFromUnknown`. There is no price
override: the price table is frozen and no env var sets a price.

Autonomous gate + delegation core (REQ-agent-117, issue #117):
`src/autonomous/enabled.ts` exports `parseAutonomousConfig`,
`loadAutonomousConfig`, `isAutonomousEnabled`, `autonomousSessionAllowed`;
`src/autonomous/delegate.ts` exports `delegateDepthFromEnv`,
`canDelegateAtDepth`, `clampChildTier`, `parseDelegateArgs`,
`buildDelegateTaskText`, `resolveDelegateBin`, `isWorkerEnvDropped`,
`buildDelegateSpawn`, `createDelegateLimiter`, `runDelegateChild` and the caps
(`MAX_DELEGATE_DEPTH` 2, `MAX_CONCURRENT_DELEGATES` 2,
`MAX_DELEGATES_PER_RUN` 4, `DELEGATE_MIN_TIER` 2). `buildOpenAiTools` takes
`autonomous?: boolean`; `createTaskExecute` takes `autonomous?: boolean`
(default: `autonomousSessionAllowed({ cwd, env })`).
GITHUB-9 (REQ-agent-117, REQ-agent-092): `src/autonomous/delegate.ts` also
exports `DELEGATE_AUTHORS_ENV` (`CORVIDINHO_DELEGATE_AUTHORS`, internal: set
only on a worker spawn), `DELEGATE_AUTHORS_MAX` (32),
`delegateAuthorsFromEnv(env)` and `workerModelsFromResult(r)`;
`buildDelegateSpawn` and `runDelegateChild` take `authors?`, and
`DelegateChildOutcome.models?` lists the worker's models.
A failed worker's line for its lead (REQ-agent-117, REQ-agent-118):
`src/autonomous/delegate.ts` exports `workerFailureLine({ exitCode, error?,
timedOut?, aborted?, spawnError?, protocolMismatch? }, env, tier)`,
`WORKER_TIMED_OUT_LINE`, `WORKER_INTERRUPTED_LINE` and
`WORKER_START_FAILED_LINE`; `src/agent/providers.ts` exports
`withoutProviderHost(reason)` (a `modelCallFailedLine` line without the
provider's host, any other line as is — WATCH's `watchPublicFailureLine` is
it). For a worker that failed, `DelegateChildOutcome.summary` is that line
and `resultText` is unset.

Second-model review in the tool loop (REQ-agent-092, GITHUB-9 / GITHUB-9.a):
`createTaskExecute` hands every `runPlugin` call of its tool loop a
`PrReviewRun` (`env`, `authors()`: every model its chain called, AGENT-11
failovers included, its delegate workers' reported models and, in a worker,
the lead's; `complete`: one no-tools `chatCompletions` call through the run's
spend-guarded fetch, usage under the reviewer's label). A `ReviewSpendStop`
thrown by `github-pr-create` ends the attempt (the spend guard's `finish`
turns it into the spend-cap ask); a result with `reviewHold` is never counted
by the AGENT-16 guard; a second `github-pr-create` in the batch that just got
findings is not run; `withReviewRefusalNote(summary, line)` adds the run's
latest `github-pr-create` refusal line ("PR not opened: …") once, before the
role note.

Council core (REQ-agent-118, issue #118, AUTONOMOUS-6):
`src/autonomous/council.ts` exports `parseCouncilArgs`, `resolveCouncilTier`,
`councilLens`, `capCouncilText`, `buildProposeText`, `buildCritiqueText`,
`buildDecideText`, `runCouncil`, `formatCouncilPhases`, `COUNCIL_PHASES`
(`propose`, `critique`, `decide`), `COUNCIL_LENSES` and the caps
(`COUNCIL_DEFAULT_VOICES` 3, `COUNCIL_MIN_VOICES` 2, `COUNCIL_MAX_VOICES` 5,
`COUNCIL_QUESTION_MAX` 4000, `COUNCIL_ENTRY_MAX` 1500, `COUNCIL_DECISION_MAX`
= `DELEGATE_SUMMARY_MAX`, `COUNCIL_TIMEOUT_MS` 15 min,
`COUNCIL_VOICE_TIMEOUT_MS` 5 min, `MAX_COUNCILS_PER_RUN` 2,
`COUNCIL_DEFAULT_TIER` read, `COUNCIL_MAX_VOICE_TIER` tool).
`DelegateChildOutcome` gains optional `resultText` (the worker's own result
summary, scrubbed and capped at `DELEGATE_SUMMARY_MAX` rather than the
1800-char chat body) and `modelFallback` (the worker's own failovers from its
result frame, validated, AGENT-11); `CouncilOutcome.modelFallback` holds its
voices' and chair's, each once (REQ-agent-080).

Project instructions (REQ-agent-084, AGENT-1, issue #84):
`src/agent/project-instructions.ts` exports `findProjectRoot`,
`loadProjectInstructions`, `renderProjectInstructions`,
`describeProjectInstructions`, `withProjectInstructions`,
`PROJECT_INSTRUCTION_FILES` (`AGENTS.md`, `CLAUDE.md`),
`PROJECT_INSTRUCTIONS_MAX_BYTES` (16 KiB), `PROJECT_INSTRUCTIONS_HEADER`,
`NOT_COMMITTED_REASON` and `projectInstructionsWarning`
(re-exported from `src/agent/index.ts`). `createTaskExecute` loads them from
`cwd` by default; `projectInstructions: false` opts out.
`ProjectInstructions.source` is `commit` when the project root holds `.git`
(files are read from the `HEAD` commit through read-only git: `ls-tree`,
`cat-file`, `diff --name-only`, hooks and fsmonitor off, env clamped with the
git plugins' `gitEnv`) and `working-tree` otherwise. A loaded file carries
`uncommitted: true` when its working-tree copy differs from `HEAD`.
`LoadProjectInstructionsOptions.exactRoot` reads at the given directory
instead of walking up to the nearest `.git` (the persona file).

Persona file (REQ-agent-069, PERSONA-1/2/3, issue #69): `src/agent/persona.ts`
exports `PERSONA_FILE` (`persona.md`), `PERSONA_MAX_BYTES` (8 KiB),
`CORVIDINHO_ROOT` (Corvidinho's own checkout, `import.meta.dir/../..`),
`loadPersona(root?, { maxBytes? })`, `renderPersona`, `personaWarning`,
`withPersona`, `PERSONA_HEADER` and `PERSONA_RULES_SYSTEM_INSTRUCTIONS`, plus
the `Persona` / `LoadPersonaOptions` types (re-exported from
`src/agent/index.ts`). `loadPersona` reads `persona.md` with
`loadProjectInstructions(root, { fileNames: ["persona.md"], maxBytes: 8 KiB,
exactRoot: true })`, so the AGENT-1 guards apply (HEAD-committed copy only in a
git checkout, cap with marker, symlink / binary / non-UTF-8 refusal, SAFE-6
scrub, never throws). `createTaskExecute` loads it once per run from
`CORVIDINHO_ROOT` (`personaRoot` is a test seam) and builds both system
prompts as persona block, then Corvidinho's rules with
`PERSONA_RULES_SYSTEM_INSTRUCTIONS`, then project instructions. The shipped
`persona.md` at the repo root uses corvid-agent's persona shape (Archetype,
Personality traits, Background, Communication style, Example messages).

`task-summary` exports `formatTaskPlumbing`, `chatBodyFromTaskResult` (optional
`max`, default `CHAT_BODY_MAX` 1800), and
`chatBodyFromTaskRunOutput` alongside `summarizeTaskResult`, plus
`ROLE_REFUSED_SUMMARY_NOTE`, `closingNotesTail` and `clipKeepingRoleNote`
(REQ-agent-333; it keeps the AGENT-11 `(model fallback: …)` note before the
role note too, REQ-agent-080, and the REQ-agent-318 attribution note between
them), and `REPLY_ATTRIBUTION_BY_TOOL` (tool name → the visible line its
provider's terms ask a reply to end with: `web-search` → "Search by Brave"),
`replyAttributionNote`, `withoutReplyAttribution` and `withReplyAttribution`
(REQ-agent-318). Discord/NDJSON
bridge summaries SHALL use the chat-body helpers so operator plumbing never
appears in the final chat reply (DISCORD-3.a).

`execute` system prompt SHALL include IDENTITY-4 and ROLES-CHAT-8 instruction
blocks (`IDENTITY_AGENT_SYSTEM_INSTRUCTIONS`, `PUBLIC_QA_AGENT_SYSTEM_INSTRUCTIONS`)
in addition to MEMORY instructions; the public Q&A block names the only
community site / roadmap sources — the public repo docs (README, docs/,
STATUS, CHANGELOG) and the public issues and milestones of allowed public
repos — and says nothing else counts (ROLES-CHAT-8.a, REQ-agent-065). `execute` exports
`DISCORD_ATTACH_AGENT_SYSTEM_INSTRUCTIONS` (DISCORD-17, REQ-agent-476): the
system prompt carries it only when the run's catalog offers
`discord-send-file` and its env has a conversation channel
(`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID`), so the model never says it cannot
send files or images there and sends a large diff as a `.diff` attachment.

Ask the human (REQ-agent-044, issue #44, AUTONOMY-1/2/7 / DISCORD-ASK):
`src/agent/ask.ts` exports `ASK_TOOL_NAME` (`ask-human`), `withAskTool`,
`askFromToolArguments`, `askFromUnknown`, `formatAskSummary`, `stuckAfterVerifyAsk`,
`ASK_AGENT_SYSTEM_INSTRUCTIONS` (AUTONOMY-7 + prefer `options` / numbered choices
for ephemeral Discord buttons + the one AUTONOMY-11 sentence: anything inside
its guardrails it just does and then says what it did; only prod or deploy
contact and channel posts need the owner's OK, which the tool itself waits
for on the Approve card, so it never calls ask-human for permission first and
never repeats a call the owner denied — REQ-agent-097). `src/agent/ask-options.ts` exports
`resolveAskOptions` / `parseChoicesFromQuestion` / `normalizeAskOptions`
(option ids come out unique within an ask: a repeated id takes the first
unused position number, and already-unique ids are kept byte-identical,
REQ-agent-045) and `cleanAskLabel`. The question is SAFE-6 scrubbed before it
is cut at `ASK_QUESTION_MAX` (1500, `normalizeQuestion`) and each option label
before it is cut at 80 (`cleanAskLabel`), so a secret the cut would split
shows as `[redacted:<kind>]`, never as a raw piece; cut text is scrubbed once
more, so a cut that ends a key shape is redacted too and normalizing again
changes nothing (SAFE-6.a, REQ-agent-045).
`HumanAsk` MAY include `options: AskOption[]`. A clarify ask ends the run
`blocked` (verify skipped, exit 0); verify exhaustion stays `failed` and
carries a `stuck` ask. Additive on the NDJSON wire: protocol stays 2.

Verify runner env (REQ-agent-002, SAFE-6): `src/agent/verify.ts` exports
`isVerifyEnvDropped` and `buildVerifyEnv`; `defaultVerifyRunner` spawns fledge
with `buildVerifyEnv()`.

Verify retry feedback (REQ-agent-002, AGENT-4.a): `src/agent/verify.ts` also
exports `VERIFY_FEEDBACK_MAX_CHARS` (4000) and `verifyFeedbackExcerpt(output,
max?)`, the lane output a retry sends the model. `runTask` builds
`ExecuteContext.verifyFeedback` with it (prefix included, within the cap) and
the LLM execute (tool loop and read-tier chat) caps feedback with it instead
of a head cut. No flag, env var or config key.

Allowlisted dangerous tools (REQ-agent-501, CLI-3 / SAFE-1): `src/agent/tools.ts`
exports `SAFE3A_TOOLS` (`shell-exec`, `node-exec`, `python-exec`,
`cargo-exec`, and the Fledge core runs `fledge-lanes-run` and
`fledge-run`; `SAFE3_PENDING_TOOLS` before SAFE-3.a),
`allowlistOffers(allowlist, name, safe3a = false)` (named, and for a
`SAFE3A_TOOLS` name only with the attempt's SAFE-3.a grant) and
`editsFilesUnreported(name)` (a Fledge command or a `SAFE3A_TOOLS` name,
REQ-agent-502). `BuildToolsOpts` gains `allowlist?: ReadonlySet<string>` and
`safe3a?: boolean` (default false);
`createTaskExecute` passes its effective allowlist (the `allowlist` option,
else `CORVIDINHO_ALLOWLIST`) and loads Fledge plugins when `includeDangerous`
is set or the allowlist names a Fledge plugin command (a `fledge-*` name that
is not one of the four Fledge core builtins) and the session is not a
non-ADMIN role session (the ADMIN check runs first). `ExecuteResult` gains
optional `unreportedEditTools?: string[]`; outside a role session, with a
Fledge plugin command allowlisted, a `delegate` call that started a worker is
named there too. No env var, config key, flag or slash command.

Owner shell grant (REQ-agent-503, SAFE-3.a): `src/agent/shell-gate.ts` exports
`shellToolsGate({ env, cwd, talkWorktree? })` → `ShellToolsVerdict` (`{ granted: true }` or
`{ granted: false, reason }`), `isOwnTalkWorktree(cwd, sessionId)`,
`isCliRunWorktree(cwd, worktree)` (REQ-cli-681),
`shellToolsRefusedLine(names, reason)`, `ACTING_SURFACE_ENV`
(`CORVIDINHO_ACTING_SURFACE`), `ACTING_SURFACES` / `ActingSurface` (`chat`,
`ask`, `session`, `work`, `watch`, `schedule`), `SAFE3A_SURFACES` (the first
four) and `actingSurface(env)`. `createTaskExecute` calls the gate once per
tool-loop attempt when its allowlist names a `SAFE3A_TOOLS` name (never with
`includeDangerous`), passes `safe3a` to `buildOpenAiTools`, and emits the
refusal line once per run. The gate grants only at delegation depth 0, with
no WATCH or schedule marker, and either in a role session with a `chat` /
`ask` / `session` / `work` stamp, the owner role resolved now and a cwd that
is the top of this session's own linked talk worktree, or, with no role
session (the local CLI half, REQ-cli-681), with no Discord session id and no
stamp and a cwd that is exactly the linked worktree `task run` made for this
run, which `createTaskExecute`'s optional `talkWorktree` (set only by
`taskRun`, in-process) names. The stamp is internal: each spawning
client always overwrites it (REQ-discord-735, REQ-watch-735), and delegate
workers and the verify lane drop it with the `CORVIDINHO_ACTING_` prefix. No
config key, flag, slash command or schema.

The owner's own schedule (DISCORD-SCHEDULE-1.a, REQ-agent-741): a scheduled
run (`isScheduleRunEnv`, `src/plugins/roles.ts`) may now carry the owner
stamp. `createTaskExecute` SHALL NOT discover Fledge plugin commands in a
scheduled run, whatever its role (they run arbitrary project code, like the
runners SAFE-3.a keeps from schedules); the other allowlisted dangerous tools
stay offered to the owner's schedule. `src/agent/ask.ts` exports
`mustAskRefusedAsk(tool, result)`: for a `runPlugin` refusal from the
must-ask gate whose outcome is `denied`, `expired` or `resent` it returns a
`stuck` HumanAsk naming the tool, the gate's scrubbed `why` (≤300 chars), the
rule and the card, else null. In a scheduled run, `runToolLoop` SHALL end the
run with that ask right after the refused call's `ToolResult` (one
`[operator] DISCORD-SCHEDULE-1.a: <tool> was refused on its Approve card; this
scheduled run stops and asks` Text line; later calls in that batch never run;
the run is `blocked`, verify skipped), so the schedule waits on it
(AUTONOMY-6.a) instead of raising a new card every tick. Outside a scheduled
run the refusal still goes back to the model. No env var, config key, flag or
schema.

Untrusted text (SAFE-11/12/13, #71, REQ-agent-071): `src/agent/untrusted.ts`
exports `cleanDisplayName(raw, max?)` / `DISPLAY_NAME_MAX` (32),
`nameSkeleton` / `namesLookAlike`, `stripInvisible`, `defangContextMarkers`,
`fenceUntrustedData(text, { source, header, word?, id? })` /
`UNTRUSTED_FENCE_WORD` (`UNTRUSTED_DATA`),
`UNTRUSTED_CONTENT_AGENT_SYSTEM_INSTRUCTIONS`, `detectInjection(text)` →
`InjectionVerdict` (`InjectionReason`: `ignore-rules`, `role-override`,
`owner-claim`, `secret-request`, `tool-call-payload`, `fake-marker`;
`INJECTION_REASONS`, `INJECTION_REASON_TEXT`, `describeInjectionReasons`,
`INJECTION_SCAN_MAX_CHARS`), `InjectionNotice` / `injectionNoticeFromUnknown`,
`INJECTION_AUDIT_ACTION` (`injection-suspected`), `UNTRUSTED_RESULT_TOOLS`,
`INJECTION_SCAN_TOOLS`, `toolResultFenceHeader`, `injectionToolNote`,
`injectionToolRefusal` and `injectionSummaryNote`. `src/agent/execute.ts`
exports `withInjectionNote(summary, notice)` and `toolResultScanText(result)`;
`createTaskExecute` takes `onInjection?: (notice) => void`; `TaskResult`
gains optional `injection?: InjectionNotice` (additive on the NDJSON
`result` frame: protocol stays 2). No env var, config key or flag.

Repo ways (AGENT-18 / AGENT-18.a, REQ-agent-518 / REQ-agent-519):
`src/agent/repo-ways.ts` exports `RepoWays` (`sdd`, `hi`, `trust`),
`SddPolicy` / `RepoWaysScan`, `detectRepoWays(root, base)`,
`scanRepoWays(root, base)`, `repoWaysBase(root)`, `mergeScans`,
`parseSddPolicy`, `mergeSddPolicies`, `isMeaningfulPath`,
`sddRequiresChange`, `hasHiFrontMatter`, `activeChangeIds(root)`,
`sddUncovered(root, changed, policy)`, `sddUncoveredNote(paths)`,
`formatRepoWaysLine(ways)`, `renderRepoWaysBlock(ways)`, the run ledger
`SddRun` / `beginSddRun(cwd)` / `endSddRun(run)` / `currentSddRun(cwd)` /
`noteOpenedChange(cwd, id)` / `repoWaysNow(cwd)`, `CORVIDINHO_REPO`,
`SELF_LIFECYCLE_ACTOR` (`corvid-agent`), `isCorvidinhoOriginUrl(url)`,
`isCorvidinhoProject(cwd)`, `setCorvidinhoCheckoutForTests(dir)` (a code-only
test seam), `HUMAN_LIFECYCLE_LINE`, `selfLifecycleRefusal(cwd, id, env)`,
`SDD_APPROVE_TOOL` / `SDD_FINALIZE_TOOL`, `SddToolCall`,
`settleOwnSddChanges({ cwd, run, call, onText })`, `capturedHiIds(cwd)` and
`citedHiIds(text, families)`. `ExecuteContext` gains optional
`repoWays?: RepoWays`. No env var, config key, flag or schema.
The hi guard (AGENT-18 hi clause, guard half, REQ-agent-520):
`src/agent/repo-ways.ts` also exports `HiChanges` (`criteria`, `retired`,
`files`), `HiSnapshot`, `parseHiEntries(text)`, `hiChangesSince(root, base)`,
`hiSnapshot(root)`, `hiChangesFromSnapshot(root, start)`,
`hiChangeCount(changes)`, `hiChangeSummary(changes)`, `hiGuardNote(changes)`,
`HI_GUARD_UNREADABLE_NOTE`, `HI_NO_CAPTURE_YET`, `hiRunChanges(cwd, run)` (the
gate's comparison for a run) and `hiPrRefusal(cwd)` (`github-pr-create`
inside a run, REQ-plugins-521); `SddRun` gains
`hiStart` (hi/ at planning for a run with no git session base). No env var,
config key, flag or schema.

A failed run's plain reason (DISCORD-3.b, REQ-agent-032): `TaskResult` gains
an optional `error?: string` (additive; no protocol bump) and `ExecuteResult`
an optional `failureReason?: string` beside `error: true`.
`modelCallFailedLine(failure, provider)` (`src/agent/providers.ts`) builds
`The model call failed (<status> <standard name> from <host>)` / `The model
call timed out (<host>)` / `… (network error reaching <host>)` / `…
(malformed reply from <host>)` / `… (<label> needs <KEY>, which is not set)`,
or `NO_PROVIDER_NOTICE` for an empty chain. `src/agent/loop.ts` exports
`VERIFY_RERUN_FAILED_REASON` and `verifyGaveUpReason(maxRetries)`.
`collectTaskRunStream` returns `stderrTail?` (the last `STDERR_TAIL_MAX`,
4000, characters of the child's stderr when it wrote any).
A local `task run`'s own worktree (SESSION-WORKTREE-1.a, REQ-cli-122):
`TaskResult` gains optional `workspace?: TaskWorkspaceReport` (`dir`,
`branch`, `kept`, `branchKept`), set only by the CLI for a run that worked in
its own worktree (additive on `--json` and the NDJSON `result` frame:
protocol stays 2). The delegate core spawns every worker (and council voice)
with `task run --here …` (REQ-agent-117), so a worker works in its lead's cwd
and never makes a worktree of its own. A run with no role session gets the
SAFE-3.a grant only at the top of that worktree (REQ-cli-681,
REQ-agent-503).

## Invariants

A limit I set stops a stalled or endless run and the run says so (AGENT-12,
REQ-agent-244 / REQ-agent-312). The turn cap is per execute attempt, so verify
retries keep working; `stopReason` is `turn-cap` only when the final attempt
hit it, and the stop reason reaches Discord only as `stopped=…` plumbing,
never the channel body. Every `runTask` has an idle watchdog bound to it: run
events, tool output and verify-lane output feed it; a model call, a
`delegate` / `council` worker and an Approve-card wait hold it (each bounded
by its own cap or expiry); when it fires, the run's abort kills tool and
verify-lane process trees and the run ends failed (never cancelled, never
done) with `stopReason` `idle-timeout` and the one-line `error`. A step that
ignores the abort is waited for at most `IDLE_STOP_GRACE_MS` after the
watchdog fires; then the run ends the same way anyway (its changes said to
be not verified) and that step's later events are dropped, so a stalled run
always stops. The caller's own abort still wins (cancelled). No value turns
either limit off. A `delegate` worker a limit stopped returns its
`stopReason` to its lead.

A failed run names why in harness text only (DISCORD-3.b, AGENT-9,
REQ-agent-032): `runTask` sets `error` on a failed result from the attempt's
`failureReason` (the no-provider notice, or `modelCallFailedLine` of the
chain's last failure — status and host, never the provider's reply body), and
to `verifyGaveUpReason` / `VERIFY_RERUN_FAILED_REASON` when verify fails for
good; never model or tool text. A spend-cap stop is not a failure and carries
none (its `SPEND_CAP_SUMMARY` and ask are unchanged, SAFE-14.a).

A failed model hands the run to the next configured one and says so (AGENT-11,
REQ-agent-080): one `ModelChain` per `createTaskExecute` (every surface's
`task run`, workers included), shared by every round and attempt; only an
HTTP error, a network error, a timeout or a malformed reply moves it on, at
once and once per failure; a spend-cap stop (`SpendCapRefusal`), the run's own
abort, a Deny or a lapsed card never does, so a cap stop asks and never routes
around the cap. Each failover is one Text event, one `onModelFallback` call
and a part of the closing note on every later summary of the run; reasons are
fixed short texts, never provider output.

A repeated failing call is steered, then asks (AGENT-16, REQ-agent-086): one
guard per `createTaskExecute` (every surface's `task run`, workers included)
counts `ok: false` results per `callSignature` across the run's attempts; a
`changedState` result resets every count and a call's own success resets its
own. The steer follows the whole tool result (outside any SAFE-12 fence,
error quoted scrubbed and capped, except a worker result fenced for its
injection hit, whose error is never quoted outside the fence); the call that
is not run ends the attempt
with `repeatedFailureAsk`, whose question names only an offered tool (else
`(unknown tool)`), never error text. The ask is never given before the model
has seen the steer in its own conversation.

A plan-only or empty "Done." reply that changed nothing is nudged once
(AGENT-17, REQ-agent-087): only in `runToolLoop`'s final-reply branch, after
the MEMORY-9 follow-up, and only when `stallKind(lastText, taskText)` matches
(the text that would stand: this reply, or the attempt's last earlier text
when this one is empty), the tier is not read, SAFE-13 has not tripped, the
round's catalog offers an `isStateChangingTool` tool and `nothingChanged`
holds (no `changedForStall` result and no tool whose edits no result
reports in any attempt of the run — the stall guard remembers both — and an
empty real diff where there is a git tree; an unreadable diff counts as a
change; the diff is read only for a reply that stalls). The nudge is one user message to
the same conversation and model chain, never uses up a tool round, and comes
at most once per `createTaskExecute`; a later stall stands with one
`[operator] AGENT-17` line (no ask, no error). `stallKind` is null for any
"?", code fence, "let me know" or offer, decline, toy / demo / joke or
deferral, for answers and social replies, and for a plan when the task text
asks for one or for nothing to change yet. The model chain (AGENT-11), the
spend guard (SAFE-8/14/15) and the AGENT-16 repeat guard are unchanged.

The persona sets tone only and the rules win (REQ-agent-069, PERSONA-3): the
persona block is always first in the system prompt and every rule
(`PERSONA_RULES_SYSTEM_INSTRUCTIONS`, SAFE / role / memory / ask
instructions, then project instructions) follows it, whether or not a persona
loaded. The persona is read from Corvidinho's own checkout at `HEAD`, never
from the run's project folder or an uncommitted working-tree copy, so a run
cannot plant a persona for later runs. A persona problem never stops a run.

The verify gate can't be skipped (AGENT-14, REQ-agent-003): no option,
config key or CLI flag turns it off, and chat, WATCH, schedules, `/work` and
delegate workers all reach it through `task run`. The real git diff decides
what changed (AGENT-15, REQ-agent-085): the snapshot is always taken, any
path the run changed on disk since its baseline (git status, `HEAD` moves,
content of already-dirty paths) is in `filesChanged` (up to
`WORKSPACE_DIFF_MAX_FILES` per run) and forces the verify lane, and a path a
tool claims but git does not show is not listed yet still forces the lane.
A run ends `done` without verify only when nothing changed, with one
`Verify gate: no changes, nothing to verify.` note. A diff git cannot read
after a good snapshot verifies anyway (fail closed). In a talk worktree whose
last run ended blocked, failed or cancelled (or died), the baseline is the
talk branch's merge-base, so every edit since the talk started, including
ones an earlier attempt left, is verified before done (AGENT-15.a,
REQ-agent-015); a new talk worktree and a run after a `done` start from
their own snapshot, and the caller's own checkout keeps the run-start
baseline. A delegate or council worker (`CORVIDINHO_DELEGATE_DEPTH` above 0)
in its lead's talk worktree never takes or writes the marker and keeps its
own run-start baseline; the lead's gate covers the combined change.
'Verified' requires that tests ran and none were deleted (AGENT-15,
REQ-agent-185): a passing lane counts only when its output has a recognised
test summary (`bun test`, jest, vitest, `cargo test`, pytest, `go test`)
with at least one executed test (skipped and todo don't count), and no test
at the baseline is gone (removed or retitled, even a conditional or skipped
one) or runs less than it did (a running test made conditional, `.skip`,
`.todo`, skip-decorated, `#[ignore]` or silenced by `.only`; a conditional
one turned off) by name across the repo root; otherwise the attempt is a failed verify
whose note names what is missing or which tests, with no opt-out. With no
git snapshot the names come from a bounded walk of the cwd's test files at
run start; a walk or a baseline that cannot be read fails closed. The diff is read-only git plus in-process hashing: it never writes
the index or objects (the talk's verified marker lives in the worktree's own
git dir).
With no git snapshot (a non-git cwd, or an unreadable start snapshot), a run
that called a tool whose edits no result reports (a Fledge command, or the
shell / a runner, a local run's `delegate` whose worker could have run an
allowlisted Fledge command, or a `delegate` whose worker left no result frame,
so whatever it edited was reported nowhere) verifies anyway, with one `Text` note per attempt
naming the tools; other non-git runs keep tool-reported files only
(REQ-agent-502).

A task run offers the model a dangerous tool only when the run's allowlist
names it (SAFE-1 consent, CLI-3), `shell-exec`, the language runners and the
Fledge core runs (`fledge-lanes-run`, `fledge-run`) only with the attempt's
SAFE-3.a grant (the owner's own chat, `/session start`, `/work` or ask
answer, inside that talk's own worktree, or a local `task run` at the top of
the worktree it made for itself, REQ-agent-503 / REQ-cli-681), and never to a
non-ADMIN role session: the role,
tier and SAFE-9 filters apply first, and every runtime gate still runs
(REQ-agent-501). An empty allowlist gives the same catalog as before.

A verify retry works from the failing step's output, not the start of the
lane log (REQ-agent-002, AGENT-4.a). The runner's output is stdout then
stderr, so steps that passed first (a typecheck, a `--help` smoke) can fill
the head. Output within `VERIFY_FEEDBACK_MAX_CHARS` reaches the model whole;
over it, colour escapes are dropped, the feedback names the failing step
(fledge's `Lane '<lane>' failed at step N (<name>)` line; a parallel step is
`parallel(<tasks>)`) and carries that step's output from its `Running task:
<name>` marker (a parallel step's `Running parallel:` line) when it fits,
else its error / fail lines and the end of the log. Error lines that report a
failure (`error:`, `Expected:`, `(fail)`, `file(1,2): error TS…`, `✗`) are
kept before lines that only mention one (`… marked failed`), so a step's
console chatter cannot crowd its failure out; first ones first, passing-test
lines left out, printed in log order. It is never longer than the cap and
never cut inside a surrogate pair, including where the error-line scan stops
(the start of the kept end of the log).

The default verify runner spawns fledge with the parent's env minus the
delegate worker drop list (`DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`,
`CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_ACTING_*`) and the LLM API keys
(`CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`OPENROUTER_API_KEY`): tests the agent wrote never see
operator secrets (SAFE-6).

The verify lane's `spec-check` task runs `specsync check` at the CI Spec Sync
Action's strictness: `--require-coverage` equal to the Action's
`require-coverage` input in `.github/workflows/spec-sync.yml`, and `--strict`
only when the Action sets `strict`. A tree the CI Spec Sync check rejects, such
as one with an unspecced source file, fails the lane and never reaches
verified=true (SPECSYNC-2/7, REQ-agent-005).

Tool-loop system prompt SHALL include trust-inject / memory-store /
memory-recall-before-ignorance / never-invent rules. OpenAI tool argv
descriptions for `memory-*` commands SHALL include concrete examples.

NDJSON frames never carry raw tool arguments; ToolCall `argsSummary`, Text,
ToolResult detail and VerifyResult output are SAFE-6 scrubbed and capped.
AgentEvent stays frozen (usage is a separate callback), so `task run --json`
events are unchanged.

No spend cap set (neither the total nor a provider cap) means no spend
behavior: the fetch is untouched and the DB is not opened. With a cap, a
provider call is never sent unless its estimate was reserved under the total
cap and its provider's cap in one IMMEDIATE transaction; that estimate counts
the model's worst-case reply (its listed maximum output, else 128000 tokens;
AUTONOMY-8.a, REQ-agent-298), so a call whose long reply could pass a cap
asks first, and no request ever carries `max_tokens` (replies are never cut
short); each cap warns and
stops on its own (SAFE-15), and a cap stop never falls back to another model
(AGENT-11). A call that would pass
the cap, and every call while the cap value is invalid or the ledger is
unavailable, is not sent: the attempt ends with a `spend-cap` ask and the run
is `blocked` (never `done`, never retried, verify skipped) — the runner never
spends past the cap and never counts an unpriced model as free. A call to an
unpriced model under a cap that covers it is sent only on the owner's
unknown-price card (Approve plus the code, one call each) and recorded
`unknown`, never as $0; owner spend lines then read `$X + unknown`
(SAFE-16.a, REQ-agent-199). There is no price override. The 80% warning is recorded once per crossing across
processes (`spend_alerts`, same IMMEDIATE transaction as its check): it
re-arms when spend is seen back under 70% of that cap value (by a settle or
by the next call's reservation), 24 h after the last warning, or for a new
cap value — the 70–80% band keeps spend hovering at 80% from warning on every
call. Recording is separate from delivery: a recorded warning stays pending
(`delivered_at` NULL) until a surface that can reach the owner claims it, so
a run whose surface cannot show it (WATCH, daemon, delegate worker) never
uses it up. Money is integer micro-USD, rounded up.
With an owner configured, a priced call past a cap is held for the owner's
`spend` Approve card instead (SAFE-8, AUTONOMY-8): it is sent only on an
approval (Approve plus the SAFE-19 one-time code, recorded by the bridge's
card engine) that the waiting run uses once, and then only that call, at
the estimate the card showed (`reserveApproved`); every later call past a cap
raises a new card (SAFE-8.a). One card per paused call and at most one open
per run; another run's open card never refuses this one. A deny, no answer
before the card lapses, a late code, the call's abort signal (a stop or its
request timeout), an approval whose call would by then pass a cap the card did
not show, or no owner configured is a no (SAFE-20): nothing is sent
or recorded, and the stop is a `SpendCapRefusal` — never a model failure,
even when the request timeout ended the wait. The wait line is a Text event
without amounts; the card records its waiting process so a killed run's card
closes as a no. Invalid-setting and ledger stops never raise a card; a covered
unpriced model's call asks on its own unknown-price card (REQ-agent-199).
Autonomous mode is off unless the project `fledge.toml` sets
`[corvidinho.autonomous] enabled = true` (AUTONOMOUS-1). Autonomous extras are
left out of the tool catalog unless the session is allowed (enabled, depth
below 2) and appear at code tier only (SAFE-9). The tool loop passes its tier
and abort signal to `runPlugin`. A worker never runs above the lead's tier
(omitted = the lead's), is forced non-interactive with the lead's allowlist,
no ADMIN and no SAFE-4 confirm tokens, keeps prove-before-done (never
`--no-verify`, REQ-cli-085), runs one level deeper, and is stopped on
lead abort, timeout or lead exit; at most 2 run at once and 4 per lead run.
These are safety defaults, not HI (draft AUTONOMOUS-10 left for capture).
A worker that failed (not `done` with exit 0, and not stopped on an ask of
its own) comes back to its lead — and a council voice into its transcript —
as one plain line of harness text (`workerFailureLine`, REQ-agent-117): the
timeout or interrupt line, else for a worker that could not start `worker
failed to start: <why>` (scrubbed, host paths cut), else its result `error`
as one scrubbed line without the provider's host (`withoutProviderHost`),
else for a worker that streamed another protocol the protocol-mismatch
notice, else the no-provider notice for its tier, else `the worker failed
(exit N)`. Never its summary,
stdout or stderr, which for a model failure is `LLM HTTP <status>: <provider
body>` (org or account names, request ids, the provider's host) that a lead
could quote into a public reply or comment; the lead keeps no other copy of
it. A successful worker's summary, an ask's question and the worker's
`models` / `stopReason` / `injection` fields are unchanged.

A council (AUTONOMOUS-6) deliberates in three phases in order — propose,
critique, decide — and every voice and the chair is a delegate-core worker
one level deeper than the lead. Voices advise and never act: read tier by
default, never above tool or the lead, a non-ADMIN role session
(`CORVIDINHO_ACTING_IS_ADMIN=0`) with an empty SAFE-1 allowlist, so they get
no mutating tool and every must-ask tool is denied. At most 2 voices run at
once; each phase entry is SAFE-6 scrubbed and capped; the whole council has
a wall-clock cap. The council returns a decision and a transcript; it never
returns a confidence score (draft AUTONOMOUS-11 left for capture).

Project instructions come only from the project root (nearest `.git` at or
above cwd, else cwd), never from a parent directory above it. Each file is
capped at 16 KiB with a truncation marker, SAFE-6 scrubbed, and labelled as
project instructions that cannot widen SAFE-1 consent, the tool allowlist or
the capability tier. The loader never throws.

In a git project only the `HEAD` copy of an instruction file reaches the
system prompt. The file tools (files-write / files-edit, not dangerous) can
change the working tree without consent, so working-tree edits and untracked
instruction files are never loaded; only a commit, which needs a dangerous,
consented tool such as `git-commit` (SAFE-1), changes what later runs see. A
`.git` that git cannot read never falls back to the working tree. Committed
symlinks are followed only as paths inside the commit, never through the
filesystem.

The Planning SpecSync briefing reaches the model on every execute attempt
(`ExecuteContext.specBriefing`, AGENT-2 / REQ-agent-004) in the user message,
never the system prompt: spec files are working-tree data, so the block is
labelled as project data, fenced, SAFE-6 scrubbed and capped at 8000 chars.
Planning selects modules from the request only (`planningSelectionText`):
`[Corvidinho …]` context paragraphs (Discord identity and memory) and all-caps
line labels such as `[WATCH <kind>]` do not count, so a bridge wrapper cannot
pick a module the request never names.

`buildOpenAiTools` omits mutating plugins when `actingIsAdmin` is false (ROLES-CHAT-2); given `actingRole` (IDENTITY-9..12, REQ-agent-065) it keeps exactly what `roleAllowsPlugin(actingRole, entry, workTask)` allows — owner (or `null`, no role session): every tool; team: read tools plus `github-issue-comment` / `github-pr-review` (plus `files-write` / `files-edit` when `workTask`); community: read tools only. `createTaskExecute` resolves the role from env via `resolveActingRole` on every attempt (null outside a role session) and passes it with `workTask` (`CORVIDINHO_ACTING_WORK_TASK`); only the owner or no role session discovers Fledge plugin commands.

When the caller's role does not allow the plugin at the call (a role session,
re-checked per call like `runPlugin`, ROLES-CHAT-6 / IDENTITY-12), the tool
loop answers a not-offered registered
mutating / dangerous plugin with the role refusal `runPlugin` gives (`Denied:
plugin "<name>" is not allowed for your role (ROLES-CHAT-3).`, exit 2) instead
of the catalog refusal, and never runs it; an unregistered name keeps the
catalog refusal. Once any call in a task run gets exactly that role refusal,
every summary of that run ends with `(not allowed for your role)` once,
exported as `ROLE_REFUSED_SUMMARY_NOTE` / `withRoleRefusalNote` from
`src/agent/execute.ts` (the note is defined in `src/agent/task-summary.ts`);
`resultFrame` and `chatBodyFromTaskResult` keep that closing note when they cap
a long summary (`clipKeepingRoleNote`, REQ-agent-333). Event names and progress
lines stay as they are.

A reply whose run used a tool whose provider's terms ask for attribution
ends with that provider's short visible line (REQ-agent-318, PLUGIN-7, Leif's
go on #318): once an offered tool in `REPLY_ATTRIBUTION_BY_TOOL` returns
`ok` in a task run (a `web-search` that Brave answered), every summary of that
run ends with its line ("Search by Brave") once, as a closing paragraph after
the model fallback note and before the role note (`withReplyAttribution`,
applied by `createTaskExecute` after each attempt). A failed, refused or
stopped call adds nothing, and a run with no such call gets no line: a line
the model's own answer ends with is dropped on every run before any closing
note goes on (`withoutReplyAttribution`), so only an earned line shows, once.
The line
is never part of a tool message, the untrusted web fence or any other request
the model gets, and it carries nothing else (no amount, no cap, SAFE-14.a); a
`spend-cap` ask's question (the owner's spend DM) never carries it.
`closingNotesTail` recognises it, so `resultFrame`, `chatBodyFromTaskResult`,
the post clips and Discord's split (`splitDiscordMessage`) keep it whole at
the end on every surface (owner and team replies, `/session start`, `/work`,
the owner's schedule posts, the CLI's `task run` output).

An abort stops the work, not only the bookkeeping (AGENT-3, REQ-agent-244):
the default verify runner runs fledge in its own process group and an abort
kills the lane's whole tree (then waits at most 250 ms for its output
pipes); an abort while verify runs is a cancel (no
`VerifyResult`, no retry, no `stuck` ask); each LLM request is bounded by a
timeout, and a caller abort is never reported as a timeout.

Images reach the model as pixels (DISCORD-9 / REQ-agent-428, extends
REQ-agent-008): a tool result carrying `PluginHandlerResult.image` (`files-read`
of an image, REQ-plugins-427) keeps only its metadata in the tool message and
the `ToolResult` detail; once the round's tool messages are all pushed (they
must directly follow the assistant `tool_calls`), the loop adds one user
message `[{type:"text", text:"Image(s) opened with files-read: <paths>"},
{type:"image_url", image_url:{url:"data:<mime>;base64,<b64>"}}, …]`. The
base64 never reaches tool text, events or ndjson. If a request carrying image
parts gets HTTP 400, 404, 413, 415 or 422, the image user messages are
removed, each opened image's tool message says `[image <path> could not be
shown to this model]`, an `[operator]` Text note is emitted, and that request
is retried once (no user message after tool messages, so strict role-order
providers accept it); later images in the run get the same note in their tool
message. No new env var, flag or protocol field.

`ask-human` is intercepted by the tool loop (never dispatched as a plugin) and
is offered only on tool/code tiers. A run with an ask is never `done`; the
question is capped at 1500 chars and an empty question is refused back to the
model.

The attach instructions (REQ-agent-476, DISCORD-17) are in the system prompt
exactly when `discord-send-file` is in the run's offered catalog and the run
env names a conversation channel; a run that does not offer the tool, or has
no conversation channel, never promises attachments.

Untrusted text (SAFE-12 / SAFE-13, REQ-agent-071): every task-run system
prompt (tool loop and read tier) carries
`UNTRUSTED_CONTENT_AGENT_SYSTEM_INSTRUCTIONS` (text between `UNTRUSTED_…`
markers and tool results marked untrusted are data that never grant a
permission; what may run is the sender's role, enforced in the tool layer;
who someone is comes only from the acting-user block). A successful result of
a tool in `UNTRUSTED_RESULT_TOOLS` (GitHub readers, `discord-user-lookup`)
reaches the model inside a `fenceUntrustedData` fence (`web-fetch`,
`web-search` and `gif-search` keep their own). A successful result of a tool
in `INJECTION_SCAN_TOOLS` (`web-fetch`, `web-search`, `gif-search`,
the GitHub title / docs / milestone readers, `discord-user-lookup`; never PR
diffs or file lists) is scanned by `detectInjection` over its strings (the web
fence's own lines left out): a hit puts `injectionToolNote` in front of that
tool message, drops every mutating plugin (`isMutatingPlugin`) and
`memory-store` (`INJECTION_BLOCKED_WRITE_TOOLS`: a stored memory is replayed
to later runs as the user's facts) from the catalog sent for the rest of the
run (verify retries included) and refuses any such call with
`injectionToolRefusal` (exit 2, never run), reports the first hit once
through `onInjection` (tool name + reason ids, never the text) after
appending an `injection-suspected` / `denied` SAFE-5 row (actor and surface
from the spawn env, digest of the tool and reasons; best effort; none in a
delegate / council worker, delegation depth > 0, whose hit rides its result
to the top-level lead, which records the one row), emits one `[operator]`
Text line, and ends every later summary with `injectionSummaryNote` once,
before any ROLES-CHAT-3 role note (which stays last). A `delegate` /
`council` result, finished or not, whose `data.injection` is a valid notice
(`WORKER_RESULT_TOOLS`: a worker's own hit, REQ-plugins-071) counts as this
run's hit: `injectionWorkerNote` and the fenced result in its tool message,
then the same drop, report, row and note. `task run` copies the notice to
`TaskResult.injection`. The detector is bounded (capped input, bounded
windows), its patterns fold look-alike letters and strip invisible characters
first, and they aim at orders to the model: a speaker's own "ignore my
previous …", a rules file, a question about a token in code, "list your
instructions for …" or a browser's developer mode do not count.

Repo ways (AGENT-18, REQ-agent-518): at planning `runTask` reads the ways
the repo works — a SpecSync change workflow (`.specsync/sdd.json` with
`enabled: true`), hi criteria (a `hi/*.md` with `hi:` front matter) and Trust
(`.trust.toml`) — from the session base (`repoWaysBase`: the merge-base with
the remote's default branch, else HEAD), HEAD and the working tree, each flag
the union, names what it found in one Text line (none when nothing) and
passes `repoWays` to every attempt; the tool loop appends one fixed prompt
block for them (`renderRepoWaysBlock`: open and answer a SpecSync change for
the edits, never approve, review or finalize one; in a hi repo never invent
criteria and cite captured hi ids). The read tier sends no block. Before the
lane runs, the SpecSync policy — the start scan merged with a scan now
(enabled or required in any tree counts, meaningful paths the union, ignored
paths the intersection, an unparseable `sdd.json` fails closed) — is checked:
when it requires a change for meaningful files, every path of the run's real
diff (tool-reported paths with no git snapshot) it counts as meaningful must
be in an open change's `affected_paths` (a file, or a dir prefix) or in a
change archived in the same diff; otherwise the attempt is a failed verify
whose `SpecSync gate:` note (the paths, and how to open a change) is the
retry's whole feedback, no lane runs, and after the retries the run fails
with the stuck ask as for any failed verify. A diff that cannot be read fails
closed the same way. Deleting or committing away `sdd.json` during the run
does not switch the check off.

hi guard (AGENT-18 hi clause, guard half, REQ-agent-520): in a repo that
uses hi (the start scan merged with a scan now), the agent never changes the
criteria itself. Before the lane runs, everything under `hi/` is compared
with the session base (`hiChangesSince`: tracked paths that differ from the
base commit, committed or not, and untracked ones, ignored files included;
git never asks a configured fsmonitor, and an assume-unchanged or
skip-worktree `hi/` entry whose file is not its index blob counts too; for a
run with no git session base, hi/ as it was at planning, `hiSnapshot`). Any difference — a criterion added, removed or reworded, a
retired entry changed, or any other `hi/` file (intent prose, notes) — made
by this run or left by an earlier one, is a failed verify whose `hi guard:`
note (what changed, that no run can make an approved capture yet, and to undo
a hi/ change this run made but leave one that was already there for the
owner) is the retry's feedback, with no lane run; after the retries the run fails with the
stuck ask. What cannot be read fails closed. No run can make an approved
capture yet (drafting criteria and the capture card come later), so every
`hi/` change blocks. The tool loop's hi block says the file tools refuse
`hi/` and that any `hi/` change blocks done and the PR; the run's own
`github-pr-create` holds to the same comparison (REQ-plugins-521). A run that
changed nothing is not checked. The guard runs only inside Corvidinho runs
and `/work`'s PR step: a capture made with the `hi` CLI outside any run that
is already in the session base never blocks, but a `hi/` commit on the run's
own branch that is not yet on the remote's default branch counts whoever
made it, since the run cannot tell.

Own SpecSync change (AGENT-18.a, REQ-agent-519): `runTask` keeps a per-cwd
ledger for the run. `specsync-change-new` records the ids its own spawn added
(listing `.specsync/changes/*/state.json` before and after, never model
text). Right after a green, evidence-backed lane, for each recorded change
still open: outside Corvidinho one Text line says it stays open for a human
to approve, review and finalize; on Corvidinho (`isCorvidinhoProject`: the
cwd shares the git common dir of the checkout this code runs from and its
`origin` is github.com/CorvidLabs/Corvidinho — read from disk, never a flag)
the ledger is marked verified only while `runTask` runs
`specsync-change-approve <id>` then `specsync-change-finalize <id>` through
`runPlugin` (non-interactive, the run's `CORVIDINHO_ALLOWLIST`: role gate,
SAFE-1, must-ask gate and SAFE-5 all apply), one Text line per outcome; a
refused or failed step leaves the change for a human and the run stays
verified. When a step ran, the lane (with the AGENT-15 evidence verdict) runs
again over what it wrote; a failure there ends the run failed with no retry.
A change the run did not open is never touched.

## Behavioral Examples

### Scenario: an edit in a SpecSync repo with no change for it

- **Given** a repo whose `.specsync/sdd.json` enables the change workflow and requires a change for `src/`, and a run that edits `src/app.ts` without opening one
- **When** the attempt ends
- **Then** one `SpecSync gate:` note names `src/app.ts` and says to open a change with `specsync-change-new`; no lane runs; the retry gets the note as its feedback; once a change's `affected_paths` covers the path, the lane runs and the run is verified (REQ-agent-518)

### Scenario: a run changes a criterion in a hi repo

- **Given** a repo whose `hi/agent.md` has `hi:` front matter, and a run that rewords `AGENT-19` there through the shell while editing `src/app.ts`
- **When** the attempt ends
- **Then** one `hi guard:` note names `criteria AGENT-19` and says no run can make an approved capture yet; no lane runs; the retry gets the note as its feedback; once `hi/` is back as it was at the session base, the lane runs and the run is verified (REQ-agent-520)

### Scenario: its own change on Corvidinho once verify is green

- **Given** a run on Corvidinho's own checkout that opened change `bump-x` with `specsync-change-new`, and `CORVIDINHO_ALLOWLIST` naming `specsync-change-approve` and `specsync-change-finalize`
- **When** its verify lane passes with tests shown to have run
- **Then** it runs `specsync change approve bump-x --actor corvid-agent`, then `change check`, `change review --reviewer corvid-agent` and `change finalize`, says so in one Text line, runs the lane again and ends verified; in any other repo it only says the change stays open for a human (REQ-agent-519)

### Scenario: System prompt mentions memory-store

- **Given** tool-loop execute is constructed
- **When** the system message is built
- **Then** it embeds MEMORY_AGENT_SYSTEM_INSTRUCTIONS with argv example for
  memory-store

### Scenario: a resumed talk verifies the edit its blocked run left

- **Given** a talk worktree where the last run edited `app.ts` and ended blocked on an ask
- **When** the resumed run only answers and changes nothing
- **Then** its baseline is the talk branch's merge-base, `filesChanged` is `["app.ts"]`, the verify lane runs, and the run is `done` only if it passes (AGENT-15.a, REQ-agent-015)

### Scenario: the owner lets one call past the spend cap

- **Given** `CORVIDINHO_DAILY_SPEND_CAP_USD=1`, $0.999 spent in the last 24 h and a configured owner
- **When** the run's next `gpt-4o` call would pass the cap
- **Then** the call is held and a `spend` card (money) is recorded with action `send one model call to gpt-4o via <host>`, target `total` and that call's estimate as amount; the run emits `[operator] AUTONOMY-8: waiting for the owner's OK on an Approve card with the one-time code …` (no amounts); once the owner approves with the code the call goes out once, recorded at that estimate; the next call past the cap raises a new card; a Deny or a lapse sends nothing and the run ends `blocked` on a `spend-cap` ask (REQ-agent-198)

### Scenario: a call whose worst-case reply would pass the cap asks first

- **Given** `CORVIDINHO_DAILY_SPEND_CAP_USD=0.10`, nothing spent in the last 24 h and a configured owner
- **When** the run's next `gpt-4o` call would go out (request ~$0.0001, worst-case reply 16384 tokens ≈ $0.1638)
- **Then** the call is held and a `spend` card (money) is recorded at that worst-case estimate before anything is sent; approved with the code it goes out once, unchanged (no `max_tokens`), and afterwards counts the provider-reported usage; with no owner the run ends `blocked` on a `spend-cap` ask and nothing is sent (AUTONOMY-8.a, REQ-agent-298)

### Scenario: an unpriced model under a cap asks on a card showing the amount as unknown

- **Given** `CORVIDINHO_DAILY_SPEND_CAP_USD=5`, a configured owner and a model with no known price
- **When** the run's next call to it would go out
- **Then** the call is held and a `spend` card (money) is recorded with title `Spend at an unknown price — asks first (SAFE-16.a) · from <surface>`, target `total` and amount `unknown (no known price for this model; never counted as free)`; approved with the code, that one call goes out and is recorded `unknown` (the window's `unknownCalls` 1, owner lines `$X + unknown`); the next such call asks again; a Deny or a lapse sends nothing and the run ends `blocked` on the unpriced `spend-cap` ask naming the card (REQ-agent-199)

### Scenario: a run deletes a test and the lane still passes
- **Given** a git project whose `tests/math.test.ts` has `adds numbers` and `keeps order`
- **When** a run edits `app.ts`, drops `keeps order` (or turns it into `test.skip`, or adds a `.only` beside it) and the verify lane passes with a `bun test` summary
- **Then** the run is not verified: one note names `"keeps order" (tests/math.test.ts)`, the retry gets it first, and a retry that restores the test ends `done` verified; a renamed file or a test moved to another file keeps its name and is verified (AGENT-15, REQ-agent-185)

### Scenario: a lane that shows no test ran
- **Given** a project whose verify lane prints no test summary Corvidinho recognises, or only skipped tests
- **When** a run changes a file and the lane passes
- **Then** the run is not verified and the note says the verify lane printed no recognised test summary (or that no test ran); there is no key to turn this off (AGENT-14 / AGENT-15, REQ-agent-185)

### Scenario: a chat turn that changed nothing

- **Given** a run whose real git diff is empty and whose tools claimed no change
- **When** the attempt ends
- **Then** the run is `done` with `verifySkipped=true` and one `Verify gate: no changes, nothing to verify.` note; no switch could have skipped a run that did change files (AGENT-14, REQ-agent-003)

### Scenario: delegate hidden until the project opts in

- **Given** a project whose `fledge.toml` has no `[corvidinho.autonomous]`
- **When** a code-tier task run builds its tool catalog
- **Then** `delegate` is not offered, and a model call naming it is refused

### Scenario: community user's model invents a file write

- **Given** a non-ADMIN role session (`CORVIDINHO_ACTING_IS_ADMIN=0`) at code tier
- **When** the model calls `files-write`, which its catalog does not offer
- **Then** the call gets the `not allowed for your role` refusal, nothing is
  written, and the run summary ends with `(not allowed for your role)`

### Scenario: lead delegates a subtask

- **Given** `[corvidinho.autonomous] enabled = true` and a code-tier lead
- **When** the model calls `delegate` with `--skill specsync --task ...`
- **Then** a worker `task run` runs non-interactive at depth 1 and its summary and filesChanged come back in the tool result for the lead to synthesize

### Scenario: a delegated worker's model call fails

- **Given** a code-tier lead whose `delegate` worker's model answers 429 with an org name and a request id
- **When** the worker's run fails
- **Then** the lead's tool result says `worker (tier code, depth 1) did not finish (state failed, exit 1):` and `The model call failed (429 Too Many Requests)` — no org name, request id, provider host or `LLM HTTP` body (REQ-agent-117)

### Scenario: lead convenes a council

- **Given** `[corvidinho.autonomous] enabled = true` and a code-tier lead
- **When** the model calls `council` with `--question ...` (3 voices by default)
- **Then** 3 read-tier voices propose, each critiques the proposals, a chair decides, and the tool result carries the decision and a bounded transcript

### Scenario: the model looks at an attached image

- **Given** a tool-tier run whose model calls `files-read` on a PNG under the session cwd
- **When** the next chat/completions request is sent
- **Then** it carries the small tool message and, right after it, one user message with an `image_url` part holding `data:image/png;base64,…` of the file

### Scenario: a model without vision refuses the image

- **Given** the request carrying an image part gets HTTP 400
- **When** the loop handles it
- **Then** it drops the image message, puts `[image <path> could not be shown to this model]` in that image's tool message, retries once, and the run completes with the model's reply

### Scenario: the owner asks for a PR review with the tool allowlisted

- **Given** `CORVIDINHO_ALLOWLIST=github-pr-review` and an ADMIN (owner) run at tool tier
- **When** the task run builds its tool catalog and the model calls `github-pr-review`
- **Then** the tool is offered, the review goes through the GitHub plugin
  (GITHUB-6 repo gate, SAFE-5 audit), and an unlisted `github-issue-create`
  call is refused as not offered; a non-owner run with the same allowlist is
  offered neither (REQ-agent-501)

### Scenario: the persona is in every run's prompt, the rules after it

- **Given** `persona.md` committed at the root of Corvidinho's checkout
- **When** a Discord chat, a schedule, WATCH or a local `task run` spawns a run in any project
- **Then** the system prompt starts with the persona block, then Corvidinho's rules with the PERSONA-3 rules text, then that project's AGENTS.md / CLAUDE.md block; the next run after a committed edit carries the new text (REQ-agent-069)
### Scenario: a fetched issue title tells the model to ignore its rules

- **Given** a tool-tier run that offers `files-write` and calls `github-issue-list`
- **When** an issue title reads like an instruction to set aside the previous instructions
- **Then** the tool message starts with the SAFE-13 note and holds the result inside an `UNTRUSTED_DATA` fence, the next request offers no mutating tool, a `files-write` call is refused and writes nothing, `onInjection` gets `{ source: "github-issue-list", reasons: ["ignore-rules"] }`, an `injection-suspected` row is audited, and the summary ends with the "didn't act on it" note (REQ-agent-071)

### Scenario: no model is configured

- **Given** `task run` with an LLM key but no `CORVIDINHO_LLM_MODEL` (an old key-only setup)
- **When** the run starts
- **Then** the no-provider notice is the first stderr line (text output), no provider is called, and the run ends `failed` with that notice as its summary and no files; there is no `gpt-4o-mini` default and no demo answer (REQ-agent-179)

### Scenario: the model call is refused (DISCORD-3.b)

- **Given** a configured model whose provider answers every call with 401 and a body quoting a key
- **When** `task run --output ndjson` runs
- **Then** it exits 1 and the `result` frame is `failed` with `error` `The model call failed (401 Unauthorized from <host>)`; the body never reaches `error` (REQ-agent-032)

### Scenario: the configured model is retired

- **Given** `CORVIDINHO_LLM_MODEL=ollama:gone-model, ollama:fake-model` and a provider that answers `gone-model` with HTTP 404
- **When** `task run --output ndjson` runs
- **Then** it calls `gone-model` once, then `fake-model`; a Text frame says `[operator] ollama:gone-model failed (HTTP 404); falling back to ollama:fake-model`; the result is `done`, its summary ends with `(model fallback: ollama:gone-model failed (HTTP 404), fell back to ollama:fake-model)`, and it carries `model` `ollama:fake-model`, `usageByModel` and `modelFallback` (REQ-agent-080)

### Scenario: a verify lane hangs and prints nothing

- **Given** `CORVIDINHO_IDLE_TIMEOUT_MS=4000` and a run whose verify lane stops printing and never exits
- **When** 4 seconds pass with no event, tool output or lane output
- **Then** the lane's process tree is killed and the run ends `failed` (exit 1) with `stopReason: "idle-timeout"`, `error` `Stopped: no output for 4 seconds (idle timeout).`, and that line first in its summary (REQ-agent-244)

### Scenario: the model never stops calling tools

- **Given** `CORVIDINHO_MAX_TURNS=2` and a model that calls a tool on every reply
- **When** the attempt has made 2 model/tool rounds
- **Then** it ends with its last prose, the `[operator] Stopped after 2 tool rounds …` event, and — as the run's final attempt — `stopReason: "turn-cap"`: `stopped=turn-cap` in the Discord footer, a plain turn-cap line on WATCH and in the CLI (REQ-agent-312)

### Scenario: the model repeats a failing call

- **Given** a tool-tier run whose model calls `files-read` on a missing file
- **When** it makes the same call a second time, then a third after seeing the steer
- **Then** the 2nd tool result ends with the AGENT-16 harness steer quoting the error, the 3rd call never runs, and the run ends `blocked` with the stuck question `The same files-read call keeps failing with nothing changed in between. How should I proceed?` (REQ-agent-086)

### Scenario: the model only says "Done." and changed nothing

- **Given** a code-tier run (the catalog offers `files-write`) in a project whose tree has not changed
- **When** the model's final reply is "Done." (or only a plan, or empty)
- **Then** the same model gets one `[Corvidinho harness — AGENT-17]` nudge and its next reply is the answer; if that reply stalls again it stands with an `[operator] AGENT-17 … the reply stands` line; a Q&A answer, a social reply, a question, "let me know", a decline or a toy demo is never nudged (REQ-agent-087)

### Scenario: the owner's schedule posts to a channel and the owner says no

- **Given** `CORVIDINHO_ALLOWLIST=discord-post-message` and a run the scheduler spawned for the owner's own schedule (owner stamp, `CORVIDINHO_ACTING_SURFACE=schedule`, session `schedule_<id>`)
- **When** the model calls `discord-post-message` and the owner denies its Approve card (or lets it lapse)
- **Then** nothing is posted, no later call in that batch runs, and the run ends `blocked` with a stuck question naming `discord-post-message`, why it asks, AUTONOMY-10 and the card; the schedule records it and waits; the same deny in the owner's chat goes back to the model instead (REQ-agent-741)

### Scenario: the owner's chat uses the shell in its own talk worktree

- **Given** `CORVIDINHO_ALLOWLIST=shell-exec`, a code-tier run spawned by the bridge for the owner's chat message (`CORVIDINHO_ACTING_SURFACE=chat`) in the talk worktree made for its session
- **When** the model calls `shell-exec`
- **Then** the tool is offered and runs in that worktree; a prod command (`kubectl get pods`) still waits for the owner's Approve card and a deny runs nothing; the same run in the main checkout, another talk's worktree, for a team member, on WATCH or a schedule, in a delegate worker or from a local CLI run outside the worktree it made for itself is not offered it, the call is refused and one `[operator] SAFE-3.a` line says why (REQ-agent-503)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Verify exhausted | state failed, verified=false, summary includes verifier output, `ask` reason stuck, `error` `Verification failed after N retries` (REQ-agent-032) |
| Model call fails on the last configured model (HTTP, timeout, network, malformed) or no provider is configured | state failed; `error` is `modelCallFailedLine` (status / kind and host only) or the no-provider notice (REQ-agent-032) |
| Verify lane log over 4000 chars (passing steps such as the `--help` smoke fill its head) | the retry gets the failing step's name, its output (or its error lines and the end of the log) within 4000 chars, never the start of the log (REQ-agent-002, AGENT-4.a) |
| Edit no tool reported (code-tier shell-exec, delegate worker, commit through a shell) | the real git diff adds the path to filesChanged; verify runs; done only on a pass (REQ-agent-085) |
| A tool claims a path git does not show (gitignored, nested repo, nothing written) | not listed in filesChanged; one note names it; verify runs anyway (REQ-agent-085) |
| Path dirty before the run and left untouched, or gitignored and unclaimed | not counted; with nothing else changed the run ends done with the "no changes, nothing to verify" note (REQ-agent-085 / REQ-agent-003) |
| Project fledge.toml sets `[corvidinho] verify_before_complete = false` | ignored; the gate runs as always (AGENT-14, REQ-agent-003) |
| Talk worktree whose last run ended blocked / failed / cancelled or died | baseline is the talk branch's merge-base: its edits are verified before done; one carried note; a base git cannot find verifies anyway (REQ-agent-015) |
| Cwd not in a git work tree, or start snapshot unreadable | tool-reported filesChanged only, as before (REQ-agent-085); if the run called a Fledge command (or the shell / a runner, or a local run's `delegate` with a Fledge plugin command allowlisted, or a `delegate` whose worker left no result frame), verify runs anyway with a `Verify gate: no git working tree to diff` note (REQ-agent-502) |
| Dangerous plugin the run's allowlist does not name | not in the catalog; a model call to it is refused as not offered (REQ-agent-501 / REQ-agent-128) |
| The task names a plugin or asks for a GIF that this run does not offer | summary is the concrete gap (not installed / not allowlisted / not configured / role / tier) plus only HI ids and open PR numbers a lookup returned; no model call; no `ask`; no invented provider (REQ-agent-742) |
| The same ask when a candidate tool is already offered | the model still runs; a vague install question is steered back to that tool instead of a clarify ask (REQ-agent-742) |
| Scheduled run (`schedule_*` session), even the owner's, whose allowlist names a Fledge plugin command | no Fledge discovery, so the command is not offered and fledge is never spawned (REQ-agent-741) |
| Scheduled run: a must-ask call the owner denies, lets lapse, or denied before (`denied` / `expired` / `resent`) | nothing done; the run ends `blocked` with the `mustAskRefusedAsk` stuck question naming the tool, why, rule and card, verify skipped (REQ-agent-741) |
| `shell-exec`, `node-exec`, `python-exec`, `cargo-exec`, `fledge-lanes-run` or `fledge-run` named in the allowlist, and the SAFE-3.a gate refuses the attempt (not the owner, a surface other than chat / ask / session / work, WATCH, a schedule, a delegate or council worker, a local CLI run with `--here`, outside a git repo or not at the top of the worktree it made for itself, a run with no role session that carries a Discord session id or surface stamp, or a cwd other than this talk's own linked worktree) | not in that attempt's catalog; a model call is refused as not offered (the role refusal for a non-owner); one `[operator] SAFE-3.a: … allowlisted but not offered: <why>` Text line per run, never in the reply (REQ-agent-501 / REQ-agent-503) |
| The same, and the gate grants (the owner's own chat, `/session start`, `/work` or ask answer in its own talk worktree) | offered at code tier (never at tool tier); each call still goes through `runPlugin` (role re-check, SAFE-1, the must-ask Approve card for prod, SAFE-5) and the tool's own clamp, SAFE-21 refusals and credential-free env (REQ-agent-503) |
| Git diff unreadable after a good start snapshot | fail closed: verify runs; one Text note says the diff could not be read (REQ-agent-085) |
| Verify lane passes but prints no recognised test summary, or no test ran (all skipped / todo) | not verified: a failed verify whose note names the verify lane (or says no test ran); retried, then `failed` (REQ-agent-185) |
| A test at the baseline was deleted or retitled (even a conditional or skipped one), or a running test was skipped, made todo or conditional, or silenced by `.only`, or a conditional one turned off | not verified: the note names each (up to 10, `"name" (file)`), retried, then `failed`; a renamed file or a moved test keeps its name and passes (REQ-agent-185) |
| Test names cannot be read (baseline git cannot give, a test file over 4 MiB or unreadable, over 2000 changed test files, a non-git walk over 20000 entries) | fail closed: not verified, with a "could not read the test files" note (REQ-agent-185) |
| Real diff of thousands of paths (an install, a branch switch) | at most `WORKSPACE_DIFF_MAX_FILES` join filesChanged, the note counts them all, verify runs; the NDJSON result line stays under the parser cap (REQ-agent-085) |
| Retry after a failed verify changes no files | filesChanged is the union across attempts, so verify runs again; never done unless it passes (REQ-agent-242) |
| No usable provider for the run's tier (no entry, or the kind's key unset) | no provider call; `ExecuteResult.error` with the no-provider notice as summary; state failed, no files, no verify; `task run` exits 1 (REQ-agent-179) |
| The current model fails (HTTP error incl. 404 / 410, network error, timeout, malformed reply) and a next entry exists | the same request goes to the next entry at once; the chain keeps it for the process; Text event, `onModelFallback`, closing note (REQ-agent-080) |
| Every configured model failed | the last model's error is the summary with the note after it; `error: true`, state failed (REQ-agent-080) |
| A call stops at the spend cap, the run is stopped, or a must-ask call is denied or its card lapses | no failover; the cap stop asks as before (the request timeout ending a spend card's wait included), the stop stops, the tool gets its refusal (REQ-agent-080, REQ-agent-198) |
| Provider / HTTP / network failure in execute | `ExecuteResult.error`; state failed, verified=false, summary is the provider error (then the earlier verify output when a verify already failed), `task run` exits 1 (REQ-agent-242) |
| Model calls ask-human | state blocked, verifySkipped=true, `ask` reason clarify, summary `Needs your input: …` |
| ask-human with empty question | ToolResult success=false fed back to the model; loop continues |
| The same tool call (same argv) fails a 2nd time with nothing changed | the call's tool message ends with the AGENT-16 steer (scrubbed error excerpt); the loop continues (REQ-agent-086) |
| That call is made again after the model saw the steer | not run; `ToolResult` success=false with `REPEAT_FAILURE_BLOCK_DETAIL`, one `[operator] AGENT-16` Text line; state blocked with a `stuck` ask naming only the tool (REQ-agent-086) |
| Identical failing calls in one batch, or in a fresh verify-retry conversation | they run and get the steer again; never the ask before the model saw the steer (REQ-agent-086) |
| Final reply is only a plan or a short "Done."-style / empty claim, a state-changing tool was offered, no SAFE-13 trip, nothing changed | one `[Corvidinho harness — AGENT-17]` user message to the same model (no tool round used), one `[operator] AGENT-17 … nudged once` line; its next reply is the answer (REQ-agent-087) |
| It stalls again after the run's nudge | the reply stands; one `[operator] AGENT-17 … the reply stands` line; no ask, no error (REQ-agent-087) |
| The git diff cannot be read (null or throws) when a reply stalls | counted as a change: no nudge (REQ-agent-087) |
| "Done." after a memory was stored (`memory-store` / `memory-forget-me` ok) | counted as a change: no nudge, so nothing is stored twice (REQ-agent-087) |
| A plan-only reply to a task that asks for the plan, or for no changes yet | the plan is the answer: no nudge (REQ-agent-087) |
| AbortSignal fired | cancelled=true (outer loop) or execute returns early mid tool loop |
| AbortSignal fired while verify runs | lane's process tree killed; cancelled=true, no VerifyResult, no retry, no `ask` |
| Aborted lane left an escaped process holding its output pipe | runner stops waiting after a 250 ms grace; cancelled=true |
| HTTP 400 / 404 / 413 / 415 / 422 on a request carrying image parts (model or gateway without vision, image too large) | image user messages removed, each image's tool message says `[image <path> could not be shown to this model]`, `[operator]` Text note, request retried once; later images get that note in their tool message (REQ-agent-428) |
| Any error on that retry, any other status (401 / 429 / 5xx) with images, or an error on a request with no image parts | provider error as today (`LLM HTTP <status>`, `ExecuteResult.error`; REQ-agent-242) |
| LLM provider stalls (no headers, or a body that never ends) | request aborted after `LLM_REQUEST_TIMEOUT_MS`; summary `LLM request timed out after <ms>ms` |
| fledge missing | verify failure output names PATH miss |
| Source file with no spec coverage | verify lane `spec-check` (`--require-coverage 100`) fails; verified=false, retried like any verify failure |
| SpecSync registry missing | Planning lists modules from `specs/<name>/<name>.spec.md` instead (REQ-plugins-008); none there → soft-fails; execute continues |
| Dangerous plugin + non-interactive + not allowlisted | ToolResult success=false (SAFE-1); loop may continue |
| Spend cap set and 24h spend + estimate over it with no owner configured, an unpriced model under a cap with no owner (or no card path), invalid cap value, or ledger unavailable | provider call not sent; run ends `blocked` with a `spend-cap` ask stating spend vs cap and the operator action (no yes/no question); summary is the generic `SPEND_CAP_SUMMARY` (SAFE-8) |
| Spend cap set, an owner configured, and a priced call over a cap: the owner denies the spend card, it lapses (no bridge, no answer), a code comes late, the run is stopped, the request times out, or the card cannot be raised | call held and then not sent, nothing recorded; run ends `blocked` with a `spend-cap` ask naming the card and what it came to, and how to continue (ask again for a new card, or the operator action), no reply note; generic summary (REQ-agent-198) |
| A cap covers a call to a model with no known price, an owner is configured, and its unknown-price card comes to no (deny, lapse, late code, stop, timeout, unavailable) | call not sent, nothing recorded; run ends `blocked` with the unpriced `spend-cap` ask naming the card, the amount shown as unknown, and both ways on (a new card, or a priced model / the cap), no reply note; generic summary (REQ-agent-199) |
| `CORVIDINHO_PROVIDER_SPEND_CAPS_USD` set and a provider's 24h spend + estimate over its cap (or a bad entry / unknown provider) | provider call not sent (none to any other model either); run ends `blocked` with a `spend-cap` ask naming `provider:<id>` (or the bad setting, never its value) and `spendScopes`; generic summary (SAFE-14 / SAFE-15) |
| A flat-priced tool call (`web-search`; `gif-search` at $0 once the window is past the cap) would pass the total cap, or a spend-cap setting is invalid, or the ledger is unavailable | not sent; the tool returns the ask in `spendAsk`; the attempt ends `blocked` with that `spend-cap` ask and `SPEND_CAP_SUMMARY`, no further model call (REQ-agent-098) |
| A `web-search` call failed, was refused or was stopped (no key, usage error, secret query, HTTP error, spend cap), or the run made none | no attribution line on the reply; one call that Brave answered puts "Search by Brave" on every later summary of the run, once (REQ-agent-318) |
| Settled call brings 24h spend to ≥80% of the cap while the warning is armed | one `Text` warning + `TaskResult.spendWarning` + a pending `warn` row; later calls stay quiet until spend is seen under 70% (or 24 h pass) (SAFE-8) |
| Autonomous tool named while not offered | Refused like any non-offered tool (REQ-agent-128) |
| Non-ADMIN caller (checked at the call) names a mutating / dangerous plugin it was not offered (or `runPlugin` refuses an offered one for the role) | ToolResult success=false with the role refusal `not allowed for your role`, nothing runs; the run summary ends with `(not allowed for your role)` once, and the result frame / chat body caps keep it (ROLES-CHAT-3, REQ-agent-333) |
| A tool's own error only quotes "not allowed for your role" | No role note (only the exact role refusal counts, REQ-agent-333) |
| Delegation depth env malformed | Treated as the cap; no further delegation |
| Worker hangs / lead interrupted | Worker SIGTERM then SIGKILL; lead returns after a short drain |
| Council: fewer than 2 voices propose | No critique or decide; ok=false with the transcript |
| Council: chair fails | ok=false, empty decision, transcript kept |
| Council: time cap or lead abort | Running voices stopped, later phases not started; state cancelled |
| AGENTS.md / CLAUDE.md missing | skipped; system prompt unchanged |
| Instruction file symlink resolves outside the project | refused; named in a one-time Text note; run continues |
| Instruction file is a directory, binary, or not UTF-8 | refused; named in a one-time Text note; run continues |
| Instruction file over 16 KiB | first 16 KiB kept (UTF-8 boundary) plus truncation marker; one-time Text note |
| Git project: working-tree AGENTS.md / CLAUDE.md differs from HEAD | HEAD copy loaded; one-time Text note says working-tree changes were not loaded |
| Git project: instruction file untracked, or HEAD unborn | refused as not committed; named in the Text note |
| Git project: `.git` unusable (not a repo top level, git missing) | present files refused; no working-tree fallback |
| Git project: committed symlink leaves the commit, is broken, hops a symlinked dir, or loops | refused; named in the Text note |
| `persona.md` missing, empty, or refused (untracked, symlink out, binary) | run continues with no persona block; the rules are still in the prompt; one `Persona: persona.md …; this run has no persona (PERSONA-2)` Text note naming only the file (REQ-agent-069) |
| `persona.md` edited in the working tree but not committed | the committed copy loads; one "working-tree changes not loaded" Text note (REQ-agent-069) |
| `persona.md` over 8 KiB | cut on a UTF-8 boundary with a truncation marker; one Text note (REQ-agent-069) |
| `persona.md` text tries to close its `<persona>` block or override the rules | the close tag is escaped; the block stays first and the PERSONA-3 rules after it say the rules win (REQ-agent-069) |
| A tool result in `INJECTION_SCAN_TOOLS` looks like an injection attempt (SAFE-13) | note in front of that tool message; no mutating tool and no `memory-store` offered or run for the rest of the run (refused with `injectionToolRefusal`, exit 2); `onInjection` once; `injection-suspected` audit row; summary ends with `injectionSummaryNote`; `TaskResult.injection` set (REQ-agent-071) |
| A `delegate` worker or `council` voice fails (a model call, verify, the idle timeout, a crash with no result frame) | its lead's tool result (`data.summary`, `error`) or transcript entry is `workerFailureLine`: `worker failed to start: <why>` (host paths cut) for one that could not start, else the result `error` without the provider's host, else the protocol-mismatch notice for one that streamed another protocol, else the no-provider notice, else `the worker failed (exit N)` — never its summary, stdout or stderr (REQ-agent-117/118) |
| A `delegate` / `council` result carries its worker's own hit (`data.injection`) | counts as this run's hit: `injectionWorkerNote` and the fenced result in its tool message, then the same drop, report, row and note; the worker itself records no row (REQ-agent-071) |
| Audit trail unavailable when a tool result trips the detector | one `[audit] could not record injection-suspected` line; mutating tools still dropped (REQ-agent-071) |
| SpecSync workflow requires a change and a changed meaningful path has none | `SpecSync gate:` note, failed verify with no lane run, retry with the note, then failed with the stuck ask (REQ-agent-518) |
| `sdd.json` deleted, disabled or committed away during the run | the base tree, HEAD and the start scan still count; the check stays on (REQ-agent-518) |
| `sdd.json` present but not valid JSON | fails closed: enabled, required, every path meaningful (REQ-agent-518) |
| Git diff unreadable in a repo whose SpecSync workflow requires a change | failed verify with the "could not read what changed" `SpecSync gate:` note (REQ-agent-518) |
| In a hi repo, anything under `hi/` differs from the session base (made by the run, left by an earlier one, or committed mid-run) | `hi guard:` note naming the criteria, retired entries and other `hi/` files; failed verify with no lane run, retry with the note, then failed with the stuck ask (REQ-agent-520) |
| hi/ cannot be read or diffed in a hi repo | failed verify with the "could not read what changed under hi/" `hi guard:` note (REQ-agent-520) |
| A `hi/` file marked assume-unchanged or skip-worktree is edited on disk (git diff shows nothing) | still a `hi/` change: `hi guard:` note, failed verify; a skip-worktree file missing from disk (sparse checkout) is not (REQ-agent-520) |
| Own change on a repo other than Corvidinho after a green lane | one Text line: it stays open for a human; nothing approved (REQ-agent-519) |
| Own change on Corvidinho, approve or finalize not allowlisted, refused or failing | one Text line with the scrubbed reason; the change stays open for a human; the run stays verified (REQ-agent-519) |
| Lane fails when re-run over what approve and finalize wrote | run failed, not verified, no retry; the summary says so (REQ-agent-519) |
| No output (event, tool output, lane output) for `CORVIDINHO_IDLE_TIMEOUT_MS` outside a model call, worker or card wait | run aborted (tool / lane trees killed); `failed`, `stopReason: "idle-timeout"`, `error` = `Stopped: no output for … (idle timeout).` (REQ-agent-244) |
| The step the run is on ignores the idle-timeout abort (no timeout of its own) | waited for at most `IDLE_STOP_GRACE_MS` (5 s); then `failed`, `stopReason: "idle-timeout"`, summary `… (idle timeout). Any changes so far were not verified.`, an `[operator] AGENT-12: …` line; its later events dropped (REQ-agent-244) |
| Final attempt used up `CORVIDINHO_MAX_TURNS` rounds | best prose so far; `stopReason: "turn-cap"`; verify still runs when files changed (REQ-agent-312) |
| `CORVIDINHO_MAX_TURNS` / `CORVIDINHO_IDLE_TIMEOUT_MS` not a positive whole number | ignored with one `[operator] AGENT-12: …` line; the default applies (REQ-cli-125) |

## Dependencies

Spawns `fledge` for the default verify runner. Reads SpecSync registry/specs via plugin helpers. Dispatches allowlisted plugins via `runPlugin` during the LLM tool loop. No Trust/attest.

## Change Log

Flesh LLM tool loop MVP on prove-before-done (#31) (2026-09-26, corvid-agent).
| 2026-10-03 | missing-plugin soft-land cites the real gap, never an invented provider (REQ-agent-742) |
| 2026-09-26 | discord-dogfood soft-land + Discord chat prompt (REQ-agent-312 / AGENT-9 / IDENTITY-5 / ROLES-CHAT-9) |
| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: chat/plumbing split for Discord summaries; identity + public Q&A system instructions |
| 2026-09-26 | flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai: Flesh full LLM tool loop on prove-before-done so task run / Discord / WATCH can call allowlisted plugins via OpenAI-compatible tools (issue #31 dogfood MVP) |
| 2026-09-26 | memory-discord-inject: MEMORY system prompt + tool argv (REQ-agent-010) |
| 2026-09-26 | discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior: Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7 |
| 2026-09-26 | tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but: Tool loop dispatches only tools offered in the run's catalog (SAFE-1 / AGENT-5, PR #128 review follow-up): a registered but not-offered (e.g. dangerous or above-tier) plugin name from the model is refused instead of run; memory store test updated for soft-deleted re-store history |
| 2026-09-26 | spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene: Spawned agents ignore the project .env and tests never create real worktrees (ALLOW-4 / SAFE-1 / SESSION-WORKTREE-3 hygiene): bun-invoked spawns pass --no-env-file so a project worktree's .env cannot inject allowlists, admin lists or keys into the agent; bridge and slash fixture tests use temp project roots so bun test never adds talk/* worktrees or branches to the repo |
| 2026-09-26 | live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one: Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2 |
| 2026-09-26 | safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a: SAFE-8 daily spend cap (issue #98 captured slice): optional CORVIDINHO_DAILY_SPEND_CAP_USD caps provider (LLM) spend over a rolling 24h; each OpenAI-compatible call is priced from a per-model table, reserved against a spend_ledger in the shared SQLite DB before it is sent and refused with a clear error when it would break the cap, then settled from provider-reported token usage; unpriced models are refused while a cap is set; no cap means no behavior change; doctor shows spend vs the cap (AUTONOMOUS-8); ledger provider/model columns are SAFE-6 scrubbed; draft SAFE-14..16 (80% warn, per-provider caps, ask at 100%) left for HI capture |
| 2026-09-26 | autonomous-1-gate-and-depth-capped-delegate-tool-issue-117: AUTONOMOUS-1 `[corvidinho.autonomous]` gate, SAFE-9 catalog hiding, delegation core with depth / tier / fan-out safety defaults (REQ-agent-117) |
| 2026-09-26 | autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho: AUTONOMOUS-1 gate and depth-capped delegate tool (issue #117, AUTONOMOUS-1/5, SAFE-9): autonomous mode off until [corvidinho.autonomous] enabled = true in the project fledge.toml; a code-tier lead can delegate a skill-tagged subtask to a worker (child task run, same-or-lower tier, non-interactive, depth <= 2, capped fan-out) and synthesize its summary; delegate stays hidden from the tool catalog unless the session is allowed |
| 2026-09-26 | task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled: Task run reads the project's own AGENTS.md and CLAUDE.md from the project root into the LLM system prompt as labelled project instructions (AGENT-1, issue #84 captured slice): 16 KiB cap with truncation marker, symlinks outside the project refused, binary/non-UTF-8 refused, SAFE-6 scrubbed |
| 2026-09-26 | call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the: Call registered Fledge plugins as tools (issue #112, FLEDGE-4/5 PLUGIN-2/3/6): discover the project's Fledge plugins via the fledge CLI, register each command as a dangerous typed plugin run through fledge plugins run with argv arrays, and show per-command tool schema cost plus a context budget line in plugins list |
| 2026-09-26 | autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44: AUTONOMY-1/2 ask-human tool and stuck owner ping on Discord (#44) |
| 2026-09-26 | autonomy-4-7-clarify-pings-requester-thin-ack-restates-pending-ask-cancel-clears-joke-impossible-witty-decline-package: AUTONOMY-7 joke/impossible guidance in ASK_AGENT_SYSTEM_INSTRUCTIONS |
| 2026-09-26 | repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools: Repo projects load AGENTS.md and CLAUDE.md from the HEAD commit, not the working tree, so the non-dangerous file tools cannot plant system-prompt instructions for later runs (AGENT-1 hardening, issue #84, review of PR #150) |
| 2026-09-26 | roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat: ROLES-CHAT-2 catalog omit mutating for non-ADMIN |
| 2026-09-26 | safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run: SAFE-8 amended (issue #98): warn at 80% of the daily spend cap and ask at 100% instead of refusing. Once per crossing a run that pushes rolling 24h spend to 80% of CORVIDINHO_DAILY_SPEND_CAP_USD emits a warning (Text event, result spendWarning, Discord reply line with owner ping); a provider call that would pass the cap is stopped before it is sent and the run ends blocked with a spend-cap ask to the owner via the AUTONOMY-1/2 ask path stating spend vs cap and how to continue; doctor and Discord /status show 24h spend vs the cap (AUTONOMOUS-8); Approve card (#96) left for HI capture |
| 2026-09-26 | spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run: Spawned agents pin Bun config to a known-empty file and SAFE-2 protects bunfig.toml so a planted preload cannot run code in the agent (#133 isolation / SAFE-1) |
| 2026-09-26 | council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2: Council tool (issue #118, AUTONOMOUS-6, SAFE-9): a code-tier lead in an autonomous-enabled project can convene a council of 2-5 delegated voices that deliberate in structured phases (propose, critique, decide) and get back a bounded transcript and a synthesized decision; voices run read tier by default with no mutating tools, reuse delegate caps and worker env stripping, and the tool stays hidden unless the session is allowed |
| 2026-09-26 | harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own: Harden child process lifetimes and Fledge scoping (issue #112 follow-up to #154, #157, #167): fledge plugin argv after --, own process group plus tree kill on timeout or abort for Fledge runs, delegate workers and schedule runs, daemon shutdown kills abandoned runs, Fledge commands scoped to the project root they were discovered for |
| 2026-09-26 | agent-loop-never-reports-done-after-a-failed-verify-or-a-provider-error-agent-4-8-union-fileschanged-across-attempts-so: Agent loop never reports done after a failed verify or a provider error (AGENT-4/8): union filesChanged across attempts so a retry that changes nothing is re-verified, and provider/HTTP failures return an execute error flag that ends the run failed |
| 2026-09-26 | agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is: Agent run summaries are secret-scrubbed before every length clip, and a private-key block cut before its END line is redacted |
| 2026-09-26 | discord-ask-ephemeral-buttons-session-multi: ask-human options + ask-options parse for DISCORD-ASK buttons |
| 2026-09-26 | discord-ask-1-5-ephemeral-discord-button-asks-session-multi-1-4-per-user-sessions-package-0-0-22: DISCORD-ASK-1..5 ephemeral Discord button asks + SESSION-MULTI-1..4 per-user sessions; package 0.0.22 |
| 2026-09-26 | planning-specsync-briefing-reaches-the-model-runtask-passes-the-loaded-spec-constraints-and-companions-to-every-execute: Planning SpecSync briefing reaches the model: runTask passes the loaded spec constraints and companions to every execute attempt and the LLM user message carries them fenced as project data (AGENT-2, SPECSYNC-1/5) |
| 2026-09-27 | planning-picks-spec-modules-from-the-request-not-the-bridge-wrapper-and-the-briefing-fence-and-cap-are-hardened: Planning picks spec modules from the request not the bridge wrapper, and the briefing fence and cap are hardened |
| 2026-09-26 | safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend: SAFE-8 review follow-up for PR #160 (issue #98): a post that did not go out hands back the 80% spend warning and the spend-cap owner ping on every bridge surface (a slash reply that fails, e.g. an expired interaction token, still posts the owner notice), a warning claimed while spend is back under 80% stays pending for the next post at 80% or more, and a spend-cap stop is never kept as the session pending ask |
| 2026-09-27 | agent-loop-provider-error-summary-still-says-plainly-that-an-earlier-verify-failed-agent-4-a-run-that-ends-failed-on-a: Agent loop provider-error summary still says plainly that an earlier verify failed (AGENT-4): a run that ends failed on a provider error after a failed verify keeps that verify output in its summary |
| 2026-09-26 | task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out: Task run stops on SIGINT/SIGTERM with a cancelled result and a stopped verify lane, and a stalled LLM request times out (agent-loop-4) |
| 2026-09-27 | task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an: Task run leaves a SIGINT it started with ignored alone, and an interrupted verify lane stops waiting on a pipe an escaped lane process holds (agent-loop-4 follow-up) |
| 2026-09-27 | lightly-adopt-agent-3md-ship-guidance-only-agent-3md-plus-corvidlabs-agent3md-dep-and-validate-route-smoke-no-agent-13: Lightly adopt agent.3md: ship guidance-only agent.3md plus @corvidlabs/agent3md dep and validate/route smoke; no AGENT-13 runtime wiring |
| 2026-09-27 | tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points: Tests never write the operator data dir and the verify lane never sees operator secrets: bun test preload always points CORVIDINHO_DATA_DIR at its own temp dir and clears CORVIDINHO_AUDIT_HMAC_KEY / CORVIDINHO_WATCH_SPAWN_LOG / WORKTREE_BASE_DIR; the fledge verify runner spawns with DISCORD_*, GitHub tokens, LLM API keys, the audit key and CORVIDINHO_ACTING_* stripped (SAFE-5 / SAFE-6) |
| 2026-09-27 | discord-dogfood-member-user-lookup-for-snowflakes-identity-5-discord-13-soft-land-tool-round-exhaustion-without-dumping: Discord dogfood: member/user lookup for snowflakes (IDENTITY-5/DISCORD-13), soft-land tool-round exhaustion without dumping Stopped after N (AGENT-9), chat prefers prose over SpecSync/github thrash (ROLES-CHAT-9); package 0.0.28 |
| 2026-09-27 | per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5: Per-tier model: read/tool/code runs call the model configured for that tier (AGENT-5) |
| 2026-09-27 | local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to: Local spec-check runs at the CI Spec Sync strictness (specsync check --require-coverage 100), specsync-check falls back to specsync check when the project defines no Fledge spec-check task, and a read-only specsync-score tool reports SpecSync spec scores (SPECSYNC-2/3, issue 89) |
| 2026-09-27 | the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the: The verify gate uses the run's real git working-tree diff, not only the files tools report, so an edit made outside the file tools is verified before done (AGENT-4, #85) |
| 2026-09-27 | files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision: Files-read passes images to the model as image parts it can see, with a one-shot text fallback for models without vision (DISCORD-9) |
| 2026-09-27 | verify-retry-feedback-keeps-the-failing-step-s-output-failing-step-name-error-lines-end-of-the-log-instead-of-the-first: Verify retry feedback keeps the failing step's output (failing step name, error lines, end of the log) instead of the first 4000 chars of the lane log (AGENT-4.a, #85) |
| 2026-09-27 | roles-chat-7-b-an-admin-role-session-s-github-pr-create-is-tested-safe-1-denies-it-without-an-allowlist-entry-github-6: ROLES-CHAT-7(b): an ADMIN role session's github-pr-create is tested: SAFE-1 denies it without an allowlist entry, GITHUB-6 still refuses an unlisted repo, and the dry-run PR goes through with the allowlist entry plus the GITHUB-6 repo allowlist |
| 2026-09-27 | plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and: PLUGIN-1 Fledge itself as typed builtins: fledge-lanes-list and fledge-lanes-validate (read-only) and fledge-lanes-run and fledge-run (dangerous, code tier) wrap the local fledge CLI in the project root |
| 2026-09-27 | roles-chat-3-a-non-admin-session-s-invented-call-to-a-mutating-or-dangerous-plugin-gets-the-role-refusal-not-allowed: ROLES-CHAT-3: a non-ADMIN session's invented call to a mutating or dangerous plugin gets the role refusal (not allowed for your role), not the catalog refusal, and the run summary ends with a short (not allowed for your role) note once a call was refused for the caller's role |
| 2026-09-27 | task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho: Task run offers allowlisted dangerous tools to the model: a dangerous plugin enters the catalog only when CORVIDINHO_ALLOWLIST names it (tier, role and SAFE-9 filters unchanged); shell-exec and the node/python/cargo runners stay out pending the SAFE-3 decision; a non-git run whose Fledge command may have changed files verifies anyway (CLI-3, GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3, AGENT-4) |
| 2026-09-27 | req-agent-112-after-the-fledge-core-builtins-an-allowlist-with-no-fledge-entry-and-a-non-admin-role-session-offer-no: REQ-agent-112 after the Fledge core builtins: an allowlist with no fledge-* entry and a non-ADMIN role session offer no Fledge plugin command and never spawn fledge; the only fledge- tools they offer are the read-only core builtins fledge-lanes-list and fledge-lanes-validate (PLUGIN-1, PLUGIN-3, ROLES-CHAT-2) |
| 2026-09-27 | fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the: Fledge core runs wait on SAFE-3 like the shell: fledge-lanes-run and fledge-run are never offered to the model from the task-run allowlist (SAFE3_PENDING_TOOLS), and allowlisting a Fledge core builtin does not start Fledge plugin discovery (PLUGIN-1, CLI-3, SAFE-1, SAFE-3 pending) |
| 2026-09-29 | discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can: Discord-send-file attaches files and images to replies in the conversation's own channel, and the model is told it can (DISCORD-17) |
| 2026-09-29 | three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key: Three roles: owner, team and community gate every tool. Each declared person has one role set only by the owner (role key or audited /admin people role); the tool layer re-resolves the actor's role from the people registry on every run and surface (runPlugin + catalog): owner keeps everything, team gets /work edits and PR, GitHub reviews and comments on allowlisted repos and only their own memory, community (and anyone undeclared, WATCH, schedules, workers) keeps today's read/chat tools; community site/roadmap sources are the public repo docs and the public issues and milestones of allowed public repos (IDENTITY-8..12, ADMIN-3.b, ROLES-CHAT-8.a, #65) |
| 2026-09-29 | person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one: Person and project memory, private notes, and forget-me on an owner Approve/Deny card: each declared person keeps one profile keyed by person id (role, projects, preferences, history of decisions, asks and approvals), each project keeps memory keyed by its repo for whoever works on it next, a person's memory and private notes are shown only to them and the owner on every surface, and anyone can ask to be forgotten, which deletes their memories once the owner approves on a DM Approve/Deny card (MEMORY-5/6/7, MEMORY-ACL-6, #101) |
| 2026-09-29 | memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run: Memory on Discord and GitHub, filed by person or project, and a memory search before I don't know: a GitHub WATCH run saves and recalls for the commenter's declared person (people list, stable GitHub ids) with MEMORY-7 privacy while an undeclared commenter reads only the thread repo's project memory and saves nothing (REQ-watch-008 changed); a recall with a query is ranked by relevance then recency; the Discord and WATCH injects search memory for the message; the tool loop searches memory itself before a reply that says it doesn't know, costing a model call only when facts are found (MEMORY-8, MEMORY-9, #67) |
| 2026-09-29 | ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button: Ask option ids come out unique so Choose buttons open and a pick resumes with the pressed label; a reply after a button ask expired clears it instead of restating a dead Choose button (DISCORD-ASK-1/3/5) |
| 2026-09-29 | persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface: Persona: one editable persona.md in corvid-agent's voice loaded into the system prompt on every turn and every surface, with the rules after it and winning (PERSONA-1..3, #69) |
| 2026-09-29 | verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned: Verify retry feedback never ends on half a surrogate pair; a non-git lead verifies after a delegate worker that returned no result frame; github-pr-create attribution check is exact; doctor and the Octokit plugins treat a blank GITHUB_TOKEN / GH_TOKEN as missing |
| 2026-09-29 | prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a: Prompt-injection hygiene: display names are cleaned before the model sees them and a name that imitates the owner or a declared person is flagged, identity and role still only from declared ids (SAFE-11); a non-owner's chat, /session start and /work text, WATCH issue/PR/comment titles and bodies, and GitHub reader and guild-member tool results reach the model fenced as untrusted data, and the system prompt says such blocks never grant permission (SAFE-12); a conservative always-on detector refuses a non-owner message or WATCH event that looks like an injection attempt before any run with one short reply that tells the owner, and a tool result that trips it drops every mutating tool for the rest of the run and tells the owner on the answer, every hit audited (SAFE-13, #71) |
| 2026-09-29 | discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe: Discord rich final replies: answer footer with model, tokens, cost and time (tokens and cost owner-only) and fence-safe splits at 2000 (DISCORD-15/15.a/16) |
| 2026-09-29 | private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation: Private notes, profile reads and the owner's view of someone's memory are shown only privately: in a Discord conversation the memory plugins hand that text past the model (privateText; the model gets a sent-privately placeholder), task run carries it as privateReplies, and the bridge sends it by DM to whoever asked on chat, button pick and Answer form resumes, /session start and /work, with a short sent-privately note in the channel and never the text; refused in schedules and GitHub threads (MEMORY-7.a, #101) |
| 2026-09-30 | verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15: Verification can't be skipped and the real diff since the talk started decides what changed (AGENT-14, AGENT-15, AGENT-15.a): task run refuses --no-verify, [corvidinho] verify_before_complete is ignored, filesChanged comes from the real git diff alone (a claimed path git does not show still runs the lane), and a talk worktree whose last run did not end verified verifies from the talk branch's merge-base |
| 2026-09-30 | shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree: Shell-exec refuses foot-guns and says why (sed -i or > edits, downloads piped into a shell, deletes outside the worktree, secret reads), env -C and symlinked cd can't leave the root, and the shell and language runners start without GitHub or git credentials (SAFE-21, SAFE-21.a, SAFE-3) |
| 2026-09-30 | ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a: Ask questions and choice labels are secret-scrubbed before they are cut or posted (SAFE-6.a) |
| 2026-09-30 | on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a: On GitHub people match only by their numeric user id: a renamed or re-registered login never counts as the owner or a declared person on WATCH (prompt, memory scope, SAFE-13 exemption); [owner] github_id declares the owner's id; /admin people link github stores the looked-up numeric id; doctor warns about logins without an id (IDENTITY-7.a, #36) |
| 2026-09-30 | when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord: When it repeats a failing call it is steered to change approach, then asks; a stuck GitHub run pings the owner on Discord (AGENT-16, AGENT-16.a) |
| 2026-09-30 | only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14: Only the owner sees spend amounts and cap settings on Discord; everyone else sees only 'Work is paused for budget.' (SAFE-14.a): spend-cap posts, the /work PR line, the slash owner notice and SPEND_CAP_SUMMARY say only that; the question quote is dropped on every path including the daemon pending-ask pass; the 80% warning never rides a channel post and, with a cap stop's details, goes to the owner by DM (src/discord/spend-dm.ts, retried every scheduler tick); the /status spend line is owner-only |
| 2026-09-30 | verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its: 'Verified' requires that tests actually ran and none were deleted (AGENT-15): a passing verify lane counts only when its output has a recognised test summary (bun test, jest, vitest, cargo test, pytest, go test) with at least one executed test and no test active at the baseline was deleted, retitled or turned off (skip, todo, silenced by only), by name across the repo root; non-git projects walk their test files at run start; /work checks the tree against the merge-base before commit and push |
| 2026-09-30 | it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and: It asks me on an Approve card before touching prod or deploys or making a channel post; anything else it just does and tells me (AUTONOMY-9/9.a, AUTONOMY-10/10.a channel posts, AUTONOMY-11, #97) |
| 2026-09-30 | i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set: I configure the models (OpenAI-compatible, Ollama, Anthropic) with no built-in default, and it says so when none is set (AGENT-13, AGENT-10) |
| 2026-09-30 | if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11: If a model fails or is retired it falls back to my next configured model and tells me (AGENT-11) |
| 2026-09-30 | owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own: Owner chat, /session start and /work may use the allowlisted shell, runners and Fledge runs only in that talk's own worktree; non-owners, WATCH, schedules, workers and the local CLI never get them (SAFE-3.a) |
| 2026-09-30 | a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and: A schedule the owner creates runs with the owner's tools and allowlist (never the shell, runners or Fledge commands) and asks on Approve cards where the must-ask list says so, a denied or lapsed card ending the run with a blocking ask; schedules other people create stay read-only (DISCORD-SCHEDULE-1.a) |
| 2026-09-30 | in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its: In a SpecSync repo it opens and works a SpecSync change for its edits, and on Corvidinho it approves and archives its own change once verify is green (AGENT-18 SpecSync clause, AGENT-18.a) |
| 2026-09-30 | rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe: Rolling 24-hour spend caps per provider plus the total cap, each warning the owner at 80% and stopping to ask at 100% (SAFE-14, SAFE-15): CORVIDINHO_PROVIDER_SPEND_CAPS_USD (provider=USD keyed on the configured provider id; a malformed or unknown key stops every call, value never echoed) next to CORVIDINHO_DAILY_SPEND_CAP_USD (the total cap); every provider call is recorded while any cap is set; SpendLedger.window(now, provider?) with a (provider, ts) index; reserve() checks the total and the call's provider cap in one IMMEDIATE transaction and names each tripped scope (total, provider:<id>) in owner-only text; spend_alerts gains a scope column (idempotent ALTER, scrubbed) so each cap warns once per crossing and pings once per episode; a cap stop is never a model failure; doctor and the owner's /status show each cap |
| 2026-09-30 | at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets: At a spend cap the run asks the owner on a DM spend Approve card with a one-time code instead of refusing; Approve lets only the paused call through at the amount shown and the next call past the cap asks again (SAFE-8, SAFE-8.a, SAFE-15, SAFE-19 money) |
| 2026-09-30 | the-safe-3-a-approved-prod-command-test-runs-a-stand-in-kubectl-first-on-path-instead-of-the-host-s-real-one-which-took: The SAFE-3.a approved-prod-command test runs a stand-in kubectl first on PATH instead of the host's real one, which took 2.4-3.1 s on CI runners and once passed the 5 s test timeout |
| 2026-09-30 | if-it-only-plans-or-says-done-without-changing-anything-it-gets-one-nudge-to-the-same-model-a-second-stall-stands-with: If it only plans or says 'Done.' without changing anything, it gets one nudge to the same model; a second stall stands with an operator note (AGENT-17, nudge half) |
| 2026-09-30 | a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told: A failed run tells the owner why in one plain line, and everyone else that it didn't work and the owner has been told (DISCORD-3.b) |
| 2026-09-30 | a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a: A CLI task run in a git repo works in its own worktree by default; --here runs it in my checkout (SESSION-WORKTREE-1.a) |
| 2026-09-30 | a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers: A call whose price is unknown stops and asks on the owner's spend card showing the amount as unknown when a cap covers it (recorded unknown, owner lines read $X + unknown, no price override), and every surface asks before spending over a cap: WATCH spend-cap stops reach the owner by DM and a schedule's spend-cap stop can go on through the card (SAFE-16, SAFE-16.a, AUTONOMY-8) |
| 2026-10-01 | before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed: Before a PR opens, a second model reviews the diff in bounded rounds, and the PR lists what it raised and what changed (GITHUB-9, GITHUB-9.a) |
| 2026-10-01 | an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12: An idle timeout and a turn cap I set stop stalled or endless runs, and it says so (AGENT-12) |
| 2026-10-01 | my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half: My local CLI task run may use the allowlisted shell and runners inside its own worktree (SAFE-3.a, local CLI half) |
| 2026-10-01 | a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the: A failed delegate worker or council voice hands its lead one plain failure line (the worker's result error without the provider's host, the no-provider notice, or the exit code), never the worker's summary or stderr, which for a model failure is the provider's raw error body |
| 2026-10-01 | in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent: In a hi repo it never changes the criteria itself: any hi/ change no approved capture made blocks done and the PR (AGENT-18, hi guard) |
| 2026-09-30 | web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered: Web search through Brave (PLUGIN-7, PLUGIN-9, issue 318): a dangerous minTier-1 web-search command in plugins/web, offered only when allowlisted and only to the owner and team; Brave results reach the model only inside the untrusted web fence and are SAFE-13 scanned; the key comes from BRAVE_SEARCH_API_KEY only and never appears in any output; requests go through a shared https-only, host-allowlisted, redirect-refusing JSON GET on the pinned-DNS public-address checks; each search reserves about 0.005 USD against the SAFE-8 cap |
| 2026-10-01 | gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins: GIF search through GIPHY (PLUGIN-8, PLUGIN-9, issue 318 slice B): a dangerous minTier-1 gif-search command in a new plugins/gif, offered only when allowlisted and only to the owner and team; GIPHY's Tenor-compatible v2 search with contentfilter=medium (G and PG) always sent; titles and GIPHY media links reach the model only inside the untrusted web fence and are SAFE-13 scanned, posted as a link only; the key comes from GIPHY_API_KEY only, sits in the request URL and never appears in any output; each search is recorded at 0 USD against the SAFE-8 cap |
| 2026-10-03 | missing-plugin-asks-soft-land-with-the-real-gap: Missing-plugin asks soft-land with the real gap |
