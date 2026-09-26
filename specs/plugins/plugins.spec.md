---
module: plugins
version: 13
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

Typed plugin host including GitHub reads and SpecSync list/read/check/brief tools for the agent loop.

## Public API

Export allowlist load + github/discord gate helpers used by plugins and future HEAR.

## Invariants

Empty allowlists deny all targeted GH/Discord actions; deny overrides win; file+env load; no Merlin empty→BASIC.

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

STEAL SpecSync plugins list/read/check/brief (+ coverage/change-list/ship-status) (2026-09-26, corvid-agent).
| 2026-09-26 | steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship: STEAL SpecSync agent wiring from Merlin fledge-plugin-specsync: typed list/read/check/brief/coverage + change list/ship-status; Planning companion briefing; SpecSync check blocks prove-before-done (SPECSYNC-1..7); plan-time list/read + verify-lane spec-check; CI Spec Sync Action remains dedicated |
