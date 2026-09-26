---
module: plugins
version: 19
status: draft
files:
  - src/plugins/types.ts
  - src/plugins/registry.ts
  - src/plugins/run.ts
  - src/plugins/env.ts
  - src/plugins/builtins.ts
  - src/plugins/githubDeny.ts
  - src/allowlist/types.ts
  - src/allowlist/load.ts
  - src/allowlist/github.ts
  - src/allowlist/discord.ts
  - src/allowlist/index.ts
  - plugins/github/api.ts
  - plugins/github/commands.ts
  - plugins/github/index.ts
  - plugins/meta/index.ts
  - plugins/specsync/api.ts
  - plugins/specsync/commands.ts
  - plugins/specsync/index.ts

db_tables: []
depends_on: []
---

# Plugins

## Purpose

Plugin host includes Discord outbound post as dangerous.

## Public API

Export allowlist load + github/discord gate helpers used by plugins and future HEAR.

## Invariants

Builtin plugin loaders MAY re-register after an in-process registry clear
(test seam). Presence of an already-registered command name skips duplicate
register. No new dangerous commands; SAFE-1 non-interactive deny unchanged.

## Behavioral Examples

### Scenario: List plugins

- **Given** builtins are loaded
- **When** the operator runs `corvidinho plugins list`
- **Then** github-* and plugins-list appear with danger markings and exit 0

### Scenario: Deny dangerous non-interactive

- **Given** `danger-ping` is registered as dangerous
- **When** run under `--non-interactive` without allowlist
- **Then** the run fails with a Denied/SAFE-1 error and exit code 2

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown plugin name | Throw / fail with Unknown plugin command |
| Dangerous + non-interactive + not allowlisted | Deny (exit 2) |
| Missing token / API fail on github-* | Clear error; non-zero exit |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| Bun | `Bun.which`, `Bun.spawn` |
| @octokit/rest | REST list/view/checks for read commands |

### Consumed By

| Module | What is used |
|--------|-------------|
| cli | `plugins list` / `plugins run` / doctor count |

## Change Log

Plugin reload-after-clearRegistry for HEAR #13 fixtures (2026-09-26).
| 2026-09-26 | cover-plugin-reload-after-clearregistry-helpers-for-hear-13-fixture-suite: Cover plugin reload-after-clearRegistry helpers for HEAR #13 fixture suite |
