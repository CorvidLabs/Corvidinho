---
module: plugins
change: specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync
---

# Delta — plugins (SpecSync module listing without registry.toml)

## Modified

### REQUIREMENT REQ-plugins-008

Built-ins SHALL register SpecSync agent tools `specsync-list`, `specsync-read`, `specsync-check`, `specsync-brief`, plus cheap `specsync-coverage`, `specsync-score`, `specsync-change-list`, `specsync-ship-status` that use the local SpecSync binary / project files only (SPECSYNC-1/2/3/6; Merlin fledge-plugin-specsync steal). No SpecSync API key.

`specsync-check` SHALL run `fledge run spec-check` only when `fledge` is on PATH and the project's own `fledge.toml` defines a `spec-check` task; otherwise it SHALL run the local `specsync check` (SPECSYNC-2/7). A `fledge.toml` that cannot be read or parsed SHALL keep the Fledge path (fail closed). `specsync-score` SHALL be read-only (tier 0, not dangerous) and return the local `specsync score` report with the forwarded args (SPECSYNC-3).

The tools SHALL stay inside the project: they read this repo's `specs/` and the companions next to a spec, using project files only (SPECSYNC-1 / SPECSYNC-5 / SPECSYNC-6), as typed plugin commands (PLUGIN-1). `specsync-read` and `specsync-brief` SHALL accept only a plain module name (letters, digits, `_` or `-`, the form `.specsync/registry.toml` names use; an optional `name=` prefix is stripped first) and SHALL refuse any other name before reading anything. Every file they read (the module spec, the legacy flat spec and each companion) SHALL resolve, with symlinks followed, inside the real path of the project's `specs/` dir, which SHALL itself resolve inside the real project root. `specsync-coverage`, `specsync-score`, `specsync-change-list` and `specsync-ship-status` SHALL refuse a forwarded `--root` argument before spawning `specsync`.

Acceptance Criteria
- `plugins list` includes the SpecSync command names, `specsync-score` among them.
- `specsync-list` returns registered module names from `.specsync/registry.toml`.
- With no `.specsync/registry.toml` in a project whose `.specsync/` is a dir (the layout `specsync init` + `specsync scaffold <name>` leave), `specsync-list` and `corvidinho specsync list` return, sorted, each module name with a `specs/<name>/<name>.spec.md` (a plain module name; the spec a file resolving inside the real `specs/` dir); a listed name reads with `specsync-read` / `specsync-brief`, and the Planning spec briefing (`loadRelevantSpecs`) includes that module's constraint sections and its `context.md` / `tasks.md` companions (SPECSYNC-1 / SPECSYNC-5).
- When `.specsync/registry.toml` exists it stays the only source of module names (one naming no module lists nothing). With no `.specsync/` dir, no `specs/` dir, or a `specs/` dir resolving outside the project, the fallback lists nothing; a legacy flat `specs/<name>.md`, a dir without its spec, a spec that is a dir, a name that is not a plain module name, and a spec or module dir that links outside `specs/` are not listed and never reach the Planning briefing.
- `specsync-read <module>` returns `specs/<module>/<module>.spec.md` contents.
- `specsync-check` runs project `spec-check` (fledge task or `specsync check` fallback) and fails non-zero on drift.
- With fledge on PATH and a project `fledge.toml` that has no `spec-check` task, or no `fledge.toml`, `specsync-check` runs `specsync check` and returns its result (no `Unknown task 'spec-check'` failure); with the task defined it runs `fledge run spec-check` and a failing task fails `specsync-check` (exit 1, `spec check failed`).
- `projectDefinesSpecCheckTask` is true for a `fledge.toml` that cannot be parsed, false for one without the task or no file.
- `specsync-score [args]` spawns the local `specsync score [args]` (e.g. `cli --explain`, `--format json`) and returns its report; a non-zero `specsync score` exit (e.g. `--min-score`) passes through with the report. It is offered in the default tool-tier catalog.
- `specsync-brief <module>` returns companion files when present.
- `specsync-read` / `specsync-brief` with a name that is not a plain module name — a relative traversal (`../../<outside>/outside`, `../../../..<abs>`), an absolute path, `.` / `..`, a path separator (`/` or `\`), a NUL byte or any other character — fail with exit 1 and a one-line `invalid spec module name` error (the name JSON-escaped, never a raw NUL) and read nothing.
- A module spec, legacy flat spec, module dir or companion that is a symlink resolving outside the project's `specs/` dir, or a `specs/` dir that resolves outside the project root, is refused with exit 1 and a `resolves outside` error naming only the in-project path; a refused companion fails the whole brief; no outside content is returned.
- Symlinks that stay inside `specs/` still read, and a missing module still reports `spec '<name>' not found`.
- `specsync-coverage`, `specsync-score`, `specsync-change-list` and `specsync-ship-status` given `--root <dir>` or `--root=<dir>` fail with exit 1 (`refused: --root is not allowed; SpecSync tools run on this project only`) and `specsync` is not spawned.
- A tool-loop `specsync-read` call with a traversal name returns the refusal to the model, not the outside file.
- The Planning spec briefing (`loadRelevantSpecs`), which reads through the same helpers, leaves out a registered module whose spec or module dir resolves outside `specs/` and never includes a companion that does.
