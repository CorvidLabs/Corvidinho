# Lesson bundle — a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A message sent while a run is going waits for it, and stop or cancel stops the run; waiting messages still run after (AGENT-3.a, AGENT-3.b)
- **Kind**: Feature
- **Specs**: discord
- **Paths**: docs/discord.md, specs/discord/discord.spec.md, specs/discord/testing.md, src/discord/bridge.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/discord/message-router.ts, src/discord/run-control.ts, src/discord/slash-types.ts, src/discord/types.ts, tests/discord.run-queue.test.ts, tests/discord.stop-run.test.ts
- **Acceptance**: AGENT-3.a (captured on main from Leif's 2026-09-28 interview): 'In Discord I can stop a run with a Stop button or by saying stop or cancel, and so can the person who asked; a message sent while a run is going waits for it instead of starting a second run.' AGENT-3.b (captured in this change's PR with hi, Leif's 2026-09-30 decision, round 13 of the 2026-09-28 record): 'After I stop a run, messages that were waiting still run, in order.' This change builds the queue and the stop/cancel text (AGENT-3.a is partial: the Stop button is the next slice, and stopping schedule runs is later). Observable outcomes: (1) per Discord session one run at a time: a chat message, an ask pick or Answer submit sent while a run of that session is going waits for it, first in first out, instead of starting a second run; runs of different sessions go in parallel; a waiting message gets no new indicator (its normal progress message comes when its turn starts) and its in-flight row (REQ-discord-311) is recorded from when it starts waiting; after waiting, a session that ended or idled out, or a requester forgotten meanwhile, runs and posts nothing; /session start and /work take their new session's turn. (2) 'stop' or 'cancel' as the whole message from the requester in their session, or from the requester or the owner as a reply to the running run's progress message (the stop_run route, checked right after the channel gate and before the thread and bot-message lookups, past the actor and mute/rate gates), aborts that run's signal once (idempotent), which kills its whole process tree, answers with one short ack, and the progress message becomes '⏹ Stopped' with the DISCORD-15/15.a footer; a question the run raised is dropped; an Approve card the killed run waited on closes as a no (SAFE-20) on the card pass that runs after the stop; a stopped /work is failed ('stopped') and opens no PR. (3) Waiting messages are never dropped by a stop and run after it in order (AGENT-3.b). (4) With nothing running, 'cancel' keeps today's behaviour (clears open asks) and 'stop' is ordinary text. (5) Bridge stop aborts every run still going (no post) and starts no waiting message; their in-flight rows stay for the next start's interrupted notice. No new env var, config key, slash command, table or schema change. Tests: tests/discord.run-queue.test.ts and tests/discord.stop-run.test.ts (stub agents and fake agent bins, fake LLM fixture model; no network), failing on the base (af4597e) and passing on the branch.

## Evidence

- Verification commit: `b4dae7633c63babbcf6f8cbef7fb079a51f6a06c`
- Base commit: `41ec90df25d36a9cb4b09c1938860b6cfc70e9fa`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Part of #122 (M2 "Talk anywhere"); slice stop-button-1 of the M3/M4 plan
(`/home/user/coord/pr-stop-button-1.json`). No tracking issue names AGENT-3
(searched open issues for AGENT-3 / stop / queue), so the PR says "Part of
#122".

Leif confirmed AGENT-3.a in the 2026-09-28 interview (round 7: "Stop button +
'stop'/'cancel' text from requester or owner aborts the session's run
(process tree killed); a follow-up while running is queued, not run in
parallel"); it is captured on main in `hi/agent.md`. In round 13 (2026-09-30)
he decided "Stop and the queue: waiting messages still run in order after a
stop", captured in this PR with `hi` as AGENT-3.b ("After I stop a run,
messages that were waiting still run, in order.").

What was wrong on main (af4597e): every Discord message routed to a session
started its own `task run` at once, so a follow-up sent mid-run ran in
parallel in the same worktree and thread, and nothing on Discord could stop a
run: `AgentRunChatOpts.signal` (which kills the process tree, REQ-cli-108)
was only used by the daemon and the scheduler at shutdown. 'cancel' only
cleared open asks.

Constraints: smallest change on the existing run paths (bridge chat,
ask pick / Answer resume, `/session start`, `/work`); reuse the spawn
client's process-group kill, the in-flight reply rows (REQ-discord-311) and
the Approve/Deny card engine's "nobody waits ⇒ no" (SAFE-20); no new env
var, config key, slash command, table or schema bump; specs only through
SpecSync; #232/#233 and the files of #328 (spend caps) and #329 (repo ways)
untouched; v1 off-chain. Out: the Stop button (next slice, stop-button-2)
and stopping a schedule's run from Discord (a later slice; Leif round 13:
the owner or the schedule's creator can stop it) — so AGENT-3.a is partial
here.

## From the change's design.md

# Design

- **`SessionRunControl` (new `src/discord/run-control.ts`).** A per-session
  promise chain: `enqueue` appends a turn whose `ready` resolves when every
  earlier turn of the session is `done` (at once, synchronously marked
  running, when the session is free); FIFO; sessions independent. Each turn
  has an `AbortController`, a list of progress message ids mapped to it while
  it runs, `stopReason` (`stopped` | `closed`), `stoppedBy`, and a
  `requesterForgotten` flag from a per-user forget epoch. `stop(runId)` aborts
  a running turn once (`already` after that, `none` when it is not running);
  waiting turns are never stopped or dropped (AGENT-3.b). `close()` aborts the
  running turns (`closed`) and makes every waiting or later `ready` false;
  `settle(ms)` waits for open turns. `onStopped` runs after a stopped turn is
  done. In memory only.
- **Router.** `RouterDeps.runs` (the control's `byProgressMessage`);
  `stopRunRoute` right after the own-channel gate: a reply whose body
  (`promptBodyForAskGate(stripMentions(...))`) is exactly stop/cancel to a
  running turn's progress message, in that message's channel, from its
  requester or the owner, then `refuseActor` and `refuseRateOrMute` →
  `{ kind: "stop_run", runId, sessionId }`; anything else falls through
  unchanged.
- **Bridge chat path.** `stop_run` → `stopRunFor` (stop, one ack tracked on the
  run's session). A `continue_session` whose body is stop/cancel while
  `current(session)` exists → the same. Otherwise `enqueue`; a turn that must
  wait gets its in-flight row now; after `ready` (false ⇒ `keep()` the row and
  return) a waited turn whose session is gone or requester forgotten, or that
  no longer passes the channel, actor or mute gate (`waitedMessageStillAllowed`;
  `/admin` changes and mutes are live), returns;
  the rest of the old body runs inside the same try (re-indented), with
  `inflight ??= trackInflight(...)`, `setProgressMessage`, `signal:
  turn.signal`, and after the run: `closed` ⇒ `keep()` + dispose, no post;
  `stopped` ⇒ no ask, body `RUN_STOPPED_TEXT`, failed status/colour, same
  footer extras; `finally` ends the row and `done()`s the turn.
- **Pick / Answer path.** The same turn around the resumed run, taken after
  the pick is claimed and acked (Discord's 3 s), before the thread replay; the
  row is recorded before it waits; after waiting the press is re-gated
  (`waitedPressStillAllowed`: press and session channels, actor, mute); a
  skipped turn deletes the "Got it" ephemeral.
- **Slash.** `SlashContext.runControl`; `/session start` and `/work` enqueue
  after their session exists and move the run into `runSessionStart` /
  `runWork` (same code, no re-indent) inside `try/finally done()`. A stopped
  run's `result` loses its `ask` and `ok`; `/session` answers its head lines +
  `⏹ Stopped`; `/work` records `failed` / `stopped` and the PR line
  `WORK_STOPPED_PR_REASON` (also when the stop lands after the agent exited,
  before the PR step); `closed` posts nothing.
- **Bridge stop.** `runControl.close()` first, `settle(ABANDONED_SETTLE_MS)`
  before the gateway stops.
- **Cards.** `onStopped` → `approvals.deliver()`: the killed run's card is
  orphaned and closes as a no in that pass.
- **Alternatives rejected.** A "waiting" indicator (m34 default: none);
  dropping waiting messages on stop (AGENT-3.b says they run); a new
  `WorkTaskStatus` (touches the loader and `/status`); moving the whole chat
  body into a new function (bigger diff than re-indenting the part before the
  existing `try`).

## From the change's testing.md

# Testing

Stub agents that wait until the test finishes them (an abort ends them like a
killed process), a dry-run bridge with a fake gateway and the in-memory
outbound, the configured model from the fake LLM fixture
(`useConfiguredModel`; no model is called), and the real spawn client over
fake agent bins (`sh` for the process tree, `bun` raising a real must-ask
request as its own waiter in a temp DB file). Temp non-git projects; no
network, no key or token.

Fail-on-base proof: with the base's (af4597e) sources swapped in for the six
modified files (`bridge.ts`, `message-router.ts`, `types.ts`,
`slash-types.ts`, `command-handlers/session.ts`, `command-handlers/work.ts`;
the new `run-control.ts` kept so the imports resolve), `bun test
tests/discord.run-queue.test.ts tests/discord.stop-run.test.ts` gave 6 pass,
23 fail; restored, 29 pass, 0 fail (after the review fixes; before them it
was 6 pass, 19 fail of 25). Review fixes: with the pre-review (13597b4)
`bridge.ts` swapped in, the two gate-after-waiting tests fail; with its
`work.ts`, the late-stop `/work` test fails. The 6 that pass on the base are the three
`SessionRunControl` units, the `isStopRunText` unit, "different sessions
still run in parallel" and "with nothing running 'cancel' still clears an
open ask and 'stop' goes to the agent as before" — behaviour the base already
has.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-301` | `tests/discord.run-queue.test.ts` ("the second message starts no second run …", "three messages …") | While the first run is going the second message starts no run and no progress message; after the answer it runs in the same session (`resume: true`) with the answer in its thread and its own progress message; three run in order. Fail on base. |
| `REQ-discord-301` | `tests/discord.run-queue.test.ts` ("different sessions still run in parallel") | Another user's thread session and another channel's session are in flight together (passes on base too). |
| `REQ-discord-301` | `tests/discord.run-queue.test.ts` ("a waiting message is an in-flight reply …", "a message whose session ended …") | The waiting message's row exists with no progress message, gets it at its turn, and is gone after; a message whose session ended while it waited runs and posts nothing. Fail on base. |
| `REQ-discord-301` | `tests/discord.run-queue.test.ts` ("an ask pick waits …", "/session start and /work runs take their session's turn …") | A pick during a chat run waits and resumes with the label and that answer; the requester's @mention during a `/session start` or `/work` run waits. Fail on base. |
| `REQ-discord-301` | `tests/discord.run-queue.test.ts` ("the bridge's stop …", `SessionRunControl` units) | Bridge stop aborts the run, starts nothing waiting, posts nothing, keeps both rows; FIFO, parallel sessions, idempotent `done`, released turn never starts, `noteForgotten`, `close`. |
| `REQ-discord-302` | `tests/discord.stop-run.test.ts` ("the requester's 'stop' in their thread …", "the owner's own stopped run …") | One abort, one `⏹ Stopping the run.` reply, `⏹ Stopped` with `<model> \| <time>` (owner: tokens and cost), `⏹ Stopped` in the thread and `stop` not. Fail on base. |
| `REQ-discord-302` | `tests/discord.stop-run.test.ts` ("'cancel' as a reply …", "the owner's 'stop' in reply …", "a second 'stop' …") | Reply to the untracked progress message stops it; the owner's reply stops someone else's run and starts no owner session; a third user's does nothing; a second stop aborts nothing more. Fail on base. |
| `REQ-discord-301` | `tests/discord.run-queue.test.ts` ("a waiting message runs nothing once its author is muted or deny-listed …", "an ask pick that waited does not resume once its presser is muted …") | A mute, a user deny or a thread deny that lands while the message waits: no run, no post, no row left; a waiting pick of a presser muted meanwhile does not resume. Fail on base and on the pre-review branch. |
| `REQ-discord-302` | `tests/discord.stop-run.test.ts` ("a stop after the /work agent exited, before its PR step …") | A stop reply while the finished run's private-reply DM is still going out: ack, `PR: not opened — the run was stopped.`, task `failed` / `stopped`. Fail on base and on the pre-review branch. |
| `REQ-discord-044`, `REQ-discord-302` | `tests/discord.stop-run.test.ts` ("'cancel' while a run is going stops it and leaves the session's open button ask open") | Only the stop ack; the open button ask stays pending. Fail on base. |
| `REQ-discord-302` | `tests/discord.stop-run.test.ts` ("messages that were waiting still run after a stop, in order (AGENT-3.b)") | The stop is handled at once; the two waiting messages then run in order and are not aborted. Fail on base. |
| `REQ-discord-302` | `tests/discord.stop-run.test.ts` ("with nothing running …") | 'cancel' clears the ask with `ASK_CANCELLED_ACK`; 'stop' runs the agent with the text (passes on base too). |
| `REQ-discord-302` | `tests/discord.stop-run.test.ts` ("a pick's resumed run …", "/session start and /work stop …") | A reply to the Choose stub stops the pick's run; `/session start` and `/work` stop by a reply to their progress message; `/work` says `PR: not opened — the run was stopped.` and is `failed` / `stopped`. Fail on base. |
| `REQ-discord-302` | `tests/discord.stop-run.test.ts` ("the spawned agent and what it started are killed", "a run waiting on an Approve card …") | Real spawn client: the agent and its background child are gone; the must-ask request the killed run waited on is `expired`. Fail on base. |
| `REQ-discord-302`, `REQ-discord-002` | `tests/discord.stop-run.test.ts` (router tests, `isStopRunText`) | `stop_run` for the requester and the owner even when the progress message is a tracked bot message; other text, a third user, a finished run route as before; deny-listed requester refused quietly. Fail on base. |
| `REQ-discord-044` | `tests/discord.stop-run.test.ts` ("messages that were waiting …", "with nothing running …"); existing `tests/discord.slash-pending-ask.test.ts`, `tests/discord.ask-*.test.ts` | Cancel with a run going stops it; with nothing running it still clears every open ask; the existing cancel cases pass unchanged. |

## Automated coverage

- `tests/discord.run-queue.test.ts` (13 tests), `tests/discord.stop-run.test.ts` (16 tests).
- Unchanged suites over the touched files still pass: every `tests/discord.*.test.ts`
  (chat, slash, asks, spend, inflight replies, rich replies, safe3a surface).

## Where these lessons go

- `specs/discord/context.md`
