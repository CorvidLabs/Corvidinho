---
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
artifact: plan
---

# Plan

1. Capture AGENT-15.a with `hi` in its own commit; `hi check`.
2. Remove the switches (config, types, loop, CLI) and refuse `--no-verify`;
   doctor `[warn]`; honest demo stub.
3. Real diff alone in `runTask`; ghost claims run the lane.
4. Move `resolveBase` to `src/worktree/base.ts`; talk marker helpers;
   `ensureTalkWorkspace` writes the marker; carried tracker in
   `startWorkspaceDiff`; `runTask` settles.
5. Tests: new `tests/agent.verify-gate.test.ts` and fixture; rewrite the
   loop / CLI / config / dangerous / doctor tests; move every real-CLI
   `task run` test to scratch projects.
6. Fail-on-base proof: swap the base's source files in, run the six touched
   files, restore, run again.
7. Docs (AGENTS.md, docs/discord.md, docs/WATCH.md, fledge.toml, comments),
   spec prose, deltas, testing evidence.
8. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
