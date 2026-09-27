---
id: task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho
state: approved
type: feature
base_commit: 0940db343de30fdb4d79d83cfa44b95c5a247681
---

# Task run offers allowlisted dangerous tools to the model: a dangerous plugin enters the catalog only when CORVIDINHO_ALLOWLIST names it (tier, role and SAFE-9 filters unchanged); shell-exec and the node/python/cargo runners stay out pending the SAFE-3 decision; a non-git run whose Fledge command may have changed files verifies anyway (CLI-3, GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3, AGENT-4)

## Intent

task run offers allowlisted dangerous tools to the model: a dangerous plugin enters the catalog only when CORVIDINHO_ALLOWLIST names it (tier, role and SAFE-9 filters unchanged); shell-exec and the node/python/cargo runners stay out pending the SAFE-3 decision; a non-git run whose Fledge command may have changed files verifies anyway (CLI-3, GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3, AGENT-4)

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- A task run (tool/code tier) offers a dangerous plugin to the model only when CORVIDINHO_ALLOWLIST (the run's allowlist) names it and its minTier fits the tier; unlisted dangerous plugins stay out of the catalog and a model call to one is refused as not offered; shell-exec, node-exec, python-exec and cargo-exec are never offered from the allowlist (SAFE-3 decision pending); a non-ADMIN role session (Discord non-owner, WATCH, schedules, council voices) still gets no dangerous or mutating tool; Fledge commands are discovered only when the allowlist names a fledge-* command and an allowlisted one is offered and runs; with no git work tree, an attempt that ran a Fledge command (or shell / runner) that reports no filesChanged still runs the verify lane and never ends done on a failed lane; tests fail on main and pass on the branch.

## No-spec Rationale

Not applicable
