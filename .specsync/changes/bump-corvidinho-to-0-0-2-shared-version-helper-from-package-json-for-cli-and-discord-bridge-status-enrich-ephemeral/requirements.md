---
change: bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral
artifact: requirements
---

# Requirements

1. Bump `package.json` version to `0.0.2`.
2. Shared `src/version.ts` reads version from `package.json`; CLI `version` and Discord bridge `/status` use it (no hardcoded `BRIDGE_VERSION` / CLI `VERSION` string).
3. Ephemeral `/status` includes: Corvidinho vX.Y.Z; uptime; protocol; channels count; sessions/work counts; LLM model + base host (no API key) or "demo stub"; list of the 6 registered slash command names; optional git tip short SHA without failing offline.
4. Do not invent new slash commands; mute/unmute unchanged.
5. STATUS.md briefly notes 0.0.2 dogfood polish.
6. SpecSync deltas + tests for version helper and status formatting; fledge verify green.
