---
module: plugins
change: shell-exec-plugin-with-safe-3-project-root-cwd-clamp-plugin-1-2-safe-3-issue-83-package-0-0-9
---

# Delta — plugins (shell-exec SAFE-3 #83)

## Modified

### SPEC SECTION Purpose

Plugin host includes Discord outbound post, GitHub write plugins as dangerous
(GITHUB-2/3/5), memory-store/recall/forget/override (MEMORY / REQ-plugins-010),
file/search plugins with SAFE-2 guards (PLUGIN-1/2 / REQ-plugins-081..084),
and `shell-exec` with SAFE-3 project-root cwd clamp (REQ-plugins-086..088).

### SPEC SECTION Public API

Export allowlist load + github/discord gate helpers used by plugins and future
HEAR. File/search plugins register via `loadFilesPlugins` / `loadSearchPlugins`.
Shell plugins register via `loadShellPlugins` (`shell-exec`).

### SPEC SECTION Invariants

`shell-exec` is dangerous + minTier 2 (code). Spawn cwd is pinned to plugin cwd.
Lexical `cd`/`pushd` targets that escape the root are refused before spawn
(SAFE-3) with exit 2. SAFE-1 non-interactive deny applies unless allowlisted.

### SPEC SECTION Behavioral Examples

### Scenario: SAFE-3 refuse cd outside root

- **Given** builtins loaded and `shell-exec` allowlisted
- **When** the agent runs `shell-exec` with `cd /tmp && pwd`
- **Then** the run fails with exit 2 and a SAFE-3 refuse message; no spawn outside root

### Scenario: relative cd inside root

- **Given** a project with subdirectory `sub`
- **When** `shell-exec` runs `cd sub && …` allowlisted
- **Then** the command runs with initial cwd at project root and succeeds if the subcommand does

### SPEC SECTION Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown plugin name | Throw / fail with Unknown plugin command |
| Dangerous + non-interactive + not allowlisted | Deny (exit 2) |
| Missing token / API fail on github-* | Clear error; non-zero exit |
| Dangerous github write + non-interactive + not allowlisted | Deny (exit 2, SAFE-1) |
| github write + empty/missing repo allowlist | Refuse (exit 3, GITHUB-6) |
| Path escapes project cwd / symlink escape | Refuse (exit 1) |
| Write/edit/delete protected infra | Refuse (exit 2, SAFE-2); no override |
| shell-exec cd/pushd escapes project root | Refuse (exit 2, SAFE-3); no spawn |

### SPEC SECTION Dependencies

| Module | What is used |
|--------|-------------|
| Bun | `Bun.which`, `Bun.spawn`, `Bun.file`, `Bun.write` |
| @octokit/rest | REST list/view/checks + create/comment/review for gated write commands |
| node:fs / path | path clamp, symlink resolve, glob/list, shell cwd pin |
| sh | shell-exec child via `sh -c` |

### SPEC SECTION Change Log

| 2026-09-26 | shell-exec-plugin-with-safe-3-project-root-cwd-clamp-plugin-1-2-safe-3-issue-83-package-0-0-9: shell-exec + SAFE-3 cwd clamp; package 0.0.9 |

## Added

### REQUIREMENT REQ-plugins-086

The system SHALL register typed plugin `shell-exec` (PLUGIN-1). It SHALL declare
`dangerous: true` and `minTier: 2` (code) (PLUGIN-2). Non-interactive runs
without `shell-exec` on the allowlist SHALL deny (SAFE-1).

Acceptance Criteria
- `plugins list` includes `shell-exec` with dangerous=true and minTier=2.
- Non-interactive without allowlist returns exit 2 / SAFE-1.

### REQUIREMENT REQ-plugins-087

`shell-exec` SHALL pin the spawned shell's initial cwd to the plugin cwd
(project root / task worktree) and SHALL refuse, before spawn, any command
whose lexically-resolved `cd` or `pushd` target would land outside that root
(SAFE-3). Refusals include absolute paths outside the root, `..` chains that
escape, `~` / `~user`, `$VAR` references, and bare `cd` (home). Relative `cd`
that stays under root and absolute `cd` under root SHALL be allowed.

Acceptance Criteria
- Unit fixtures cover allow/refuse cases above.
- Integration: `cd /tmp && …` and `cd ..` from root refuse with exit 2 and SAFE-3 message; `cd sub && …` inside project succeeds when allowlisted.

### REQUIREMENT REQ-plugins-088

Builtins SHALL load shell plugins. Happy-path + SAFE-3 refuse + SAFE-1 deny
fixture tests SHALL pass without live tokens. Package version SHALL be `0.0.9`.
STATUS.md ROADMAP and CHANGELOG SHALL record the slice. A WATCH reliability
HI draft MAY live under `docs/hi-drafts/` only (not `hi/`).

Acceptance Criteria
- `package.json` version is `0.0.9`; CLI `version` prints `0.0.9`.
- CHANGELOG has a 0.0.9 section; STATUS marks #83 done.
- `docs/hi-drafts/WATCH-RELIABILITY.md` exists as draft.

### FRONTMATTER files

Add:
- `plugins/shell/index.ts`
- `plugins/shell/commands.ts`
- `plugins/shell/clamp.ts`
- `tests/shell.plugins.test.ts`
