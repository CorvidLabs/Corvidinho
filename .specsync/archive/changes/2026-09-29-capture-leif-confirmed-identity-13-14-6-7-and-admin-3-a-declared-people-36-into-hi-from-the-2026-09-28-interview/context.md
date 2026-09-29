---
change: capture-leif-confirmed-identity-13-14-6-7-and-admin-3-a-declared-people-36-into-hi-from-the-2026-09-28-interview
artifact: context
---

# Context

Leif confirmed the #36 criteria in the 2026-09-28 interview (round 6, "#36
people: capture all, renumbered"; round 11, "hi capture: per issue, in its
PR"). They were captured with the `hi` CLI in commit `e54ec96` (this PR's
first commit; `hi <ID> "<text>"`, family file from the id prefix):

- hi/identity.md: **IDENTITY-13** "I declare each person's ids (nicknames,
  GitHub and Discord accounts), and that list is who's who."; **IDENTITY-14**
  "It recognises me and each declared person on Discord and GitHub.";
  **IDENTITY-6** "Only I add, change or remove a person's links, never through
  chat."; **IDENTITY-7** "It matches people on stable ids, never on display
  names."
- hi/admin.md: **ADMIN-3.a** "As owner I can add, change and remove declared
  people and their links with /admin; every change is audited."
- INTENT.md: the `hi` index counts (identity 9, admin 5).

The #36 drafts IDENTITY-4/5 collide with captured ids and were renumbered to
IDENTITY-13/14 (IDENTITY-8..12 are the #65 roles drafts). AlgoChat / wallet
ids in the original drafts are Post-v1 and not in the captured text. The build
is the separate change
`declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared`.
