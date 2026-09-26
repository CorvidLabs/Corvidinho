---
change: cover-specsync-config-toml-agent-registry-entry-added-during-specsync-agent-wiring-8-pr-22
artifact: context
---

# Context

PR #22 SpecSync agent wiring archived its SDD change, but the PR tip also touches `.specsync/config.toml` (adds `agent = "specs/agent/agent.spec.md"` under `[specs]` to mirror `registry.toml`). `specsync change audit` on the PR fails because that meaningful path is not covered by an active change.

No product behavior change beyond documenting coverage of an already-landed agent spec mapping.
