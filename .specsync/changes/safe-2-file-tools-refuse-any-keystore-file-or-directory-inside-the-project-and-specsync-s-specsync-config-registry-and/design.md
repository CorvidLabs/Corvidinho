---
change: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
artifact: design
---

# Design

- `isProtectedPath(filePath, root?)`: the component loop adds `.specsync` (case-insensitive) unless the next component is `changes`. The keystore rule becomes "any component contains `keystore`" (subsuming the old basename and `wallet-keystore.json` checks), read over the components below `root` when `root` is given with an absolute path inside it; otherwise over the whole path.
- `refuseProtected(userPath, absPath, cwd)` passes `realRoot(cwd)` for both checks, so an absolute user path or the resolved path is judged on its in-project components for the keystore rule; `.git` / `.env*` / `specs` / `.specsync` still read the whole path as before.
- `protectedRefuseMessage` lists `.specsync` among the protected kinds.
- `git-commit` (REQ-plugins-182) reuses `isProtectedPath` on repo-relative paths, so it now also refuses staging the deletion of `.specsync/` state and of files in keystore directories; deletions under `.specsync/changes/` still stage.
- Design choice pending Leif: `.specsync/` is protected as SAFE-2 "specs" infra except the active change folders `.specsync/changes/`, which stay writable so the agent can fill change artifacts (SPECSYNC-4). Machine state inside an active change (`state.json`, `approvals.json`) is therefore still writable by the file tools.
- No new env var, command, flag, config key or schema change.
