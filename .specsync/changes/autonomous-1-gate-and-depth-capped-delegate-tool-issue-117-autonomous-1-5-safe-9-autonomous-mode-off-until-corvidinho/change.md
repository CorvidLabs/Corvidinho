---
id: autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho
state: implementing
type: feature
base_commit: 554357fbf27b524e32cfcd29377d3c38557883e3
---

# AUTONOMOUS-1 gate and depth-capped delegate tool (issue #117, AUTONOMOUS-1/5, SAFE-9): autonomous mode off until [corvidinho.autonomous] enabled = true in the project fledge.toml; a code-tier lead can delegate a skill-tagged subtask to a worker (child task run, same-or-lower tier, non-interactive, depth <= 2, capped fan-out) and synthesize its summary; delegate stays hidden from the tool catalog unless the session is allowed

## Intent

AUTONOMOUS-1 gate and depth-capped delegate tool (issue #117, AUTONOMOUS-1/5, SAFE-9): autonomous mode off until [corvidinho.autonomous] enabled = true in the project fledge.toml; a code-tier lead can delegate a skill-tagged subtask to a worker (child task run, same-or-lower tier, non-interactive, depth <= 2, capped fan-out) and synthesize its summary; delegate stays hidden from the tool catalog unless the session is allowed

## Affected Canonical Specs

- `agent`
- `plugins`

## Acceptance Criteria

- Autonomous mode is off unless the project fledge.toml sets [corvidinho.autonomous] enabled = true (AUTONOMOUS-1); the delegate tool is absent from the task-run tool catalog unless the session is allowed (autonomous enabled, code tier, delegation depth below the cap) (SAFE-9); a code-tier lead can call delegate with a skill label and a subtask, which runs a child corvidinho task run (bun --no-env-file, non-interactive, ndjson; like every product spawn it keeps prove-before-done, no --no-verify per REQ-cli-085) at the same or lower tier with the depth counter incremented and returns the worker summary, tier, depth and filesChanged for the lead to synthesize (AUTONOMOUS-5); depth >= 2, tier above parent, concurrent children > 2 or more than 4 children per run are clamped or refused; fake-bin tests prove argv, env, clamp, gate and refusal paths with no network

## No-spec Rationale

Not applicable
