---
change: discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone
artifact: research
---

# Research

- `resolvePermissionLevel` (permissions.ts) already encodes the intended actor rule: deny-listed ⇒ BLOCKED; owner ⇒ ADMIN; listed user or allowed role ⇒ STANDARD; empty user+role lists ⇒ STANDARD; otherwise BLOCKED. It ignores `denyRoles`.
- `checkDiscordAction` (allowlist/discord.ts) default-denies when the user and role lists are both empty, which would break ROLES-CHAT-1 chat; it also lets a listed user through when one of their roles is deny-listed, and it does not know the owner. So it is not a drop-in for chat.
- `docs/discord.md` and the `/admin users add` warning already promise that adding the first user flips unlisted non-owner callers to BLOCKED; nothing enforced that on chat or on non-ADMIN slash commands.
- The gateway already fills `authorRoleIds` (MessageCreate) and `roleIds` (slash) from the guild member.
