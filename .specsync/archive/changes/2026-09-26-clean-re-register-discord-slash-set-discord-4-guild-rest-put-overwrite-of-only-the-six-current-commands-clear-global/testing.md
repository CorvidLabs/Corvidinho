---
change: clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global
artifact: testing
---

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
