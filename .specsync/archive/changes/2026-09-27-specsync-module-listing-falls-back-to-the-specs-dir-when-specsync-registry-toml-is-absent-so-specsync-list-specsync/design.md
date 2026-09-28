---
change: specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync
artifact: design
---

# Design

- `plugins/specsync/api.ts`: `listRegisteredModules(cwd)` lists the union
  of the new private `listSpecsDirModules(cwd)` and, when
  `.specsync/registry.toml` exists, its `[specs]` names (sorted, each once).
  The registry is not the only source because SpecSync does not keep it in
  step with `specs/` (`specsync scaffold` does not add to the file
  `specsync init-registry` wrote). This repo's registry names exactly its five
  `specs/<name>/<name>.spec.md` modules, so its listing is unchanged.
  `listSpecsDirModules(cwd)`:
  - requires `<cwd>/.specsync` to be a directory (SPECSYNC-1 scopes this to
    "a repo that already has `.specsync/` and `specs/`"); otherwise `[]`;
  - resolves the specs dir with the existing `realSpecsDir` (must realpath
    inside the project root); missing or escaping → `[]`;
  - lists entries of the real specs dir whose name passes `MODULE_NAME_RE`
    and whose `<name>/<name>.spec.md` passes the existing
    `containedSpecFile` (a file resolving inside the real specs dir);
  - sorts like the registry path.
  No new export, error type or output shape: `specsync-list` still returns
  `{ count, modules }` and `N spec(s) registered`. A registry name with no
  spec on disk is still listed, as before.
- `plugins/specsync/commands.ts`: the `specsync-list` tool description
  says the list is the `specs/` modules plus the registry names.
- Not done (conservative choices, listed in the PR as pending Leif):
  - `specs_dir` from `.specsync/config.toml` is not honoured; the fallback
    lists the fixed `specs/` dir because `specsync-read` / `specsync-brief`
    only read there. Honouring it would change read/brief too.
  - Legacy flat `specs/<name>.md` files are not listed (read still accepts
    them with its warning); only the canonical module-dir layout is.
  - `config.toml` `[specs]` is not read as a second registry.
  - No marker in the output saying the names came from `specs/`.
- Security: the fallback enumerates only the project's own real `specs/`
  dir; a module dir or spec symlinked outside is skipped, so no outside name or
  content is listed or briefed. It spawns nothing and reads no file contents.
