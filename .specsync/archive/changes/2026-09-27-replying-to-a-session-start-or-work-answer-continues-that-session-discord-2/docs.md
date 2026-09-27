---
change: replying-to-a-session-start-or-work-answer-continues-that-session-discord-2
artifact: docs
---

# Docs

`docs/discord.md` "Slash replies" says that replying to a `/session start`
or `/work` answer continues that session, and only for the user who started
it. `specs/discord/discord.spec.md` Public API notes that the bridge wires
`SlashContext.trackBotMessage` and that `SlashInteraction.editReply` may
resolve with the reply's message id; its `files:` list and
`specs/discord/testing.md` add the new test file. No README, CHANGELOG or
STATUS change; no operator knob.
