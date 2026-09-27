---
change: search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles
artifact: tasks
---

# Tasks

- [x] Reproduce the leak on origin/main as a non-ADMIN role session.
- [x] Regression tests fail before the fix (6 of 8 in tests/search.secret-path.test.ts; the 2 ADMIN/CLI tests pass before and after).
- [x] Shared `secretPathsRefused()` gate and `SECRET_GREP_EXCLUDES`.
- [x] search-grep refuses explicit secret paths, excludes and filters secret files in recursive searches.
- [x] files-list refuses secret dirs and hides secret entries; files-glob hides secret matches.
- [x] Delta REQ-plugins-267, spec invariant, scenario and files list updated.
- [x] Review: git-diff refuses explicit secret paths and excludes tracked secret files (worktree and --staged); files-glob judges the resolved path; recursive search-grep records keep names holding `:N:`.
- [x] tsc, full test suite, SpecSync checks and verify lane green.
