---
change: person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one
artifact: context
---

# Context

Issue #101 (MEMORY: person and project profiles, private notes, forget on
request, milestone M1 "Knows everyone"), stacked on #65 (roles, branch
`claude/m1-65-roles`, itself on #36 declared people), whose people registry
and resolver (#36) and owner / team / community role gate (#65) this reuses.
Leif confirmed the criteria in the 2026-09-28 interview (round 6: "#101
profiles: capture MEMORY-5/6/7 + MEMORY-ACL-6 (per-person profile incl.
history of decisions/asks/approvals; per-project memory; private to the
person + Leif by default; forget-me once Leif approves — via SAFE-18 card)";
the plan: "#101 profiles + private + forget-on-card (MEMORY-5/6/7,
MEMORY-ACL-6; needs a minimal SAFE-18 card)"). Leif on #101 (2026-09-26):
anyone may ask to be forgotten and the owner approves on an Approve/Deny card;
MEMORY-ACL-4's admin-only path remains for direct admin use. Captured in this
PR's first commit (`hi`; MEMORY-ACL-6 by hand, hi does not parse the
MEMORY-ACL prefix):

- **MEMORY-5** "For each person it keeps their role, projects, preferences,
  and a history of decisions, asks and approvals."
- **MEMORY-6** "Each project has memory that is there the next time anyone
  works on the repo."
- **MEMORY-7** "Memory about a person is private to them and me by default,
  and private notes are never shown to others."
- **MEMORY-ACL-6** "Anyone can ask to be forgotten, and it forgets once I
  approve on a card."

Gap on the stacked base (89f7976): memory rows are keyed by the acting Discord
id only, four categories, no project scope, the owner cannot read anyone's
memory, no private notes, no forget request and no Approve/Deny card or DM.

Settled constraints: owner admins, the team works; v1 off-chain (Discord ids
only, no AlgoChat / wallet / MainNet); MEMORY-ACL-1..5 behaviour stays;
undeclared users keep today's scoping; specs/ only through SpecSync; #232 /
#233 and #65's active change untouched; SAFE-18..20 (one-time codes, exact
diff/amount cards) are not built here — only the reusable card helper.
