---
change: discord-bot-presence-shows-shared-corvidinho-package-version-discord-12-set-custom-status-on-clientready-from-src
artifact: testing
---

# Testing

- Unit: `formatPresenceVersionString("0.0.3")` → `v0.0.3`; already-prefixed unchanged.
- Unit: `buildVersionPresenceActivity` → Custom type 4, name `Custom Status`, state `v0.0.3` from VERSION / package.json.
- No live Discord token; slash + allowlist fixtures unchanged.
- `bun test` + `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-017 | `tests/discord.presence.test.ts` — presence payload from shared version; Custom type + short `v*` state |
| REQ-cli-002 | `tests/discord.presence.test.ts` + `tests/version.test.ts` — `formatPresenceVersionString` / VERSION from package.json |

## Automated coverage

- `bun test tests/discord.presence.test.ts tests/version.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`
