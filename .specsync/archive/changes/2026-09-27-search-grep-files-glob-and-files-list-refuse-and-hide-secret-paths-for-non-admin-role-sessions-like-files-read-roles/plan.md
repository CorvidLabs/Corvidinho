---
change: search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles
artifact: plan
---

# Plan

1. Reproduce on origin/main with a fake `.env` key as a non-ADMIN session.
2. Regression tests first (`tests/search.secret-path.test.ts`); watch them
   fail on main.
3. Shared `secretPathsRefused()` gate and `SECRET_GREP_EXCLUDES`;
   `search-grep` refuses explicit secret paths, excludes and filters secret
   files; `files-list` refuses / hides; `files-glob` hides.
4. Delta REQ-plugins-267; spec invariant, scenario and files list.
5. tsc, full test suite, SpecSync checks and the verify lane.
