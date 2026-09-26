---
id: bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral
state: verifying
type: feature
base_commit: 4ef180b31cf719ac1e1661d209b37360781dd026
---

# Bump Corvidinho to 0.0.2; shared version helper from package.json for CLI and Discord bridge /status; enrich ephemeral /status with uptime protocol channels sessions work LLM model+host (no key) slash command names optional git tip SHA; STATUS dogfood polish note; no new slash commands

## Intent

Bump Corvidinho to 0.0.2; shared version helper from package.json for CLI and Discord bridge /status; enrich ephemeral /status with uptime protocol channels sessions work LLM model+host (no key) slash command names optional git tip SHA; STATUS dogfood polish note; no new slash commands

## Affected Canonical Specs

- `discord`
- `cli`

## Acceptance Criteria

- package.json is 0.0.2; shared src/version.ts (or equivalent) feeds CLI version and Discord bridge /status (no hardcoded BRIDGE_VERSION); /status ephemeral includes Corvidinho vX.Y.Z, uptime, protocol, channels count, sessions/work counts, LLM model+base host without API key (or demo stub), registered slash command names (the 6), optional git tip short SHA without failing offline; STATUS.md notes 0.0.2 dogfood polish; SpecSync + tests for version helper + status formatting; no new slash commands; mute/unmute unchanged; fledge verify green

## No-spec Rationale

Not applicable
