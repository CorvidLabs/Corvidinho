---
module: plugins
version: 27
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
  - plugins/memory/index.ts
  - plugins/memory/commands.ts
  - tests/memory.plugins.test.ts

db_tables: []
depends_on: []
---

# Plugins

## Purpose

Plugin host includes Discord outbound post, GitHub write plugins as dangerous (GITHUB-2/3/5), and memory-store/recall/forget/override (MEMORY / REQ-plugins-010).

## Public API

Export allowlist load + github/discord gate helpers used by plugins and future HEAR.

## Invariants

Builtin plugin loaders MAY re-register after an in-process registry clear
(test seam). Presence of an already-registered command name skips duplicate
register. GitHub write commands (`github-issue-create`, `github-issue-comment`,
`github-pr-create`, `github-pr-review`) are dangerous + minTier 1; SAFE-1
non-interactive deny unless CORVIDINHO_ALLOWLIST names them. Repo gate
(GITHUB-6 / ALLOW-1) still applies before any Octokit write. PR create appends
plain Made with Corvidinho attribution (no @handles). Dry-run via
CORVIDINHO_GITHUB_DRY_RUN=1.

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
| Dangerous github write + non-interactive + not allowlisted | Deny (exit 2, SAFE-1) |
| github write + empty/missing repo allowlist | Refuse (exit 3, GITHUB-6) |

## Dependencies

| Module | What is used |
|--------|-------------|
| Bun | `Bun.which`, `Bun.spawn` |
| @octokit/rest | REST list/view/checks + create/comment/review for gated write commands |

### Consumed By

| Module | What is used |
|--------|-------------|
| cli | `plugins list` / `plugins run` / doctor count |

## Change Log

Plugin reload-after-clearRegistry for HEAR #13 fixtures (2026-09-26).

| 2026-09-26 | github-write-plugins-issue-48: dangerous issue/PR create comment review + attribution; SAFE-1 + GITHUB-6 |
| 2026-09-26 | github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create: GitHub write plugins for assign→work→comment→PR dogfood (issue #48): dangerous github-issue-create/comment, github-pr-create with Made with Corvidinho attribution, github-pr-review; SAFE-1 CORVIDINHO_ALLOWLIST + GITHUB-6 repo gate; WATCH assignment events from assignees; SpecSync + fixtures no live tokens |
| 2026-09-26 | memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user: MEMORY SQLite + ACL (MEMORY-1..4 / MEMORY-ACL-1..5 / issues #41 #59): shared store schema v3 memories scoped by Discord owner_user_id; categories conversation/entity/person/personality; ADMIN-only forget/override including self-forget; empty admin deny-all; no slash commands; no on-chain; bump 0.0.4 |
