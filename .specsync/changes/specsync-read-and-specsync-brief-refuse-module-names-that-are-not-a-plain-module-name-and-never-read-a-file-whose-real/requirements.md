---
change: specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real
artifact: requirements
---

# Requirements

- SPECSYNC-1 / SPECSYNC-5 / SPECSYNC-6 (captured, `hi/specsync.md`): in a
  repo that has `.specsync/` and `specs/`, Corvidinho lists and reads module
  specs and the companion files next to a spec, with local binary + project
  files; REQ-plugins-008 already says "project files only". PLUGIN-1
  (captured, `hi/plugin.md`): SpecSync is available as typed plugin commands.
  The SpecSync tools must not be a way around the file tools' project clamp
  (REQ-plugins-082). SAFE-2 (`hi/safe.md`) covers delete/overwrite of
  protected infra, not reads, so it is not the basis here.
- Modify REQ-plugins-008 (delta `deltas/plugins.md`): `specsync-read` /
  `specsync-brief` accept only a plain module name and read only files whose
  real path is inside the project's real `specs/` dir (itself inside the
  project root); `specsync-coverage` / `specsync-change-list` /
  `specsync-ship-status` refuse `--root`.
- Existing acceptance bullets stay; registered modules read and brief as
  before. No new REQ, command, flag, env var or package version.
