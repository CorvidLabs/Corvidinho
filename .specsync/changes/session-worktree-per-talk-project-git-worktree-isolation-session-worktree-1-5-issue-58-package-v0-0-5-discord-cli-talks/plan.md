---
change: session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks
artifact: plan
---

# Plan

1. Schema v4: session worktree columns on `discord_sessions` in `src/store/db.ts`.
2. `src/worktree/` manager + cleanup + project resolve + index exports.
3. Extend SessionStub / SessionStore create+purge+persist for project/worktree;
   park/remove on TTL purge.
4. AgentClient `runChat` optional `cwd`; bridge/slash/work/schedule pass it.
5. Wire ensure-workspace on mention start, `/session start`, `/work`; freeze
   project on continue; optional `project` slash option.
6. Scheduler tick: resolve schedule.project → worktree cwd → park after run.
7. Fixture tests: isolation, cleanup/park, explicit project, schedule scope.
8. Specs delta REQ-discord-022 + docs/STATUS/CHANGELOG; package **0.0.5**.
9. SpecSync check → fledge verify → PR → squash-merge → tag v0.0.5 + Release.
