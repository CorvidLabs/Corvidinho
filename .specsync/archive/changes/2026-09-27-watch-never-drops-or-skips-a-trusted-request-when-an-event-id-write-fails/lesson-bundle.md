# Lesson bundle — watch-never-drops-or-skips-a-trusted-request-when-an-event-id-write-fails

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: WATCH never drops or skips a trusted request when an event-id write fails
- **Kind**: BugFix
- **Specs**: watch
- **Paths**: src/watch/poller.ts, src/watch/ack.ts, src/watch/summary.ts, tests/watch.dedup-durable.test.ts
- **Acceptance**: An event whose id write fails is logged 'not marked, retried next cycle', runs nothing, and is handled exactly once by the next cycle even when an immediate retry of the write would have succeeded; a failed acked or summarized id write after the comment is posted is logged and the agent run and summary still happen once; tests/watch.dedup-durable.test.ts covers both and fails on the previous code

## Evidence

- Verification commit: `6830514555bd0426ceea77ebff63c333c3ba6cc2`
- Base commit: `f834cc942785d33825f5a13dfa687961925257fc`
- Verified by: `specsync check --spec watch`

## From the change's context.md

# Context

Adversarial review of PR #195 (watch-github-3, REQ-watch-247) found two gaps
in its failure handling for the new DB-backed event-id stores:

- The per-event catch re-ran `processed.addMany` whenever the event was not
  yet marked, including when the id write itself had just failed. If the lock
  cleared a moment later, the retry succeeded, the event was logged
  "marked processed" and never ran or retried: a trusted request was lost,
  against REQ-watch-247's own acceptance criterion ("the next cycle handles it
  once").
- `maybePostWatchAck` writes the acked id after posting the ack comment. With
  a DB store that write can now throw (e.g. SQLITE_BUSY past the 5 s busy
  timeout). The throw left the per-event try, so the agent run was skipped for
  a request that had already been told "on it", and the processed mark kept it
  from ever running. `maybePostWatchSummary` had the same shape (after the
  summary comment; nothing else was skipped there, but the error was thrown).

HI / rules: REQ-watch-247, REQ-watch-037 (one failing event never aborts the
cycle), REQ-watch-009 / WATCH-RELIABILITY-1 (summary once after a successful
ack), ALLOW-1 unchanged.

Constraints: no schema change, no new env vars, CLI flags or slash commands.
Routing failures (before the id write) keep REQ-watch-037's "marked processed"
behaviour so a deterministic router error is not retried forever.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-247` | `tests/watch.dedup-durable.test.ts` | "an id write that fails once and would succeed on retry still leaves the event for the next cycle": cycle 1 runs nothing and logs `not marked, retried next cycle`, the id is not recorded, cycle 2 runs it once, cycle 3 sees `new=0`. "a failed acked/summarized id write after the comment is posted still runs the agent once": the agent runs once, ack + summary are posted, both write failures are logged, nothing reaches logError, the next cycle sees `new=0`. Both fail on the PR #195 sources (logged "marked processed"; 0 agent runs) and pass after. The 6 earlier REQ-watch-247 tests still pass. |
| `REQ-watch-037` | `tests/watch.session-store.durable.test.ts` | "a failing event is logged and marked processed; later events still run" (routing failure) still passes. |
| `REQ-watch-009` / `REQ-watch-231` | `tests/watch.reliability.test.ts`, `tests/watch.summary-scrub.test.ts` | Summary-once and scrubbed-summary tests still pass after the merge of origin/main. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean.

## Where these lessons go

- `specs/watch/context.md`
