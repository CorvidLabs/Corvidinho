---
module: discord
change: discord-deny-polish-discord-deny-1-3-messagecreate-unauthorized-silent-slash-admin-ephemeral-allowlist-tip-non-admin
---

# Delta — discord (deny polish DISCORD-DENY-1..3)

## Added

### REQUIREMENT REQ-discord-018

Outside an allowlisted Discord channel (or from a non-configured user when a
user allowlist applies), Corvidinho SHALL NOT send any public channel reply
(DISCORD-DENY-1 / amended DISCORD-5). Behavior:

- **MessageCreate / gateway messages:** refuse silently for all actors (no
  public reply, no DM, no reaction). MessageCreate has no ephemeral; admin tip
  is slash/interaction only.
- **Slash interactions:** if the actor is ADMIN per existing
  `resolvePermissionLevel` + `adminUserIds`/`adminRoleIds` (empty = nobody
  ADMIN), reply **ephemeral only** with a short tip how to add the channel (or
  user) to Discord allowlist config (`~/.config/corvidinho/allowlist.toml`
  `discord.channels` or `CORVIDINHO_DISCORD_CHANNELS` / `DISCORD_CHANNEL_IDS`)
  and restart the bridge (DISCORD-DENY-2). Non-admins SHALL get zero useful
  response (DISCORD-DENY-3); because Discord requires an interaction response
  within 3s, the system SHALL ack with an ephemeral zero-width character
  (`\u200b`) (or equivalent defer+delete) — never allowlist guidance and never
  a public "not authorized" leak.

Operator docs (`docs/discord.md`) SHALL document the six slash commands,
outbound formats, and a deny-behavior flowchart (mermaid in repo docs only;
Discord chat uses embeds/fences/PNG, not native Mermaid). Fixture tests SHALL
cover message-router and slash-dispatch deny paths without a live token.

Acceptance Criteria
- MessageCreate non-allowlisted → no `reply` on refuse; bridge posts nothing public.
- Slash non-allowlisted admin → ephemeral tip containing allowlist.toml / env hint.
- Slash non-allowlisted non-admin → ephemeral zero-width (or empty-useful) only; no tip text.
- No public "not authorized" on channel deny paths.
- Admin detection reuses DISCORD-7 admin lists (empty ⇒ nobody ADMIN).
- `docs/discord.md` exists with slash inventory + deny mermaid + mermaid-docs-only note.
- Fixture tests for router + slash deny paths pass.
