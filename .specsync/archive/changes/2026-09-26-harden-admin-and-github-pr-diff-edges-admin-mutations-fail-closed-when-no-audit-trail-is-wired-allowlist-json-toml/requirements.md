---
change: harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml
artifact: requirements
---

# Requirements

Modified (see `deltas/`):

- **REQ-discord-043** (`/admin`, ADMIN-1..4 / SAFE-5):
  - A mutation fails closed when no audit trail is wired, not only when the
    trail throws.
  - File format detection uses the loader's own rule.
  - A dangling or looping allowlist symlink is refused and never replaced by a
    regular file.
- **REQ-plugins-093** (`github-pr-diff`, GITHUB-3):
  - An empty-after-normalization `--file` is a usage error.
  - A pure rename, copy or mode change with no patch says content unchanged.
  - A copied file gets `copy from`/`copy to` lines.

Captured HI met: ADMIN-1, ADMIN-2, ADMIN-3, ADMIN-4 and SAFE-5 (#43), and
GITHUB-3 (#93). No new HI ids. Draft GITHUB-10 is left for HI capture.
