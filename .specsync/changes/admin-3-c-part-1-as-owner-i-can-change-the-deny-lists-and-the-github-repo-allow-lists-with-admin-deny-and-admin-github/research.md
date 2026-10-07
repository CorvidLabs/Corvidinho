---
change: admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github
artifact: research
---

# Research

- `hi/admin.md` ADMIN-3.c is captured on main (Leif's 2026-09-28 interview,
  round 10: "deny lists + mute, GitHub allow lists" via /admin, owner-only,
  audited; not the tool allowlist or spend caps). No new capture here.
- `/home/user/coord/m34-defaults.md` (admin-lists): `[github].users` is not
  a "repo allow list" — it stays file / env and is listed read-only; mutes
  stay in memory (part 2).
- Loader (`src/allowlist/load.ts`): `githubFromObj` / `discordFromObj`
  read `orgs ?? organizations`, `repos ?? repositories`,
  `deny_* ?? deny*` (lowercased keys); JSON sections `github ?? Github`,
  `discord ?? Discord`; a file that cannot be loaded throws (fail closed).
- Pattern reuse: the ADMIN-1/2 writer (`src/discord/admin-allowlist.ts`)
  and handler path (plan → started → commit → ok), the schedule daemon's
  per-tick `tryLoadAllowlist` (`src/daemon/daemon.ts`), the gates in
  `src/discord/permissions.ts` / `src/allowlist/github.ts` (who a deny entry
  locks out), `[corvidinho.plugins]` from #350 (`src/autonomous/enabled.ts`)
  and the WATCH role resolution from #374 (`watchTriggerRole`).
- GitHub `deny_users` holds logins or numeric ids (`src/plugins/roles.ts`
  checks both), so `github_user` accepts either and the lockout check covers
  the owner's login and id. WATCH's event gate (`gateEvent`) matched the
  sender's login only, so it now also matches the event's `senderId`.
