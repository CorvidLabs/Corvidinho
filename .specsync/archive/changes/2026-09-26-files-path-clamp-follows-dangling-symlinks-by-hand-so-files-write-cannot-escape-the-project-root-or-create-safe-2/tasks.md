---
change: files-path-clamp-follows-dangling-symlinks-by-hand-so-files-write-cannot-escape-the-project-root-or-create-safe-2
artifact: tasks
---

# Tasks

- [x] Regression test reproducing dangling-link escape and SAFE-2 bypass (fails before fix).
- [x] Walk-up uses lstat existence; dangling link followed by hand and re-clamped; loop capped.
- [x] Link directory and target both clamped to root.
- [x] Delta modifies REQ-plugins-082; spec invariant, error row and files list updated.
- [x] specsync check, tsc, bun test, fledge verify green.
