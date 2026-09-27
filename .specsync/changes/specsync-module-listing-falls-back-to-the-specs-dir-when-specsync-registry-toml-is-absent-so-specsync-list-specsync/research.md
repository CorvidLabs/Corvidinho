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
  `specsync init-registry` (help: "Generate a specsync-registry.toml for
  cross-project references") does write `.specsync/registry.toml`, the file
  `listRegisteredModules` reads, naming the modules that exist at that
  moment. A later `specsync scaffold auth` does not add `auth` to it (checked
  with 6.0.0: `config.toml` and `registry.toml` unchanged), so a registry can
  be older than `specs/` and must not be the only source of names (review
  finding on the first draft, which kept the registry authoritative).
- `specsync check` itself discovers specs by walking `specs_dir`; it does
  not need a registry. So the canonical SpecSync source of "which modules
  exist" is the specs dir layout `<specs>/<name>/<name>.spec.md`.
- `readModuleSpec` / `readCompanions` already read from the fixed
  `<cwd>/specs` dir with realpath containment (REQ-plugins-008); the fallback
  lists from the same dir with the same checks, so every listed name reads.
- `loadRelevantSpecs` needs no change: it calls `listRegisteredModules`
  and then the read helpers, so the fallback reaches Planning and its
  companions (`context.md`, `tasks.md`) with no other edit.
