---
module: plugins
version: 8
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

db_tables: []
depends_on: []
---

# Plugins

## Purpose

Typed plugin command host for Corvidinho: register/list/run commands with honest danger and minTier markings. Built-in GitHub read tools and a meta list command live behind this host. Dangerous commands are denied in non-interactive mode unless allowlisted (SAFE-1).

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

Default-deny allowlists file+env; Discord stub; empty≠BASIC (2026-09-26, corvid-agent).
| 2026-09-26 | safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm: SAFE: default-deny allowlists for GitHub orgs/repos/users and Discord channels/roles/users; file+env config on bot VM; empty allowlist denies all; AlgoChat wallets deferred (WALLET HI only); integrates GITHUB-6; Discord stub for HEAR #5 |
