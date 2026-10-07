---
change: admin-3-c-part-2-as-owner-i-can-mute-and-unmute-with-admin-mutes-add-remove-mute-and-unmute-are-audited-aliases-of-the
artifact: context
---

# Context

ADMIN-3.c is captured on main (`hi/admin.md`, Leif's 2026-09-28 interview,
round 10): "As owner I can change deny lists, mutes and the GitHub repo allow
lists with /admin; every change is audited." Part 1 (admin-lists-a, PR #404,
branch `claude/m4-admin-lists-a2`, not merged yet) added `/admin deny` and
`/admin github` with their SAFE-5 audit helpers. This change is part 2 (M3/M4
plan slice `admin-lists-b`) and completes ADMIN-3.c with mutes. It is stacked
on part 1's branch; part 1's SpecSync change stays active in this tree and is
left alone.

Before this change `/mute` and `/unmute` (REQ-discord-009/010/011, DISCORD-6/7)
mutated the in-memory mute set with no audit row at all, and `/admin` had no
mute surface (`config show` only counted mutes). No new hi capture: ADMIN-3.c
is already on main.

Constraints: mutes stay in memory (REQ-discord-010; the spec's out-of-scope
list excludes a SQLite mute table; m34-defaults `admin-lists`), no new config
key or env var. #232/#233 are landed separately and untouched here.
