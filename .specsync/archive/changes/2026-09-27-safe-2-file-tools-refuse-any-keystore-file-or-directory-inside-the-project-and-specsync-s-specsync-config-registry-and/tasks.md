---
change: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
artifact: tasks
---

# Tasks

- [x] Reproduce the gap on main (keystore directory file and `.specsync/config.toml` overwritten by files-write).
- [x] Regression tests in `tests/files.plugins.test.ts` and `tests/git.plugins.test.ts` that fail on main.
- [x] `isProtectedPath` protects any in-project `keystore` component and `.specsync/` outside `changes/`; `refuseProtected` passes the project root.
- [x] Delta modifies REQ-plugins-083; requirements and spec protected list updated.
- [x] Review: `.specsync/changes` / `.specsync/changes/<id>` themselves protected; SpecSync change folder names skipped by the keystore rule; git-commit refuses staging files in keystore directories (REQ-plugins-182).
- [x] specsync check, tsc, bun test, fledge verify green.
