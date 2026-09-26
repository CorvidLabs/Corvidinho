---
module: cli
version: 1
status: draft
files:
  - src/cli.ts

db_tables: []
depends_on: []
---

# Cli

## Purpose

Bootstrap operator surface for Corvidinho on Linux: print help, print version, and run a non-secret doctor check for Discord env presence, `gh` auth, Fledge, and SpecSync on PATH. This module does not yet run the agent loop.

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

1. Doctor never prints secret values (SAFE-6).
2. Unknown commands print help and exit non-zero.
3. `--help` / `help` / bare invoke exit 0.

## Behavioral Examples

### Scenario: Help

- **Given** the CLI stub is installed
- **When** the operator runs `corvidinho --help`
- **Then** usage text is printed and the process exits 0

### Scenario: Version

- **Given** the CLI stub is installed
- **When** the operator runs `corvidinho version`
- **Then** a semver string is printed and the process exits 0

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown command | Print error + help; exit 1 |
| Doctor missing tools/env | Print per-check status; exit 1 (no secrets) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| Bun | runtime, `Bun.which`, `Bun.spawn` |

### Consumed By

| Module | What is used |
|--------|-------------|
| — | bootstrap only |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-09-26 | corvid-agent | Initial draft stub for BOOT HI capture |
| 2026-09-26 | corvid-agent | Help text: merge when SpecSync change + verify green |
