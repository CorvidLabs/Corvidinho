# Lesson bundle — a-stop-button-on-the-run-s-progress-message-lets-me-or-the-person-who-asked-stop-it-agent-3-a

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A Stop button on the run's progress message lets me or the person who asked stop it (AGENT-3.a)
- **Kind**: Feature
- **Specs**: discord
- **Paths**: docs/discord.md, specs/discord/discord.spec.md, specs/discord/testing.md, src/discord/bridge.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/discord/gateway.ts, src/discord/inflight-replies.ts, src/discord/run-control.ts, src/discord/thinking-status.ts, tests/discord.ask-answer-modal.test.ts, tests/discord.stop-run.test.ts, tests/discord.thinking-status.test.ts
- **Acceptance**: AGENT-3.a (captured on main from Leif's 2026-09-28 interview): 'In Discord I can stop a run with a Stop button or by saying stop or cancel, and so can the person who asked; a message sent while a run is going waits for it instead of starting a second run.' AGENT-3.b (captured in #332, Leif 2026-09-30): 'After I stop a run, messages that were waiting still run, in order.' Nothing new is captured. This change builds the Stop button, completing AGENT-3.a for chat, ask pick / Answer resume, /session start and /work runs; stopping a schedule's run from Discord (Leif round 13: the owner or the schedule's creator can) is a separate later slice. Observable outcomes: (1) the progress message of each of those runs carries one danger-style (red) Stop button, custom id cvstop:<runId>, while the run goes (on a reused Choose / Answer stub it takes that button's place); working edits leave it. (2) A press, past the channel gate (the pressed message's session: the run it shows, else the session its finished answer is tracked on, else the press channel alone), the actor gate and the mute/rate gate (the same gates, replies and order as an ask press), from the run's requester or the configured owner stops that run through the same run-control stop path as the stop words (its signal aborted once, the process tree killed) with the ephemeral ack '⏹ Stopping the run.'; the progress message then becomes '⏹ Stopped' with the DISCORD-15/15.a footer and the button gone; a second press while it winds down aborts nothing more. (3) Anyone else's press gets the ephemeral 'This Stop button isn't for you.' and the run goes on; a press whose run is not the one that message shows running in that channel (a finished run's button, another run id, another channel, a button from before a restart) gets the ephemeral 'Nothing is running.' and stops nothing. (4) The button is cleared when the run is done (the collapsed answer), failed (the answer, or the failure status when the run throws or the fallback status edit) or stopped, and by the restart's interrupted notice for a run a dead process left. (5) After a Stop press the messages that were waiting still run, in order, each with its own button (AGENT-3.b). (6) The cvstop branch is its own branch in onComponent, apart from the Approve cards (cvok), the asks (cvask) and any later cvstop-... id; a forged form submit with a Stop id is ignored. No new env var, config key, slash command, table or schema change. Tests: tests/discord.stop-run.test.ts and tests/discord.thinking-status.test.ts (stub agents, dry-run bridge, in-memory outbound, fake LLM fixture model; no network), failing on the base (9ea4005) and passing on the branch.

## Evidence

- Verification commit: `c25e4eefc9b2c765f7d4df9b9133022e10cdbedb`
- Base commit: `9ea40051c5cd6841c201e1210319ee621aa4bde0`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Part of #122 (M2 "Talk anywhere"); slice stop-button-2 of the M3/M4 plan
(`/home/user/coord/pr-stop-button-2.json`), stacked on stop-button-1 (#332,
merged as f79a848), which built the per-session queue and the stop words. No
tracking issue names AGENT-3, so the PR says "Part of #122".

Leif confirmed AGENT-3.a in the 2026-09-28 interview (round 7: "Stop button +
'stop'/'cancel' text from requester or owner aborts the session's run
(process tree killed); a follow-up while running is queued, not run in
parallel"); it is captured on main in `hi/agent.md`. AGENT-3.b ("After I
stop a run, messages that were waiting still run, in order.", round 13) was
captured in #332. Nothing new is captured here.

What was missing on main (9ea4005): AGENT-3.a names a Stop button, but a run
could only be stopped by the words 'stop' / 'cancel'; the progress message
carried no component, and `onComponent` knew only Approve cards (`cvok:`) and
asks (`cvask:`).

Constraints: build on #332's `SessionRunControl` (run id, AbortController,
progress-message map, idempotent `stop`) and reuse its stop path, never a
second one; smallest change on the progress-message plumbing
(`ThinkingStatus`, `ThinkingOutbound.sendEmbed` / `editEmbed`, the live
gateway, `memoryThinkingOutbound`) and the `onComponent` cvstop branch; the
press sits behind the same channel, actor and mute / rate gates as an ask
press; no new env var, config key, slash command, table or schema bump;
specs only through SpecSync; #232 / #233 untouched; v1 off-chain. Parallel
slices touch `src/cli.ts` / agent-client spawners (cli-worktree) and the
spend guard / schedule-ask spend continue (spend-caps-c), so this change
stays out of those files. Out: stopping a schedule's run from Discord (Leif
round 13: the owner or the schedule's creator can) — a separate later slice.

## From the change's design.md

# Design

- **`run-control.ts`.** New exports only: `RUN_STOP_PREFIX` (`cvstop`),
  `RUN_STOP_LABEL`, `RUN_STOP_NOT_YOURS`, `RUN_STOP_NOTHING_RUNNING`,
  `stopRunCustomId` / `parseStopRunCustomId` (`cvstop:run_<n>`, exactly two
  parts, so `cvstop-schedule:…`, `cvok:…`, `cvask:…` parse as null) and
  `buildStopComponents(runId)` (one action row, one style-4 button). The
  queue, `stop`, `byProgressMessage` and the run ids are unchanged.
- **`ThinkingStatus`.** Optional `components`: sent with the progress embed
  (`sendEmbed`), or on a reused stub in place of `components: null`
  (`editMessage`, else `editEmbed`); working edits send no `components`
  (Discord keeps them); `done` / `fail` edit with `components: null` (only
  when the button was shown, so a status without components edits exactly as
  before); `finalizeContent` already writes `null` (or the answer's own
  components) on the first part; `discard` deletes or clears. The
  `ThinkingOutbound` / gateway `sendEmbed` and `editEmbed` gain optional
  `components` (`null` ⇒ `[]` on the wire; omitted ⇒ untouched).
  `memoryThinkingOutbound` records them.
- **Run paths.** Chat, pick / Answer, `/session start` and `/work` pass
  `buildStopComponents(turn.runId)` to `ThinkingStatus` (slash only when a
  turn exists). `setProgressMessage` already maps the message to the turn.
- **Press.** `onComponent`: after the Approve-card branch and before the ask
  parser, `parseStopRunCustomId`; a form submit with that id is ignored. The
  ask branch's channel / actor / mute-rate block moves verbatim into
  `pressPassesGates(interaction, talk)`, which both branches call. The run is
  `byProgressMessage(interaction.messageId)` when its run id and channel match
  the press (so a button from a finished run or an earlier process, whose
  progress message is no longer mapped, stops nothing); the gate's talk is
  that run's session, else the session the pressed (finished answer) message
  is tracked on, else the press channel alone. Then: no run ⇒ 'Nothing is
  running.'; not requester / owner ⇒ 'This Stop button isn't for you.'; else
  `stopRun` (the one helper `stopRunFor` now uses too: `SessionRunControl.stop`
  + the log line) and the ephemeral `RUN_STOP_ACK` (a race that finds the run
  gone gets 'Nothing is running.').
- **Restart.** `recoverInterruptedReplies` edits the interrupted embed with
  `components: null`, so a dead run's button goes too.
- **Alternatives rejected.** Looking the run up by id alone (`run_<n>` restarts
  at 1 each process, so an old button could stop a new run); a public ack
  (the words' ack is public because the stop message is; a press has a
  private answer); `update`-ing the message on press (the `⏹ Stopped` edit
  follows at once and clears it); a new `editEmbed`-free `done` via
  `editMessage` (more calls change for existing callers).

## From the change's testing.md

# Testing

Stub agents that wait until the test finishes them (an abort ends them like
a killed process), a dry-run bridge with a fake gateway and the in-memory
outbound, the configured model from the fake LLM fixture
(`useConfiguredModel`; no model is called); a temp SQLite DB for the
interrupted-notice test; recording `ThinkingOutbound` fakes for the
`ThinkingStatus` units. No network, no key or token.

Fail-on-base proof: with the base's (9ea4005) sources swapped in for the six
modified files (`bridge.ts`, `thinking-status.ts`, `gateway.ts`,
`inflight-replies.ts`, `command-handlers/session.ts`,
`command-handlers/work.ts`; the branch's `run-control.ts` kept so the tests'
imports resolve), `bun test tests/discord.stop-run.test.ts
tests/discord.thinking-status.test.ts tests/discord.ask-answer-modal.test.ts`
gave 62 pass, 14 fail; restored, 76 pass, 0 fail. The 14 are 13 of the 16
new tests and the changed Answer form test; the 3 new tests that pass on the
base are the custom-id unit (the new module), "the collapsed answer replaces
it" and "without components nothing changes" — behaviour the base already
has (`finalizeContent` writes `components: null`; no components, no field).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-303` | `tests/discord.stop-run.test.ts` ("a chat run's progress message carries one red Stop button …") | One row, one style-4 `Stop` button `cvstop:run_<n>` on the sent progress message; working edits carry no components; the requester's press: ephemeral `⏹ Stopping the run.` only, one abort, nothing public, `⏹ Stopped` with `<model> \| <time>` in the error colour and `components: null`; a later press gets `Nothing is running.`. Fail on base. |
| `REQ-discord-303` | `tests/discord.stop-run.test.ts` ("the owner's press stops someone else's run …") | A third user gets `This Stop button isn't for you.` and the run goes on; the owner's press stops it and starts no owner session. Fail on base. |
| `REQ-discord-303` | `tests/discord.stop-run.test.ts` ("a finished run's button is cleared …", "a failed run's answer clears the button too …") | Done, failed and thrown runs end with the components cleared; a finished run's button, mismatched ids and channels, a pre-restart button get `Nothing is running.` (an unknown thread the zero-width ack) and abort nothing. Fail on base. |
| `REQ-discord-303` | `tests/discord.stop-run.test.ts` ("a press passes the channel, actor and mute gates first …") | Deny-listed thread (zero-width; owner: `ALLOWLIST_DENY_TIP`), deny-listed and muted requester refused, forged form submit ignored, none stops the run; past the gates the press stops it. Fail on base. |
| `REQ-discord-303`, `REQ-discord-302` | `tests/discord.stop-run.test.ts` ("a second press (or a 'stop' reply) while the run winds down …") | Two presses and a 'stop' reply: one abort, one `⏹ Stopped`, each gets its ack. Fail on base. |
| `REQ-discord-303` | `tests/discord.stop-run.test.ts` ("after a Stop press, messages that were waiting still run …") | Waiting messages get no progress message while waiting; after the press they run in order, each with its own button (three ids), all cleared at the end (AGENT-3.b). Fail on base. |
| `REQ-discord-303` | `tests/discord.stop-run.test.ts` ("a pick's resumed run …", "/session start and /work …") | The stub's Choose button is replaced by the Stop button and the press stops the run; `/session start` and `/work` progress messages carry it and a press stops them; `/work` says `PR: not opened — the run was stopped.` and is `failed` / `stopped`. Fail on base. |
| `REQ-discord-303` | `tests/discord.stop-run.test.ts` ("a restart's interrupted notice clears the dead run's Stop button") | `recoverInterruptedReplies` edits with `components: null`. Fail on base. |
| `REQ-discord-303` | `tests/discord.stop-run.test.ts` ("cvstop:<runId> round-trips …") | `parseStopRunCustomId` accepts only `cvstop:run_<n>`; `cvstop-schedule:…`, extra parts, malformed ids, ask and card ids give null. |
| `REQ-discord-303` | `tests/discord.thinking-status.test.ts` ("the progress message's Stop button") | Sent with the embed, reused stub via `editMessage` else `editEmbed`, working edits leave it, `done` / `fail` send `components: null`, the answer carries none or its own; without components no call has the field. Three of five fail on base. |
| `REQ-discord-548` | `tests/discord.ask-answer-modal.test.ts` ("submit → same session resumed …") | The resumed stub's Answer button is replaced by the Stop button (content cleared) and the answer's final edit clears it. Fail on base. |
| `REQ-discord-302` | existing `tests/discord.stop-run.test.ts` stop-word tests | Unchanged and passing: the stop words still stop a run as before. |

## Automated coverage

- `tests/discord.stop-run.test.ts` (27 tests, 11 new), `tests/discord.thinking-status.test.ts` (20 tests, 5 new), `tests/discord.ask-answer-modal.test.ts` (29 tests, 1 changed).
- Unchanged suites over the touched files still pass: every `tests/discord.*.test.ts`
  (chat, slash, asks, spend, inflight replies, rich replies, run queue).

## Where these lessons go

- `specs/discord/context.md`
