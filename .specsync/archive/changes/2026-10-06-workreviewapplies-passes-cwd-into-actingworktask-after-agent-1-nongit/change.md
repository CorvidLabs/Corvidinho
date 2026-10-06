---
id: workreviewapplies-passes-cwd-into-actingworktask-after-agent-1-nongit
state: implementing
type: bug_fix
base_commit: 10b5fcaf98abcfb302574ce854e4989c73574677
---

# WorkReviewApplies passes cwd into actingWorkTask after AGENT-1 nongit

## Intent

workReviewApplies passes cwd into actingWorkTask after AGENT-1 nongit

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- workReviewApplies(env, allowlist, cwd) forwards cwd to actingWorkTask; taskRunIn passes its run cwd; bunx tsc --noEmit is clean on tip

## No-spec Rationale

Call-site fix only: actingWorkTask gained cwd in #351; workReviewApplies must forward the run cwd. No requirement text change.
