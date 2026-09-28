---
change: lightly-adopt-agent-3md-ship-guidance-only-agent-3md-plus-corvidlabs-agent3md-dep-and-validate-route-smoke-no-agent-13
artifact: requirements
---

# Requirements

- Ship root `agent.3md` (identity + guidance-only playbooks: HI-first, Discord
  ask UX, SpecSync, no-secrets, SAFE plugins) with **no** `tool=` bindings that
  duplicate SAFE plugins.
- `package.json` depends on `@corvidlabs/agent3md` (^1).
- Bun smoke test: `validateAgent` ok; `Agent.route` / `Agent.get` resolve
  playbooks; every skill `tool` is null.
- No AGENT-13 runtime loop wiring; no new numbered HI AC beyond a Notes note.
- Patch bump to 0.0.27 with CHANGELOG/STATUS noting light 3md adopt.
