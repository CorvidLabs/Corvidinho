---
module: cli
change: work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9
---

# Delta: cli (task run wires the /work review hook — GITHUB-9)

## Added

### REQUIREMENT REQ-cli-092

Before the PR, a second model reviews the diff in bounded rounds, and the PR
lists what it raised and what changed (GITHUB-9); with no second model
there's no PR and the reply says why (GITHUB-9.a). `task run` SHALL pass
`runTask` the `/work` review hook (`workReviewHook` over
`createTaskExecute`'s `review` and `takeSpendAsk`, REQ-agent-092 /
REQ-plugins-092) exactly when `workReviewApplies(env, allowlist)`: the run's
surface stamp is `work` (`CORVIDINHO_ACTING_SURFACE`), the /work bit is set
(`CORVIDINHO_ACTING_WORK_TASK`), the role cap is owner or team
(`actingRoleCap`, `CORVIDINHO_ACTING_ROLE`), it is no `delegate` or
`council` worker (delegation depth 0), and the plugin allowlist has
`git-push` and `github-pr-create` (GITHUB-5), so no review is spent on a PR
that cannot open. Every other run — chat, `/session`, schedules, WATCH, a
local `task run`, workers — gets no hook. No new flag, env var or config
key.

Acceptance Criteria
- `workReviewApplies` is true for an owner and a team `/work` stamp with both plugins allowlisted, and false for community, another surface, no /work bit, a worker (`CORVIDINHO_DELEGATE_DEPTH=1`), no stamps, or either plugin missing from the allowlist.
