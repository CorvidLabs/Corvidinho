---
id: discord-6-rate-limits-and-mutes-discord-rate-limit-by-level-applies-to-chat-and-slash-via-the-actor-s-resolved
state: implementing
type: bug_fix
base_commit: 3cdbb5c7cc469fe3d9fbaae991f58d69326da9dd
---

# DISCORD-6 rate limits and mutes: DISCORD_RATE_LIMIT_BY_LEVEL applies to chat and slash via the actor's resolved permission level, /mute refuses the invoker and the configured owner, and a muted or rate-limited user gets at most one public MessageCreate notice per rate-limit window

## Intent

DISCORD-6 rate limits and mutes: DISCORD_RATE_LIMIT_BY_LEVEL applies to chat and slash via the actor's resolved permission level, /mute refuses the invoker and the configured owner, and a muted or rate-limited user gets at most one public MessageCreate notice per rate-limit window

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- With DISCORD_RATE_LIMIT_MAX=3 and DISCORD_RATE_LIMIT_BY_LEVEL={"3":100} the owner's 4th and later /status and @mentions within the window are served while a STANDARD member is still refused at 4, and a level override applies on chat and slash from the actor's resolved permission level (user, roles, owner); /mute of the invoker or of the configured owner is refused with an ephemeral message and leaves the mute set unchanged, so the owner can never lock themselves out until restart; a muted or rate-limited user's @mention/reply/thread messages get at most one public notice per user per rate-limit window (later refusals in the window are silent, the next window may notify once again), other users are unaffected, and slash refusals stay ephemeral on every call; tests/discord.rate-mute-limits.test.ts covers each and fails on the previous code

## No-spec Rationale

Not applicable
