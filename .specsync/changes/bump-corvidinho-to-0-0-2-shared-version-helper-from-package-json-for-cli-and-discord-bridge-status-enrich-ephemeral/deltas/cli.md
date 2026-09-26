---
module: cli
change: bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral
---

# Delta — cli (shared version 0.0.2)

## Modified

### REQUIREMENT REQ-cli-002

The CLI `version` command SHALL print the semver string read from
`package.json` via the shared `src/version.ts` helper and SHALL NOT rely on a
hardcoded constant that can drift from the package.

Acceptance Criteria
- Printed version matches `package.json` `"version"`.
- Unit tests cover `readPackageVersion` / exported `VERSION`.

## Added

### REQUIREMENT REQ-cli-010

The project SHALL ship package version `0.0.2` and SHALL expose a shared
version helper (`src/version.ts`) used by the CLI `version` command. STATUS.md
SHALL briefly note the 0.0.2 dogfood polish (shared version + richer Discord
`/status`).

Acceptance Criteria
- `package.json` version is `0.0.2`.
- CLI `version` prints `0.0.2` (or whatever package.json says).
- STATUS.md mentions 0.0.2 dogfood polish.
- Secrets remain out of repo; no new slash commands invented here.
