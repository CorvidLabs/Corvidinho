---
module: plugins
version: 4
status: draft
files:
  - src/plugins/types.ts
  - src/plugins/registry.ts
  - src/plugins/run.ts
  - src/plugins/env.ts
  - src/plugins/builtins.ts
  - src/plugins/githubDeny.ts
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

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `register` | `command: PluginCommand` | `void` | Register a command by unique name |
| `get` | `name: string` | `PluginCommand \| undefined` | Lookup by name |
| `list` | — | `PluginListEntry[]` | Sorted list with danger/tier |
| `clearRegistry` | — | `void` | Test helper |
| `size` | — | `number` | Registered count |
| `runPlugin` | `opts: RunOptions` | `Promise<PluginHandlerResult>` | Run with SAFE-1 enforcement |
| `isNonInteractive` | `{ nonInteractiveFlag?: boolean }` | `boolean` | Flag/env detection |
| `allowlistFromEnv` | — | `Set<string>` | Parse CORVIDINHO_ALLOWLIST |
| `loadBuiltins` | — | `void` | Load github + meta plugins once |

### Exported Types

| Type | Description |
|------|-------------|
| `PluginCommand` | name, description, dangerous?, minTier?, handler |
| `PluginListEntry` | name, description, dangerous, minTier |
| `PluginHandlerArgs` | args, cwd, json, nonInteractive, allowlist |
| `PluginHandlerResult` | ok, data?, message?, error?, exitCode? |
| `RunOptions` | name, args?, cwd?, json?, nonInteractive?, allowlist? |

## Invariants

Add GITHUB-6 repo gate invariant; keep danger/minTier and gh-helper invariants.

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

WATCH: host + github read + SAFE-1 deny + repo deny gate (2026-09-26, corvid-agent).

