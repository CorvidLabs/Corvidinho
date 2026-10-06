---
change: in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone
artifact: tasks
---

# Tasks

- [x] Capture AGENT-1.b and AGENT-1.c with `hi` (own commit); AGENT-1.a confirmed on main; `hi check` passes.
- [x] `src/worktree/manager.ts`: `project_dir` kind, `nonGit` option, `guardsProjectDir` in park / remove / scoped setup; `src/worktree/index.ts` exports.
- [x] `src/discord/session-store.ts`: `sessionWorkspaceKind`, bind in place, legacy and became-git re-bind, attachment clean-up on every park.
- [x] `src/scheduler/service.ts`: `nonGit: "scoped_dir"` (AGENT-1.c) and the widened kind type.
- [x] `src/plugins/roles.ts` `actingWorkTask(env, cwd)`; cwd threaded through `src/plugins/run.ts` and `src/agent/execute.ts` (catalog and `refusedForRole`).
- [x] `plugins/files/protectedPaths.ts` + `commands.ts`: AGENT-1.b refusal.
- [x] `src/discord/image-attachments.ts` + `bridge.ts`: owner images per session in the project folder, others URL-only.
- [x] Tests: `tests/discord.nongit-project-dir.test.ts`, `tests/plugins.nongit-project-dir.test.ts`, `tests/agent.nongit-project-dir.test.ts`; `tests/roles.team.test.ts` fixture dir made a git repo; fail-on-base proof recorded in testing.md.
- [x] Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`), spec prose and files lists, module testing evidence, deltas.
- [x] `specsync change approve`, `change check --commit`, `change audit`, `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
