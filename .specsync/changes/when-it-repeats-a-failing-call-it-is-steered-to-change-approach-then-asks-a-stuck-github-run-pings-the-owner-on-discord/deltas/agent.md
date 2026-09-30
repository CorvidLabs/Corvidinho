---
module: agent
change: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
---

# Delta: agent (a repeated failing call is steered to change approach, then asks — AGENT-16)

## Added

### REQUIREMENT REQ-agent-086

When it repeats a failing call, it changes approach or asks me (AGENT-16,
captured from Leif's 2026-09-28 interview, round 2). The task-run tool loop
(`runToolLoop`, every surface's `task run`: CLI, Discord chat, `/session`,
`/work`, button and Answer resumes, schedules, WATCH, delegate and council
workers) SHALL keep one repeat-failure guard per `createTaskExecute`
(`createRepeatFailureGuard`, `src/agent/loop-guards.ts`), so its counts
last across the verify-retry attempts of one run. A call's identity SHALL be
`callSignature`: the tool name plus the canonical argv
(`argvFromToolArguments`, so `{"argv":["a"]}` and `["a"]` are one call).
Every tool result with `ok: false` SHALL count as a failure of its call,
refusals included (not offered, role, SAFE-1, SAFE-13, SAFE-21, a denied or
unanswered approval, an `ask-human` with no question, a thrown handler).
`changedState(name, result)` SHALL be the single "something changed"
predicate: true when the result's data reports `filesChanged` (ok or not), or
when a tool in `STATE_CHANGING_TOOLS` (file writes, git writes, GitHub
writes, Discord posts and files, memory forget / override, `delegate`, the
shell, the language runners and `fledge-run`) or a Fledge plugin command
(`origin` `fledge:`) succeeds; never for `NO_STATE_CHANGE_TOOLS`
(`web-fetch`, `danger-ping`, `fledge-lanes-run`, `council`) or a read.
Every dangerous or mutating builtin SHALL be in exactly one of the two sets.
A change SHALL reset every count; a call's own success SHALL reset its own.

The 2nd failure of the same call with nothing changed in between
(`STEER_AFTER_FAILURES`, 2) SHALL get `repeatFailureSteer` appended after
its whole tool message (after any SAFE-12 fence or SAFE-13 note, the result
and any SAFE-21 "why" text left intact): harness text quoting a scrubbed,
one-line error excerpt of at most `STEER_ERROR_EXCERPT_MAX` (200) chars as a
JSON string (or, when the result was fenced as untrusted data because a
`delegate` / `council` worker reported an injection, `STEER_FENCED_ERROR_NOTE`
and no piece of the error, SAFE-12) and telling the model to change approach
(a different tool or different arguments) or call `ask-human`, and that the
same call again stops the run and asks the owner. Each later failure of that
call gets it too. An
identical call made in a later round of the same conversation after its steer
went out SHALL NOT run: one `ToolResult` (success false,
`REPEAT_FAILURE_BLOCK_DETAIL`) and one `[operator] AGENT-16` Text line
(scrubbed error excerpt) are emitted, and the attempt SHALL end with
`askExecuteResult(repeatedFailureAsk(label))`: the existing `stuck` reason,
question `The same <label> call keeps failing with nothing changed in
between. How should I proceed?`, where `label` is the offered tool name or
`UNKNOWN_TOOL_LABEL`, never error text or a refused plugin's name; `runTask`
then ends `blocked` with that ask and no verify, and each surface's existing
stuck path pings the owner (AUTONOMY-2/4). A steer the model has not seen yet
(an identical call in the same `tool_calls` batch, or the first identical
call in a fresh verify-retry conversation, `newConversation`) SHALL mean the
call runs and gets the steer again, never the ask. Thresholds are constants:
no env var, config key, flag, HumanAsk reason or NDJSON field is added. Not
built (not captured): a windowed "3 in 20 calls" count, did-you-mean for
unknown tool names, and a prefer-plugin steer.

Acceptance Criteria
- `callSignature` is equal for argv spellings of one call and differs for other args or tools.
- Every registered dangerous or mutating builtin is in exactly one of `STATE_CHANGING_TOOLS` / `NO_STATE_CHANGE_TOOLS`; a successful write, a failed `delegate` that reports `filesChanged` and a Fledge plugin command's success are changes; a failed write, reads, `web-fetch`, `council`, `danger-ping` and `fledge-lanes-run` are not.
- A tool that always fails, called three rounds in a row with the same argv: the 1st tool message has no steer, the 2nd ends with the steer (scrubbed error, after the whole result), the 3rd call never runs and the attempt ends with `repeatedFailureAsk("flaky-read")`, a `ToolResult` with `REPEAT_FAILURE_BLOCK_DETAIL` and an `[operator] AGENT-16` line whose error excerpt is scrubbed.
- Three identical failing calls in one batch all run (2nd and 3rd steered); the next round's identical call asks.
- After the steer, a call with different arguments runs and the model's final reply stands (no ask).
- A real change between failures resets the count: two more identical failures are needed for the steer, then the ask.
- A `council` worker that fails twice with an injection hit: its error stays inside the fence and the steer after it says `STEER_FENCED_ERROR_NOTE`, quoting none of the worker's text.
- A tool outside the catalog repeated after the steer asks with `(unknown tool)`; the summary names neither the tool nor the refusal.
- A verify retry (new conversation) whose first call repeats a call that failed twice in attempt 1 runs it and steers; its next identical call asks.
- `runTask` with that execute ends `blocked`, `ask` = the stuck ask, verified false, verify never called.
- The real CLI (`task run --output ndjson`, localhost mock LLM repeating a missing `files-read`) exits 0 with a `blocked` result frame whose `ask` is the stuck ask after exactly three LLM requests.
