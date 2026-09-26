---
hi: 1
families: [AUTONOMOUS]
owner: leif
---

# Autonomous

## Intent

Optional multi-agent work should be a config flag away, not the default personality of the binary. When I turn it on, named agents can take worktrees, meet in councils, run on a schedule, and poke me on Discord when they are stuck — still behind the same safety gates.

## Criteria

- **AUTONOMOUS-1**  Autonomous mode is off until I enable it in project config.
- **AUTONOMOUS-2**  I can define named personas with their own provider and skill tags and run as one of them.
- **AUTONOMOUS-3**  A work task gets its own git worktree, does the job, and can open a PR when I allow that path.
- **AUTONOMOUS-4**  I can schedule recurring agent work and have a daemon tick it forward without an open REPL.
- **AUTONOMOUS-5**  A lead agent can delegate subtasks to peers by skill and synthesize the result.
- **AUTONOMOUS-6**  A council can deliberate in structured phases when a decision needs more than one voice.
- **AUTONOMOUS-7**  When autonomous work needs a human, it can reach me through the configured owner channel (Discord) instead of dying quietly.
- **AUTONOMOUS-8**  I can see credit/spend usage for autonomous runs against a budget I set.
- **AUTONOMOUS-9**  Bridges and other clients can talk to the running agent team over a local HTTP/WS API with a token, without that API being required for plain CLI use.
