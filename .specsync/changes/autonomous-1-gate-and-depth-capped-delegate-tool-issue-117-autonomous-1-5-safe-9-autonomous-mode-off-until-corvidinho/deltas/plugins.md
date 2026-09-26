---
module: plugins
change: autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho
---

# Delta — plugins (delegate autonomous plugin, #117)

## Added

### REQUIREMENT REQ-plugins-117

The system SHALL register autonomous extras as plugins (PLUGIN-5) from
`plugins/autonomous/` via builtins. `PluginCommand` SHALL accept
`autonomous?: boolean` (left out of the agent tool catalog unless the session
is allowed, REQ-agent-117 / SAFE-9). `PluginHandlerArgs` and `runPlugin`
options SHALL accept optional `tier` and `signal`, passed through to the
handler unchanged when given.

The `delegate` command SHALL declare `dangerous: false`, `minTier: 2` and
`autonomous: true` (PLUGIN-2). Its handler SHALL, in order: parse
`[--skill NAME] [--tier read|tool|code] --task TEXT` (or positional text; the
skill is a short lowercase `[a-z0-9_-]` label; `--task` takes the next item
even when it starts with `-`) and exit 1 on a usage error; refuse with exit 2
and without spawning when the cwd's project has not enabled autonomous mode
(AUTONOMOUS-1), when the delegation depth cap is reached, when the lead's tier
(the handler `tier`, else `CORVIDINHO_LLM_TIER`, default `tool`) is below
code, or when the concurrency / per-run budget is spent; otherwise run one
worker (REQ-agent-117) in the plugin cwd with the lead's allowlist and abort
signal. The result data SHALL carry `skill`, `tier`, `tierClamped`, `depth`,
`exitCode`, `state`, `summary`, `filesChanged` and, when present,
`totalTokens`, `timedOut`, `aborted`, so the lead can synthesize the result
(AUTONOMOUS-5). The result SHALL be ok only when the worker exits 0 in state
`done`.

Acceptance Criteria
- `delegate` is registered with dangerous=false, minTier=2, autonomous=true.
- Autonomous off, depth 2, tool tier, an omitted tier with the default env tier, and a spent budget are refused with exit 2 and spawn nothing; bad args exit 1.
- Happy path against a fake bin: argv has `task run`, `--non-interactive`, `--no-verify`, the clamped `--tier`, and `--task` last with the skill / depth provenance header; env has depth 1, the worker tier, non-interactive, the lead allowlist, ADMIN 0 and no confirm tokens; data carries skill / tier / depth / state / filesChanged.
- A failed worker yields ok=false with its exit code and a SAFE-6 scrubbed summary.
