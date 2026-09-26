---
change: harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml
artifact: context
---

# Context

Bug-fix follow-up (no new features, no new HI) from the reviews of two merged
PRs:

- #147 `/admin` (issue #43, ADMIN-1..4, SAFE-5; REQ-discord-043).
- #153 `github-pr-diff` / `github-pr-files` (issue #93, GITHUB-3;
  REQ-plugins-093).

The reviews found five edge cases:

1. `/admin` fails closed when `recordAudit` throws, but when the bridge has no
   DB, `recordAudit` is unset and the mutation was written with no audit row.
   SAFE-5 says destructive actions leave a tamper-evident trail.
2. `/admin`'s file-format detection lowercased the path (`.JSON` → JSON) while
   the loader (`loadAllowlistFile`) uses a case-sensitive
   `path.endsWith(".json")`. So `allowlist.JSON` was loaded as TOML but edited
   as JSON.
3. `writeFileAtomic` checked `existsSync(path)`, which follows links. On a
   dangling symlink it fell through to `rename(tmp, path)` and replaced the
   operator's symlink with a regular file.
4. `github-pr-diff --file ./` (or whitespace) normalized to `""`, which was
   treated as "no filter" and returned the whole PR diff.
5. A pure rename or mode-only change with no patch was described as "binary
   file, or the file diff is too large", and copied files had no
   `copy from`/`copy to` lines.

Constraints: captured HI only (ADMIN-1..4, SAFE-5, GITHUB-3); no new slash
commands, env vars or product surface. Draft GITHUB-10 (confidence score) is
still left for HI capture.
