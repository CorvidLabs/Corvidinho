# Lesson bundle — clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Clean re-register Discord slash set (DISCORD-4): guild REST PUT overwrite of only the six current commands, clear global applicationCommands to [], prefer DISCORD_GUILD_ID dogfood scope, CLI discord register-commands, fixture tests for putCommands guild-then-clear-globals; no new slash names
- **Kind**: BugFix
- **Specs**: discord, cli
- **Paths**: src/discord, src/cli.ts, docs/BOX-UPDATE.md, STATUS.md
- **Acceptance**: With DISCORD_GUILD_ID set, startup and `corvidinho discord register-commands` REST PUT guild applicationGuildCommands to exactly the six bodies (session/status/agents/work/mute/unmute) then PUT applicationCommands to [] clearing globals; without guild id, PUT globals to the six and warn that stale guild commands are not cleared; fixture tests assert putCommands guild-then-clear-globals order without live token; BOX-UPDATE/STATUS document re-register + Discord client cache tip; no new slash names; fledge verify green

## Evidence

- Verification commit: `4c2b3a52279d8b76bb0ecc3701357e21c4927d5c`
- Base commit: `2cfad2f0919ce11a9b964c474ed90eab8025f008`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Leif reported Discord slash commands look outdated/duplicated (e.g. two `/agents`).
Live Discord API showed: **global** has the six Corvidinho commands; **guild Corvid**
still has **11 stale corvid-agent** commands (`session` with new/list/resume/end,
`work` create/status/list/cancel, plus admin/config/message/credits/plugins).
Guild PUT never clears globals (and vice versa), so dual registration yields
duplicates in the Discord client.

Steal pattern (corvid-agent `putCommands` / Merlin `registerCommands`): guild
`Routes.applicationGuildCommands` PUT with ONLY the current six bodies, then
global `Routes.applicationCommands` PUT with `[]`. Prefer `DISCORD_GUILD_ID`
for dogfood speed. Do not invent new slash names. Stay off LLM/memory HI workstreams.

## From the change's design.md

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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-009 | `tests/discord.slash.test.ts` — exactly six slash bodies; dispatch/handlers unchanged |
| REQ-discord-016 | `tests/discord.register-commands.test.ts` — guild PUT bodies then global `[]`; no-guild warns; names match SLASH_COMMAND_NAMES |
| REQ-cli-008 | `tests/discord.bridge.cli.test.ts` — `discord register-commands` without token exits cleanly naming token; help documents register-commands |

## Automated coverage

- `bun test tests/discord.register-commands.test.ts tests/discord.bridge.cli.test.ts tests/discord.slash.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`

## Notes

No live Discord token in CI. Live re-register is box ops after merge (`DISCORD_GUILD_ID` + `discord register-commands`).

## Where these lessons go

- `specs/discord/context.md`
- `specs/cli/context.md`
