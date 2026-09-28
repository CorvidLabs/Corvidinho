---
change: discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted
artifact: requirements
---

# Requirements

- Captured HI: **DISCORD-DENY-3** (`hi/discord.md`) and **ADMIN-4**
  (`hi/admin.md`), with DISCORD-7 and IDENTITY-2/3 as the ADMIN definition
  (owner only; no owner means nobody is ADMIN).
- Add **REQ-discord-431** (delta `deltas/discord.md`). Every channel
  autocomplete request answers `[]` unless the invoker is ADMIN in an
  allowlisted channel. That means the slash channel gate passes, the actor
  gate passes, and `resolvePermissionLevel` with the live mute set is
  ADMIN. The check is repeated on every request. The gateway fails closed
  when no gate is wired or the gate throws. The owner in an allowlisted
  channel keeps today's choices.
- No new slash command, option, env/config key, schema version or package
  version. No change to `default_member_permissions`, because registration
  alone is never enough (ADMIN-4).
