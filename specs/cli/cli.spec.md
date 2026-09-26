---
module: cli
version: 13
status: draft
files:
  - src/cli.ts

db_tables: []
depends_on:
  - plugins
  - agent
---

# Cli

## Purpose

Operator surface includes plugins, task run, and SpecSync list/read/check/brief.

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

### Scenario: Specsync list

- **Given** builtins are loaded and `.specsync/registry.toml` has modules
- **When** the operator runs `corvidinho specsync list`
- **Then** registered module names print and exit 0

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

SpecSync CLI forwarding + task --task briefing hook (2026-09-26, corvid-agent).

