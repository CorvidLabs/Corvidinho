---
change: specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync
artifact: research
---

# Research

- specsync 6.0.0 `init` writes `.specsync/config.toml` (`specs_dir =
  "specs"`, no `[specs]` table), `.specsync/sdd.json`,
  `.specsync/version` and `.specsync/.gitignore`. `scaffold billing`
  writes `specs/billing/billing.spec.md` plus `context.md`,
  `requirements.md`, `tasks.md`, `testing.md`. Its help says "register in
  registry", but no `.specsync/registry.toml` is created.
  `init-registry` writes a different file (`specsync-registry.toml`, for
  cross-project references), so it is not what `listRegisteredModules`
  reads.
- `specsync check` itself discovers specs by walking `specs_dir`; it does
  not need a registry. So the canonical SpecSync source of "which modules
  exist" is the specs dir layout `<specs>/<name>/<name>.spec.md`.
- `readModuleSpec` / `readCompanions` already read from the fixed
  `<cwd>/specs` dir with realpath containment (REQ-plugins-008); the fallback
  lists from the same dir with the same checks, so every listed name reads.
- `loadRelevantSpecs` needs no change: it calls `listRegisteredModules`
  and then the read helpers, so the fallback reaches Planning and its
  companions (`context.md`, `tasks.md`) with no other edit.
