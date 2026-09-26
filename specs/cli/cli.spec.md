---
module: cli
version: 10status: draft
files:
  - src/cli.ts

db_tables: []
depends_on:
  - plugins
  - agent
---

# Cli

## Purpose

Operator surface includes task run for prove-before-done gate.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `main` | `argv: string[]` | `Promise<number>` | CLI entry; exit code |
| `VERSION` | — | `string` | Semver stub |

### Exported Types

| Type | Description |
|------|-------------|

## Invariants

task run honors --no-verify and agent config; bridges may skip verify for latency.
plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count.

## Behavioral Examples

### Scenario: Plugins list

- **Given** builtins are loaded
- **When** the operator runs `corvidinho plugins list`
- **Then** github-* and plugins-list appear with danger markings and exit 0

### Scenario: Task run skip verify

- **Given** `--no-verify`
- **When** `corvidinho task run --no-verify --json`
- **Then** exit 0 and JSON has verifySkipped true

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown command | Print error + help; exit 1 |
| Doctor missing tools/env | Print per-check status; exit 1 (no secrets) |
| Task verify exhausted | Exit 1; JSON verified false |

## Dependencies

Consumes plugins module for loadBuiltins/list/size/runPlugin/helpers.
Consumes agent module for runTask / loadAgentConfig.

## Change Log

task run + --no-verify prove-before-done surface (2026-09-26, corvid-agent).
Document default-deny allowlists + wallet deferral (2026-09-26, corvid-agent).
| 2026-09-26 | safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm: SAFE: default-deny allowlists for GitHub orgs/repos/users and Discord channels/roles/users; file+env config on bot VM; empty allowlist denies all; AlgoChat wallets deferred (WALLET HI only); integrates GITHUB-6; Discord stub for HEAR #5 |
plugins list/run + non-interactive + doctor plugin count (2026-09-26, corvid-agent).
| 2026-09-26 | steal-prove-before-done-agent-loop-refuse-done-until-fledge-verify-passes-agent-4-fledge-2-states-planning-executing: STEAL prove-before-done agent loop: refuse done until fledge verify passes (AGENT-4 / FLEDGE-2); states planning/executing/verifying/done; CLI --no-verify; config verify_before_complete |
