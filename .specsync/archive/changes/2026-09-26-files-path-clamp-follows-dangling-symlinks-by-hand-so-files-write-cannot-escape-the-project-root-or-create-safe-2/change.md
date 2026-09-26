---
id: files-path-clamp-follows-dangling-symlinks-by-hand-so-files-write-cannot-escape-the-project-root-or-create-safe-2
state: archived
type: bug_fix
base_commit: cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f
---

# Files path clamp follows dangling symlinks by hand so files-write cannot escape the project root or create SAFE-2 protected files through a link whose target does not exist yet

## Intent

Files path clamp follows dangling symlinks by hand so files-write cannot escape the project root or create SAFE-2 protected files through a link whose target does not exist yet

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- files-write through a dangling symlink whose target is outside the project root is refused with a symlink-escape error and the target is not created; through a dangling symlink to a missing SAFE-2 path (.env, specs/*.spec.md) it is refused with SAFE-2 and the file is not created; a dangling directory link cannot carry a nested write outside the root; a symlink loop is refused; a dangling link to a missing file inside the root still writes that in-root file

## No-spec Rationale

Not applicable
