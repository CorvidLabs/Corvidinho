---
hi: 1
families: [IDENTITY]
owner: leif
---

# Identity

## Intent

Corvidinho knows a durable owner (Discord user id, optional GitHub / display such as 0xLeif) from local config or DB so admin slash and autonomy pings have a real target — empty owner means no admin.

## Criteria

- **IDENTITY-1**  I can declare a durable owner (Discord user id plus optional GitHub login or display such as 0xLeif) in local config or DB that survives restarts.
- **IDENTITY-2**  Only the configured owner may use admin slash commands; non-owners cannot.
- **IDENTITY-3**  Empty owner config means nobody is admin — default-deny.
- **IDENTITY-4**  Discord chat injects acting user Discord id plus display name from Discord and the owner map when known; never invent names like Kyn; memory stays scoped to that acting user
- **IDENTITY-5**  When Discord chat mentions a snowflake user id, an @mention, or asks about a named guild member, look them up via a read-only Discord member/user tool scoped to the configured guild before diving into SpecSync/git/github/files; never invent names or look up arbitrary other guilds
- **IDENTITY-13**  I declare each person's ids (nicknames, GitHub and Discord accounts), and that list is who's who.
- **IDENTITY-14**  It recognises me and each declared person on Discord and GitHub.
- **IDENTITY-6**  Only I add, change or remove a person's links, never through chat.
- **IDENTITY-7**  It matches people on stable ids, never on display names.
  - **IDENTITY-7.a**  On GitHub it matches people only by their numeric user id, so a renamed or re-registered login never counts as them.
- **IDENTITY-8**  Each declared person has exactly one role (owner, team or community), and only I set it.
- **IDENTITY-9**  The owner can use everything, subject to the must-ask list.
- **IDENTITY-10**  Team members get work tasks, reviews, and only their own memory and briefings.
- **IDENTITY-11**  Community members get Q&A and announcements only, with no mutating tools.
- **IDENTITY-12**  The role is checked in the tool layer on every run and surface; anyone undeclared is community at most.

## Notes (not numbered AC)

- Community vs ADMIN tool gates (read/chat only for non-owners): **ROLES-CHAT-1..7** in [`hi/roles.md`](roles.md) — the two-tier gate that the three roles of **IDENTITY-8..12** (owner / team / community) replace over time (#65).
