---
change: specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync
artifact: tasks
---

# Tasks

- [x] Reproduce the gap on `origin/main` with specsync 6.0.0
      (`init` + `scaffold billing`, no `registry.toml`): `specsync list`
      prints `0 spec(s) registered`; Planning finds no module.
- [x] `listSpecsDirModules` fallback in `plugins/specsync/api.ts` (only when
      `registry.toml` is absent and `.specsync/` is a dir; same containment
      as `specsync-read`).
- [x] `specsync-list` tool description names the fallback.
- [x] Tests: `tests/specsync.registry-fallback.test.ts`; prove the new
      behaviour cases fail with main's source and pass on the branch.
- [x] Delta (REQ-plugins-008 modified) and plugins / agent spec updates.
- [x] Run change approve / check / audit, coverage check, tsc, bun test and the
      verify lane.
