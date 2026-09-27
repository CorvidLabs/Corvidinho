---
change: work-and-session-start-answer-an-ask-whose-choices-fit-a-short-list-with-the-chat-s-choose-stub-and-ephemeral-pick-free
artifact: docs
---

# Docs

- `docs/discord.md` "Questions and owner ping": the Choose stub and
  ephemeral pick now cover `/work` and `/session start` too; schedules
  still post text. The `/work` / `/session start` paragraph says the one
  answer message is the Choose stub when the choices fit a short list (the
  pick resumes the session in the stub), else the question as text; a thin
  reply restates with the button; a button ask stays open through other chat
  until picked, cancelled or expired.
- `specs/discord/discord.spec.md`: slash pending-ask paragraph
  (`buttonAskFor`, `ButtonAsk`, `components`, `recordSlashStub`,
  `onDelivered(mode, messageId)`, `SlashReplyPayload.components`);
  `files:` lists the new test. `specs/discord/testing.md` lists it.
- No operator knob, env var, slash command or CLI flag.
