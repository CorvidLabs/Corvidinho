---
change: a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after
artifact: testing
---

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
