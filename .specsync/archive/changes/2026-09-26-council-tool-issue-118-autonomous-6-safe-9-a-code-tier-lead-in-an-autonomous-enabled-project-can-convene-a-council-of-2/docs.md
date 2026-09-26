---
change: council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2
artifact: docs
---

# Docs

- `fledge.toml`: the commented `[corvidinho.autonomous]` block now also names
  `council` (AUTONOMOUS-6) and its caps. It stays off by default.
- The `council` command description carries an argv example, the voice and
  tier options, a cost note and the gate note (PLUGIN-6, `plugins list`).
- Canonical specs: agent and plugins spec sections, requirements
  (REQ-agent-118, REQ-plugins-118), context and testing notes.
- No CHANGELOG / STATUS / version edits (release PRs own those).
