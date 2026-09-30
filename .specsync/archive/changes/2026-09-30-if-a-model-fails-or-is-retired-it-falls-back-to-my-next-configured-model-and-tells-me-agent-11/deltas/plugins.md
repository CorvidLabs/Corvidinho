---
module: plugins
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
---

# Delta: plugins (delegate and council pass a worker's model failovers back — AGENT-11)

## Added

### REQUIREMENT REQ-plugins-080

If a model fails or is retired, it falls back to my next configured model and
tells me (AGENT-11, captured in `hi/agent.md` from Leif's 2026-09-28
interview; the chain is REQ-agent-080). The `delegate` command SHALL pass the
worker's model failovers (`DelegateChildOutcome.modelFallback`, validated from
its result frame) back as `data.modelFallback`, and the `council` command its
voices' and chair's (`CouncilOutcome.modelFallback`, each once), finished or
not, so the lead's tool loop reports them as its own run's (`via`
`delegate` / `council`). Absent when no worker failed over. No flag, env var or
config key is added.

Acceptance Criteria
- `createCouncilCommand` with a fake bin whose result frames report one failover returns `ok` with `data.modelFallback` holding it once.
- `runDelegateChild` over a fake bin returns the worker's failovers (an invalid entry dropped), which the `delegate` data carries.
