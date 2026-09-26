---
change: hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5
artifact: testing
---

# Testing

## Local gates

- `bun test` (router mention/reply/thread, empty deny, missing token clean exit, protocol, discord-post dangerous)
- `bunx tsc --noEmit`
- `bun src/cli.ts discord bridge` without token → clean non-zero exit
- `bun src/cli.ts --protocol-version` → `1`
- `specsync check`
- `specsync change audit`
- `fledge lanes run verify --non-interactive`

## CI

Bun smoke/test/typecheck + Spec Sync Action only (no Fledge Actions). Do not block merge on missing Discord token.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-001 | `tests/discord.router.test.ts` mention → start_session |
| REQ-discord-002 | `tests/discord.router.test.ts` reply + thread continue same id |
| REQ-discord-003 | `tests/discord.router.test.ts` non-allowlisted refuse/ignore; empty channels |
| REQ-discord-004 | `tests/discord.config.test.ts` empty_channels / DISCORD_CHANNEL_IDS merge |
| REQ-discord-005 | `tests/discord.bridge.cli.test.ts` bridge without token clean exit |
| REQ-discord-006 | `tests/discord.bridge.cli.test.ts` --protocol-version prints 1 |
| REQ-discord-007 | `tests/discord.post.plugin.test.ts` dangerous + SAFE-1 deny + channel gate |
| REQ-cli-008 | `tests/discord.bridge.cli.test.ts` protocol-version + missing token; help via cli smoke |
| REQ-plugins-009 | `tests/discord.post.plugin.test.ts` list dangerous + deny + dry-run allow |
