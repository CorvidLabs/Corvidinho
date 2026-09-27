---
change: discord-6-rate-limits-and-mutes-discord-rate-limit-by-level-applies-to-chat-and-slash-via-the-actor-s-resolved
artifact: docs
---

# Docs

`docs/discord.md` changes in two places:

- The `/mute` row in the slash table now says it refuses yourself and the
  configured owner.
- A new "Rate limits and mutes (DISCORD-6)" subsection under "Slash replies"
  covers four points:
  - One per-user window is shared by chat and slash.
  - `DISCORD_RATE_LIMIT_BY_LEVEL` keys on the actor's level (3 = owner, 2 =
    allowed user or role, or anyone when the user and role lists are empty).
  - Why `/mute` refuses yourself and the owner.
  - A muted or rate-limited user gets at most one public chat notice per
    window, while slash refusals stay ephemeral on every call.

`specs/discord/discord.spec.md` changes in two places:

- `tests/discord.rate-mute-limits.test.ts` is added to `files:`.
- Public API names `claimRefusalNotice`, `RateLimitState.refusalNoticeAt` and
  `MUTE_SELF_OR_OWNER_REFUSED`.

REQ-discord-010 is updated through this change's delta. No env var, command
or config key is added or renamed.
