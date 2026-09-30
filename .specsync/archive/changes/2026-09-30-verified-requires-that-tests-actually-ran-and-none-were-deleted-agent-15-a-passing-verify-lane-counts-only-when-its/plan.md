---
change: verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its
artifact: plan
---

# Plan

1. `src/agent/test-evidence.ts`: summaries, declarations, drops, walk, verdict.
2. `WorkspaceDiffTracker.testDrops` + `startWorkspaceDiffFrom` in `src/agent/workspace-diff.ts`; `TestDrop` in types; exports.
3. Gate verdict in `src/agent/loop.ts` (walk for non-git, note first in feedback and summary).
4. /work merge-base check and pre-push evidence in `src/work/pr.ts`.
5. Tests: new `tests/agent.test-evidence.test.ts`; stub lanes print a `bun test` summary (`tests/fixtures/lane-output.ts`); `/tmp` cwd → scratch dir; the no-base talk test now expects "not verified".
6. Fail-on-base proof: swap the base's five source files in, run, restore.
7. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `README.md`), spec prose, deltas, testing evidence.
8. `specsync change approve` → `specsync change check --commit` → `specsync change audit` → `specsync check --require-coverage 100` → `hi check` → `bunx tsc --noEmit` → `bun test` → `fledge lanes run verify --non-interactive`.
