---
change: discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone
artifact: design
---

# Design

New `gateActor({ userId, roleIds, allowlist, owner })` in `src/discord/permissions.ts`: refuse when any role is on `denyRoles`; otherwise refuse when `resolvePermissionLevel` (without the mute set) is BLOCKED. This reuses the existing actor rule, so the owner passes when unlisted and empty user+role lists leave the channel gate alone.

- `routeMessage`: after the channel check on the thread-continue and reply-continue paths, and after the mention check on the start path, call `gateActor`; refuse with `{ kind: "refuse", reason: "user_not_allowlisted" }` and no reply (DISCORD-DENY-1). Non-mention noise stays `ignore`. New optional `RouterDeps.owner`; the bridge passes `config.owner`.
- `handleSlashInteraction`: after the channel gate and before mute/rate, call `gateActor` for every command; refuse with the existing `EPHEMERAL_SILENT_ACK` (ephemeral) and `reason: "user_not_allowlisted"` (DISCORD-DENY-3). The owner can fail here only when deny-listed, and is then not ADMIN, so the admin tip never applies.
- Mute stays with `gateRateOrMute`, so muted users keep the MUTED reply. No new env var, slash command, table or column.
