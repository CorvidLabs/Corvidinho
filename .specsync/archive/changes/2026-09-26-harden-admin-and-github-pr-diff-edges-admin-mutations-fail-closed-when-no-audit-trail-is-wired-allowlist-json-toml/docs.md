---
change: harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml
artifact: docs
---

# Docs

- The `/admin` reply texts are unchanged except in these refusals:
  - With no DB, a mutation gets
    `Refused: audit log unavailable (SAFE-5): no audit database is wired to this bridge. Nothing changed.`
  - With a dangling or looping allowlist symlink, it gets
    `Refused: allowlist file is a symlink to <target>, which does not resolve (dangling or looping); fix or remove the link on the VM. File: … — nothing changed.`
- `github-pr-diff --file ./` now returns a usage error instead of the whole
  diff.
- A pure rename, copy or mode change reads as "no line changes … content
  unchanged".
- The REQ-discord-043 and REQ-plugins-093 text is updated through the deltas.
- Code doc comments are updated in `admin-allowlist.ts`, `admin.ts`,
  `slash-types.ts`, `load.ts` and `review.ts`.
- README, CHANGELOG and STATUS are not edited (release PRs own those).
