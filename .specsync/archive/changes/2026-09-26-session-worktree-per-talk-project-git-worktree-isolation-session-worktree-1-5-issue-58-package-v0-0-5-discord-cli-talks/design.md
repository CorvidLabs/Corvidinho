---
change: session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks
artifact: design
---

# Design

## Worktree manager (`src/worktree/`)

- `getWorktreeBaseDir(projectWorkingDir)` → `WORKTREE_BASE_DIR` or
  `{dirname(project)}/.corvid-worktrees`
- `createWorktree({ projectWorkingDir, branchName, worktreeId })` — prune stale,
  `git worktree add -b`, return `{ success, worktreeDir, error? }`
- `removeWorktree(projectDir, worktreeDir, { cleanBranch? })` — idempotent
- `parkWorktree(...)` — remove worktree dir from active use but keep branch when
  it has commits (or rename/mark parked); ensure path is not reused as cwd
- `pruneWorktrees`, `generateTalkBranchName(sessionId)` → `talk/{sessionPrefix}`
- `resolveProjectDir(project, { defaultProjectRoot })` — absolute existing path,
  else path under default root; must be a directory
- `ensureTalkWorkspace({ projectWorkingDir, sessionId })` — if git repo: create
  worktree; else: mkdir project-scoped dir under base (`scoped-{id}`)

## Session binding

`SessionStub` gains optional:
- `project` (resolved absolute path; frozen for talk lifetime)
- `worktreePath`, `worktreeBranch`, `worktreeState`

Schema v4 adds columns on `discord_sessions`. On create (mention/`/session`/`/work`):
resolve project (explicit option or default `projectRoot`), ensure workspace,
persist fields. Continue-session reuses the same project/worktree (no switch).

TTL purge / abandon: `parkOrRemoveSessionWorktree(session)` then delete row.

## AgentClient

`runChat` accepts optional `cwd` (and optional `project`). Spawn uses per-call
cwd when set; bridge default remains `projectRoot` for non-isolated paths.

## Schedule ticks

`SchedulerService.runOne`: resolve `schedule.project`, `ensureTalkWorkspace` with
id `schedule_{schedule.id}_{runId}`, spawn agent with that cwd, park/remove after
run finishes (keep branch if commits ahead of main).

## Slash (no new commands)

Optional string option `project` on `/session start` and `/work` only.
`/schedule create` already requires `project`.

## Spec ownership

`src/worktree/*` listed under discord module files for this change (same pattern
as `src/store/` / `src/scheduler/`). Physical path stays reusable.
