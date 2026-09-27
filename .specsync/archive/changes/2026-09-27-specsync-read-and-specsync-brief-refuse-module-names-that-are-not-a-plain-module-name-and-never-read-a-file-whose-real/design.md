---
change: specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real
artifact: design
---

# Design

- **Name check.** `MODULE_NAME_RE = /^[A-Za-z0-9_-]+$/` — the same form
  `listRegisteredModules` parses from `.specsync/registry.toml`. It rules out
  absolute paths, `.`/`..`, `/` and `\`, NUL and anything else in one test.
  `invalidModuleName(name)` returns a one-line error with the name
  `JSON.stringify`-escaped (so a NUL shows as `\u0000`) and truncated at 80
  chars. `readModuleSpec` / `readCompanions` check it before touching disk.
- **Containment.** `realSpecsDir(cwd)` realpaths the project root and its
  `specs/`, and refuses when `specs/` resolves outside the root.
  `containedSpecFile` realpaths each candidate and requires it inside the real
  specs dir (`isInsideRoot`); the file is then read from its real path, so what
  was checked is what is read. Missing entries and non-files stay "missing"
  (not-found behaviour unchanged); an escape is an error naming only the
  in-project path, never the outside target.
- **Brief fails closed.** `readCompanions` realpaths the module dir and each
  companion (fixed list and extra `*.md`); any escape returns `error` with no
  files. `readModuleSpec` marks refusals `refused: true` so `specsync-brief`
  can fail on them instead of falling back to "no spec or companions found".
- **Spawned tools.** `refuseRootArg(args)` rejects `--root` and `--root=…`;
  `specsync-coverage`, `specsync-change-list` and `specsync-ship-status` call
  it before `spawnSpecsync`.
- Exit code 1 matches the existing "path escapes project cwd / symlink escape"
  row for file tools. No new command, flag, env var, tier or package version.
