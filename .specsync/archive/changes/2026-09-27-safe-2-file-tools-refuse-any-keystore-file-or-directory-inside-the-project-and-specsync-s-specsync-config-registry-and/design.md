---
change: safe-2-file-tools-refuse-any-keystore-file-or-directory-inside-the-project-and-specsync-s-specsync-config-registry-and
artifact: design
---

# Design

- `isProtectedPath(filePath, root?)`: the component loop adds `.specsync` (case-insensitive) unless the path is a file inside a change folder (`.specsync/changes/<id>/…`); `.specsync/changes` and `.specsync/changes/<id>` themselves stay protected, so a file planted where SpecSync needs a folder cannot switch `specsync change new` off (SPECSYNC-4). The keystore rule becomes "any component contains `keystore`" (subsuming the old basename and `wallet-keystore.json` checks), read over the components below `root` when `root` is given with an absolute path inside it; otherwise over the whole path.
- `hasKeystoreComponent(parts)` (exported) is the keystore component rule. It skips a SpecSync change folder's name (`.specsync/changes/<id>/`, `.specsync/archive/changes/<id>/`): SpecSync derives the id from the change title, so a change about keystores (this one) would otherwise make its own artifacts unwritable and its archive move unstageable. Components below the change folder still count.
- `refuseProtected(userPath, absPath, cwd)` passes `realRoot(cwd)` for both checks, so an absolute user path or the resolved path is judged on its in-project components for the keystore rule; `.git` / `.env*` / `specs` / `.specsync` still read the whole path as before.
- `protectedRefuseMessage` lists `.specsync` among the protected kinds.
- `git-commit` (REQ-plugins-182) reuses `isProtectedPath` on repo-relative paths, so it now also refuses staging the deletion of `.specsync/` state and of files in keystore directories; deletions under `.specsync/changes/<id>/` still stage. Its secret-bearing staging refusal used the keystore basename only, so `keystore/UTC--…` could be committed; it now uses `hasKeystoreComponent` on the repo-relative path (REQ-plugins-182 already said "any keystore path").
- Design choice pending Leif: `.specsync/` is protected as SAFE-2 "specs" infra except the active change folders `.specsync/changes/`, which stay writable so the agent can fill change artifacts (SPECSYNC-4). Machine state inside an active change (`state.json`, `approvals.json`) is therefore still writable by the file tools.
- No new env var, command, flag, config key or schema change.
