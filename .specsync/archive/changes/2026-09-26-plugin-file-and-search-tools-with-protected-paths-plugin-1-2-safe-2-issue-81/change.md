---
id: plugin-file-and-search-tools-with-protected-paths-plugin-1-2-safe-2-issue-81
state: archived
type: feature
base_commit: c20fc10318238468d1e6036a8f814759a31f7526
---

# PLUGIN file and search tools with protected paths (PLUGIN-1,2 SAFE-2 issue #81)

## Intent

PLUGIN file and search tools with protected paths (PLUGIN-1,2 SAFE-2 issue #81)

## Affected Canonical Specs

- `cli`
- `plugins`

## Acceptance Criteria

- files-read/write/edit/glob/list and search-grep registered as typed plugins (PLUGIN-1); write/edit/delete declare minTier=code and delete is dangerous (PLUGIN-2); write/edit/delete refuse protected infra paths env/git/fledge.toml/specs/keystores (SAFE-2); paths clamped to project cwd with symlink escape refuse; happy-path + SAFE-2 deny tests green; STATUS/CHANGELOG updated; wired into builtins for LLM tool loop

## No-spec Rationale

Not applicable
