---
change: discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone
artifact: requirements
---

# Requirements

HI violated: ALLOW-3 (listen only for allowlisted roles/users), ALLOW-5 (a denied contact is refused and never does the work), DISCORD-5 and DISCORD-DENY-1 / DISCORD-DENY-3 (a non-configured user where a user allowlist applies is refused: silent on MessageCreate, ephemeral zero-width ack on slash). Consistent with ROLES-CHAT-1 (non-blocked users in an allowlisted channel keep chat) and IDENTITY-2 (the owner is ADMIN even when unlisted).

Added REQ-discord-201 (see deltas/discord.md).
