---
change: files-path-clamp-follows-dangling-symlinks-by-hand-so-files-write-cannot-escape-the-project-root-or-create-safe-2
artifact: research
---

# Research

- `existsSync` / `statSync` / `realpathSync` follow links, so for a dangling link they report ENOENT. `lstatSync` sees the link itself.
- Callers: `plugins/files/commands.ts` (read/write/edit/glob/list/delete), `plugins/search/commands.ts` (grep path) and `plugins/git/commands.ts` `clampRel` (check only; it returns the lexical repo-relative path).
- Existing (non-dangling) links are already realpath'd and the real path is returned, so SAFE-2 checks in `refuseProtected(pathArg, abs)` see the real target. Only the dangling case skipped this.
- Before the fix, a dangling directory link (`d -> /outside/missing`) was refused only by accident: `mkdirSync` recursive failed with EEXIST. A loop (`a -> b -> a`) failed at write time with a raw ELOOP.
