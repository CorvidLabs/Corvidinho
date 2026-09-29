---
change: free-text-asks-post-a-short-public-stub-with-the-question-and-one-answer-button-that-opens-a-private-form-its-submit
artifact: testing
---

# Testing

New tests — `tests/discord.ask-answer-modal.test.ts` (27 tests, bridge
harness: fake gateway, injected agent, memory outbound, no token, no network):

- Stub: the collapsed free-text ask quotes the question, has
  `ASK_ANSWER_HINT` (not `ASK_REPLY_HINT`), exactly one Answer button on the
  `open` custom_id, a footer embed, and is the ask's `stubMessageId`; a
  spend-cap stop has no button and no pending ask; `answerAskFor` returns null
  for structured / numbered options and spend-cap and drops a lone option;
  `formatAskReply` swaps the hint only with `answerButton` (never spend-cap).
- Press: the requester's press calls `showModal` with `buildAnswerModal`
  (title ≤45, one type 18 label ≤45 with the question as description, one
  required type 4 style 2 input, `max_length` = `ASK_ANSWER_MAX` =
  min(`ASK_QUESTION_MAX`, 4000)); no post, no run, ask kept. The description
  is scrubbed, one line, ≤100 chars. Another user's press: not-for-you, no
  form.
- Submit: resumes the same session (`resume: true`, `actingUserId` the
  requester) with `[Prior clarifying question you asked (the human is
  answering it now): …]\n\nHuman answer:\n<trimmed text>` and `humanText` the
  trimmed text; ephemeral `ASK_ANSWER_ACK` then deleted once; the stub is
  cleared (content and components) and edited into the answer, no extra reply;
  the typed text is never posted; the human turn is in the thread; the ask is
  cleared; a second submit is "already answered". A `sk-ant-…` key in the text
  never reaches the prompt, `humanText` or the thread (`[redacted:anthropic-key]`).
  `normalizeAskAnswer` drops control characters, trims, cuts at
  `ASK_ANSWER_MAX`, returns "" for blank / non-string. An empty submit: the
  zero-width ack, no run. A follow-up free-text ask from the resumed run gets
  its own Answer button in the same stub.
- Gates: another user's submit (not-for-you), muted press and submit
  (`MUTED`; once unmuted the submit resumes), deny-listed user or role
  (zero-width), off-channel (zero-width), rate limited (`RATE_LIMITED`), and
  past the timeout (`ASK_CHOICE_EXPIRED` for press and submit) are refused
  with one ephemeral ack, no run, nothing sent and the ask kept; after the
  late one a thin reply restates with the reply hint and no button, and a
  substantive reply still answers with the prior-question block. A form id
  without typed text or a press/pick id with typed text is ignored (no reply,
  no run). A submit on a Choose ask is refused.
- Reply fallback: a reply answers the ask as before (prior-question block),
  then the Answer press and a submit are "already answered"; a thin reply
  restates with the live Answer button.
- `/work` free-text answer: Answer button + hint, `stubMessageId` = the
  answer; its form opens and its submit resumes that session, edited into the
  answer message.
- Gateway: `parseAskCustomId` reads `answer`; `adaptComponent.showModal`
  calls discord.js `showModal` on the interaction (absent when the raw
  interaction has none); `adaptModalSubmit` maps type 4 values by id, stub
  message id, role ids and names, replies with flag 64 and `parse: []` and
  defangs `@everyone`; a MODAL_SUBMIT emitted on the live discord.js client
  (login stubbed) reaches `onComponent` with its text.

Updated tests (behaviour change): `tests/discord.ask-ping.test.ts` (chat
clarify stub has the Answer hint, button and stub id),
`tests/discord.thin-ack.test.ts` (restated free-text ask has the hint and the
button), `tests/discord.slash-pending-ask.test.ts` (restated `/work` ask has
the hint), `tests/discord.slash-choose-ask.test.ts` (a `/work` free-text
answer has one Answer button and its stub id).

Fail-on-base proof (base `f1809a5`; branch sources saved, base swapped in,
the five files run, branch restored — 83 pass, 0 fail after restore):

| Source | Result | Failing |
|---|---|---|
| base `src/discord` (all 10 changed files) | 0 pass, 5 fail | all five files fail to load (`ASK_ANSWER_HINT`, `buildAnswerStubComponents`, `ASK_ANSWER_ACK` missing) |
| base wiring (bridge, handlers, gateway, slash-finish, spend-post, thinking-status) + branch helpers (`ask-buttons`, `ask-ping`, `index`) | 52 pass, 5 fail | the 4 updated tests (no Answer button / hint on chat, restatement, `/work`); the new file fails to load (`adaptModalSubmit` missing) |
| same + branch `gateway.ts`, new file only | 14 pass, 13 fail | stub button, modal open, submit resume, scrub, empty submit, follow-up button, muted-then-resume, late keeps ask, id mix-up, Choose-ask submit, reply-then-already-answered, restatement button, `/work` resume |
| branch | 83 pass, 0 fail | — |

The 14 that pass with the base bridge are the pure helper / gateway adapter
tests and the refusals the base press gates already give any `cvask` id
(another user, deny, off-channel, rate limit) — kept as regression guards.

Full suite on the branch: `bun test` 2325 pass, 0 fail (2327 tests, 166
files); `bunx tsc --noEmit` clean.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-548` | `tests/discord.ask-answer-modal.test.ts`, `tests/discord.ask-ping.test.ts`, `tests/discord.thin-ack.test.ts`, `tests/discord.slash-pending-ask.test.ts`, `tests/discord.slash-choose-ask.test.ts` | Free-text stub = question + Answer hint + one Answer button + footer, stub id stored; requester press → type 9 modal (type 18 label, type 4 paragraph input, `ASK_ANSWER_MAX` ≤ 4000), no post/run; MODAL_SUBMIT through channel, actor/deny, mute/rate, not-yours and expiry gates (ephemeral refusals, no run, ask kept); accepted submit scrubbed, resumes the same session with the reply's prior-question block in the stub, ack deleted, text never posted; late press/submit keeps the ask for a reply; reply fallback unchanged; slash answers and restatements carry the button; spend-cap unchanged; live gateway routes MODAL_SUBMIT. Fails on the base source. |
| `REQ-discord-044` (unchanged) | `tests/discord.slash-pending-ask.test.ts`, `tests/discord.thin-ack.test.ts`, `tests/discord.ask-ephemeral.test.ts` | Free-text pending ask, thin-reply restatement, cancel and substantive-reply answer still hold; restatements now also carry the live Answer button. |
| `REQ-discord-045` (unchanged) | `tests/discord.ask-ephemeral.test.ts`, `tests/discord.ask-button-gates.test.ts` | Choose / option late presses still clear and answer `ASK_CHOICE_EXPIRED`; the press gates are unchanged and now also cover the form submit. |
| `REQ-discord-457` (unchanged) | `tests/discord.ask-ping.test.ts`, `tests/discord.thinking-bridge.test.ts` | A final answer keeps its footer-only embed, a Choose stub has none; a free-text ask with the Answer button keeps its footer (`keepFooter`). |
