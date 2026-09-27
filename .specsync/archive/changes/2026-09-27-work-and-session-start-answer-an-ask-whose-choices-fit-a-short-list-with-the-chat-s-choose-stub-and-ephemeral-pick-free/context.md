---
change: work-and-session-start-answer-an-ask-whose-choices-fit-a-short-list-with-the-chat-s-choose-stub-and-ephemeral-pick-free
artifact: context
---

# Context

Captured HI (`hi/discord.md`):

- **DISCORD-ASK-1** "Clarify/stuck choices that fit a short list use Discord
  components (buttons), not a public \"reply to this MCQ\"."
- **DISCORD-ASK-4** "Free-text clarify only when options cannot be listed;
  prefer ephemeral over a public ping."

Gap on main (1c7b6ce): `src/discord/command-handlers/work.ts` and
`session.ts` store `toPendingAsk({ reason, question })` for a clarify or
stuck ask, dropping its options, and answer with `formatAskReply`: the
question (and any numbered choices in it) is posted publicly as text and
answered by reply, even when the ask-human tool listed options. Only the
@mention / reply chat path used the Choose stub. REQ-discord-044 and
`docs/discord.md` pinned the text-only slash ask; that came from
implementation PR #216, with no Leif decision on it, and contradicts the
captured DISCORD-ASK-1/4 text.

Constraints: reuse the chat Choose stub (`formatAskStub`,
`buildOpenStubComponents`) and the existing `onComponent` open / pick path
(no bridge change; open PR #232 owns the button actor gate and mute/rate for
presses). No new slash command, env var, config key or schema change: the
pending ask with options already persists in `discord_sessions.pending_ask`.
Schedules stay text (no resumable session behind a schedule post). A SAFE-8
spend-cap stop stays free text and is never pending.
