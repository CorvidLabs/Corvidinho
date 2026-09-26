---
change: files-path-clamp-follows-dangling-symlinks-by-hand-so-files-write-cannot-escape-the-project-root-or-create-safe-2
artifact: testing
---

# Testing

Before the fix, `bun test tests/files.dangling-symlink.test.ts` gave 1 pass and 4 fail: the outside-root write and the `.env` write both returned ok=true and created their targets. After the fix it gives 5 pass and 0 fail. The existing files, git, search and secret-path suites stay green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-082` | `tests/files.dangling-symlink.test.ts` | files-write via a dangling link (absolute and relative) to a missing file outside the root is refused and the target is not created; a dangling directory link with a nested path is refused; a symlink loop is refused; an in-root dangling link still writes its in-root target. |
| `REQ-plugins-082` | `tests/files.dangling-symlink.test.ts` | files-write via a dangling link to a missing `.env` or `specs/x.spec.md` is refused with SAFE-2 (exit 2) and no file is created, because the SAFE-2 check (REQ-plugins-083) now sees the target. |
| `REQ-plugins-082` | `tests/files.plugins.test.ts` | existing escape and symlink-outside-root fixtures still refuse. |
