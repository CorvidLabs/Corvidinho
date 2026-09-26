---
change: discord-admin-slash-for-runtime-allowlist-admin-issue-43-captured-admin-1-4-owner-only-admin-users-add-channels-add
artifact: research
---

# Research

- Ancestor: corvid-agent `server/discord/admin-commands.ts`
  (`handleAdminChannels`, `handleAdminUsers`, `handleAdminShow`) persisted to
  a SQLite `discord_config` table with hot reload. Corvidinho has no such
  table; the allowlist file (`src/allowlist/load.ts`, ALLOW-4) plus env
  overlays is the live source, so `/admin` edits that file.
- `loadBridgeConfig` merges file ∪ `CORVIDINHO_DISCORD_ALLOW_*` ∪
  `DISCORD_CHANNEL_IDS` and stores the merged channel array as both
  `allowlist.discord.channels` and `config.channelIds` (same array). The
  router, scheduler and slash ctx all hold the same `config.allowlist`
  object, so splicing the arrays in place is visible everywhere at once.
- `parseSimpleToml` is line-based: one key per line, `#` starts a comment
  anywhere, repeated `[discord]` sections merge, multi-line arrays are not
  understood (read as empty). `parseOwnerToml` reads `[owner]` from the
  same file, so edits must not disturb other sections.
- `resolvePermissionLevel`: when users and roles are both empty,
  channel-gated callers resolve to STANDARD; once either list is non-empty,
  unlisted non-owner callers resolve to BLOCKED. Mentions are channel-only
  gated (`channelOnlyGate: true`), so today the user list changes the
  permission level, not the mention path.
- discord.js delivers `SUB_COMMAND_GROUP` (type 2) options nested two
  levels deep; the gateway adapter only flattened type 1, so group names and
  options were lost.
- SAFE-5 (`src/audit`): `appendAudit` on the shared DB; dangerous plugin
  runs record `started` first and fail closed.
