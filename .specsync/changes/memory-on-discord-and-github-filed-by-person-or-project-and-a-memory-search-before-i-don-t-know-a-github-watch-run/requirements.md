---
change: memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run
artifact: requirements
---

# Requirements

- Added **REQ-watch-067** (delta `deltas/watch.md`): the WATCH spawn passes
  the commenter's GitHub login / numeric id and the thread's repo; before the
  run the poller searches the commenter's declared person's profile and the
  repo's project memory for the comment and prepends them (MEMORY-8/9).
- Modified **REQ-watch-008**: GitHub runs still have no Discord actor, no
  confirm tokens, non-ADMIN, non-interactive; memory is no longer refused —
  the commenter's GitHub ids and repo are passed, Discord reply keys cleared.
- Added **REQ-plugins-067** (delta `deltas/plugins.md`): memory plugins in a
  GitHub run act for the commenter's declared person; undeclared = community
  scope (thread repo's project memory read-only, nothing saved); on GitHub
  project memory is read-only and `--person`, private notes and forget-me
  are refused; `--query` is ranked.
- **REQ-plugins-101** (#101's change, still active) is not modified: a
  delta cannot modify a requirement another active change adds, so
  REQ-plugins-067 states the one GitHub exception (`memory-recall --project`
  reads the thread repo's project memory in a GitHub run; writes keep the
  role refusal) and says every other REQ-plugins-101 rule stands. Fold it
  into REQ-plugins-101 once #101's change is archived.
- Added **REQ-agent-067** (delta `deltas/agent.md`): the MEMORY-9 prompt rule
  and (i) GitHub rule; the recall-before-"I don't know" guard in the tool loop
  (search only when nothing searched yet, extra model call only when facts
  are found, once per attempt).
- Added **REQ-discord-067** (delta `deltas/discord.md`): ranked
  `MemoryStore.recall` with a query (no schema change); the chat / button
  inject searches memory for the message; `memorySubjectForGithub`,
  `projectScopeForRepo`; the Discord spawn clears the GitHub keys.
- HI: MEMORY-8, MEMORY-9 (captured in this PR). MEMORY-1..7, MEMORY-ACL-1..6,
  IDENTITY-7..14, ROLES-CHAT unchanged. No acceptance criteria beyond the
  captured text and the interview's design decisions; open design points are
  in `design.md` for Leif.
