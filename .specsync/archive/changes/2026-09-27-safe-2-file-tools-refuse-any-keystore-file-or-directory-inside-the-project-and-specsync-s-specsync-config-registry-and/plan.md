---
change: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
artifact: plan
---

# Plan

1. Reproduce on main: `files-write keystore/UTC--key.json` and `files-write .specsync/config.toml` succeed.
2. Add regression tests in `tests/files.plugins.test.ts` (unit + write/edit/delete, symlink, keystore-named project root) and `tests/git.plugins.test.ts` (git-commit deletion staging); confirm they fail on main.
3. Extend `isProtectedPath` (keystore component rule scoped to the project root, `.specsync/` outside `changes/`) and pass the project root from `refuseProtected`.
4. Modify REQ-plugins-083 (delta + `specs/plugins/requirements.md`); update the protected list in `specs/plugins/plugins.spec.md`.
5. Run specsync check, tsc, bun test and fledge verify.
