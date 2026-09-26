---
change: discord-searchable-channel-string-autocomplete-for-admin-channels-add-remove-and-announce-channel-admin-2-ux-discord
artifact: testing
---

# Testing

Fixture-only; no live Discord token.

## Requirement evidence

| Requirement | Evidence |
|---|---|
| REQ-discord-043 | `tests/discord.admin-slash.test.ts` (STRING+autocomplete body; ADMIN-4 re-check; add/remove persist); `tests/discord.channel-autocomplete.test.ts` (name/emoji/id match, ≤25 rank, allowlist scope) |
| REQ-discord-009 | `tests/discord.announce.test.ts` (announce channel STRING+autocomplete body + handler snowflake resolve); `tests/discord.channel-autocomplete.test.ts` (shared matcher) |

## Commands

- `bun test tests/discord.channel-autocomplete.test.ts tests/discord.admin-slash.test.ts tests/discord.announce.test.ts`
- `fledge lanes run verify`
