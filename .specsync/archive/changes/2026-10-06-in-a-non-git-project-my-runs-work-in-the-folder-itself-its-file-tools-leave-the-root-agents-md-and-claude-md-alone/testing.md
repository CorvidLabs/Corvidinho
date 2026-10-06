---
change: in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone
artifact: testing
---

# Testing

Three new files, 16 tests, no network: `tests/discord.nongit-project-dir.test.ts`
(8: temp folders and git repos, in-memory and temp-file SQLite session stores,
the bridge with a recording agent, a null gateway and a mocked CDN fetch),
`tests/plugins.nongit-project-dir.test.ts` (6: `runPlugin` in temp folders
with a temp allowlist file declaring the owner and a team member) and
`tests/agent.nongit-project-dir.test.ts` (2: `runTask` + `createTaskExecute`
with an injected fake provider and a stub verify lane). All temp dirs live
under the test run's scratch root, never this checkout.

Fail-on-base proof: with the base's (cf7f61b, main) eleven modified sources
swapped in (`src/worktree/manager.ts`, `src/worktree/index.ts`,
`src/discord/session-store.ts`, `image-attachments.ts`, `bridge.ts`,
`src/scheduler/service.ts`, `src/plugins/roles.ts`, `run.ts`,
`src/agent/execute.ts`, `plugins/files/protectedPaths.ts`, `commands.ts`)
plus three one-line shims for the exports the tests import, set to the base's
behaviour (`sessionWorkspaceKind`: branch ⇒ worktree else scoped;
`sessionAttachmentDir`; `isNonGitRootInstructionPath` ⇒ false), the three
files gave 3 pass, 13 fail: every in-place binding case (the base made a
scoped dir; `toMatchObject` / `toBe` failures), the park / remove guard
(the base deleted the project folder and the git main checkout), the restart,
legacy and became-git cases, the bridge images case (cwd a scoped dir), all
AGENT-1.b refusals (written), `actingWorkTask` and the team `/work` role
refusal (written), and both agent cases (no AGENT-1.b refusal; the team run
was offered `files-write`). The 3 that pass on the base are the guards that
must hold on both: a schedule's scoped folder (AGENT-1.c was already met),
SAFE-2 in the folder, and a git project's root AGENTS.md staying writable.
Restored: 16 of 16 pass.

`tests/roles.team.test.ts`: its fixture dir is now a git repo (`git init`),
since a team member's `/work` edits need a git work tree; 29 of 29 pass on
the branch (3 failed with the dir left non-git, as AGENT-1.a now requires).

Unchanged suites that cover the touched files pass: `worktree`,
`discord.session-worktree`, `worktree.project-scope`,
`discord.session-store.durable`, `discord.image-attachments`,
`scheduler.owner-role`, `scheduler.worktree`, `agent.safe3a-gate`,
`agent.safe3a-owner-shell`, `discord.safe3a-surface`, `roles.chat.gates`,
`roles.community-no-work`, `files.plugins`, `files.secret-path`,
`files.dangling-symlink`, `agent.project-instructions`, `cli.task-worktree`,
and the full `bun test` (3578 tests).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-110` | `tests/discord.nongit-project-dir.test.ts` ("nonGit project_dir returns the folder itself…", "AGENT-1.c: without nonGit…", "park and remove never delete…", "bind, cwd, end and TTL purge…", "a restart keeps…", "a legacy row…", "a mid-conversation project switch…"); `tests/scheduler.owner-role.test.ts` ("an owner schedule on a non-git project keeps its own scoped folder…") | The talk's workspace is the folder itself with no `.corvid-worktrees`; schedules keep a scoped folder; park / remove leave the folder, its parent and a git main checkout; end, TTL purge, an expired row at start and a restart leave the folder; a legacy scoped row is parked and re-bound in place; a switch is refused; a folder that became git gets a worktree. |
| `REQ-discord-013` | `tests/discord.nongit-project-dir.test.ts` ("the owner's image goes to this session's own folder…"); `tests/discord.image-attachments.test.ts` (unchanged) | The owner's image is under `<project>/.corvidinho/attachments/<session id>/`, opens with `files-read`, and the talk's end removes it and the empty `.corvidinho`; another person's image is URL-only and nothing is written; a git talk worktree is unchanged. |
| `REQ-plugins-110` | `tests/plugins.nongit-project-dir.test.ts` ("write, edit and delete of the root files are refused…", "a missing root file can't be created…", "a git project's root AGENTS.md is unchanged…") | `refused (AGENT-1.b)` for the names, the absolute path, a path under the name, a symlink's target and a hard link, for the CLI and the owner; other files and `sub/AGENTS.md` written; git project unchanged. |
| `REQ-plugins-115` | `tests/plugins.nongit-project-dir.test.ts` ("actingWorkTask needs…", "a team member's /work run gets the role refusal…"); `tests/roles.team.test.ts` | `actingWorkTask` false in a non-git folder; team `/work` writes refused there with the role refusal and allowed in a git repo; the owner writes there. |
| `REQ-agent-110` | `tests/agent.nongit-project-dir.test.ts` | Owner run: the edit lands in the folder, SAFE-2 and AGENT-1.b refused, `shell-exec` not offered with the SAFE-3.a line, the verify lane runs on the folder and its failure fails the run; team `/work`: no `files-write` / `files-edit` in the catalog, the call refused for the role, offered in a git worktree. |
