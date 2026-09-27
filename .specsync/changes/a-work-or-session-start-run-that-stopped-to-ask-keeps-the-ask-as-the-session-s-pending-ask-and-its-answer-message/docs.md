---
change: a-work-or-session-start-run-that-stopped-to-ask-keeps-the-ask-as-the-session-s-pending-ask-and-its-answer-message
artifact: docs
---

# Docs

`specs/discord/discord.spec.md` Public API (questions / pending ask
paragraph) and Invariants say a `/work` or `/session start` ask is kept as
the session's free-text pending ask (never a spend-cap stop) and that the
slash answer message is bound to its session through
`SlashContext.trackBotMessage`; `specs/discord/testing.md` lists the new
test file. The `bridge.ts` header and handler comments note it. No operator
knob, slash command or env var, so no operator guide change.
