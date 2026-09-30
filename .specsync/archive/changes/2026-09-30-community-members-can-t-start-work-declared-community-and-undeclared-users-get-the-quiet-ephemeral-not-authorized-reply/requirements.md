---
change: community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply
artifact: requirements
---

# Requirements

- Modified REQ-discord-065 (delta `deltas/discord.md`, IDENTITY-11.a):
  `/work` starts only for the owner or a declared team member; the handler
  resolves the role from the live owner config and the people list re-read
  for the command (after the SAFE-13 check) and answers community — declared
  community, no role, undeclared; muted / deny-listed callers too, though the
  dispatcher's gates stop them first — with only the ephemeral
  `not authorized`, before any deferred reply,
  session, worktree / `talk/*` branch, work task, agent run (verify) or PR
  step. With no owner configured only a declared team member can start it
  (IDENTITY-3). Owner and team unchanged; `/session start` and chat stay open to
  community. New acceptance bullets for the refusal, a live role change, the
  unchanged owner / team runs and the regression test file.
- Modified REQ-discord-088 (delta): the PR-step role paragraph no longer says
  community `/work` runs keep their changes on the work branch — community
  never starts `/work`; only a team member demoted mid-run keeps the
  branch. Its role acceptance bullet says so.
- HI: IDENTITY-11.a captured in this PR from Leif's 2026-09-28 interview
  record (round 12, 2026-09-29), under IDENTITY-11. IDENTITY-3, IDENTITY-10,
  IDENTITY-12, ROLES-CHAT-2/3, DISCORD-DENY-1..3 and SAFE-13 unchanged. No
  acceptance criteria beyond the captured ids.
