---
change: discord-announce-slash-discord-announce-1-6-channel-picker-persist-bridge-live-announce-only-package-0-0-8-req-discord
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-009 | `tests/discord.announce.test.ts` + schedule/slash tests — eight-command set |
| REQ-discord-016 | `tests/discord.register-commands.test.ts` — eight bodies |
| REQ-discord-018 | `docs/discord.md` announce section + mermaid |
| REQ-discord-024 | `tests/discord.announce.test.ts` — set/clear/show, deny, persist, postAnnouncement, status; package 0.0.8 |

## Automated coverage

- `bun test`; `bunx tsc --noEmit`; `fledge lanes run verify --non-interactive`
