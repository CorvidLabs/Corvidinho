---
change: specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync
artifact: design
---

# Design

- `plugins/specsync/api.ts`: `listRegisteredModules(cwd)` keeps parsing
  `.specsync/registry.toml` `[specs]` whenever that file exists (even one
  naming no module), so this repo and any project with a registry behave as
  before. Only when the file is absent does it call the new private
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
  `{ count, modules }` and `N spec(s) registered`.
- `plugins/specsync/commands.ts`: the `specsync-list` tool description
  names the fallback so the model knows the list can come from `specs/`.
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
