---
change: autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho
artifact: tasks
---

# Tasks

- [x] AUTONOMOUS-1 gate module reading `[corvidinho.autonomous]` from the project fledge.toml
- [x] Delegation core: depth env, tier clamp, argv/env, limiter, worker spawn with abort/timeout/drain
- [x] `delegate` plugin (dangerous=false, minTier=2, autonomous=true) with run-time gate re-checks
- [x] SAFE-9 hooks: catalog filter, session gate in createTaskExecute, tier + signal to runPlugin
- [x] Document the off-by-default switch in fledge.toml
- [x] Fake-bin tests for gate, catalog, tool loop, spawn argv/env, refusals, failure, timeout, abort, drain, .env isolation
- [x] Spec deltas and canonical spec updates (REQ-agent-117, REQ-plugins-117)
- [x] Verify: specsync check --require-coverage 100, tsc, bun test, fledge verify lane
