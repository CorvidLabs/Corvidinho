---
change: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
artifact: context
---

# Context

Issue #65 (ROLES: owner / team / community gate every tool, milestone M1
"Knows everyone"), stacked on #36 (declared people, branch
`claude/m1-36-contacts`), whose registry, resolver and `/admin people`
commands this reuses. Leif confirmed the criteria in the 2026-09-28 interview
(round 6: "#65 roles: capture IDENTITY-8..12 as written"; round 9: ROLES-CHAT-8
sources; round 10: ADMIN-3 knobs editable via /admin include people + roles).
They were captured in this PR's first commit (`hi`, ROLES-CHAT-8.a by hand):

- **IDENTITY-8** "Each declared person has exactly one role (owner, team or
  community), and only I set it."
- **IDENTITY-9** "The owner can use everything, subject to the must-ask list."
- **IDENTITY-10** "Team members get work tasks, reviews, and only their own
  memory and briefings."
- **IDENTITY-11** "Community members get Q&A and announcements only, with no
  mutating tools."
- **IDENTITY-12** "The role is checked in the tool layer on every run and
  surface; anyone undeclared is community at most."
- **ROLES-CHAT-8.a** "Community sessions may read the public repo docs
  (README, docs/, STATUS, CHANGELOG) and the public issues and milestones of
  allowed public repos, and nothing else as site or roadmap."
- **ADMIN-3.b** "As owner I can set each declared person's role with /admin;
  every change is audited."

Gap on the stacked base: two tiers only (ROLES-CHAT): the owner is ADMIN and
everyone else is non-ADMIN with read/chat tools; `resolvePerson` returns
`role: owner` only; no role key, no `/admin people role`; `/work` ships a PR
for the owner only; community "site / roadmap" is unspecified in the prompt
and there is no milestone or repo-docs reader.

Settled constraints: owner admins, the team works (IDENTITY-2 stands for
admin slash); v1 off-chain (Discord + GitHub ids only, no AlgoChat / wallet);
every existing ROLES-CHAT test stays green; no schema bump; #232 / #233 scope
untouched; #36's active SpecSync changes are left alone.
