---
module: plugins
change: specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real
---

# Delta — plugins (SpecSync tools stay inside the project)

## Modified

### REQUIREMENT REQ-plugins-008

Built-ins SHALL register SpecSync agent tools `specsync-list`, `specsync-read`, `specsync-check`, `specsync-brief`, plus cheap `specsync-coverage`, `specsync-change-list`, `specsync-ship-status` that use the local SpecSync binary / project files only (SPECSYNC-1/2/3/6; Merlin fledge-plugin-specsync steal). No SpecSync API key.

The tools SHALL stay inside the project (SAFE-2 / PLUGIN-1). `specsync-read` and `specsync-brief` SHALL accept only a plain module name (letters, digits, `_` or `-`, the form `.specsync/registry.toml` names use; an optional `name=` prefix is stripped first) and SHALL refuse any other name before reading anything. Every file they read (the module spec, the legacy flat spec and each companion) SHALL resolve, with symlinks followed, inside the real path of the project's `specs/` dir, which SHALL itself resolve inside the real project root. `specsync-coverage`, `specsync-change-list` and `specsync-ship-status` SHALL refuse a forwarded `--root` argument before spawning `specsync`.

Acceptance Criteria
- `plugins list` includes the SpecSync command names.
- `specsync-list` returns registered module names from `.specsync/registry.toml`.
- `specsync-read <module>` returns `specs/<module>/<module>.spec.md` contents.
- `specsync-check` runs project `spec-check` (fledge task or `specsync check` fallback) and fails non-zero on drift.
- `specsync-brief <module>` returns companion files when present.
- `specsync-read` / `specsync-brief` with a name that is not a plain module name — a relative traversal (`../../<outside>/outside`, `../../../..<abs>`), an absolute path, `.` / `..`, a path separator (`/` or `\`), a NUL byte or any other character — fail with exit 1 and a one-line `invalid spec module name` error (the name JSON-escaped, never a raw NUL) and read nothing.
- A module spec, legacy flat spec, module dir or companion that is a symlink resolving outside the project's `specs/` dir, or a `specs/` dir that resolves outside the project root, is refused with exit 1 and a `resolves outside` error naming only the in-project path; a refused companion fails the whole brief; no outside content is returned.
- Symlinks that stay inside `specs/` still read, and a missing module still reports `spec '<name>' not found`.
- `specsync-coverage`, `specsync-change-list` and `specsync-ship-status` given `--root <dir>` or `--root=<dir>` fail with exit 1 (`refused: --root is not allowed; SpecSync tools run on this project only`) and `specsync` is not spawned.
- A tool-loop `specsync-read` call with a traversal name returns the refusal to the model, not the outside file.
