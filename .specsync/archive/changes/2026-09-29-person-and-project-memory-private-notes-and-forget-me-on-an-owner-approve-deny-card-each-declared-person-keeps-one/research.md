---
change: person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one
artifact: research
---

# Research

- Memory today (`src/memory/store.ts`, `plugins/memory/commands.ts`):
  `owner_user_id` = acting Discord id from the bridge env; categories
  checked in code only (no SQL CHECK), so new categories need no migration;
  re-store soft-deletes the old row; forget/override owner-only, two-phase.
- People (#36 `src/identity/people.ts`): `resolvePerson` on stable ids;
  the built-in `owner` entry for an undeclared owner. Roles (#65
  `src/plugins/roles.ts`): `resolveActingRole(env)` re-reads the owner
  config and people list at every call; WATCH / schedules / workers are
  community.
- Inject sites: bridge chat and button pick (`enrichPromptWithMemories`);
  `/work` and `/session start` get identity only. `SlashContext` already
  carries `memoryStore`.
- No DM path exists: the gateway has `reply` / `editMessage` to channels
  only; interactions from a DM reach `onComponent` (no intent needed), and
  `user.send` opens the DM channel. Ask buttons (`cvask:`) are
  session-bound and channel-gated, so an owner card needs its own prefix and
  must be routed before the channel gate.
- Outbox precedent: schedule asks (REQ-discord-347) and spend alerts are
  recorded where the run happens and posted by the bridge's tick; the
  scheduler tick is the bridge's only periodic pass.
- Session turns (`discord_session_turns`) hold the person's words; keyed by
  session, sessions keyed by Discord user id.
- Project key: `repoSlugFromRemoteUrl` and `gitEnv` (plugins/git) already
  parse remotes and clamp discovery; `git rev-parse --git-common-dir` gives
  the main checkout of a worktree.
- corvid-agent steal notes (#101): contacts across platforms (#36 covers it),
  key families `user-*` / `project-*` (here: scopes `person:` /
  `project:` plus profile categories), person and project lookups
  (`memory-profile`, `--project`), "check session users carefully" (the
  subject always comes from the bridge env, never argv or the prompt).
