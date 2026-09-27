---
change: verify-retry-feedback-keeps-the-failing-step-s-output-failing-step-name-error-lines-end-of-the-log-instead-of-the-first
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-002` | `tests/agent.loop.test.ts` | "a lane log whose passing steps fill the first 4000 chars still gives the retry the failing step's output (AGENT-4.a)": the fixture log (lint, a 4400-char `--help` smoke, then a failing bun test) fails verify once; attempt 2's `verifyFeedback` starts with the "Verification failed" head, is at most 4000 chars, names `Failing step: test (step 3 of lane 'verify')`, carries `error: expect(received).toBe(expected)`, `Expected: 7` / `Received: 6`, `(fail) sum of three` and fledge's failure line, and not the `--help` head. On main: the whole 5000+ char log, no failing-step line. |
| `REQ-agent-002` | `tests/agent.tool-loop.test.ts` | "tool loop: after a lane whose --help smoke fills the first 4000 chars, the retry request carries the failing test": real `createTaskExecute` (tool tier, mock provider) under `runTask`; the second request's user message holds the failing step and its error lines within 4000 chars, not the `--help` head. On main: the first 4000 chars, lane header and `--help` only. |
| `REQ-agent-002` | `tests/agent.tool-loop.test.ts` | "read tier: a raw feedback over the cap is cut to the failing step and the end, not its first 4000 chars": both failures (first as error lines, second in the end of the log) and fledge's line reach the read-tier chat. On main: the head only. |
| `REQ-agent-002` | `tests/agent.verify-feedback.test.ts` | `verifyFeedbackExcerpt`: output within the cap unchanged (and the cap is 4000); the fixture log keeps the failing step whole and drops the `--help` head; a failing step over the cap keeps its first error lines and the end of the log, no `(pass)` lines among error lines; no fledge markers keeps the end; never over the cap nor half a surrogate pair across inputs and caps 80 to 5001. Cannot load on main (no export). |
| `REQ-agent-002` | `tests/agent.verify-feedback.test.ts` | Review additions, each failing on the first cut of this branch (d43ac3e's `verify.ts`) and passing now: "log lines that only mention a failure do not crowd out the failure itself" (`chattyFailingLaneLog`: 20 × "… marked failed" / "error_class=ok" chatter on stdout, the failure mid-stderr; before, the error lines were all chatter and the failure was dropped); "colour escapes (FORCE_COLOR reaching the lane) are dropped and do not hide the markers"; "a failing parallel step is named whole and starts at its Running parallel line"; the no-marker case no longer says "failing step". |
| `REQ-agent-002` | `tests/agent.loop.test.ts`, `tests/agent.tool-loop.test.ts` | Guards (pass on main and branch): "a verify output within the cap reaches the retry whole (AGENT-4.a)"; "a feedback within the cap is sent whole"; the existing "verify fail then pass retries with feedback (AGENT-4.a)" and shell-exec retry tests. |
| `REQ-agent-003`, `REQ-agent-085`, `REQ-agent-242`, `REQ-agent-244` | `tests/agent.loop.test.ts`, `tests/agent.tool-loop.test.ts`, `tests/agent.ask.test.ts` | Existing skip, real-diff, union, provider-error and abort tests still pass. |

Fail-on-main proof: with origin/main's `src/agent/verify.ts`, `loop.ts` and
`execute.ts` swapped in, the three files run 67 pass / 4 fail (the three
behaviour tests above, plus tests/agent.verify-feedback.test.ts failing to
load); with only main's `loop.ts` and `execute.ts`, 72 pass / 3 fail (the
three behaviour tests). Restored: 75 pass / 0 fail. After the review
additions (four more unit tests): main's `loop.ts` and `execute.ts` only,
75 pass / 3 fail; all three of main's files, 67 pass / 4 fail (the unit file
cannot load); d43ac3e's `verify.ts` with the rest of the branch, the four
review tests fail; the branch, 78 pass / 0 fail.

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check
--require-coverage 100` and `fledge lanes run verify --non-interactive`.
