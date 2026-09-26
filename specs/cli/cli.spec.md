---
module: cli
version: 19
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
| `VERSION` | — | `string` | Semver stub |
| `attribution` | `format?: "markdown" or "plain"` | `string` | Return the canonical footer in the requested format |

### Exported Constants

| Constant | Description |
|----------|-------------|
| `CORVIDINHO_URL` | Canonical Corvidinho repository URL |
| `ATTRIBUTION_MARKDOWN` | Canonical markdown footer without account handles |
| `ATTRIBUTION_PLAIN` | Canonical plain-text footer without account handles |

### Exported Types

| Type | Description |
|------|-------------|
| `AttributionFormat` | Supported attribution output formats |

## Invariants

discord bridge never logs token values; missing token is a clean exit; empty channels refuse start.
Attribution output uses only the project name and repository link and contains no account handle.

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
- **When** `corvidinho task run --no-verify --json`
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

discord bridge + --protocol-version HEAR surface (2026-09-26, corvid-agent, #5).
| 2026-09-26 | hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5: HEAR Discord bridge thin slice: DISCORD-1 mention→session stub, DISCORD-2/2.a reply/thread continuity, DISCORD-5 allowlisted channels only; gateway→message-router→session stub; no ProcessManager; token clean-exit; discord-post dangerous; spawn --no-verify |
| 2026-09-26 | Add canonical attribution helper and `corvidinho attribution` output for outbound PR footers (issue #20). |
| 2026-09-26 | Add CLI attribution helper and canonical no-handle footer forms. |

