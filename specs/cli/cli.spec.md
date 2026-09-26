---
module: cli
version: 31
status: draft
files:
  - src/cli.ts
  - src/version.ts
  - src/attribution.ts
  - .env.example
  - STATUS.md

db_tables: []
depends_on:
  - plugins
  - agent
---

# Cli

## Purpose

Operator surface includes Discord HEAR, GitHub WATCH, attribution, and task run with optional LLM plugin tool loop.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `main` | `argv: string[]` | `Promise<number>` | CLI entry; exit code |
| `attribution` | `format?: "markdown" or "plain"` | `string` | Return the canonical footer in the requested format |

### Exported Constants

| Constant | Description |
|----------|-------------|
| `VERSION` | Semver from package.json via shared helper |
| `formatPresenceVersionString` | Short `vX.Y.Z` for Discord Custom Status (DISCORD-12) |
| `CORVIDINHO_URL` | Canonical Corvidinho repository URL |
| `ATTRIBUTION_MARKDOWN` | Canonical markdown footer without account handles |
| `ATTRIBUTION_PLAIN` | Canonical plain-text footer without account handles |

### Exported Types

| Type | Description |
|------|-------------|
| `AttributionFormat` | Supported attribution output formats |

## Invariants

task run honors --no-verify, --tier, and agent config; bridges may skip verify for latency.
plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count.
Attribution output uses only the project name and repository link and contains no account handle.

## Behavioral Examples

### Scenario: Github watch missing token

- **Given** no GITHUB_TOKEN / GH_TOKEN
- **When** the operator runs `corvidinho github watch`
- **Then** exit non-zero naming the token env and go-live checklist

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

| 2026-09-26 | watch-reliability: STATUS notes WATCH poll logging + auto-ack + own-mention skip + pagination bury docs (REQ-watch-007); no CLI argv change |
| 2026-09-26 | watch-reliability-poll-cycle-logging-error-catch-auto-ack-github-comment-on-start-continue-ignore-own-mentions-document: WATCH reliability: poll cycle logging + error catch, auto-ack GitHub comment on start/continue, ignore own mentions, document search pagination bury risk (flake harden for GH watch) |
