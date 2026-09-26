---
change: discord-deny-polish-discord-deny-1-3-messagecreate-unauthorized-silent-slash-admin-ephemeral-allowlist-tip-non-admin
artifact: design
---

# Design

## MessageCreate (gateway messages)

`routeMessage` on allowlist gate fail:
- With or without @mention → `{ kind: "refuse", reason: "channel_not_allowlisted" }`
  **without** `reply` (bridge only posts when `action.reply` is set).
- Same for thread/reply continue paths that fail channel re-check.
- Admin tip is NOT available on MessageCreate (no ephemeral) → silent for admins too.

## Slash interactions

On `gateChannel` fail:
1. `resolvePermissionLevel({ userId, roleIds, allowlist, adminUserIds, adminRoleIds, mutedUsers })`
2. If `>= ADMIN` → `interaction.reply({ ephemeral: true, content: ALLOWLIST_DENY_TIP })`
3. Else → `interaction.reply({ ephemeral: true, content: EPHEMERAL_SILENT_ACK })`
   where `EPHEMERAL_SILENT_ACK = "\u200b"` (zero-width space). Discord requires a
   response within 3s; true zero/public silence is impossible for interactions.
   Documented compromise for DISCORD-DENY-3.

Tip (~example): "This channel isn’t allowlisted. Add its id to discord.channels
in ~/.config/corvidinho/allowlist.toml (or CORVIDINHO_DISCORD_CHANNELS /
DISCORD_CHANNEL_IDS) and restart the bridge."

## Docs mermaid

Deny flowchart lives only in `docs/discord.md`. Discord UX never posts mermaid.
