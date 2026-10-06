---
change: in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone
artifact: design
---

# Design

## Workspace kind `project_dir`

`TalkWorkspaceKind = "worktree" | "scoped_dir" | "project_dir"`.
`ensureTalkWorkspace` takes `nonGit?: "scoped_dir" | "project_dir"`
(default `scoped_dir`, today's behaviour). With `project_dir` and a project
where `isGitRepo` is false it returns `{ kind: "project_dir", workDir:
project, projectWorkingDir: project }` and creates nothing; the worktree base
is now made only by the paths that use it (`createWorktree`, the scoped dir).
Only `SessionStore.bindWorktree` asks for `project_dir`; the scheduler
passes `scoped_dir` explicitly (AGENT-1.c) and the CLI never calls it for a
non-git cwd.

## The park / remove invariant

`guardsProjectDir(project, dir)` is true when `dir` equals or contains the
project folder, by realpath and lexically (for a path that no longer
resolves). `parkWorktree` returns `removed` without touching anything for
`project_dir` or a guarded dir, whatever kind was passed; `removeWorktree`
returns at once for a guarded dir (so a main checkout git refuses to remove is
never `rmSync`ed); the scoped-dir setup refuses a guarded path.

## Session rows

No new column: `sessionWorkspaceKind(session)` derives the kind — a branch
⇒ `worktree`; a path that is the project folder (realpath) ⇒
`project_dir`; else `scoped_dir`. Park and bind use it instead of
"branch ⇒ worktree, else scoped". `bindWorktree`: the switch refusal runs
first as today; then an active row that is a scoped dir of a non-git project
(legacy) or `project_dir` of a project that is now a git repo is parked and
bound afresh; otherwise the existing dir is returned with its derived kind.
`cwdFor` is unchanged (path when active, else the project).

## Others only read

`actingWorkTask(env, cwd)` = the `/work` stamp AND `isGitRepo(cwd)`;
`cwd` is required, so every caller passes it: `runPlugin` (`opts.cwd ??
process.cwd()`), `refusedForRole` and the catalog in `execute.ts`. In a
non-git folder a team member's `/work` gets neither the work tools in the
catalog nor a call to one; owner and community are unchanged.

## AGENT-1.b

`isNonGitRootInstructionPath(absPath, cwd)` (files plugin): when
`isGitRepo(cwd)` is false, for each `PROJECT_INSTRUCTION_FILES` name the
targets are `<realRoot(cwd)>/<name>` and where a write to that name would
land (`resolveProjectPath`, so a symlink's target); a path equal to or under
a target, or a regular file sharing a target's inode, is refused by
`refuseProtected` (files-write, files-edit, files-delete) with
`refused (AGENT-1.b): …`, exit 2, for every caller. Git projects are
unchanged (only the HEAD copy is loaded there).

## Images

In a `project_dir` talk the bridge writes the owner's images (`actingRole
=== "owner"`) to `sessionAttachmentDir(project, session.id)` =
`<project>/.corvidinho/attachments/<session id>/` and anyone else's go to the
model as `appendAttachmentUrls` only. `parkSessionWorktree` (every end path:
`endSession`, TTL purge, an expired row at start, the re-bind park) calls
`removeSessionAttachments` for a `project_dir` row or a non-git project:
it removes that one folder when it resolves strictly inside the project, then
`.corvidinho/attachments` and `.corvidinho` only if empty.

## Alternatives not taken

- A `worktree_kind` column: a schema change for what the path already says.
- Non-owner sessions in a scoped dir: AGENT-1.a says they read *there*.
- URL-only for non-owners everywhere: the captured text is about the non-git
  folder; git talk worktrees are the requester's own.
