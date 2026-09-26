---
change: bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral
artifact: design
---

# Design

- `src/version.ts`: `readPackageVersion`, exported `VERSION`, `tryGitTipShortSha` (spawnSync git; undefined on failure), `formatLlmStatusLine` via `loadLlmEnv` (host only, never key).
- CLI imports `VERSION` from `./version.ts`; bridge drops `BRIDGE_VERSION` and uses shared `VERSION`.
- `command-handlers/status.ts`: pure `formatStatusReport(input)` builds lines; handler stays ephemeral.
- SlashContext may carry optional `env` / `gitTipSha` for tests; bridge fills git tip best-effort at start.
- No new slash commands; `SLASH_COMMAND_NAMES` listed in status body.
