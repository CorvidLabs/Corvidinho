---
change: autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho
artifact: plan
---

# Plan

1. Add `src/autonomous/enabled.ts` (AUTONOMOUS-1 gate + SAFE-9 session gate).
2. Add `src/autonomous/delegate.ts` (depth, tier clamp, argv/env, limiter,
   worker spawn with abort / timeout / drain).
3. Add `plugins/autonomous/{commands,index}.ts` (`delegate`) and load it in
   builtins.
4. Small hooks: `PluginCommand.autonomous`, handler `tier` / `signal`,
   `runPlugin` pass-through, `buildOpenAiTools({autonomous})`,
   `createTaskExecute` session gate + tier/signal to `runPlugin`.
5. Document the switch in `fledge.toml` (commented, off).
6. Tests: `tests/autonomous.enabled.test.ts`, `tests/autonomous.delegate.test.ts`
   with fake bins in mkdtemp dirs; no network, no worktrees.
7. Spec deltas + canonical spec updates; `specsync check --require-coverage 100`,
   `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
