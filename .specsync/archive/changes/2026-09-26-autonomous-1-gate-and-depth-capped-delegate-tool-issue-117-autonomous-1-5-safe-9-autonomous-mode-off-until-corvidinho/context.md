---
change: autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho
artifact: context
---

# Context

Issue #117 (M6 multi-agent, build step 10 of 13): Leif chose sub-agents
(workers per task or repo) as part of multi-agent, not replacing orc.
Captured HI in scope: **AUTONOMOUS-1** (autonomous mode off until enabled in
project config), **AUTONOMOUS-5** (a lead agent can delegate subtasks to peers
by skill and synthesize the result), **SAFE-9** (expensive cross-agent tools
stay hidden until a session is allowed to use them). **PLUGIN-5** (autonomous
extras are plugins left disabled until opt-in) and **PLUGIN-2** (every command
declares danger + minTier) shape the host side.

Draft **AUTONOMOUS-10** (worker never exceeds the parent; depth <= 2) is NOT
an acceptance criterion. A hard depth / fan-out cap and a tier clamp are still
required for safety, so they ship as conservative safety defaults, not HI
claims; AUTONOMOUS-10 stays left for HI capture.

Project config already exists: `loadAgentConfig` reads the project's
`fledge.toml` `[corvidinho]` section, and `fledge.toml` is SAFE-2 protected
infra (file tools cannot write it). The switch lives there as
`[corvidinho.autonomous] enabled = true` (Merlin `[merlin.autonomous]` shape);
no new config file and no env switch.

Ruled out for this slice: a worker per worktree (#58 dependency: workers
share the lead's cwd and the lead's verify gate covers their edits), spend
charged to parent caps (SAFE-8 / AUTONOMOUS-8 budget not built), routing by
persona skill tags (AUTONOMOUS-2 personas not built: the skill is a label the
lead attaches and gets back), a persistent roster (G45, out of scope).
