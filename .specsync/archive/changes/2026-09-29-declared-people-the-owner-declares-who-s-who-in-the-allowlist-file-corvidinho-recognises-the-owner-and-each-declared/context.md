---
change: declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared
artifact: context
---

# Context

Issue #36 (CONTACTS: declared people + Discord linker, milestone M1 "Knows
everyone"). Leif confirmed the criteria in the 2026-09-28 interview (round 6:
"capture all, renumbered"; round 10: ADMIN-3 knobs editable via /admin
include people). They were captured with `hi` in this PR's first commit
(`e54ec96`, on main `246cb6c`):

- **IDENTITY-13** "I declare each person's ids (nicknames, GitHub and Discord
  accounts), and that list is who's who." (draft IDENTITY-4 renumbered: the id
  was taken)
- **IDENTITY-14** "It recognises me and each declared person on Discord and
  GitHub." (draft IDENTITY-5 renumbered)
- **IDENTITY-6** "Only I add, change or remove a person's links, never through
  chat."
- **IDENTITY-7** "It matches people on stable ids, never on display names."
- **ADMIN-3.a** "As owner I can add, change and remove declared people and
  their links with /admin; every change is audited."

Gap on main: only the owner is known (`[owner]` / env, IDENTITY-1); every
other speaker is known by a Discord display name (IDENTITY-4 block) or a
GitHub login in the WATCH header, and nothing ties the two together.
`/admin` edits only `[discord].users` / `.channels`.

Constraints (settled): extend the existing owner / allowlist file rather than
a parallel store; owner admins; v1 off-chain (Discord + GitHub ids only, no
AlgoChat / wallet fields); no schema bump; #232 / #233 are landed separately
(this change only adds the `people` argument at the two identity-inject
call sites in `bridge.ts`). Later slices reuse the resolver: #65 roles
(`role` left optional), #101 profiles, #67 recall.
