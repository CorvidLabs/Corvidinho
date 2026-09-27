---
change: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
artifact: research
---

# Research

- `refuseProtected` in `plugins/files/commands.ts` checks both the user path and the resolved absolute path (so `..` and symlinks resolving into protected paths are caught). Making the keystore rule a plain component match on the absolute path would refuse every write in a project checked out under a directory such as `~/keystore-tools/` (or this very worktree, `w10-safe2-keystore`), so the keystore rule has to skip the project root's own components.
- The exact-name rules (`.git`, `.env*`, `specs`) read the whole absolute path today; that also protects files when the cwd itself sits inside `.git/` or `specs/`. Keeping that unchanged avoids loosening anything.
- SpecSync 6 keeps the active change workspaces in `.specsync/changes/<id>/` (hand-filled `*.md` artifacts plus machine `state.json` / `approvals.json`), config in `.specsync/config.toml`, the module map in `registry.toml`, and finished changes in `.specsync/archive/`. The Corvidinho agent has no specsync plugin command that writes change artifacts, so protecting `.specsync/changes/` would stop it filling a change through its file tools (SPECSYNC-4).
- `git-commit` refuses staging the deletion of any `isProtectedPath` path (REQ-plugins-182). Archiving a change deletes `.specsync/changes/<id>/…`; with the carve-out those deletions still stage.
- No open issue tracks SAFE-2 (#81, which shipped it, is closed).
