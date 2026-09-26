---
change: harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml
artifact: research
---

# Research

- **Symlinks.**
  - `existsSync` follows symlinks, so it returns false for a dangling link
    and for a link loop (ELOOP). `lstatSync` does not follow them.
  - `realpathSync` throws ENOENT or ELOOP for a link that does not resolve.
  - `renameSync(tmp, link)` replaces the link itself. That is the bug.
- **Loader format rule.** `loadAllowlistFile` (`src/allowlist/load.ts`) picks
  JSON only on a case-sensitive `.json` suffix. The default paths are
  lowercase, so only an explicit `CORVIDINHO_ALLOWLIST_FILE` like
  `allowlist.JSON` diverged.
- **GitHub `pulls.listFiles`.**
  - Statuses are added, removed, modified, renamed, copied, changed and
    unchanged.
  - `patch` is omitted for binary files, for diffs that are too large, and for
    changes with no content diff.
  - Binary files report 0 additions and 0 deletions, so a renamed binary with
    edits cannot be told apart from a pure rename from this endpoint alone.
    The rename and copy notes say "unless the file is binary" for that reason.
- **Git diff headers.** Copies use `copy from <old>` / `copy to <new>`, and
  renames use `rename from` / `rename to`.
