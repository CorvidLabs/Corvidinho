---
change: shell-exec-plugin-with-safe-3-project-root-cwd-clamp-plugin-1-2-safe-3-issue-83-package-0-0-9
artifact: requirements
---

# Requirements

### REQ-plugins-086

The system SHALL register typed plugin `shell-exec` (PLUGIN-1). It SHALL declare
`dangerous: true` and `minTier: 2` (code) (PLUGIN-2). Non-interactive runs
without `shell-exec` on the allowlist SHALL deny (SAFE-1).

Acceptance Criteria
- `plugins list` includes `shell-exec` with dangerous=true and minTier=2.
- Non-interactive without allowlist returns exit 2 / SAFE-1.

### REQ-plugins-087

`shell-exec` SHALL pin the spawned shell's initial cwd to the plugin cwd
(project root / task worktree) and SHALL refuse, before spawn, any command
whose lexically-resolved `cd` or `pushd` target would land outside that root
(SAFE-3). Refusals include absolute paths outside the root, `..` chains that
escape, `~` / `~user`, `$VAR` references, and bare `cd` (home). Relative `cd`
that stays under root and absolute `cd` under root SHALL be allowed.

Acceptance Criteria
- Unit fixtures cover allow/refuse cases above.
- Integration: `cd /tmp && …` and `cd ..` from root refuse with exit 2 and SAFE-3 message; `cd sub && …` inside project succeeds when allowlisted.

### REQ-plugins-088

Builtins SHALL load shell plugins. Happy-path + SAFE-3 refuse + SAFE-1 deny
fixture tests SHALL pass without live tokens. Package version SHALL be `0.0.9`.
STATUS.md ROADMAP and CHANGELOG SHALL record the slice. A WATCH reliability
HI draft MAY live under `docs/hi-drafts/` only (not `hi/`).

Acceptance Criteria
- `package.json` version is `0.0.9`; CLI `version` prints `0.0.9`.
- CHANGELOG has a 0.0.9 section; STATUS marks #83 done.
- `docs/hi-drafts/WATCH-RELIABILITY.md` exists as draft.

### REQ-cli-015

The project SHALL ship package version `0.0.9` with shell-exec + SAFE-3
(issue #83 / PLUGIN-1,2 / SAFE-3). CLI `version` and Discord presence
(DISCORD-12) report `0.0.9` after bridge update.

Acceptance Criteria
- `package.json` version is `0.0.9`.
- CLI `version` prints `0.0.9`.
- CHANGELOG has a 0.0.9 section covering shell-exec + SAFE-3.
