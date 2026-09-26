---
module: cli
version: 20
status: draft
files:
  - src/cli.ts
  - src/attribution.ts

db_tables: []
depends_on:
  - plugins
  - agent
---

# Cli

## Purpose

Operator surface includes Discord HEAR bridge entrypoints and canonical attribution output for outbound PR bodies.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `main` | `argv: string[]` | `Promise<number>` | CLI entry; exit code |
| `attribution` | `format?: "markdown" or "plain"` | `string` | Return the canonical footer in the requested format |

### Exported Constants

| Constant | Description |
|----------|-------------|
| `VERSION` | Semver stub |
| `CORVIDINHO_URL` | Canonical Corvidinho repository URL |
| `ATTRIBUTION_MARKDOWN` | Canonical markdown footer without account handles |
| `ATTRIBUTION_PLAIN` | Canonical plain-text footer without account handles |

### Exported Types

| Type | Description |
|------|-------------|
| `AttributionFormat` | Supported attribution output formats |

## Invariants

task run honors --no-verify and agent config; bridges may skip verify for latency.
plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count.
Attribution output uses only the project name and repository link and contains no
account handle.

## Behavioral Examples

### Scenario: Plugins list

- **Given** builtins are loaded
- **When** the operator runs `corvidinho plugins list`
- **Then** github-* and plugins-list appear with danger markings and exit 0

### Scenario: Specsync list

- **Given** builtins are loaded and `.specsync/registry.toml` has modules
- **When** the operator runs `corvidinho specsync list`
- **Then** registered module names print and exit 0

### Scenario: Attribution footer

- **Given** the canonical attribution helper
- **When** the operator runs `corvidinho attribution`
- **Then** the exact markdown footer prints, exits 0, and contains no account handle

### Scenario: Task run skip verify

- **Given** `--no-verify`
- **When** the operator runs `corvidinho task run --no-verify --json`
- **Then** exit 0 and JSON has verifySkipped true

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown command | Print error + help; exit 1 |
| Attribution command | Print the canonical markdown footer; exit 0 |
| Doctor missing tools/env | Print per-check status; exit 1 (no secrets) |
| Task verify exhausted | Exit 1; JSON verified false |

## Dependencies

Consumes plugins module for loadBuiltins/list/size/runPlugin/helpers.
Consumes agent module for runTask / loadAgentConfig.

## Change Log

SpecSync CLI forwarding + task --task briefing hook (2026-09-26, corvid-agent).
| 2026-09-26 | Add canonical attribution helper and `corvidinho attribution` output for outbound PR footers (issue #20). |
| 2026-09-26 | Add CLI attribution helper and canonical no-handle footer forms. |

