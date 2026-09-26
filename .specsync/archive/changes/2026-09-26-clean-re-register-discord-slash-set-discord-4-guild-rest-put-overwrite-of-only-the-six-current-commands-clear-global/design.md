---
change: clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global
artifact: design
---

# Design

- New `src/discord/register-commands.ts`:
  - `registerSlashCommandSet({ applicationId, guildId?, bodies, put })`
  - When `guildId`: PUT guild bodies (six), then PUT globals `[]`.
  - When no `guildId`: PUT globals to bodies; return warn flag (stale guild cmds uncleared).
  - Injectable `put(route, body)` for fixture tests (no live token).
  - Live helper builds discord.js `REST` + `Routes`.
- `gateway.ts` ClientReady calls shared register (prefer config.guildId).
- CLI `corvidinho discord register-commands` (token + optional guild from env/`--guild-id`).
- Docs: BOX-UPDATE + STATUS re-register + client cache tip.
- No new slash command names; bodies still from `buildSlashCommandBodies()`.
