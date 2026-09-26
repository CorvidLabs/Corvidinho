# Lesson bundle — bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Bump Corvidinho to 0.0.2; shared version helper from package.json for CLI and Discord bridge /status; enrich ephemeral /status with uptime protocol channels sessions work LLM model+host (no key) slash command names optional git tip SHA; STATUS dogfood polish note; no new slash commands
- **Kind**: Feature
- **Specs**: discord, cli
- **Paths**: package.json, src/version.ts, src/cli.ts, src/discord/bridge.ts, src/discord/command-handlers/status.ts, src/discord/slash-types.ts, STATUS.md, tests/version.test.ts, tests/discord.slash.test.ts, src/discord/index.ts
- **Acceptance**: package.json is 0.0.2; shared src/version.ts (or equivalent) feeds CLI version and Discord bridge /status (no hardcoded BRIDGE_VERSION); /status ephemeral includes Corvidinho vX.Y.Z, uptime, protocol, channels count, sessions/work counts, LLM model+base host without API key (or demo stub), registered slash command names (the 6), optional git tip short SHA without failing offline; STATUS.md notes 0.0.2 dogfood polish; SpecSync + tests for version helper + status formatting; no new slash commands; mute/unmute unchanged; fledge verify green

## Evidence

- Verification commit: `3ee5b4f6d8b6966b0e041222c15db0ad25f53ce9`
- Base commit: `4ef180b31cf719ac1e1661d209b37360781dd026`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Leif wants incremental versions and clearer Discord `/status` for dogfood on the
live bridge. `package.json` and hardcoded `BRIDGE_VERSION` / CLI `VERSION` are
still `0.0.1` and can drift. `/status` already shows version/uptime/protocol/
channels/sessions/work but omits LLM mode (model + host, never key), registered
slash names, and optional git tip — useful when restarting after pull.

Constraints: HI-first; no new slash commands; keep mute/unmute; do not steal
iced/voice/schedule (#9); secrets out of repo; SpecSync + fledge verify green.

## From the change's design.md

# Design

- `src/version.ts`: `readPackageVersion`, exported `VERSION`, `tryGitTipShortSha` (spawnSync git; undefined on failure), `formatLlmStatusLine` via `loadLlmEnv` (host only, never key).
- CLI imports `VERSION` from `./version.ts`; bridge drops `BRIDGE_VERSION` and uses shared `VERSION`.
- `command-handlers/status.ts`: pure `formatStatusReport(input)` builds lines; handler stays ephemeral.
- SlashContext may carry optional `env` / `gitTipSha` for tests; bridge fills git tip best-effort at start.
- No new slash commands; `SLASH_COMMAND_NAMES` listed in status body.

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
- `specs/cli/context.md`
