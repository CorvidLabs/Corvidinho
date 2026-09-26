---
change: autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho
artifact: docs
---

# Docs

- `fledge.toml`: commented `[corvidinho.autonomous]` / `enabled = true`
  example under `[corvidinho]`, stating it is off by default and the caps.
- `delegate` command description carries an argv example and the gate note
  (PLUGIN-6 visibility in `plugins list`).
- Canonical specs: agent + plugins spec sections, requirements
  (REQ-agent-117, REQ-plugins-117), testing notes.
- No CHANGELOG / STATUS / version edits (release PRs own those).
