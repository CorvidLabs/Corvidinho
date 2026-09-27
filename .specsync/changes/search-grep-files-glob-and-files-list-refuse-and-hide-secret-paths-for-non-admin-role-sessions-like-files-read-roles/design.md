---
change: search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles
artifact: design
---

# Design

- `plugins/files/protectedPaths.ts`: `secretPathsRefused()` is the one
  ROLES-CHAT-8 gate (`roleSessionActive() && !(await resolveActingIsAdmin())`,
  re-checked per call) used by `files-read`, `files-list`, `files-glob` and
  `search-grep`. `SECRET_GREP_EXCLUDES` mirrors `isSecretPath` as grep
  `--exclude` / `--exclude-dir` globs, kept next to it.
- `search-grep`, non-ADMIN only: refuse when `isSecretPath(pathArg)` or
  `isSecretPath` of the resolved (realpath) target relative to the project
  root matches — catches `./`, `..`, absolute and symlink spellings. The
  secret excludes are appended after the `--include` globs (grep lets the last
  matching include/exclude win), so `--include env` / `pem` / `*` cannot pull
  a secret back in. Output uses `grep -Z`, so each record's file name is
  NUL-terminated; lines whose file `isSecretPath` matches (e.g. `.ENV`, which
  the case-sensitive globs miss) are dropped. `grep -r` does not follow
  symlinks found while recursing. A single-file operand prints no name; that
  file was already checked, and its output is unchanged.
- `files-list`: same explicit-path refusal; entries whose name
  `isSecretPath` matches are hidden. `files-glob`: matches `isSecretPath`
  matches are skipped.
- `files-read` keeps its check (`pathArg` or absolute target) and now calls
  the shared gate. The new checks test the target relative to the project
  root, so a project directory whose ancestor looks secret does not refuse
  every search.
- ADMIN and the local CLI (no role session) keep `files-read`'s access,
  including grepping secrets, for consistency. `resolvePath.ts` exports
  `realRoot` for the relative check. No new plugin, flag, env var or config.
