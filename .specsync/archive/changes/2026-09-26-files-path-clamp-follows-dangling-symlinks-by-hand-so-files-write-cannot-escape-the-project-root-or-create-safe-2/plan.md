---
change: files-path-clamp-follows-dangling-symlinks-by-hand-so-files-write-cannot-escape-the-project-root-or-create-safe-2
artifact: plan
---

# Plan

1. Add a regression test (`tests/files.dangling-symlink.test.ts`) that reproduces the outside-root and SAFE-2 writes, and confirm it fails on main.
2. Make `resolveProjectPath` follow dangling links by hand and re-clamp them (`plugins/files/resolvePath.ts`).
3. Modify REQ-plugins-082 (delta), and update the plugins spec invariant, error row and files list.
4. Run specsync check, tsc, bun test and fledge verify.
