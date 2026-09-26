---
id: shell-exec-plugin-with-safe-3-project-root-cwd-clamp-plugin-1-2-safe-3-issue-83-package-0-0-9
state: archived
type: feature
base_commit: ad431a9436108288cbe4c938d3e865da957458be
---

# Shell-exec plugin with SAFE-3 project-root cwd clamp (PLUGIN-1/2 SAFE-3 issue #83) package 0.0.9

## Intent

shell-exec plugin with SAFE-3 project-root cwd clamp (PLUGIN-1/2 SAFE-3 issue #83) package 0.0.9

## Affected Canonical Specs

- `plugins`
- `cli`

## Acceptance Criteria

- shell-exec registered as typed dangerous plugin minTier=code (PLUGIN-1/2); pins spawn cwd to project root; refuses cd/pushd targets that lexically escape root including ~ $VAR bare-cd and .. (SAFE-3); SAFE-1 deny in non-interactive without allowlist; happy-path + escape fixture tests green; STATUS/CHANGELOG + package 0.0.9

## No-spec Rationale

Not applicable
