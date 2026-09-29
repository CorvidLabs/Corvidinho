---
change: discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed
artifact: research
---

# Research

- `handleSlashInteraction` (`slash-dispatch.ts`) is the pattern: channel
  gate → `gateActor({ userId, roleIds, allowlist, owner })` → zero-width
  ephemeral on deny → `gateRateOrMute` with the shared
  `rateLimitState`/`rateLimitConfig` → ephemeral `rateGate.reply`.
- `ComponentInteraction` (`gateway.ts`) had no role ids, so `gateActor`
  on a press could not see role allow/deny: a member who passes only by an
  allowed role would be refused, and a deny-listed role would pass. discord.js
  button interactions carry `member` like slash: a `GuildMember` (roles
  cache) or a raw API member (`roles: string[]`). The slash adapter already
  read both shapes inline.
- `gateRateOrMute` checks mute before the rate limit and records a timestamp
  only when allowed, so a refused press does not use up budget.
- `resolvePermissionLevel` without `mutedUsers` gives the level
  `rateLimitByLevel` keys on (owner 3, listed/role/empty-lists 2). PR #221
  resolves the slash and chat level the same way.
- `result.muteUser` / `config.allowlist` on the started bridge are the
  same live objects the handlers read, so fixtures can mute or deny-list after
  the ask is posted, as the forward-channel tests do for the channel list.
