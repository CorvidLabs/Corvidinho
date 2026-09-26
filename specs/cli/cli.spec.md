---
module: cli
version: 5
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

plugins list/run + non-interactive + doctor plugin count (2026-09-26, corvid-agent).

