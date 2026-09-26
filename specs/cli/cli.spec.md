---
module: cli
version: 36
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
| 2026-09-26 | memory-sqlite-acl: package 0.0.4 with MEMORY ship (REQ-cli-011) |
| 2026-09-26 | memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user: MEMORY SQLite + ACL (MEMORY-1..4 / MEMORY-ACL-1..5 / issues #41 #59): shared store schema v3 memories scoped by Discord owner_user_id; categories conversation/entity/person/personality; ADMIN-only forget/override including self-forget; empty admin deny-all; no slash commands; no on-chain; bump 0.0.4 |
| 2026-09-26 | session-worktree: package 0.0.5 with SESSION-WORKTREE ship (REQ-cli-012) |
| 2026-09-26 | cover-leftover-cli-package-0-0-5-req-cli-012-paths-for-specsync-audit-after-session-worktree-archive-no-module-ac: Cover leftover cli package 0.0.5 / REQ-cli-012 paths for SpecSync audit after SESSION-WORKTREE archive (no module AC change beyond version bump already shipped in #58 PR) |
