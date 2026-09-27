---
change: specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync
artifact: requirements
---

# Requirements

- SPECSYNC-1 (captured, `hi/specsync.md`): in a repo with `.specsync/`
  and `specs/`, list and read module specs before editing code. Modify
  **REQ-plugins-008** (delta `deltas/plugins.md`): with no
  `.specsync/registry.toml`, `specsync-list` returns the
  `specs/<name>/<name>.spec.md` modules that `specsync-read` reads; a
  registry that exists stays authoritative.
- SPECSYNC-5 (captured): companion files are read when starting work on a
  module. Same REQ: the Planning spec briefing in a registry-less SpecSync
  project includes the module's constraints and its `context.md` /
  `tasks.md` companions.
- SPECSYNC-6 / PLUGIN-1 (unchanged): project files only; the fallback stays
  inside the real `specs/` dir like the read helpers.
- No new slash command, env var, config key, SQLite schema version or package
  version.
