---
module: plugins
change: discord-dogfood-member-user-lookup-for-snowflakes-identity-5-discord-13-soft-land-tool-round-exhaustion-without-dumping
---

# Delta — plugins (discord-user-lookup)

## Added

### REQUIREMENT REQ-plugins-312

The system SHALL register a read-only plugin `discord-user-lookup` (not dangerous, not mutating) that resolves a Discord guild member by snowflake user id (`--user-id`) or name query (`--query`) via the Discord REST API, scoped to the configured `DISCORD_GUILD_ID` only (IDENTITY-5 / DISCORD-13). A `--guild` that does not match the configured guild SHALL be refused. Empty `DISCORD_GUILD_ID` SHALL refuse. Arbitrary other guilds SHALL NOT be looked up. Dry-run (`CORVIDINHO_DISCORD_DRY_RUN=1`) SHALL succeed without a live call.

Acceptance Criteria
- `plugins list` shows `discord-user-lookup` with dangerous=false.
- Missing guild / wrong `--guild` → refuse exit 3 without REST.
- Dry-run by id or query succeeds with `dryRun: true`.
- Mocked REST returns display name / username / id; 404 → clean not-a-member error.
- Fixture: `tests/discord.user-lookup.test.ts`.
