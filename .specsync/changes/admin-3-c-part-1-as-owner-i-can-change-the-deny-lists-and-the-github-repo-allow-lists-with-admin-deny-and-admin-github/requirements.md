---
change: admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github
artifact: requirements
---

# Requirements

- **ADMIN-3.c** (hi/admin.md, captured on main): As owner I can change deny
  lists, mutes and the GitHub repo allow lists with /admin; every change is
  audited. Part 1 here: deny lists + GitHub repo allow lists (mutes: part 2).
- **ADMIN-4 / DISCORD-7 / IDENTITY-2**: owner-only, dispatcher floor plus a
  handler-time re-check.
- **SAFE-5**: `started` before the write, then `ok` / `error`; refusals
  `denied`; fail closed when the trail is unavailable.
- **ALLOW-1..6 / GITHUB-6**: default-deny, deny always wins, a broken file
  fails closed (never env-only).
- **REQ-discord-043** (modified): `/admin deny add|remove`, `/admin github
  add|remove`, the generalized writer and `config show`.
- **REQ-watch-043** (added): `github watch` re-reads the allowlist every poll.
