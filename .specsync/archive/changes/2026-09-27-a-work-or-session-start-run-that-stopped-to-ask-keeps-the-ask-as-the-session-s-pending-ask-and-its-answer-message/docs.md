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
test file. The `bridge.ts` header and handler comments note it.
`docs/discord.md` (Questions and owner ping) replaces the stale "`/work` and
`/session start` ... do not ping yet" line: the slash answer quotes the
question, a stuck or spend-cap stop pings the owner in a separate post, and
the session waits on the question like a chat ask (thin reply restates,
`cancel` drops it, a real answer resumes with the question). No operator
knob, slash command or env var.
