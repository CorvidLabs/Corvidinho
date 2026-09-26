---
id: watch-never-drops-or-skips-a-trusted-request-when-an-event-id-write-fails
state: approved
type: bug_fix
base_commit: f834cc942785d33825f5a13dfa687961925257fc
---

# WATCH never drops or skips a trusted request when an event-id write fails

## Intent

WATCH never drops or skips a trusted request when an event-id write fails

## Affected Canonical Specs

- `watch`

## Acceptance Criteria

- An event whose id write fails is logged 'not marked, retried next cycle', runs nothing, and is handled exactly once by the next cycle even when an immediate retry of the write would have succeeded; a failed acked or summarized id write after the comment is posted is logged and the agent run and summary still happen once; tests/watch.dedup-durable.test.ts covers both and fails on the previous code

## No-spec Rationale

Not applicable
