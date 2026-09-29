---
change: memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run
artifact: context
---

# Context

Issue #67 (MEMORY: "recall before claiming ignorance", ranked recall, memory
tools on every surface; milestone M1 "Knows everyone", build step 9 of 11),
stacked on #101 (branch `claude/m1-101-profiles`: person / project memory
and MEMORY-7 privacy), itself on #65 (roles) and #36 (declared people), whose
people registry and resolver, role gate and memory scopes this reuses. #101's
own SpecSync change is still active in the tree and is left alone.

Leif confirmed the criteria in the 2026-09-28 interview (round 6: "#67 memory
surfaces: capture MEMORY-8 (Discord + GitHub; AlgoChat Post-v1) and MEMORY-9 —
WATCH runs may save/recall scoped by the commenter's declared identity with
MEMORY-7 privacy (changes REQ-watch-008); search memory before 'I don't
know'"). Captured with `hi` in this PR's first commit:

- **MEMORY-8** "It saves and recalls facts in Discord and GitHub
  conversations, filed by person or project."
- **MEMORY-9** "It searches memory before saying it doesn't know."

Design decisions from the interview carried here: WATCH (GitHub) runs may now
save and recall, scoped by the commenter's declared identity (people
registry) with MEMORY-7 privacy — REQ-watch-008 (memory refused in GitHub
runs) changes; undeclared GitHub users get community scope (read project
memory only, no saves about others); the agent consults memory ranked by
relevance / recency before answering that it doesn't know, in the prompt /
tool loop, without extra model calls where possible; MEMORY-ACL gates stay.

Gap on the stacked base (9270d81): GitHub runs clear the acting user, so every
memory plugin refuses there; `--query` is one `LIKE %query%` substring
ordered by recency (a question in plain words finds nothing); the Discord
inject is the newest 20 rows whatever the message asks; nothing in the loop
checks for a memory search before a reply that says it doesn't know.

Settled constraints: v1 off-chain (no AlgoChat / wallet / MainNet surface —
AlgoChat is Post-v1); owner admins, the team works; specs/ only through
SpecSync; MEMORY-ACL-1..6 unchanged; no schema change; #232 / #233 scope
untouched. Out of scope (issue): profiles / forget (#101, shipped below),
graduation and decay (#116), on-chain memory (MEMORY-3).
