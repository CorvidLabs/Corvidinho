---
id: workreviewapplies-passes-cwd-into-actingworktask-after-agent-1-nongit
state: draft
type: bug_fix
base_commit: 10b5fcaf98abcfb302574ce854e4989c73574677
---

# WorkReviewApplies passes cwd into actingWorkTask after AGENT-1 nongit

## Intent

workReviewApplies passes cwd into actingWorkTask after AGENT-1 nongit

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- <!-- TODO: add observable acceptance criteria -->

## No-spec Rationale

Call-site fix only: actingWorkTask gained cwd in #351; workReviewApplies must forward the run cwd. No requirement text change.
