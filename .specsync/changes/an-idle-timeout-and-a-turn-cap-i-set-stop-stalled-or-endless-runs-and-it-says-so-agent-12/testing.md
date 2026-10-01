---
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
artifact: testing
---

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
| `REQ-watch-125` | `tests/agent.limits.test.ts` ("WATCH: …") | The WATCH client keeps `stopReason`; the comment has the prose, a blank line and the turn-cap line, no `stopped=`; an idle-timed-out comment is `Failed (exit 1).` and its stop-line summary without the turn-cap line. Fail on base. |
| `REQ-plugins-125` | `tests/agent.limits.test.ts` ("tool output (spawnCapped …)") | A child printing every 0.1 s for 1.5 s keeps a 500 ms watchdog from firing; a silent 1.2 s child lets it fire. Fail on base. |
