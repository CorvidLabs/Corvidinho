---
change: discord-6-rate-limits-and-mutes-discord-rate-limit-by-level-applies-to-chat-and-slash-via-the-actor-s-resolved
artifact: requirements
---

# Requirements

REQ-discord-010 is modified (see `deltas/discord.md`). The full existing text
and acceptance bullets are kept, and new text and bullets are added:

- `rateLimitByLevel` keys on the actor's resolved permission level (user,
  roles, owner) on chat and slash, unless an explicit level is passed.
- `/mute` refuses the invoker and the configured owner with an ephemeral
  message, and the mute set is unchanged (IDENTITY-2).
- MessageCreate refusals for mute and rate limit post at most one public
  notice per user per rate-limit window. Later refusals in the window are
  silent.
- Slash refusals stay ephemeral on every call.

HI sources: DISCORD-6, IDENTITY-2, DISCORD-DENY-2. There are no new acceptance
criteria beyond what these HI lines and the audit defects require.
