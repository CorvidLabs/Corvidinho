# Lesson bundle — free-text-asks-post-a-short-public-stub-with-the-question-and-one-answer-button-that-opens-a-private-form-its-submit

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Free-text asks post a short public stub with the question and one Answer button that opens a private form; its submit passes the same gates as a button press and resumes the requester's session like a reply; replying in the channel still works (DISCORD-ASK-4.a)
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/ask-buttons.ts, src/discord/ask-ping.ts, src/discord/bridge.ts, src/discord/gateway.ts, src/discord/index.ts, src/discord/command-handlers/work.ts, src/discord/command-handlers/session.ts, src/discord/slash-finish.ts, src/discord/spend-post.ts, src/discord/thinking-status.ts, tests/discord.ask-answer-modal.test.ts, tests/discord.ask-ping.test.ts, tests/discord.thin-ack.test.ts, tests/discord.slash-pending-ask.test.ts, tests/discord.slash-choose-ask.test.ts, docs/discord.md, specs/discord/discord.spec.md, specs/discord/testing.md
- **Acceptance**: A clarify or stuck ask whose choices cannot be listed posts (chat, a button-pick or form resume, /work, /session start) the question quoted in the public post with the hint 'Press Answer to answer privately, or reply to this message.' and exactly one Answer button, keeps its footer embed and records the post as the ask's stub; the requester's press opens a Discord modal (response type 9) with a short title and one required paragraph input capped at ASK_QUESTION_MAX (within Discord's 4000); the modal submit (interaction type 5) passes the same channel, actor/deny-list, mute/rate, not-yours and ~30-minute expiry gates as a button press (refusals ephemeral only, no run, ask kept), is SAFE-6 scrubbed and resumes the requester's session with the same prior-question block a reply gets, in the stub (thin-updated, then edited into the answer), with an ephemeral ack dropped when the run ends; a late press or submit gets 'that choice expired' and the ask stays for a reply; a thin reply restates it with its live Answer button; a reply still answers it; a spend-cap stop and schedule asks are unchanged; the new bridge-harness tests fail on the base source and pass on the branch

## Evidence

- Verification commit: `5a07279207056a27d978066a49a6a115bacdcb32`
- Base commit: `f1809a59b41a4f33506843a5c54a7796f57e626c`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Wave M2 slice "free-text private modal" from Leif's 2026-09-28 interview
(record `/home/user/coord/interview-2026-09-28.md`, round 10: "Free-text asks
(DISCORD-ASK-1/2/4): public stub + private modal — requester presses
"Answer", types privately; a reply still works as fallback").

The criterion is already captured on main in `hi/discord.md` (landed with
#270), so this PR captures nothing new with `hi`:

- **DISCORD-ASK-4.a**: "When the choices can't be listed, the question still
  goes in the short public stub and the requester answers privately in a
  form; replying in the channel still works."

Parent criteria that still hold: DISCORD-ASK-2 (ask UI ephemeral / only the
requester), DISCORD-ASK-3 (answer continues that requester's session, no
public reply needed), DISCORD-ASK-4, DISCORD-ASK-5 (~30 min expiry, late press
"that choice expired"), DISCORD-ASK-6/7/8.

On the base (`53f2e5d`, as on `f1809a5` where this started) a free-text ask posts the quoted question with "Reply
to this message to answer." and no component; the only way to answer is a
public reply. The Choose-ask machinery (`src/discord/ask-buttons.ts`, the
session store's open asks, `onComponent` gates from #232 / REQ-discord-201 /
REQ-discord-010 / REQ-discord-212, the late-press closed asks of
REQ-discord-045, scrub-at-rest from #265) already exists and is reused.

Settled rules: specs only through SpecSync; v1 off-chain; #232/#233 scope not
touched (their gates are reused as they are). Kind feature, spec discord.

## From the change's design.md

# Design

Reuse the Choose-ask path end to end; no parallel system.

- `src/discord/ask-buttons.ts`: `answerAskFor` (free-text `PendingAsk` + one
  Answer button, null for spend-cap or listable options),
  `buildAnswerStubComponents` (one Primary button on the existing `open`
  custom_id), `buildAnswerModal` (type 9 payload: `cvask:answer:<askId>`,
  short title, one Label (type 18) with the scrubbed question start as
  description around one required paragraph input capped at
  `ASK_ANSWER_MAX` = min(`ASK_QUESTION_MAX`, 4000)), `answerCustomId`,
  `parseAskCustomId` kind `answer`, `normalizeAskAnswer` (scrub, then
  `normalizeQuestion`, then the cap), `ASK_ANSWER_ACK`.
- `src/discord/ask-ping.ts`: `formatAskReply({ answerButton })` swaps
  `ASK_REPLY_HINT` for `ASK_ANSWER_HINT` (never on a spend-cap stop).
- `src/discord/gateway.ts`: `ComponentInteraction.showModal` (discord.js
  `showModal`) and `modalValues`; `adaptModalSubmit` + `modalTextValues`;
  `InteractionCreate` routes `isModalSubmit()` to `onComponent`, so the submit
  goes through the very same gate code as a press.
- `src/discord/bridge.ts`: the chat and resume paths post a free-text ask with
  `answerAskFor` (components + `keepFooter`), record the stub id like a Choose
  stub; the thin-reply restatement adds the Answer button while the ask is
  live; `onComponent` ignores a press/submit id mix-up, keeps a free-text ask
  pending on a late press/submit, opens the modal on an `open` press of a
  free-text ask, and takes an `answer` submit through the pick's resume code
  (parametrized: answer text + prior-question block), with the reply's block
  for a typed answer. A typed answer passes the same AUTONOMY-5/6 checks a
  reply does (`isThinAck` / `isCancelAsk`): a thin or blank one is restated
  privately with the Answer button and runs nothing; a cancel drops every open
  ask of the session with an ephemeral `ASK_CANCELLED_ACK`.
- `src/discord/command-handlers/{work,session}.ts`: slash free-text answers get
  the Answer button (`recordSlashStub` stores the stub id).
- `src/discord/thinking-status.ts` / `slash-finish.ts` / `spend-post.ts`:
  `keepFooter` keeps the footer-only embed beside an Answer button (a Choose
  stub still has none).

Not done (conservative): schedule asks keep their text post (they are not a
session's pending ask, so the modal path is not trivially shared;
AUTONOMY-6.a is a later wave); no new env var, config key, slash command,
table, column or schema bump; the pick path's acting-role resolution is
reused as it is.

Design choices pending Leif:
- Answer length cap = `ASK_QUESTION_MAX` (1500 chars), below Discord's 4000.
- A late (~30 min) Answer press or submit gets "that choice expired" but the
  free-text ask stays pending, so a reply still answers it with the
  prior-question block (a Choose ask is cleared by a late press); a thin reply
  after that restates without a button.
- The form shows the first ~100 chars of the question as the input's
  description (the stub keeps the full question); title "Answer privately",
  label "Your answer".
- Stuck free-text asks get the Answer button too; only the requester can use
  it, as only the requester's reply answers it (SESSION-MULTI-1); the owner is
  pinged as before.
- A thin form answer (`ok`, emoji, blank) is restated privately (ephemeral,
  with the Answer button again) rather than publicly as for a thin reply; a
  `cancel` typed in the form drops the open asks with a private ack rather
  than the public one a `cancel` reply gets.
- The resumed run's acting role is resolved as on a button pick (without the
  presser's member role ids, so a declared team member let in only by an
  allowed role under a non-empty user allowlist runs as community there,
  where a chat reply would run as team) — kept fail-closed, unchanged from
  the pick path.
- The free-text post keeps its footer-only embed (DISCORD-3.a / DISCORD-15);
  a Choose stub still has none.

## From the change's testing.md

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
  `ASK_ANSWER_MAX`, returns "" for blank / non-string. A thin or blank
  submit (`ok`, whitespace, `👍`, `sure!`; AUTONOMY-5) gets only a private
  restatement of the question with the Answer button: no run, nothing sent,
  ask kept, nothing in the thread; a real submit then resumes. A
  `never mind` / `cancel` submit (AUTONOMY-6) gets only the ephemeral
  `ASK_CANCELLED_ACK`, runs nothing, clears the free-text ask and an earlier
  open Choose ask of the session, and a later Answer press is already
  answered. A follow-up free-text ask from the resumed run gets its own
  Answer button in the same stub.
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

Fail-on-base proof (base `53f2e5d`, current main; the same numbers on
`f1809a5` before the rebase; base `src/discord` swapped in, the five files
run, branch restored — 83 pass, 0 fail after restore):

| Source | Result | Failing |
|---|---|---|
| base `src/discord` (all 10 changed files) | 0 pass, 5 fail | all five files fail to load (`ASK_ANSWER_HINT`, `buildAnswerStubComponents`, `ASK_ANSWER_ACK` missing) |
| base wiring (bridge, handlers, gateway, slash-finish, spend-post, thinking-status) + branch helpers (`ask-buttons`, `ask-ping`, `index`) | 52 pass, 5 fail | the 4 updated tests (no Answer button / hint on chat, restatement, `/work`); the new file fails to load (`adaptModalSubmit` missing) |
| same + branch `gateway.ts`, new file only (before the review fix) | 14 pass, 13 fail | stub button, modal open, submit resume, scrub, empty submit, follow-up button, muted-then-resume, late keeps ask, id mix-up, Choose-ask submit, reply-then-already-answered, restatement button, `/work` resume |
| branch | 83 pass, 0 fail | — |

The 14 that pass with the base bridge are the pure helper / gateway adapter
tests and the refusals the base press gates already give any `cvask` id
(another user, deny, off-channel, rate limit) — kept as regression guards.

Review fix (AUTONOMY-5/6 in the form): the three thin / cancel submit tests
fail with the builder's `bridge.ts` (93453040) swapped in — 0 pass, 3 fail:
`ok` and `never mind` were taken as answers and resumed the run — and with
main's `bridge.ts` (0 pass, 3 fail); with the branch restored the file is 29
pass, 0 fail.

Full suite on the branch (merged with main 4e65e4b): `bun test` 2365 pass,
2 skip, 0 fail (2367 tests, 168 files); `bunx tsc --noEmit` clean.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-548` | `tests/discord.ask-answer-modal.test.ts`, `tests/discord.ask-ping.test.ts`, `tests/discord.thin-ack.test.ts`, `tests/discord.slash-pending-ask.test.ts`, `tests/discord.slash-choose-ask.test.ts` | Free-text stub = question + Answer hint + one Answer button + footer, stub id stored; requester press → type 9 modal (type 18 label, type 4 paragraph input, `ASK_ANSWER_MAX` ≤ 4000), no post/run; MODAL_SUBMIT through channel, actor/deny, mute/rate, not-yours and expiry gates (ephemeral refusals, no run, ask kept); accepted submit scrubbed, resumes the same session with the reply's prior-question block in the stub, ack deleted, text never posted; a thin or cancel submit acts as the same reply (restated privately / asks dropped, no run); late press/submit keeps the ask for a reply; reply fallback unchanged; slash answers and restatements carry the button; spend-cap unchanged; live gateway routes MODAL_SUBMIT. Fails on the base source. |
| `REQ-discord-044` (unchanged) | `tests/discord.slash-pending-ask.test.ts`, `tests/discord.thin-ack.test.ts`, `tests/discord.ask-ephemeral.test.ts` | Free-text pending ask, thin-reply restatement, cancel and substantive-reply answer still hold; restatements now also carry the live Answer button. |
| `REQ-discord-045` (unchanged) | `tests/discord.ask-ephemeral.test.ts`, `tests/discord.ask-button-gates.test.ts` | Choose / option late presses still clear and answer `ASK_CHOICE_EXPIRED`; the press gates are unchanged and now also cover the form submit. |
| `REQ-discord-457` (unchanged) | `tests/discord.ask-ping.test.ts`, `tests/discord.thinking-bridge.test.ts` | A final answer keeps its footer-only embed, a Choose stub has none; a free-text ask with the Answer button keeps its footer (`keepFooter`). |

## Where these lessons go

- `specs/discord/context.md`
