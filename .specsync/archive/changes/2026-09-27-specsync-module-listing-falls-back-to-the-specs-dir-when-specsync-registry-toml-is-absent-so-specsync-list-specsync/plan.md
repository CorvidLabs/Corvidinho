---
change: specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync
artifact: plan
---

# Plan

1. Reproduce on `origin/main` with the real specsync 6.0.0
   (`init` + `scaffold billing`): `specsync list` prints
   `0 spec(s) registered`, Planning prints `no SpecSync modules matched`.
2. Add `tests/specsync.registry-fallback.test.ts` (list, CLI, read/brief by
   listed name, Planning briefing with companions, optional real-binary case,
   registry-union and containment guards). Confirm the new behaviour
   cases fail with main's `plugins/specsync/api.ts`.
3. Implement `listSpecsDirModules` fallback in `plugins/specsync/api.ts`;
   update the `specsync-list` description.
4. Delta: modify REQ-plugins-008 (two new acceptance bullets). Update
   `specs/plugins/plugins.spec.md` (Public API, invariant, scenario, error
   row, files list, change log) and the agent error row that said a missing
   registry always soft-fails Planning.
5. `specsync change approve`, `specsync change check --commit`,
   `specsync change audit`, `specsync check --require-coverage 100`,
   `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
