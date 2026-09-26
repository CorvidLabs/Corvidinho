---
change: discord-deny-polish-discord-deny-1-3-messagecreate-unauthorized-silent-slash-admin-ephemeral-allowlist-tip-non-admin
artifact: requirements
---

# Requirements

1. MessageCreate outside allowlist (channel or applicable user gate) SHALL NOT
   produce any public channel reply — silent for admin and non-admin (DISCORD-DENY-1,
   MessageCreate has no ephemeral).
2. Slash outside allowlist: admin (existing admin allowlist / ADMIN HI) SHALL get
   an ephemeral tip how to add the channel/user to allowlist config; non-admin
   SHALL get zero useful response — ephemeral zero-width ack only to satisfy
   Discord's 3s interaction rule (DISCORD-DENY-2/3). Never public "not authorized".
3. Tip text SHALL point at `discord.channels` in `~/.config/corvidinho/allowlist.toml`
   or `CORVIDINHO_DISCORD_CHANNELS` / `DISCORD_CHANNEL_IDS` and restart.
4. Admin detection SHALL reuse `resolvePermissionLevel` + `adminUserIds` /
   `adminRoleIds` (DISCORD-7 / ADMIN HI). Empty admin lists ⇒ nobody ADMIN.
5. `docs/discord.md` SHALL document the six slash commands, outbound formats,
   deny flowchart (mermaid), and that mermaid is docs-only. Link from STATUS,
   AGENTS, README, hi/discord.md.
6. Fixture tests cover message-router + slash-dispatch deny paths. SpecSync +
   fledge verify green.
