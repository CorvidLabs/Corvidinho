---
change: admin-3-c-part-2-as-owner-i-can-mute-and-unmute-with-admin-mutes-add-remove-mute-and-unmute-are-audited-aliases-of-the
artifact: research
---

# Research

- `hi/admin.md` ADMIN-3.c is captured on main (Leif's 2026-09-28 interview,
  round 10: "deny lists + mute, GitHub allow lists" via /admin, owner-only,
  audited SAFE-5). No new capture here.
- `/home/user/coord/m34-defaults.md` (`admin-lists`): a mute set with
  `/admin` does not survive a restart; no new config key; the reply says a
  mute lasts until restart and points to `/admin deny add user:` as the
  lasting block.
- Before: `src/discord/command-handlers/mute.ts` mutated `ctx.mutedUsers`
  with no audit row; `/admin config show` only counted mutes. The bridge
  wires `recordAudit` whenever it has a DB (dry run included: in-memory), so
  bridge-level `/mute` tests keep passing with the fail-closed helper; the
  direct slash fixtures in `tests/discord.admin-reauth.test.ts` and
  `tests/discord.owner.test.ts` had no trail and now wire one.
- Pattern reuse: part 1's `applyListChange` (plan → `started` fail closed →
  commit → `ok`), its `denied` rows for guard refusals and its "No change"
  replies without a row.
