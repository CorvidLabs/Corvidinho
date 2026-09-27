---
change: specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real
artifact: tasks
---

# Tasks

- [x] Reproduce the traversal and symlink escape on `origin/main` for
      `specsync-read` / `specsync-brief`, and the `--root` escape for
      `specsync-coverage` / `specsync-change-list` / `specsync-ship-status`.
- [x] Validate the module name (`[A-Za-z0-9_-]+`) in `readModuleSpec` and
      `readCompanions`; clean JSON-escaped error.
- [x] Realpath-contain the specs dir, module spec, flat spec, module dir and
      every companion under the real project `specs/` dir; read from the real
      path; fail the whole brief on an escaping companion.
- [x] Refuse `--root` / `--root=` in the spawn-backed SpecSync tools before
      spawning.
- [x] Add `tests/specsync.path-containment.test.ts` (unit, plugin, CLI and
      mock-LLM tool loop) and prove it fails on main.
- [x] Delta for REQ-plugins-008; update `specs/plugins/plugins.spec.md`.
- [x] Run SpecSync change check/audit, coverage check, tsc, bun test and the
      verify lane.
- [x] Review: add Planning spec briefing (`loadRelevantSpecs`) regression
      tests (spec, module dir and companion linking outside); cite the
      captured HI ids that actually cover reads (SPECSYNC-1/5/6, PLUGIN-1).
