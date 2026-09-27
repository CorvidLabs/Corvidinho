# Lesson bundle — verify-retry-feedback-keeps-the-failing-step-s-output-failing-step-name-error-lines-end-of-the-log-instead-of-the-first

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Verify retry feedback keeps the failing step's output (failing step name, error lines, end of the log) instead of the first 4000 chars of the lane log (AGENT-4.a, #85)
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: src/agent/verify.ts, src/agent/loop.ts, src/agent/execute.ts, tests/agent.loop.test.ts, tests/agent.tool-loop.test.ts, tests/agent.verify-feedback.test.ts, tests/fixtures/verify-lane-log.ts
- **Acceptance**: After a failed verify with retries left, the retry's verifyFeedback and the model's user message (tool loop and read-tier chat) keep the failing step's output instead of the first 4000 chars of the lane log: a lane log over the cap (fledge log is stdout then stderr, so passing steps such as the --help smoke fill the head) yields at most 4000 chars naming the failing step (from fledge's Lane '<lane>' failed at step N (<name>) line), carrying that step's output from its Running task marker when it fits, else its error/fail lines (first ones first, passing-test lines excluded) plus the end of the log with fledge's failure line; output within the cap is sent unchanged as today; never over 4000 chars, never half a surrogate pair; no new flag, env var, config key, slash command, schema or package version change; the human-facing summary and NDJSON frames are unchanged; regression tests fail on main and pass on the branch

## Evidence

- Verification commit: `9de5a86ae9294b2029be05ed8ab49cd4ff3cad14`
- Base commit: `fbaa84b7cda1bf2b462baea44cad20ef93e0df4f`
- Verified by: `specsync check --spec agent`

## From the change's context.md

# Context

HI: AGENT-4.a (hi/agent.md) — "If verification fails and retries remain, it
keeps working with the failure output instead of shrugging." Parent AGENT-4,
issue #85 (lists AGENT-4.a as captured).

Gap on main (fbaa84b): `defaultVerifyRunner` returns
`${stdout}${stderr}` (src/agent/verify.ts), `runTask` passes the whole of it
as `verifyFeedback` (src/agent/loop.ts), and the LLM execute sends
`verifyFeedback.slice(0, 4000)` to the model in both the tool loop and the
read-tier chat (src/agent/execute.ts). Corvidinho's own verify lane runs
`lint` and `smoke` (`bun src/cli.ts --help`, about 4400 chars on stdout)
before `test`, and bun test writes its failures to stderr, so the first 4000
chars are the fledge lane header plus the `--help` text. A failing test
never reached the model on a retry: it retried blind.

Reproduced with a scratch fledge lane of the same shape (fledge 1.8.0, bun
1.4.2): a failing `test` step after the real `--help` smoke gave a 5178-char
log whose first 4000 chars held no `error:` line, no `(fail)` line and no
`Lane 'verify' failed at step 3 (test)` line.

Constraints: no new flag, env var, config key or slash command; no SQLite
schema or package version change; the human-facing summary, the NDJSON
`VerifyResult` frame and the verify argv / env are unchanged.

## From the change's design.md

# Design

- **`verifyFeedbackExcerpt(output, max = VERIFY_FEEDBACK_MAX_CHARS)`** in
  src/agent/verify.ts (next to the runner whose output format it reads).
  Output within `max` is returned unchanged. Over it:
  1. The failing step comes from the last fledge `Lane '<lane>' failed at
     step N (<name>)` line; the section starts at the last `Running task:
     <name>` marker for it (else the last marker, else the start). Steps run
     in order and stderr follows stdout, so the section holds the failing
     step's stdout and the lane's stderr.
  2. A header line says the log was over the cap and this is the failing
     step's output, then `Failing step: <name> (step N of lane '<lane>')`.
  3. If the section fits, it is kept whole.
  4. Else: error / fail lines from the section before the tail (regex
     `error|fail|panic|fatal|exception|expected|received|✗✘✖`, lines
     starting `(pass)`, `(skip)`, `(todo)`, `✓` or `✔` left out, deduped,
     each at most 300 chars) get up to half the room, and the end of the log
     gets the rest (at least half), starting at a line start when one is
     within 200 chars. Lines that report a failure (starting `(fail)`, `✗`,
     `error`, `TypeError`, `Expected`, `Received`, `failed`, `panic`, `fatal`,
     or `: error` / `: fatal` after a location, as tsc prints) take the room
     first, then lines that only mention one; each group first ones first;
     kept lines print in log order. Corvidinho's own `bun test` prints about
     41 KB of test console output on stdout (after the `test` marker, before
     bun's stderr report), some of it "… marked failed" / "error_class=ok":
     without the ranking that chatter filled the room and the failure fell
     out (review finding). No error lines: header plus the end of the log.
  5. Never longer than `max`, never cut inside a surrogate pair; a `max` too
     small for the header gives just the end of the log.
  6. Colour escapes (CSI) are dropped first when the output is over the cap
     (FORCE_COLOR / CLICOLOR_FORCE reaching the lane), so the markers and
     `(pass)` lines still match; a `parallel(a, b)` step matches its
     `Running parallel: a, b` line. With no fledge line and no marker, the
     header says only that the start is left out.
- **`runTask`** builds `verifyFeedback` as the fixed "Verification failed.
  Fix these errors and try again:" head plus the excerpt at `max - head`, so
  the whole feedback is within 4000 chars and keeps its head.
- **LLM execute** (tool loop and read-tier chat) replaces
  `verifyFeedback.slice(0, 4000)` with `verifyFeedbackExcerpt(verifyFeedback)`:
  a no-op for `runTask`'s feedback, and a caller that passes a raw long log
  gets the failing step instead of the head.
- **Unchanged:** the runner (argv, env, process group, stdout then stderr),
  `VerifyResult.output`, the `VerifyResult` event / NDJSON frame, the
  exhausted-retries summary and the provider-error summary (human facing, full
  output), CLI's 500-char operator echo of the feedback.
- **Chosen conservatively (pending Leif):** the cap stays 4000 chars (no new
  config key); the excerpt relies on fledge's own markers and falls back to
  the end of the log for any other runner; short output is sent whole as
  today.

## From the change's testing.md

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

## Where these lessons go

- `specs/agent/context.md`
