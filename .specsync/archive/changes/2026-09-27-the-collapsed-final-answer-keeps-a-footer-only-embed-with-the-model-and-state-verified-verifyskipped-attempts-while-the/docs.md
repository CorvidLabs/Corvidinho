---
change: the-collapsed-final-answer-keeps-a-footer-only-embed-with-the-model-and-state-verified-verifyskipped-attempts-while-the
artifact: docs
---

# Docs

`docs/discord.md` "Thinking progress embeds (DISCORD-3)" now says the
collapsed final answer keeps a footer-only embed (`model | state=… verified=…
[verifySkipped] [cancelled] attempts=…`, colored like the done/error status)
and that the Choose stub carries no embed; "Session replies" points to it.
`specs/discord/discord.spec.md` documents `buildAnswerFooterEmbed`, the new
`finalizeContent` options and the optional `DiscordEmbedPayload.description`;
`specs/discord/requirements.md` gains REQ-discord-457 and
`specs/discord/testing.md` lists the tests. No README, CHANGELOG, STATUS or
package version change; no operator knob.
