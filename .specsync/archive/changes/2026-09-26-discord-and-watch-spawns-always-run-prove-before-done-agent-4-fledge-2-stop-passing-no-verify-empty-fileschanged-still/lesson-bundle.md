# Lesson bundle — discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord and WATCH spawns always run prove-before-done (AGENT-4 / FLEDGE-2): stop passing --no-verify; empty filesChanged still skips verify; CLI --no-verify local opt-out only; package 0.0.13 (#85 slice)
- **Kind**: Feature
- **Specs**: discord, watch, cli
- **Paths**: src/discord/agent-client.ts, src/watch/agent-client.ts, src/cli.ts, fledge.toml, docs/discord.md, docs/WATCH.md, tests/agent.ndjson-spawn.test.ts, tests/spawn.argv.test.ts, package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: Discord and WATCH createSpawnAgentClient argv is task run --task <prompt> --output ndjson with no --no-verify; empty filesChanged still skips verify; when tools report filesChanged verify runs (AGENT-4 / FLEDGE-2); CLI --no-verify local opt-out only; package 0.0.13; fixture tests; SpecSync + fledge verify green; Made with Corvidinho

## Evidence

- Verification commit: `accf1f53e26978822af5144cb1ea399316d8c0e0`
- Base commit: `19683b6059902c62baeddb9d2110f64f82dc3009`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec watch`

## From the change's context.md

# Context

Issue #85 (AGENT always verify): Discord and WATCH still spawn
`task run --no-verify`, so chat/ingress never hits prove-before-done
(AGENT-4 / FLEDGE-2). Captured HI already requires the verify lane before
claiming done; draft AGENT-14/15 stay out of scope. Empty `filesChanged`
already skips the gate in the agent loop. CLI `--no-verify` remains for
local/operator opt-out. Package **0.0.13** (0.0.12 already used by #145/#142).

## From the change's design.md

# Design

Spawn argv: `task run --task <prompt> --output ndjson` (no `--no-verify`).
Loop still skips verify when `filesChanged` is empty. CLI `--no-verify` stays
for local skips. Out of scope: AGENT-14/15, SAFE-22 / #82 porcelain extras.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-014 / REQ-discord-085 | `tests/agent.ndjson-spawn.test.ts` Discord argv has no `--no-verify` |
| REQ-watch-006 / REQ-watch-085 | `tests/agent.ndjson-spawn.test.ts` WATCH argv has no `--no-verify` |
| REQ-cli-007 / REQ-cli-085 | `tests/agent.cli.test.ts` — CLI `--no-verify` still works locally; bridges omit it |
| AGENT-4 empty-diff skip | Existing `tests/agent.loop.test.ts` |
| Package 0.0.13 | `tests/version.test.ts` / `tests/update-helpers.test.ts` |

## Automated coverage

- `bun test tests/agent.ndjson-spawn.test.ts tests/spawn.argv.test.ts tests/agent.cli.test.ts tests/version.test.ts tests/update-helpers.test.ts`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
- `specs/watch/context.md`
- `specs/cli/context.md`
