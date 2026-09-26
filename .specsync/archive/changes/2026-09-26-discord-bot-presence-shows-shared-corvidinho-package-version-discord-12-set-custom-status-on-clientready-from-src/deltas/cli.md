---
module: cli
change: discord-bot-presence-shows-shared-corvidinho-package-version-discord-12-set-custom-status-on-clientready-from-src
---

# Delta — cli (presence version string helper)

## Modified

### REQUIREMENT REQ-cli-002

The CLI `version` command and shared exports SHALL read the package version from
`package.json` via the shared `src/version.ts` helper and SHALL NOT rely on a
hardcoded semver literal in the CLI. `src/version.ts` SHALL also export
`formatPresenceVersionString` returning a short `vX.Y.Z` string for Discord
presence (DISCORD-12). Existing `VERSION` / CLI version / `/status` consumers
SHALL remain compatible.

Acceptance Criteria
- Unit tests cover `readPackageVersion` / exported `VERSION`.
- `formatPresenceVersionString` returns short `vX.Y.Z` for Discord presence (DISCORD-12).
- CLI `version` prints the shared package version.
