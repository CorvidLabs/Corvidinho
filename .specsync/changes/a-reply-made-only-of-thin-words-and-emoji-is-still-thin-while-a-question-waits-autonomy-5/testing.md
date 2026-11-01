---
change: a-reply-made-only-of-thin-words-and-emoji-is-still-thin-while-a-question-waits-autonomy-5
artifact: testing
---

# Testing

Seven new tests, no live Discord: the real `startBridge` over a null
gateway with dry-run outbound and a scripted agent client
(`tests/discord.thin-ack.test.ts`), the existing Answer form harness
(`tests/discord.ask-answer-modal.test.ts`) and the schedule ask bridge on
an in-memory DB (`tests/discord.schedule-ask.test.ts`).

Fail-on-base proof (`origin/main` 49273ff): with main's
`src/discord/thin-ack.ts` swapped in, all 7 new tests fail and the other
51 tests of the three files pass; restored, 58 of 58 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-044` | `tests/discord.thin-ack.test.ts` "isThinAck / isCancelAsk (AUTONOMY-5/6)" > "a reply made only of listed thin words and emoji, split on spaces / commas, is thin" | `ok 👍`, `👍 ok`, `hmm ok`, `yeah ok`, `sure, ok`, `k k`, `OK 👍👍`, `hmm, ok 👍`, `ok <:party:…>`, `okay. 👍` thin, not cancel. Fails on base. |
| `REQ-discord-044` | same describe > "any piece that is not a listed thin word or emoji keeps the reply an answer" | `ok use postgres` (± 👍), `option 2`, `2 👍`, `👍 2`, `2`, `Postgres 👍`, `sure, option 2`, `go with the first one` not thin. Fails on base (`2`, `2 👍`, `👍 2` were emoji). |
| `REQ-discord-044` | same file "a reply of thin words and emoji restates, never answers (AUTONOMY-5)" > "while a Choose ask waits, `ok 👍` restates its stub with the Choose button once; no run, the ask stays" | each of the 7 replies: one restatement (Choose hint, requester mention, `buildOpenStubComponents(askId)`), no "ready when you are", one agent call, the same ask pending. Fails on base. |
| `REQ-discord-044` | same describe > "while a free-text ask waits, `ok 👍` restates the question with its Answer button once; no run, the ask stays" | each of the 7 replies: one restatement (quoted question, `ASK_ANSWER_HINT`, `buildAnswerStubComponents(askId)`), no "ready when you are", one agent call, the ask pending. Fails on base. |
| `REQ-discord-044` | same describe > "`2 👍` is an answer: on a free-text ask it clears the ask and runs the agent with the question" | second run's prompt holds the question and `2 👍`; no pending ask. Fails on base. |
| `REQ-discord-044` (REQ-discord-548 form) | `tests/discord.ask-answer-modal.test.ts` > "a submit made only of thin words and emoji (`ok 👍`, `hmm ok`, `sure, ok`) is not an answer (AUTONOMY-5): …" | one ephemeral restatement each with the Answer button, no run, nothing posted, ask kept. Fails on base. |
| `REQ-discord-044` (REQ-discord-606 form) | `tests/discord.schedule-ask.test.ts` > "a form answer made only of thin words and emoji (`ok 👍`) is restated privately and the question stays open (AUTONOMY-5)" | `ok 👍`, `hmm ok`, `sure, ok`: one ephemeral restatement each with the Cancel control; `schedule_runs` ask still open (no outcome, answer or close time). Fails on base. |
| all | `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
