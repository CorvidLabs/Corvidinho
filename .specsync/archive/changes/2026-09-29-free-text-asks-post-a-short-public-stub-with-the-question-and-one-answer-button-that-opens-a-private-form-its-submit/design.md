---
change: free-text-asks-post-a-short-public-stub-with-the-question-and-one-answer-button-that-opens-a-private-form-its-submit
artifact: design
---

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
