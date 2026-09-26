---
module: plugins
change: files-path-clamp-follows-dangling-symlinks-by-hand-so-files-write-cannot-escape-the-project-root-or-create-safe-2
---

# Delta — plugins (files path clamp follows dangling symlinks)

## Modified

### REQUIREMENT REQ-plugins-082

Every path argument SHALL resolve relative to the plugin cwd (task worktree /
project root). Absolute paths outside the root, `..` escapes, and symlink
resolutions that leave the root SHALL be refused. A dangling symlink (the leaf
or an ancestor, whose target does not exist yet) SHALL be followed by hand and
its target clamped the same way, so a write through it cannot land outside the
root and SAFE-2 (REQ-plugins-083) checks see the path the write would create;
a symlink loop SHALL be refused.

Acceptance Criteria
- Escape and symlink-outside-root fixtures refuse with a clear error.
- files-write through a dangling symlink to a missing file outside the root (absolute or relative link), or through a dangling directory link with a nested path, is refused and nothing is created outside the root.
- files-write through a dangling symlink to a missing SAFE-2 path (`.env`, `specs/*.spec.md`) is refused with SAFE-2 (exit 2) and the file is not created.
- A symlink loop is refused with a symlink error; a dangling symlink to a missing file inside the root still writes that in-root file.
