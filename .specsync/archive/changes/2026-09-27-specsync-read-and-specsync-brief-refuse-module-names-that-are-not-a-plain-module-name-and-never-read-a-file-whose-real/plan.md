---
change: specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real
artifact: plan
---

# Plan

1. Reproduce on `origin/main`: CLI read/brief traversal, symlink escape, and
   `--root` on the spawn-backed tools; confirm `files-read` refuses.
2. Add `tests/specsync.path-containment.test.ts` covering every vector plus
   in-specs symlink / registered-module / not-found regressions, a CLI repro
   and a mock-LLM tool-loop call; prove it fails on main.
3. Implement name validation + realpath containment in
   `plugins/specsync/api.ts` and the `--root` refusal and brief refusal
   handling in `plugins/specsync/commands.ts`.
4. Modify REQ-plugins-008 (delta); update `specs/plugins/plugins.spec.md`
   (files list, Public API, invariant, scenario, error rows).
5. Run `specsync change approve/check --commit/audit`, `specsync check
   --require-coverage 100`, `bunx tsc --noEmit`, `bun test` and `fledge lanes
   run verify --non-interactive`.
