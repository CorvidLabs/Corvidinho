---
change: admin-3-c-part-2-as-owner-i-can-mute-and-unmute-with-admin-mutes-add-remove-mute-and-unmute-are-audited-aliases-of-the
artifact: requirements
---

# Requirements

- **ADMIN-3.c** (hi/admin.md, captured on main): As owner I can change deny
  lists, mutes and the GitHub repo allow lists with /admin; every change is
  audited. Part 2 here: mutes (part 1, deny lists + GitHub repo allow lists,
  is PR #404).
- **DISCORD-6 / IDENTITY-2**: a mute never targets the owner or the caller.
- **ADMIN-4 / DISCORD-7**: owner-only, dispatcher floor plus the `/admin`
  handler re-check.
- **SAFE-5**: `started` before the change, then `ok`; refusals `denied`;
  fail closed when the trail is unavailable.
- **REQ-discord-010** (modified): `/admin mutes add|remove` and the
  `/mute` / `/unmute` aliases through one audited helper; in memory until
  restart; reply points to `/admin deny add user:`.
- **REQ-discord-011** (modified): `/admin mutes` owner-only like every
  `/admin` subcommand; `/mute` / `/unmute` keep their ADMIN floor and are
  aliases (fixtures wire `recordAudit`); the helper re-checks ADMIN at
  handler time (ADMIN-4); the stale "admin user or admin role" bullet now
  reads owner-only (IDENTITY-2).
