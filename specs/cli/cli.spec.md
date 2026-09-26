---
module: cli
version: 9
status: draft
files:
  - src/cli.ts

db_tables: []
depends_on:
  - plugins
---

# Cli

## Purpose

Operator surface includes plugins list/run and non-interactive deny for dangerous tools.

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

plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count.

## Behavioral Examples

Add Scenario: Plugins list.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown command | Print error + help; exit 1 |
| Doctor missing tools/env | Print per-check status; exit 1 (no secrets) |

## Dependencies

Consumes plugins module for loadBuiltins/list/size/runPlugin/helpers.

## Change Log

Document default-deny allowlists + wallet deferral (2026-09-26, corvid-agent).
| 2026-09-26 | safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm: SAFE: default-deny allowlists for GitHub orgs/repos/users and Discord channels/roles/users; file+env config on bot VM; empty allowlist denies all; AlgoChat wallets deferred (WALLET HI only); integrates GITHUB-6; Discord stub for HEAR #5 |
