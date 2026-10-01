# Lesson bundle — an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: An idle timeout and a turn cap I set stop stalled or endless runs, and it says so (AGENT-12)
- **Kind**: Feature
- **Specs**: agent, cli, discord, watch, plugins
- **Paths**: .env.example, README.md, docs/DISCORD-GO-LIVE.md, docs/discord.md, docs/WATCH.md, plugins/fledge/spawn.ts, src/agent/execute.ts, src/agent/index.ts, src/agent/limits.ts, src/agent/loop.ts, src/agent/task-summary.ts, src/agent/types.ts, src/agent/verify.ts, src/approvals/store.ts, src/autonomous/delegate.ts, src/cli.ts, src/discord/agent-client.ts, src/discord/bridge.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/discord/types.ts, src/watch/agent-client.ts, src/watch/poller.ts, src/watch/summary.ts, src/watch/types.ts, tests/agent.limits.test.ts, specs/agent/agent.spec.md, specs/agent/testing.md, specs/cli/cli.spec.md, specs/cli/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/watch/watch.spec.md, specs/watch/testing.md, specs/plugins/plugins.spec.md, specs/plugins/testing.md, docs/DAEMON.md, src/scheduler/service.ts, plugins/autonomous/commands.ts
- **Acceptance**: AGENT-12 (captured on main from Leif's 2026-09-28 interview, round 2) holds on every surface: CORVIDINHO_MAX_TURNS (optional, a positive whole number, default 8 = today's maxToolRounds) caps model/tool rounds per execute attempt so AGENT-4.a verify retries are kept, the capped attempt ends with its best prose so far (AGENT-9) and TaskResult.stopReason is turn-cap only when the final attempt hit it; CORVIDINHO_IDLE_TIMEOUT_MS (optional, default 600000) is a per-run watchdog reset by every run event (what the CLI prints or streams), tool process output (spawnCapped) and verify-lane output, held while a model call is in flight, while a delegate or council worker runs (workers inherit both limits) and while the run waits on an Approve card (#316/#319/#334 waits through ApprovalStore.waitForDecision); with no output for that long the run's abort signal kills tool and verify-lane process trees (reused proc-group kill) and the run ends failed (not cancelled, exit 1) with stopReason idle-timeout, a one-line result error 'Stopped: no output for 10 minutes (idle timeout).' (the field DISCORD-3.b reads) that also leads its summary; Discord shows only stopped=turn-cap / stopped=idle-timeout in the footer and thinking plumbing (formatTaskPlumbing), never in the channel body (AGENT-9, DISCORD-3.a); WATCH comments and the CLI's human output get a plain turn-cap note; an ignored setting is said in one operator line; both are documented in --help and .env.example with today's behaviour as default; tests/agent.limits.test.ts fails on the base sources and passes on the branch

## Evidence

- Verification commit: `07000bae2fd3237bd7676fbfed2b9ee696820a20`
- Base commit: `aeb2de3407acd0990897121ac68caf1553be0118`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins --spec watch`

## From the change's context.md

# Context

Tracked under issue #80 (M3 "Real dev teammate"; tracker #123). Leif
confirmed AGENT-12 in the 2026-09-28 interview (round 2, "#79/#80 providers:
capture all four") and it is captured on main in `hi/agent.md`: "An idle
timeout and a turn cap that I set stop stalled or endless runs, and it says
so." Nothing new is captured in this change.

What was wrong on main (aeb2de3): there was no idle timeout and no turn cap
I could set. The tool loop had a fixed `maxToolRounds ?? 8` per attempt
(`task run` passed none, and no env key, config key or flag set it), and the
only time bound was the fixed 10-minute per-request model timeout
(REQ-agent-244). A tool or a verify lane that hung silently kept the run
going until the bridge's own limits, if any; a run that hit the round cap
said so only in an operator `Text` line.

Constraints: specs only through SpecSync; v1 off-chain; #232/#233 scope
untouched; second-review-1 (`src/work/review.ts`, the github-pr-create
gate) is built in parallel and not touched; in `src/agent/execute.ts` only
the loop-limit and model-call regions change (the #325 fallback chain,
#328/#334/#339 spend guard, #313 repeat guard and #335 stall nudge are kept
as they are). #340 (DISCORD-3.b, `src/discord/failure-reason.ts`) landed on
main (aeb2de3) while this was built, and this change is rebased on it: an
idle-timed-out run sets the result's `error` to its one line, which
`failureReasonFor` shows as the owner's reply (everyone else gets "That
didn't work — the owner has been told."). Where a design question
remains, the conservative defaults in `/home/user/coord/m34-defaults.md`
(providers rows) are used and listed in the PR under "Design choices pending
Leif".

## From the change's design.md

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

## From the change's testing.md

# Testing

`tests/agent.limits.test.ts` (32 tests). The model is the fake LLM
(`tests/fixtures/fake-llm.ts`): an injected fetch in-process, the localhost
server for spawned `task run`s. Fake `fledge` and `corvidinho` bins are sh
scripts in temp dirs under the test's scratch root; the CLI cases run in a
temp non-git dir or a carried talk worktree of a temp repo
(`makeCarriedTalk`), never this checkout. Timing margins are wide (the
shortest wait that must not fire is 3× the gap that feeds it) so a loaded box
does not flake them.

Fail-on-base proof: with the base's (aeb2de3, main with #340) twenty modified sources swapped
in (`.env.example`, `plugins/fledge/spawn.ts`, `src/agent/execute.ts`,
`index.ts`, `loop.ts`, `task-summary.ts`, `types.ts`, `verify.ts`,
`src/approvals/store.ts`, `src/autonomous/delegate.ts`, `src/cli.ts`,
`src/discord/agent-client.ts`, `bridge.ts`, `command-handlers/session.ts`,
`command-handlers/work.ts`, `types.ts`, `src/watch/agent-client.ts`,
`poller.ts`, `summary.ts`, `types.ts`; the new `src/agent/limits.ts` kept so
imports resolve), `bun test tests/agent.limits.test.ts` gave 10 pass, 18
fail: every turn-cap case (2 or 8 requests but no `stopReason`; the CLI made
8 requests and printed no line), the final-attempt `stopReason` case, both
stalled-run cases (no watchdog: they hang until the test timeout), the
`spawnCapped`, Approve-card and worker hold cases (the watchdog fires), the
plumbing, Discord client, both bridge footer cases (the owner's
idle-timeout reply line itself comes from #340 and holds on the base; its
footer lacks `stopped=idle-timeout`) and the WATCH comment case, the CLI
invalid-value note, the hung verify lane (still running at the 60 s timeout)
and the help / `.env.example` case. The 10 that pass on the base are the
units of the new module and the cases that must not stop a run (no
watchdog stops nothing). Restored: 28 of 28 pass. (Run first against
9ea766b before rebasing on #340: 10 pass, 17 fail of the then 27.)

Review (4 tests added, 32 in all): with the base's sources swapped in again
(the twenty-one modified sources, now with `src/scheduler/service.ts` and
`plugins/autonomous/commands.ts`; `src/agent/limits.ts` kept), 11 pass, 21
fail; the new stuck-tool, delegate `stopReason` and schedule log cases fail
there (the stuck tool hangs to the test timeout). Against the pre-review
branch head (05f7a6c) all 4 new tests fail (the stuck tool hangs; an
`idleTimeoutMs` of 0 stopped a quiet run after 1 ms; no worker
`stopReason`; no scheduler line) and the 28 earlier ones pass. Restored: 32
of 32 pass.

Unchanged suites that cover the touched files pass: `agent.tool-loop`,
`agent.soft-land`, `agent.loop`, `agent.verify-gate`, `agent.verify-env`,
`agent.cli`, `agent.ndjson-spawn`, `autonomous.delegate`,
`autonomous.council`, `agent.spend-approve`, `must-ask.gate`,
`watch.reliability`, `watch.summary-scrub`, `discord.thinking-bridge`,
`fledge.hardening`, `agent.fallback`, `agent.execute` (293 tests), and the
full `bun test`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-244` | `tests/agent.limits.test.ts` ("the settings") | `idleTimeoutFromEnv` default 600000, `90000` kept, `0`/`off`/`-1`/`10m` ignored (`invalid`), a huge value clamped to 2147483647; `idleTimeoutLine(600000)` is `Stopped: no output for 10 minutes (idle timeout).`; the watchdog fires only after a full silent wait and nested holds keep it from firing. |
| `REQ-agent-244` | `tests/agent.limits.test.ts` ("the idle timeout I set") | A hung tool at 150 ms ends `failed`, not cancelled, `stopReason: "idle-timeout"`, `error` and summary the stop line, last events `Text` + `StateChanged failed`, plumbing `… stopped=idle-timeout`; best prose kept after the line with the unverified-changes note; a run that keeps calling `noteIdleActivity`, and a read-tier run whose model takes 1.5 s against 600 ms, are not stopped; a caller abort stays cancelled with no `stopReason` / `error`. Fail on base (hang). |
| `REQ-agent-244` | `tests/agent.limits.test.ts` ("what holds or feeds the watchdog …") | A silent 1.2 s `delegate` worker does not fire a 400 ms lead watchdog and the worker sees `CORVIDINHO_MAX_TURNS=3` / `CORVIDINHO_IDLE_TIMEOUT_MS=45000`; an Approve-card wait holds it. Fail on base. |
| `REQ-agent-244` | `tests/agent.limits.test.ts` ("corvidinho task run (CLI, AGENT-12)") | A silent hung verify lane under `CORVIDINHO_IDLE_TIMEOUT_MS=4000`: exit 1, `failed` frame with `stopReason`/`error`, fake `fledge` and its lane task killed (fail on base: still running at 60 s); a lane printing every 0.5 s for 6 s under 3 s is verified. |
| `REQ-agent-244` | `tests/agent.limits.test.ts` ("a stopped run always ends") | A tool-tier run whose tool never returns and ignores the abort ends about `IDLE_STOP_GRACE_MS` after a 200 ms timeout: `failed`, not cancelled, `stopReason: "idle-timeout"`, `attempts: 1`, summary `… (idle timeout). Any changes so far were not verified.`, last events the `[operator] AGENT-12: the step the run was on did not stop …` line, the stop line and `StateChanged failed` (fail on base and on 05f7a6c: hang). `effectiveIdleTimeoutMs` maps 0 / -5 / 0.5 / NaN / Infinity / undefined to 600000, and runs with `idleTimeoutMs` 0, -1 or NaN and a 150 ms silent attempt end `done` (fail on 05f7a6c: stopped after 1 ms). |
| `REQ-agent-312` | `tests/agent.limits.test.ts` ("a delegate worker a limit stopped …") | A worker whose `result` frame has `stopReason: "turn-cap"` gives an outcome with it; `Stopped after 8 tool rounds` gives none. Fail on base. |
| `REQ-agent-312` | `tests/agent.limits.test.ts` ("the turn cap I set") | `CORVIDINHO_MAX_TURNS=2`: 2 requests, `stopReason: "turn-cap"`, the last prose as summary, the `[operator] Stopped after 2 tool rounds (tools: noop-tool)` event; unset: 8; a capped run's plumbing `state=done verified=false verifySkipped attempts=1 stopped=turn-cap` and chat body only the prose. Fail on base. |
| `REQ-agent-312` | `tests/agent.limits.test.ts` ("stopReason is only the final attempt's …") | A capped first attempt whose retry verifies: no `stopReason`, the retry got the lane feedback; a capped final attempt: `stopReason: "turn-cap"`, verified; a cancelled run: none. |
| `REQ-cli-125` | `tests/agent.limits.test.ts` ("corvidinho task run (CLI, AGENT-12)") | `CORVIDINHO_MAX_TURNS=2`: 2 model requests, `still listing` then the turn-cap line on stdout, ndjson `result` with `stopReason: "turn-cap"`; `lots` / `off` give their `[operator] AGENT-12: …` lines without the value; `--help` and `.env.example` name both keys. Fail on base. |
| `REQ-discord-125` | `tests/agent.limits.test.ts` ("it says so on each surface") | The spawn client keeps `stopReason: "turn-cap"` and drops `Stopped after 8 tool rounds`; a mention answer's footer has `… attempts=1 stopped=turn-cap` and its body is only the prose; an idle-timed-out frame (exit 1) gives `failureReason` = the stop line and `task.stopReason: "idle-timeout"`, and the owner's own mention gets that line as the reply with `state=failed verified=false attempts=1 stopped=idle-timeout` in the footer; `waitForDecision` answered after 0.9 s does not fire a 250 ms watchdog, which fires once the card is decided. Fail on base. |
| `REQ-agent-312` | `tests/agent.limits.test.ts` ("a schedule run that hit the turn cap") | Two owner schedules, one whose run returns `task.stopReason: "turn-cap"`: both posts end `:\nHere is what I found so far.` with no `turn` / `stopped=`, and the scheduler logs exactly one `[scheduler] schedule <id>: run stopped=turn-cap …` line, for the capped one. Fail on base. |
| `REQ-watch-125` | `tests/agent.limits.test.ts` ("WATCH: …") | The WATCH client keeps `stopReason`; the comment has the prose, a blank line and the turn-cap line, no `stopped=`; an idle-timed-out spawn (exit 1, `error` the stop line) gives `failureReason` the stop line and its comment is `Failed (exit 1).` and that one reason line (REQ-watch-009) without its summary or the turn-cap line; a failed turn-capped run shows its reason line without the note. Fail on base. |
| `REQ-plugins-125` | `tests/agent.limits.test.ts` ("tool output (spawnCapped …)") | A child printing every 0.1 s for 1.5 s keeps a 500 ms watchdog from firing; a silent 1.2 s child lets it fire. Fail on base. |

## Where these lessons go

- `specs/agent/context.md`
- `specs/cli/context.md`
- `specs/discord/context.md`
- `specs/watch/context.md`
- `specs/plugins/context.md`
