---
change: a-stop-button-on-the-run-s-progress-message-lets-me-or-the-person-who-asked-stop-it-agent-3-a
artifact: testing
---

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
