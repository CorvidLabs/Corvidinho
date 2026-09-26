---
change: hear-admin-re-auth-confused-deputy-channel-post-discord-7-8-steal-from-corvid-agent-commands-ts-merlin-bridges-discord
artifact: context
---

# Context

Issue #13 (DISCORD-7, DISCORD-8): admin re-auth at command run time +
confused-deputy guard when posting to another channel on the requester's
behalf.

Confirmed HI: `hi/discord.md` DISCORD-7 / DISCORD-8. Steal provenance (issue
body; consult only):

- **DISCORD-7** — archived corvid-agent `server/discord/commands.ts`
  `handleInteraction`: `resolvePermissionLevel` then `entry.minPermission`
  **before** handler (~L752–792). Admin-shaped: mute/unmute (and ancestor
  admin/config). Do not trust Discord UI registration alone.
- **DISCORD-8** — Merlin-primary: `bridges/discord` API auth
  (`api-server.ts` requester check + `gateway.verifyRequesterCanSend`
  ViewChannel+SendMessages). Archive `cross-channel-guard.ts` is **advisory
  only** — do not treat as Discord channel ACL.

Depends on HEAR thin + slash (#5/#11). Soft later. No ProcessManager, no iced,
no SQLite mute DB, no invent ACCESS/bounty/MainNet. Default-deny allowlists
unchanged (empty admin lists ⇒ nobody is ADMIN).

Update STATUS.md Done when this slice merges (#13 → this PR).
