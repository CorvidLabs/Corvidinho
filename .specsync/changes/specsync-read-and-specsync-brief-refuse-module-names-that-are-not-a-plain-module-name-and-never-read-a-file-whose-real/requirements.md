---
change: specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real
artifact: requirements
---

# Requirements

- SAFE-2 (captured, `hi/safe.md`) and PLUGIN-1 (captured, `hi/plugin.md`):
  SpecSync tools are typed plugins, and the tool layer keeps them inside the
  project; they must not be a way around the file tools' project clamp.
- Modify REQ-plugins-008 (delta `deltas/plugins.md`): `specsync-read` /
  `specsync-brief` accept only a plain module name and read only files whose
  real path is inside the project's real `specs/` dir (itself inside the
  project root); `specsync-coverage` / `specsync-change-list` /
  `specsync-ship-status` refuse `--root`.
- Existing acceptance bullets stay; registered modules read and brief as
  before. No new REQ, command, flag, env var or package version.
