---
change: bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral
artifact: testing
---

# Testing

- Unit: `readPackageVersion` / `VERSION` matches package.json; injectable path.
- Unit: `formatLlmStatusLine` — no key → demo stub; with key → model @ host (never key).
- Unit: `formatStatusReport` includes version, protocol, channels, sessions/work, LLM, slash names; optional git tip when provided.
- Slash fixture: `/status` ephemeral body contains v0.0.2 + slash names + demo stub.
- `bun test` + `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-cli-002 | `tests/version.test.ts` + `tests/cli.smoke.test.ts` — version from package.json via `src/version.ts` |
| REQ-cli-010 | `package.json` is 0.0.2; `tests/version.test.ts`; STATUS.md 0.0.2 note |
| REQ-discord-009 | `tests/discord.slash.test.ts` — six slash bodies; `/status` enriched; mute/unmute unchanged |
| REQ-discord-015 | `tests/discord.slash.test.ts` formatStatusReport + `/status` (LLM host/demo stub, slash names, optional git tip; never key) |

## Automated coverage

- `bun test tests/version.test.ts tests/discord.slash.test.ts tests/cli.smoke.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`
