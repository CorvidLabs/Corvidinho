---
change: session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks
artifact: tasks
---

# Tasks

- [x] Schema v4 session worktree columns in `src/store/db.ts`
- [x] `src/worktree/` create/remove/park/prune/resolve/ensure
- [x] SessionStub + SessionStore persist/purge park wiring
- [x] AgentClient per-call cwd; bridge/slash/work/schedule wire
- [x] Optional `project` on `/session start` and `/work` bodies
- [x] Scheduler tick uses project worktree/scope + cleanup
- [x] Fixture tests (isolation, park/cleanup, explicit project, schedule)
- [x] Specs delta REQ-discord-022 + docs/STATUS/CHANGELOG + package 0.0.5
- [x] SpecSync check + fledge verify
- [x] PR via gh as corvid-agent; squash-merge; tag v0.0.5 + Release; comment #58
