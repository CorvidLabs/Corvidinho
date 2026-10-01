---
module: agent
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
---

# Delta: agent (an idle timeout and a turn cap I set stop stalled or endless runs, and it says so — AGENT-12)

## Modified

### REQUIREMENT REQ-agent-244

An abort SHALL stop the run's work, not only its bookkeeping (AGENT-3):

- The default verify runner SHALL run `fledge lanes run verify
  --non-interactive` in its own process group and, when the run's
  AbortSignal fires, SHALL stop the lane's whole process tree (fledge and
  the lane tasks it started, REQ-plugins-154), so no verify step keeps
  running in the background. An already-aborted signal SHALL NOT start the
  lane. The lane SHALL also be stopped when this process exits or dies of a
  SIGINT / SIGTERM / SIGHUP it does not handle. After an abort the runner
  SHALL wait at most a short grace (250 ms) for the lane's output pipes, so
  a lane process that escaped the kill (its own session, already
  reparented) and still holds a pipe SHALL NOT keep the cancelled run from
  returning.
- `runTask` SHALL return the cancelled result (`cancelled=true`,
  `verified=false`, state `failed`) when the signal aborted while the verify
  lane ran, whatever exit the stopped lane reports and however many retries
  remain: no `VerifyResult`, no retry and no `stuck` ask.
- Each OpenAI-compatible chat completions request of `createTaskExecute`
  (tool loop and read tier) SHALL be bounded by a per-request timeout,
  covering both the wait for headers and the body read (default
  `LLM_REQUEST_TIMEOUT_MS`, 10 minutes; `llmTimeoutMs` option). A request
  that times out SHALL end the attempt with the summary `LLM request timed
  out after <ms>ms` instead of waiting forever; a caller abort SHALL still
  end the request at once and SHALL NOT be reported as a timeout. No
  environment variable sets this per-request cap.
- AGENT-12: every `runTask` SHALL run an idle watchdog
  (`src/agent/limits.ts`, `startIdleWatchdog`) for the idle timeout I set:
  `RunTaskOptions.idleTimeoutMs`, which `task run` fills from the optional
  `CORVIDINHO_IDLE_TIMEOUT_MS` (a positive whole number of milliseconds,
  clamped to 2^31 − 1; unset, blank or anything else = the default
  `DEFAULT_IDLE_TIMEOUT_MS`, 600000 = 10 minutes; no value turns it off).
  The watchdog is bound to its run (AsyncLocalStorage, `withIdleWatchdog`)
  and SHALL be reset by the run's output: every `AgentEvent` the run emits
  (and what the CLI prints or streams, `noteIdleActivity`), each chunk a
  tool process writes (`spawnCapped`, REQ-plugins-125) and each chunk the
  verify lane writes (the default runner reads the lane's pipes while it
  runs). It SHALL be held (`pauseIdleWatchdog` / `whileIdlePaused`; holds
  nest) while a model call is in flight (`callModels`, which keeps its own
  per-request cap above), while a `delegate` or `council` worker runs
  (`runDelegateChild`; the worker inherits `CORVIDINHO_MAX_TURNS` and
  `CORVIDINHO_IDLE_TIMEOUT_MS`, which the worker env never drops, and is
  bounded by its own time cap) and while the run waits on an Approve card
  (`ApprovalStore.waitForDecision`, REQ-discord-125: the spend card, the
  must-ask gate and every other SAFE-18 card wait), and it starts the full
  wait again when nothing holds it.
- AGENT-12: after `idleTimeoutMs` with no output while not held, the
  watchdog SHALL abort the run's signal (combined with the caller's), so
  the tool loop stops and a running tool's or verify lane's process tree is
  killed as for any abort (the existing proc-group kill). Unless the caller
  aborted too, or the run had already ended `done`, the run SHALL end
  `failed` — not cancelled, not verified, no `ask` — with `stopReason:
  "idle-timeout"` and `error` set to the one line `idleTimeoutLine(ms)`
  (`Stopped: no output for 10 minutes (idle timeout).`, the plain reason a
  bridge reads, DISCORD-3.b), and a summary that starts with that line,
  adds ` Its changes so far were not verified.` when `filesChanged` is not
  empty, and then keeps the run's best prose so far (the tool loop's
  `tool loop aborted …` placeholder dropped; closing notes stay last).
  `runTask` SHALL emit that line as a `Text` event and `StateChanged`
  `failed`. AGENT-15.a treats it like any other run that did not end done.

Acceptance Criteria
- A provider that sends headers and then trickles body bytes forever makes a read-tier execute return `LLM request timed out after 300ms` within seconds (`llmTimeoutMs: 300`).
- A provider that never answers makes a tool-tier execute return `LLM request timed out after 200ms` after one request.
- A caller abort during a stalled request returns promptly with an `LLM request failed:` summary, not a timeout.
- A verify runner that sees the abort and returns a failed lane with `maxRetries: 0` yields `cancelled=true`, no `ask`, no `VerifyResult` event and one execute attempt.
- An interrupted `task run` stops a fake `fledge` and the lane task it started (REQ-cli-244).
- An interrupted `task run` whose lane left an escaped process (`setsid`, reparented) holding the lane's stdout exits 130 with a cancelled `result` frame within seconds, not when that process ends.
- `idleTimeoutFromEnv`: unset or blank = 600000; `90000` = 90000; `0`, `off`, `-1`, `10m` are ignored (default, `invalid: true`); a huge value is clamped to 2147483647.
- A run whose tool hangs (`idleTimeoutMs: 150`) ends `failed`, `cancelled=false`, `stopReason: "idle-timeout"`, `error` and summary `Stopped: no output for 150 ms (idle timeout).`, and the last two events are that `Text` and `StateChanged failed`; with best prose and changed files the summary is the line, ` Its changes so far were not verified.`, a blank line and the prose.
- A run that keeps calling `noteIdleActivity`, a read-tier run whose model takes 1.5 s against a 600 ms timeout, a 1.2 s silent `delegate` worker against a 400 ms lead timeout and a 0.9 s Approve-card wait against a 250 ms timeout are never stopped; the card's watchdog fires once the card is answered and nothing else happens.
- A caller abort during the same hang gives the cancelled result, with no `stopReason` and no `error`.
- `task run` with `CORVIDINHO_IDLE_TIMEOUT_MS=4000` and a fake verify lane that hangs silently exits 1 with a `failed` `result` frame (`stopReason: "idle-timeout"`, `error: "Stopped: no output for 4 seconds (idle timeout)."`) and the fake `fledge` and its lane task are gone; a lane that prints every 0.5 s for 6 s under a 3 s timeout is verified.

### REQUIREMENT REQ-agent-312
When the LLM tool loop exhausts `maxToolRounds` without a final no-tool reply, execute SHALL soft-land (AGENT-9): `ExecuteResult.summary` SHALL be the last assistant prose when present, otherwise a short clarifying ask (e.g. "I'm not sure I have enough to answer that cleanly — can you clarify what you meant?"). The summary SHALL NOT contain the operator phrase `Stopped after N tool rounds`. An operator note with that phrase MAY be emitted as a `Text` event for thinking/NDJSON. `chatBodyFromTaskResult` SHALL strip any leftover `Stopped after N tool rounds` lines before Discord outbound (defense in depth).
The tool-loop system prompt SHALL include Discord chat discipline (IDENTITY-5 / DISCORD-13 / ROLES-CHAT-9): prefer conversational prose for social/game banter; call `discord-user-lookup` for snowflakes/@mentions/named members before repo tools; only use SpecSync/git/github/files when the query clearly needs Corvidinho codebase or product data; treat bare `bug <snowflake>` in Discord as a user id, not a GitHub issue.
AGENT-12: `maxToolRounds` is the turn cap I set. `createTaskExecute` SHALL default it to the optional `CORVIDINHO_MAX_TURNS` of its `env` (`maxTurnsFromEnv`: a positive whole number; unset, blank or anything else = `DEFAULT_MAX_TURNS`, 8, today's cap), per execute attempt, so each AGENT-4.a verify retry gets its own rounds; an explicit `maxToolRounds` option still wins, and the rounds the AGENT-17 nudge and the MEMORY-9 recall add are not counted. A soft-landed attempt SHALL return `ExecuteResult.stopReason: "turn-cap"`, and `runTask` SHALL set `TaskResult.stopReason: "turn-cap"` only when the run's final attempt returned it and the run was not cancelled (an earlier capped attempt whose retry finished leaves none; a capped attempt can still be verified). `TaskStopReason` is `"turn-cap" | "idle-timeout"`; `stopReasonFromUnknown` accepts only those two. `formatTaskPlumbing` SHALL end with `stopped=turn-cap` or `stopped=idle-timeout` for those values (any other value is left out) — the footer / thinking plumbing AGENT-9 allows — while `chatBodyFromTaskResult` never shows it. Delegate and council workers inherit the cap (their env keeps `CORVIDINHO_MAX_TURNS`).
- Exhausted rounds with no prose → clarify ask; no `Stopped after` in summary.
- Exhausted rounds with prior prose → that prose is the summary.
- Operator `Text` event may carry the stop note.
- `chatBodyFromTaskResult` drops stop lines.
- Fixture: `tests/agent.soft-land.test.ts`.
- `CORVIDINHO_MAX_TURNS=2` with a model that always calls a tool: 2 requests, `stopReason: "turn-cap"`, the last prose as the summary and the `[operator] Stopped after 2 tool rounds …` event; unset: 8 requests; `0`, `-2`, `2.5`, `abc`, `1e3` and a 20-digit value are ignored (8).
- `runTask`: a capped first attempt whose retry finishes and verifies has no `stopReason`; a capped final attempt has `stopReason: "turn-cap"` (verified by the lane); a cancelled run has none.
- `formatTaskPlumbing` of a capped run is `state=done verified=false verifySkipped attempts=1 stopped=turn-cap`; an unknown `stopReason` adds nothing; its chat body is only the prose.
- A worker env built by `buildDelegateSpawn` keeps `CORVIDINHO_MAX_TURNS` and `CORVIDINHO_IDLE_TIMEOUT_MS`.
- Fixture: `tests/agent.limits.test.ts`.
