---
change: discord-project-option-stays-inside-the-bridge-project-root-or-an-allowlisted-sibling-repo-checkout-allow-2-allow-6
artifact: plan
---

# Plan

1. Regression test first (tests/worktree.project-scope.test.ts), watch it fail.
2. Scope gate in `resolveProjectDir`; pass the GitHub allowlist from the
   session store, bridge, scheduler tick and `/schedule create`.
3. Adjust two fixtures that relied on the old unchecked behaviour.
4. Delta REQ-discord-202; verify lane.
