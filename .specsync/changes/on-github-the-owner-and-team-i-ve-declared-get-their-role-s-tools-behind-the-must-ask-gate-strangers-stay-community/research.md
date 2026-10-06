---
change: on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community
artifact: research
---

# Research

- Sources: issue #65 (body and three comments: Leif's "owner admins, the
  team works" decision; the v0.0.29 progress note; the v0.0.35 rollup naming
  #285 choice 3 — WATCH stamps `CORVIDINHO_ACTING_IS_ADMIN=0` with no role,
  so owner and team get community tools on GitHub), the interview record
  `/home/user/coord/interview-2026-09-28.md` (round 16: role tools +
  must-ask on GitHub; strangers stay community).
- `src/plugins/roles.ts` (#285): owner = ADMIN bit + Discord id matches the
  owner, not muted or deny-listed; team = team stamp + Discord id resolves to
  a team person; schedules never team (DISCORD-SCHEDULE-1.a).
- `src/watch/router.ts` (#271, #303): the WATCH identity block and SAFE-13
  exemption already resolve the sender by `senderId` only; assignment /
  review_request carry `actor` (login, REQ-watch-302) and `sender` = the
  thread author.
- `src/plugins/must-ask.ts` (#97): the gate is surface-agnostic; cards land in
  `approval_requests` and the bridge DMs them (`mustAskApprovalKinds`);
  WATCH spend cards already reach the owner this way (REQ-agent-198).
- `src/agent/shell-gate.ts`: WATCH (`CORVIDINHO_WATCH_SESSION_ID`) never gets
  the shell, whatever its role; `src/agent/repo-ways.ts`: WATCH never
  approves / archives a SpecSync change; `src/autonomous/delegate.ts`: worker
  env drops `CORVIDINHO_ACTING_*`, so workers stay community.
- `plugins/memory/commands.ts`: `--person` needs a Discord actor; private
  reads refused on GitHub; project memory read-only on GitHub — unaffected by
  a GitHub owner or team role.
