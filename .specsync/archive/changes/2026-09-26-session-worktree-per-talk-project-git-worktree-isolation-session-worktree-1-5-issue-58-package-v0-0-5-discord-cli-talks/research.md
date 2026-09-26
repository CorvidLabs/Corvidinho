---
change: session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks
artifact: research
---

# Research

Ancestor (archived corvid-agent under `/workspace/tmp/corvid-agent-archive`):
- `server/lib/worktree.ts` — `getWorktreeBaseDir`, `createWorktree`, `removeWorktree`,
  `pruneWorktrees`, `generateChatBranchName`, `resolveAndCreateWorktree`
- `server/lib/worktree-cleanup.ts` — `cleanStaleWorktreeState`, `branchExists`,
  `deleteBranch`, `forceRemoveWorktree`
- Specs: `specs/lib/worktree.spec.md` — mandatory isolation; park/clean on exit;
  branch pattern `chat/{agentSlug}/{sessionPrefix}`; base dir `.corvid-worktrees`
  sibling (override `WORKTREE_BASE_DIR`)
- Consumers: Discord message-handler /session, work tasks, AlgoChat; process
  manager removes with `cleanBranch: true` on session exit

Skip: iced/desktop, clone_on_demand project registry thrash, ProcessManager,
mandatory fail-session-on-worktree-failure for non-repo chats (Corvidinho still
supports echo/stub without a git repo — create worktree only when project is a
git working tree; otherwise use a project-scoped directory under the base).

Corvidinho today: AgentClient spawn uses fixed `config.projectRoot`; SessionStub
has no project/worktree fields; schedule stores `project` string but tick still
runs agent at bridge cwd.
