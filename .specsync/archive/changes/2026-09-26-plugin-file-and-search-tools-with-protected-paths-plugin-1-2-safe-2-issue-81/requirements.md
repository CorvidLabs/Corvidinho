---
change: plugin-file-and-search-tools-with-protected-paths-plugin-1-2-safe-2-issue-81
artifact: requirements
---

# Requirements

### REQ-plugins-081
The system SHALL register typed file/search plugins `files-read`, `files-write`,
`files-edit`, `files-glob`, `files-list`, `files-delete`, and `search-grep`
(PLUGIN-1). Writes/edits/deletes SHALL declare `minTier: 2` (code).
`files-delete` SHALL be `dangerous: true` (PLUGIN-2).

### REQ-plugins-082
Every path argument SHALL resolve relative to the plugin cwd (task worktree /
project root). Absolute paths outside the root, `..` escapes, and symlink
resolutions that leave the root SHALL be refused.

### REQ-plugins-083
`files-write`, `files-edit`, and `files-delete` SHALL hard-refuse protected
project infra with no override (SAFE-2): `.env` / `.env.*`, `.git` components,
basename `fledge.toml`, paths under `specs/` or ending in `.spec.md`, and
keystore-like basenames (`*keystore*`, `wallet-keystore.json`).

### REQ-plugins-084
Builtins SHALL load files + search plugins so the LLM tool loop can call them
at code tier. Happy-path and SAFE-2 deny fixture tests SHALL pass without live
tokens. STATUS.md ROADMAP and CHANGELOG SHALL record the slice.
