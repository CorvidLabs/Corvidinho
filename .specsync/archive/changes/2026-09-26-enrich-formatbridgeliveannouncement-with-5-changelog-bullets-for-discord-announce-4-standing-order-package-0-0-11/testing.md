---
change: enrich-formatbridgeliveannouncement-with-5-changelog-bullets-for-discord-announce-4-standing-order-package-0-0-11
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-024 | `tests/discord.announce.test.ts` — postAnnouncement still announce-channel-only / default-deny; ClientReady path unchanged in bridge |
| REQ-discord-025 | `tests/discord.announce.test.ts` — header + ≤5 CHANGELOG bullets; description/tip/header-only fallbacks; real CHANGELOG for 0.0.10; package 0.0.11 |

## Automated coverage

- `bun test tests/discord.announce.test.ts tests/version.test.ts tests/update-helpers.test.ts`
- `fledge lanes run verify --non-interactive`
