---
change: discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone
artifact: docs
---

# Docs

No operator doc change: `docs/discord.md` ("First user narrows access") already says unlisted non-owner callers resolve to BLOCKED once a user is listed; this fix makes chat and every slash command honor that. `specs/discord/discord.spec.md`: the new test in `files:`, `gateActor` and `RouterDeps.owner` in Public API, and one invariant line.
