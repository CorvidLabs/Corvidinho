---
module: plugins
version: 37
status: draft
files:
  - src/plugins/types.ts
  - src/plugins/registry.ts
  - src/plugins/run.ts
  - src/plugins/env.ts
  - src/plugins/mutating.ts
  - src/plugins/roles.ts
  - src/plugins/builtins.ts
  - src/plugins/githubDeny.ts
  - src/audit/log.ts
  - src/audit/index.ts
  - tests/audit.log.test.ts
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
  - plugins/files/index.ts
  - plugins/files/commands.ts
  - plugins/files/protectedPaths.ts
  - plugins/files/resolvePath.ts
  - plugins/search/index.ts
  - plugins/search/commands.ts
  - src/memory/confirm.ts
  - tests/memory.plugins.test.ts
  - tests/memory.confirm.test.ts
  - tests/files.plugins.test.ts
  - tests/search.plugins.test.ts
  - plugins/shell/index.ts
  - plugins/shell/commands.ts
  - plugins/shell/clamp.ts
  - tests/shell.plugins.test.ts
  - plugins/git/index.ts
  - plugins/git/commands.ts
  - plugins/git/exec.ts
  - plugins/git/parse.ts
  - tests/git.plugins.test.ts
db_tables: []
depends_on: []
---

# Plugins

## Purpose

Plugin host includes Discord outbound post, GitHub write plugins as dangerous
(GITHUB-2/3/5), memory-store/recall/forget/override (MEMORY / REQ-plugins-010),
file/search plugins with SAFE-2 guards (PLUGIN-1/2 / REQ-plugins-081..084),
`shell-exec` with SAFE-3 project-root cwd clamp (REQ-plugins-086..088), and
typed git plugins (`git-status|diff|log|branch-list` reads;
`git-branch-create|commit|push` dangerous code-tier mutators) clamped to the
task worktree (PLUGIN-1/2, SAFE-1/2/3, GITHUB-2/6 / REQ-plugins-182).

## Public API

Export allowlist load + github/discord gate helpers used by plugins and future
HEAR. File/search plugins register via `loadFilesPlugins` / `loadSearchPlugins`.
Shell plugins register via `loadShellPlugins` (`shell-exec`). Git plugins
register via `loadGitPlugins` (`plugins/git/index.ts`).

## Invariants

File write/edit are `mutating: true` even when `dangerous: false` (ROLES-CHAT-5).
When `CORVIDINHO_ACTING_IS_ADMIN` is set, non-ADMIN callers are refused for every
mutating plugin at run time with "not allowed for your role" (ROLES-CHAT-3/6);
ADMIN still passes SAFE-1 for dangerous tools. Role is re-checked via owner
config each call.

## Behavioral Examples

### Scenario: non-ADMIN refused files-write (ROLES-CHAT-3)

- **Given** builtins loaded and `CORVIDINHO_ACTING_IS_ADMIN=0` with an acting Discord user
- **When** the agent runs `files-write`
- **Then** the run fails with exit 2 and a "not allowed for your role" message; no file is written

### Scenario: ADMIN files-write still allowed (ROLES-CHAT-4)

- **Given** `CORVIDINHO_ACTING_IS_ADMIN=1` and the acting user is the configured owner
- **When** the agent runs `files-write` under non-interactive
- **Then** the write succeeds (mutating but not dangerous); SAFE-2 protected paths still refuse

## Error Cases

| Mutating + acting non-ADMIN (ROLES-CHAT-3) | Deny (exit 2, not allowed for your role) |

## Dependencies

| Module | What is used |
|--------|-------------|
| Bun | `Bun.which`, `Bun.spawn`, `Bun.file`, `Bun.write` |
| @octokit/rest | REST list/view/checks + create/comment/review for gated write commands |
| node:fs / path | path clamp, symlink resolve, glob/list, shell cwd pin |
| sh | shell-exec child via `sh -c` |
| git (system binary) | git plugins via `Bun.spawn` argv arrays |

## Change Log

| 2026-09-26 | roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat: ROLES-CHAT-2..6 mutating role gates |

