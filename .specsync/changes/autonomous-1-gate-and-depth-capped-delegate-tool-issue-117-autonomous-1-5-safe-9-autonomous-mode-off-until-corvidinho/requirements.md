---
change: autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho
artifact: requirements
---

# Requirements

### REQ-agent-117

Autonomous mode SHALL be off until the project enables it with
`[corvidinho.autonomous] enabled = true` in its `fledge.toml` (AUTONOMOUS-1).
The task-run tool loop SHALL offer autonomous extras such as `delegate` only
to an allowed session (autonomous on, delegation depth below 2) and at code
tier (SAFE-9). A worker SHALL run as a non-interactive child `task run` at the
lead's tier or lower, one level deeper, with at most 2 workers at once and 4
per lead run (safety defaults; draft AUTONOMOUS-10 left for HI capture).
Full text: `deltas/agent.md`.

### REQ-plugins-117

The `delegate` autonomous plugin (PLUGIN-5) SHALL declare `dangerous: false`,
`minTier: 2`, `autonomous: true`, SHALL re-check every gate at run time and
refuse without spawning, and SHALL return the worker's summary, tier, depth
and filesChanged for the lead to synthesize (AUTONOMOUS-5). Plugin handlers
SHALL receive the calling run's tier and abort signal when known.
Full text: `deltas/plugins.md`.
