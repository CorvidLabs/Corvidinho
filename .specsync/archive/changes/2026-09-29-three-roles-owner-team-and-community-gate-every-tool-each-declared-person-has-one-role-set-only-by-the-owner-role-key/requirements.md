---
change: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
artifact: requirements
---

# Requirements

- Added **REQ-plugins-065** (delta `deltas/plugins.md`): `resolveActingRole`
  (owner / team / community / null) re-resolved at every call, the surface
  stamp only lowering it; `roleAllowsPlugin` (team review tools, work tools in
  `/work`); `runPlugin` role refusal; `checkRepoGateForActingRole` by role
  (team writes allowlisted only, community writes refused)
  (IDENTITY-8..12).
- Added **REQ-plugins-066**: `github-docs-read` (README, root STATUS /
  CHANGELOG, `docs/**`; any other path refused) and `github-milestone-list`,
  read-only, behind the acting role's repo gate (ROLES-CHAT-8.a).
- Added **REQ-agent-065** (delta `deltas/agent.md`): the task-run catalog by
  role (`buildOpenAiTools({ actingRole, workTask })`, resolved per attempt),
  invented-call refusal by role, Fledge discovery owner-only, the public Q&A
  prompt naming the ROLES-CHAT-8.a sources.
- Added **REQ-discord-065** (delta `deltas/discord.md`): the `role` key,
  `roleOfPerson`, `resolveDiscordActingRole`, the spawn stamps
  (`CORVIDINHO_ACTING_ROLE`, `CORVIDINHO_ACTING_WORK_TASK`) from chat, button
  picks, `/session start` and `/work`, and owner-only audited `/admin people
  role` (IDENTITY-8, ADMIN-3.b).
- Modified **REQ-discord-043**: `/admin people role`; `config show` counts
  roles.
- Modified **REQ-discord-088**: the `/work` PR step runs for the owner or a
  declared team member (re-resolved after the run).
- HI: IDENTITY-8..12, ADMIN-3.b, ROLES-CHAT-8.a (captured in this PR).
  ROLES-CHAT-1..9, IDENTITY-1..7/13/14, ADMIN-1..4, MEMORY-ACL-1..5, SAFE-1..9
  unchanged. No acceptance criteria beyond the captured text; open design
  points are listed in `design.md` for Leif.
