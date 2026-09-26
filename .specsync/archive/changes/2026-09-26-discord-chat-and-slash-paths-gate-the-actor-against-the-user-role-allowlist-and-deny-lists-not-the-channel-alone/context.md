---
change: discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone
artifact: context
---

# Context

Bug discord-1 (high). The bridge routed MessageCreate with `channelOnlyGate: true`, so `routeMessage` passed no user/role to `gateInbound`, and the reply-to-bot and thread-continuation paths checked channels only. `handleSlashInteraction` ran only `gateChannel()`; `resolvePermissionLevel` (which returns BLOCKED for deny-listed users and, with a non-empty user/role allowlist, for unlisted ones) was consulted only for commands with a `minPermission` (/mute, /unmute, /admin).

Effect: with `CORVIDINHO_DISCORD_ALLOW_USERS=leif` and `CORVIDINHO_DISCORD_DENY_USERS=mallory` (or the `[discord] users` / `deny_users` file keys), mallory or any unlisted member of an allowlisted channel could @mention the bot, reply to it, continue a thread, or run `/work` / `/session start` and start a real agent run in a worktree on the host. Repro before the fix: `routeMessage` returned `mallory => start_session`; `/work` as mallory returned `{ok:true,handled:true}` and spawned `mallory: cat secrets`.

Constraints: no new env var, slash command or table; the owner (IDENTITY-1/2) must keep access even when not on the user list (the rule `resolvePermissionLevel` already applies); empty user+role lists must keep today's channel-only chat path (ROLES-CHAT-1); mute keeps its own MUTED reply (DISCORD-6).
