---
change: repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools
artifact: plan
---

# Plan

1. Reproduce the review PoC in a test: files-write overwrites AGENTS.md in a
   git project; assert the planted text never renders.
2. Split the loader: shared `decodeInstruction`, unchanged working-tree
   reader for folders without `.git`, new HEAD reader for git projects.
3. Mark working-tree drift (`uncommitted`) and untracked files
   (`NOT_COMMITTED_REASON`) so the one-time `Text` note tells the operator.
4. Move the working-tree-only guard tests to a plain folder; add git fixture
   tests (worktree, unborn HEAD, unusable `.git`, committed symlinks, cap,
   binary, scrub, createTaskExecute prompt).
5. Update the agent spec prose and the REQ-agent-084 delta.
6. specsync check, tsc, bun test, fledge verify.
