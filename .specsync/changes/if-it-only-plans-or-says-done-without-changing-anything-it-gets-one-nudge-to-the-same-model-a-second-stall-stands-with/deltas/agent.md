---
module: agent
change: if-it-only-plans-or-says-done-without-changing-anything-it-gets-one-nudge-to-the-same-model-a-second-stall-stands-with
---

# Delta: agent (a plan-only or empty 'Done.' reply that changed nothing gets one nudge — AGENT-17, nudge half)

## Added

### REQUIREMENT REQ-agent-087

If it only plans, or says 'Done.' without changing anything, it gets one
nudge (AGENT-17, captured on main from Leif's 2026-09-28 interview, round 2:
"If it only plans, or says 'Done.' without changing anything, it gets one
nudge, then moves to a stronger model I've configured."; this builds the
nudge half; moving to a stronger model is not built). When the task-run tool
loop (`runToolLoop`, every surface's `task run`: CLI, Discord chat,
`/session`, `/work`, button and Answer resumes, schedules, WATCH, delegate
and council workers) gets a final reply (no tool calls, after the MEMORY-9
recall follow-up), it SHALL nudge only when all of these hold:
`stallKind(content)` (`src/agent/loop-guards.ts`) is `plan` or
`done-claim`; the tier is not `read`; no tool result of the run tripped
SAFE-13; the round's catalog offers a tool for which `isStateChangingTool`
is true (a `STATE_CHANGING_TOOLS` builtin or a Fledge plugin command, the
same test `changedState` applies to a successful result); and
`nothingChanged` holds: no tool result of the run was a change by
`changedState` (the repeat guard's `sawChange()`, across the run's
attempts), no tool ran in the attempt whose edits no result reports, and,
where the run has a git snapshot, the verify gate's real diff since its
baseline (`ExecuteContext.workspaceChanged`, which `runTask` passes from
its `WorkspaceDiffTracker.changed`) is empty; a diff that is null or throws
counts as a change. The diff is read only for a reply that stalls.

The nudge SHALL be `stallNudge(kind, askOffered)` added as a user message
to the same conversation, sent to the same model through the run's existing
model chain (no new call path; the AGENT-11 fallback and the SAFE-8 spend
guard are unchanged): harness text starting `[Corvidinho harness —
AGENT-17]` that says the reply only described a plan, or said the work is
done (or said nothing), while nothing has changed, and tells the model to make
the changes now with its tools, or reply with what it checked and found, or,
when `ask-human` is offered, call `ask-human`. It SHALL NOT use up a tool
round, and one Text event `[operator] AGENT-17: the reply was <only a plan |
a 'Done.'-style or empty claim> with nothing changed; nudged once (same
model)` is emitted. A run SHALL get at most one nudge
(`createStallNudgeGuard`, one per `createTaskExecute`, across verify
retries). A stall after that SHALL stand as the reply, with one Text event
`[operator] AGENT-17: the reply was … with nothing changed, after the nudge;
the reply stands (moving to a stronger model is not built yet)`: no ask, no
error, no other change to the result.

`stallKind(text)` SHALL be a narrow English heuristic: `done-claim` for an
empty reply, or a whole reply of at most `STALL_DONE_MAX_CHARS` (60)
characters that is a "Done."-style claim ("Done.", "All done!", "Task
complete.", "It's done now.", "I've done it.", "Changes made.", with leading
and trailing punctuation or emoji ignored); `plan` for a reply of at most
`STALL_PLAN_MAX_CHARS` (600) characters whose every sentence or line is a
step of a plan, the first opening with "I'll", "I will", "I'm going to",
"Let me" (and similar) and a work verb (add, check, edit, fix, look, read,
run, update, write, …) or a "Plan:" / "My plan:" heading, later ones being
such openers, "then …" steps, list items or bare work verbs; else null. It
SHALL be null for any reply with a "?" (a clarifying question, AUTONOMY-1),
a code fence, "let me know" or an offer ("if you want", "would you like",
"shall I", "feel free"), a decline ("can't", "won't", "unable", "sorry", …,
AUTONOMY-7), "toy", "demo" or "joke" (AUTONOMY-7), a deferral ("later",
"soon", "tomorrow"), and for answers and social replies ("Yes, it's done.",
"Let me check… yes: …", "Thanks!", "I'll be here."). Constants, no knob: no
env var, config key, flag, HumanAsk reason, NDJSON field or schema change is
added.

Acceptance Criteria
- `stallKind` is `done-claim` for "", "Done.", "All done!", "Done! ✅", "Task complete.", "It's done now.", "I've done it." and "Changes made."; `plan` for "I'll update src/cli.ts to add the flag, then run the tests.", "Let me look at the failing test first.", a "Plan:" list of work steps and "First, I'll read the file. Then I'll fix it."; null for a Q&A answer, "Let me check the file. It has 3 functions.", "Yes, it's done.", social replies, a deferral, clarifying questions, "let me know" and offers, AUTONOMY-7 declines (witty ones included) and toy demos, code, and replies over the length caps.
- `nothingChanged` is false for a change seen, an unreported edit, a non-empty, null or throwing diff, and true for none of those; `isStateChangingTool` is true for every `STATE_CHANGING_TOOLS` builtin and a Fledge plugin command and false for reads, `web-fetch`, `council` and `ask-human`.
- A code-tier run (catalog offers `files-write`) whose model says "Done." with nothing changed makes a second request to the same model whose last message is the `[Corvidinho harness — AGENT-17]` user message, after the stalled reply; the model's next answer is the summary; one `nudged once (same model)` operator line.
- A plan-only reply is nudged; a model that then makes a real change ends with that change's files and its reply.
- An empty reply is nudged.
- A second stall after the nudge stands (summary "Done.", no ask, no error) with the `the reply stands` operator line; exactly two requests.
- A later attempt of the same run that stalls stands without a second nudge.
- Q&A, social replies, clarifying questions, "let me know", AUTONOMY-7 declines and toy demos make one request and are never nudged.
- A tool-reported file change, or a Fledge plugin command's success, before "Done." means no nudge.
- With `workspaceChanged`: a non-empty or null diff means no nudge, an empty one a nudge; the diff is not read for a reply that does not stall.
- No nudge on the tool tier (no state-changing tool offered), on the read tier, or after a SAFE-13 trip.
- `runTask` with a stubbed git diff: a non-empty diff (an edit no tool reported) means no nudge and the gate verifies; an empty one means the nudge and nothing to verify.
- The real CLI (`task run --output ndjson`, localhost fake LLM always saying "Done.") exits 0 after exactly two LLM requests, the second carrying the nudge, with both operator lines and a `done` result whose summary is "Done.".
