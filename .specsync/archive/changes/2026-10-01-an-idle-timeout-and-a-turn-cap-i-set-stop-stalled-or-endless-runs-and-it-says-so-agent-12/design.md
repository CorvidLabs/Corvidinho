---
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
artifact: design
---

# Design

- **New module** `src/agent/limits.ts` (agent spec): the env readers
  (`maxTurnsFromEnv`, `idleTimeoutFromEnv` → `{ value, invalid }`), the
  lines (`idleTimeoutLine`, `TURN_CAP_NOTE`, `invalidLimitNote`,
  `formatIdleDuration`), `stopReasonFromUnknown`, and the watchdog
  (`startIdleWatchdog`: one timer, `touch`, nesting `pause` with an
  idempotent resume, `stop`, an AbortController that fires once). The
  current run's watchdog lives in an AsyncLocalStorage (`withIdleWatchdog`),
  so `noteIdleActivity` / `pauseIdleWatchdog` / `whileIdlePaused` reach it
  from tools, model calls and card waits deep in the run without new
  parameters, and do nothing outside a run (the bridge, WATCH, tests).
- **runTask** (`src/agent/loop.ts`) starts the watchdog, runs the gate under
  it with `AbortSignal.any([caller, watchdog])`, wraps `onEvent` (each event
  touches it) and `execute` (remembers whether the latest attempt returned
  `stopReason: "turn-cap"`), stops it in `finally`, then maps the result:
  watchdog fired, caller did not abort, not already done → the idle-timeout
  result (`idleTimeoutResult`); else a final capped attempt →
  `stopReason: "turn-cap"`. AGENT-15.a settles on the mapped result.
  Review fix: the gate is awaited through `settleWithinGrace`, so once the
  watchdog fires a step that ignores the abort (an in-process call with no
  timeout of its own — Octokit, the Discord REST posts) is waited for at
  most `IDLE_STOP_GRACE_MS` (5 s); then the run ends with the idle-timeout
  result anyway (attempts started, files finished attempts reported, "Any
  changes so far were not verified.", an `[operator]` line) and that step's
  later events are dropped. `effectiveIdleTimeoutMs` turns an unusable
  `idleTimeoutMs` (0, negative, NaN, Infinity) into the default instead of
  a 1 ms instant stop.
- **execute.ts** (two regions only): `maxToolRounds` defaults to
  `maxTurnsFromEnv(env).value`; the soft-land return carries
  `stopReason: "turn-cap"`; `callModels` runs `callChain` inside
  `whileIdlePaused` (the chain, image retry, spend guard and guards are
  untouched).
- **Activity sources**: the CLI event handler (`noteIdleActivity`), the
  default verify runner (reads the lane's pipes while it runs, one touch per
  chunk; the abort grace now also cancels the readers), `spawnCapped`'s
  `readCapped` (one touch per chunk).
- **Holds**: `callModels`, `runDelegateChild` (the worker inherits the env
  keys and enforces them itself; the delegate / council time caps bound it),
  `ApprovalStore.waitForDecision` (every SAFE-18 card wait; the card's TTL
  bounds it).
- **Surfaces**: `TaskResult.stopReason` / `error` (additive);
  `formatTaskPlumbing` adds `stopped=…` for the two values only; the Discord
  spawn client validates it into `task.stopReason` and the bridge chat /
  ask paths, `/session start` and `/work` pass it to the plumbing; the WATCH
  spawn client validates it and `buildSummaryBody` adds `TURN_CAP_NOTE`;
  the CLI prints `TURN_CAP_NOTE` after a capped summary, reads both keys,
  says when one is ignored, and passes `idleTimeoutMs`. Review fixes: a
  schedule post has no footer, so the scheduler logs one
  `[scheduler] schedule <id>: run stopped=turn-cap …` line (bridge and
  daemon logs; never the post, AGENT-9); a `delegate` worker's validated
  `stopReason` comes back in `DelegateChildOutcome` and the tool's `data`,
  so the lead knows a capped worker's answer is its best so far.
