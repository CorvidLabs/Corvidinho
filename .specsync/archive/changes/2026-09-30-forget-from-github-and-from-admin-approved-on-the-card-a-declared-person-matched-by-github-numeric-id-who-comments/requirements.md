---
change: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
artifact: requirements
---

# Requirements

- Added **REQ-discord-1016** (delta `deltas/discord.md`): asker kinds in
  `requester_user_id` (no schema change), `/admin people forget` (owner-only,
  SAFE-5 audited, declared person ids only, same ask and card, sent at once),
  the card's asker line per kind, GitHub askers never DMed, owner-started asks
  tell nobody else, `forgetTargets` / conversation delete by GitHub login and
  numeric id, never the owner who started it.
- Added **REQ-watch-1016** (delta `deltas/watch.md`): the "forget me"
  matcher, handled before the per-issue dedupe with no run, numeric-id-only
  match, SAFE-5 audited ask, one reply per event, outcome posted on the thread
  per cycle, `github-id` participants on kept conversations.
- Added **REQ-plugins-1016** (delta `deltas/plugins.md`): `memory-forget-me`
  in a GitHub run names the comment path and records nothing.
- HI: MEMORY-ACL-6.a (captured in this PR). MEMORY-ACL-1..6, IDENTITY-7,
  SAFE-5/6 unchanged. No acceptance criteria beyond the captured text; open
  design points are listed in `design.md` for Leif.
