---
change: lightly-adopt-agent-3md-ship-guidance-only-agent-3md-plus-corvidlabs-agent3md-dep-and-validate-route-smoke-no-agent-13
artifact: plan
---

# Plan

1. Add `@corvidlabs/agent3md` dependency.
2. Write root guidance-only `agent.3md` mirroring Corvidinho persona.
3. Add `tests/agent3md.smoke.test.ts` (validate + route/get).
4. Note light adopt in `hi/agent.md` Notes (not numbered AC) + STATUS/CHANGELOG.
5. Spec delta REQ-agent-260; bump package to 0.0.27; verify lane.
