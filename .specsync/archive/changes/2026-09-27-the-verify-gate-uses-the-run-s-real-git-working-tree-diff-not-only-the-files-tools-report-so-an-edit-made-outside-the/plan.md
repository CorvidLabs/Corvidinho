---
change: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
artifact: plan
---

# Plan

1. Write the regression tests (tests/agent.loop.test.ts temp git repos;
   tests/agent.tool-loop.test.ts end to end through the real shell-exec) and
   watch them fail on main's loop.
2. Add `src/agent/workspace-diff.ts` (snapshot + diff over `runGit`,
   `parseStatusPorcelainZ`, `findProjectRoot`).
3. Wire it into `runTask` before the `wantVerify` decision; add the types
   and the test seam; export from `src/agent/index.ts`.
4. Update spec prose (agent.spec.md, testing.md), deltas, docs/discord.md and
   the two spawn client header comments.
5. `specsync change approve`, `specsync change check --commit`,
   `specsync change audit`, `specsync check --require-coverage 100`,
   `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify
   --non-interactive`.
