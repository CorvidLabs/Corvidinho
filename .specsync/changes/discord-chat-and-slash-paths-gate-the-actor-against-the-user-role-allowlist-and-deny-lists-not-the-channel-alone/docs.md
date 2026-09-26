---
change: discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone
artifact: docs
---

# Docs

`docs/discord.md` (runtime admin, "First user narrows access"): one sentence that BLOCKED and deny-listed callers are refused on every chat message (silently) and every slash command (zero-width ephemeral ack). `specs/discord/discord.spec.md`: the new test in `files:`, `gateActor` and `RouterDeps.owner` in Public API, and one invariant line.
