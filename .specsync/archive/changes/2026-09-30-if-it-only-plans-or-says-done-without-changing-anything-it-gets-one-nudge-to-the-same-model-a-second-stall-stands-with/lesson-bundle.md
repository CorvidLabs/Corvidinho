# Lesson bundle — if-it-only-plans-or-says-done-without-changing-anything-it-gets-one-nudge-to-the-same-model-a-second-stall-stands-with

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: If it only plans or says 'Done.' without changing anything, it gets one nudge to the same model; a second stall stands with an operator note (AGENT-17, nudge half)
- **Kind**: Feature
- **Specs**: agent
- **Paths**: src/agent/loop-guards.ts, src/agent/execute.ts, src/agent/loop.ts, src/agent/types.ts, tests/agent.stall-nudge.test.ts, tests/fixtures/fake-llm.ts, tests/agent.safe3a-owner-shell.test.ts, tests/scheduler.owner-role.test.ts, specs/agent/agent.spec.md, specs/agent/testing.md, docs/discord.md
- **Acceptance**: AGENT-17 (captured on main, Leif's 2026-09-28 interview round 2), the nudge half, holds: in every task run (chat, /session, /work, buttons, schedules, WATCH, delegate and council workers, the CLI) a final reply that the narrow stallKind heuristic calls only a plan or a short 'Done.'-style or empty claim gets exactly one harness nudge to the same model (a user message starting [Corvidinho harness — AGENT-17], never using up a tool round) when the round's catalog offers a state-changing tool, no SAFE-13 trip, not the read tier, and nothing changed (the verify gate's real git diff where there is a git tree, unreadable = changed, plus the changedState predicate over every tool result and any tool whose edits no result reports); one nudge per run; a second stall stands with an [operator] AGENT-17 Text note (no stronger-model step yet); Q&A, social replies, clarifying questions (AUTONOMY-1), 'let me know' and offers, AUTONOMY-7 declines and toy demos, and code are never nudged; tests/agent.stall-nudge.test.ts fails on the base sources and passes on the branch

## Evidence

- Verification commit: `06d61ae8d33497d11b13212750d0acbd050d5281`
- Base commit: `81ceb4a1423189b50ce25df34363b26b50426d1d`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

Issue #86 (M3 "Real dev teammate"), slice loop-guards-b of the M3/M4 plan.
AGENT-17 is already captured in `hi/agent.md` from Leif's 2026-09-28
interview (round 2: "plan-only / empty 'Done.' → one nudge, then next
stronger configured model"); this PR captures nothing new. It builds the
nudge half. Moving to a stronger model is slice loop-guards-c and waits for
Leif to say what "stronger" means, so AGENT-17 stays partial.

What was wrong on main (81ceb4a): `runToolLoop` (src/agent/execute.ts)
returned the model's first reply with no tool calls as the run's answer. A
model that stopped after only planning ("I'll update README.md, then run the
tests.") or said "Done." (or nothing) with nothing changed ended the run
there. In a non-git or clean tree, `runTask` then found nothing to verify
and reported the run `done`. corvid-agent's cheap-model runs failed like
this (ca#1718, ca#1747; issue #86).

Constraints: specs only through SpecSync; #325's model-chain / fallback
code and #328's spend guard in `runToolLoop` stay as they are (only the
final-reply handling changes); spend-card's `createTaskExecute`
spend-guard wiring is being built in parallel and is not touched; reuse
#313's `changedState` predicate (no parallel one) and the #308/#321 verify
gate's real diff; constants, no knob; v1 off-chain; #232/#233 untouched.
Conservative defaults come from /home/user/coord/m34-defaults.md (slice
loop-guards) and /home/user/coord/pr-loop-guards-b.json, and are listed in
the PR under "Design choices pending Leif".

## From the change's design.md

# Design

- **Pure helpers** in `src/agent/loop-guards.ts` (next to AGENT-16):
  `stallKind(text, task?)` → `"plan" | "done-claim" | null` (with
  `planWanted(task)`); `changedForStall` and `STALL_CHANGE_TOOLS`;
  `nothingChanged` (async, takes the diff probe); `stallNudge`,
  `stallNudgedNote`, `stallStandsNote`; `createStallNudgeGuard`
  (`changed()` / `sawChange()`; `next()` → `"nudge"` once, then `"stand"`).
- **One predicate.** `changedState` now calls the new
  `isStateChangingTool(name)` (`STATE_CHANGING_TOOLS` or a `fledge:`
  plugin command), which AGENT-17 also uses for "the round's catalog offers a
  state-changing tool". AGENT-17's `changedForStall` is `changedState` plus
  a successful `memory-store` / `memory-forget-me` (`STALL_CHANGE_TOOLS`):
  "remember that …" → `memory-store` → "Done!" is not a stall, and a nudge
  there would store the memory twice. The memory tools stay out of
  `STATE_CHANGING_TOOLS`, so AGENT-16's counts and the catalog check (the
  memory tools are offered on the tool tier) are unchanged.
- **"Changed"** = the stall guard's `sawChange()` (every tool result of
  every attempt of the run by `changedForStall`, file or not: a GitHub
  comment changes no file; and every tool run whose edits no result reports:
  the shell, a Fledge command, a worker), or, with a git tree, a non-empty
  real diff since the gate's baseline. The AGENT-16 repeat guard is left as
  it is on main (review: the first head kept this on the repeat guard and
  the unreported-edit set per attempt, so a failed edit in attempt 1 with
  no git tree was forgotten in attempt 2). `ExecuteContext` gains the
  optional `workspaceChanged`, which `runTask` passes from its
  `WorkspaceDiffTracker` (one line in `gate()`); no git tree ⇒ absent ⇒
  tool-reported changes decide. Unreadable diff ⇒ "changed" (no nudge when
  unsure). The diff is read only after every cheaper condition matched.
- **Wiring** (execute.ts, final-reply branch only): after the MEMORY-9
  recall follow-up and before the return, if the reply stalls, the tier is
  not read, SAFE-13 has not tripped, `roundTools` offers a state-changing
  tool and nothing changed: the first time, emit the operator line, push the
  nudge as a user message, `roundLimit += 1` (as the recall follow-up does)
  and `continue` (the next request goes through the same `callModels`, so
  the same model and chain); afterwards, emit the "stands" line and return
  as before. `createTaskExecute` makes one guard per run (next to the
  repeat guard) and passes it and `workspaceChanged` to `runToolLoop`.
- **Heuristic.** Narrow on purpose (m34-defaults): whole-reply "Done."
  patterns up to 60 chars; plans up to 600 chars where every sentence is a
  plan step opened by "I'll / I will / I'm going to / Let me + work verb" or
  a "Plan:" heading; hard exclusions for "?", code fences, "let me know" and
  offers, declines, toy / demo / joke and deferrals ("later", "next time",
  "from now on", …). No "Let's", no "I need to", no "yes"-led replies
  (Q&A), no "Here's the plan" (Q&A about plans).
- **The reply judged** is the one that would stand (`lastText`): an empty
  closing reply after an answer given beside a tool call is that answer, so
  it is not nudged; after a plan given there, it is.
- **A plan the task asked for** is Q&A: `planWanted(taskText)` ("plan",
  "approach", "outline", "how would you …", "don't change … yet", "without
  editing …", anywhere in the task text) makes a plan reply null, so a
  "what's your plan?" answer is never pushed to "make the changes now". A
  match in chat context or an issue body also turns the plan nudge off (no
  nudge when unsure). The plan nudge also says: if you were asked only for a
  plan, or not to change anything yet, change nothing and reply with the plan.
- **Alternatives rejected.** Classifying the task text as Q&A vs. work in
  general — AGENT-17 is about the reply (only the narrow "asks for a plan /
  no changes yet" check reads the task, and it can only turn a nudge off); a second `changedState` pass in the
  dispatch loop — the guard already sees every result; nudging per attempt
  — "one nudge" read as once per run (the conservative reading); escalating
  on the second stall — not built until "stronger" is decided.

## From the change's testing.md

# Testing

The fake LLM only (`tests/fixtures/fake-llm.ts`: `fakeLlmFetch` in process,
`startFakeLlm` on localhost for the real CLI in a scratch non-git project;
it can now script tool calls), test plugins registered in process, and a
stubbed `workspaceDiff` for `runTask`. No network, no real key or token,
and no test runs the repo's own verify lane.

Fail-on-base proof (base 81ceb4a): with the base's `src/agent/execute.ts`,
`src/agent/loop.ts` and `src/agent/types.ts` swapped in (the branch's
`src/agent/loop-guards.ts` kept so the imports resolve), `bun test
tests/agent.stall-nudge.test.ts tests/agent.safe3a-owner-shell.test.ts
tests/scheduler.owner-role.test.ts` gave 88 pass, 8 fail: every nudge case
(tool loop "Done.", plan, empty reply, second stall, one per run, the empty
diff; runTask's empty diff; the CLI) fails, with no second request and no
operator line. The cases that pass on the base are the pure units of the
new helpers and the "never nudged" / "no nudge" cases, which the base also
never nudges, plus the two fixture files. With only the base's
`src/agent/loop.ts` swapped in, runTask's "an edit no tool reported is in
the diff" case fails (the loop never sees the diff and nudges). With the
base's `loop-guards.ts` too, the file cannot load (`Export named
'createStallNudgeGuard' not found`). Restored: 69 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` ("stallKind: a narrow heuristic") | `done-claim` for "", whitespace, "Done.", "done", "All done!", "Done! ✅", "✔️ Done", "Task complete.", "It's done now.", "Okay, that’s fixed now.", "I've done it.", "I have finished the task.", "Changes made."; `plan` for "I'll update src/cli.ts …, then run the tests.", "Let me look at the failing test first.", "Okay, I'm going to fix …", "Sure! I’ll open a PR …", "First, I'll read the file. Then I'll fix it.", a "Plan:" numbered list and a "**My plan:**" bullet list; null for Q&A answers (incl. "Let me check the file. It has 3 functions.", "Let me check… yes: …", "Yes, it's done.", "I'll explain: …"), social replies, a deferral, clarifying questions, "let me know" and offers, AUTONOMY-7 declines (witty too) and toy demos, "Done. I updated the README.", "Let me think about it." and the fake LLM's default reply; the 60 / 600 caps. |
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` ("nothingChanged, the catalog check, the nudge text and the guard") | `nothingChanged` false for a change seen, an unreported edit, a non-empty, null or throwing diff, and for a change with an empty diff; true otherwise. `isStateChangingTool` true for every `STATE_CHANGING_TOOLS` builtin and a `fledge:` command, false for reads, `web-fetch`, `council`, `ask-human`, `memory-recall`. Nudge text starts with the mark, names the plan or the done claim, mentions `ask-human` only when offered; exact operator lines; the guard nudges once then stands. |
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` ("tool loop …") | Code tier (`files-write` offered): "Done." → 2 requests to the same model, the 2nd ending with the stalled reply then the `[Corvidinho harness — AGENT-17]` user message; the answer stands; one `nudged once (same model)` line. A plan → nudge → a real write → files and reply kept. An empty reply is nudged. Always "Done." → 2 requests, summary "Done.", no ask or error, the `the reply stands` line. Attempt 2 of the same run stalls → no second nudge. Q&A, social, a clarifying question, "let me know", an AUTONOMY-7 decline and a toy demo → 1 request, no AGENT-17 line. A tool-reported file change or a Fledge command's success before "Done." → no nudge. `workspaceChanged` `["README.md"]` or null → no nudge, `[]` → nudge; not read for a non-stall. Tool tier (no state-changing tool), read tier, and a SAFE-13 trip (stand-in `github-issue-list`) → no nudge. Fail on base. |
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` ("runTask: the verify gate's real diff reaches the tool loop") | A stubbed diff `["README.md"]` (an edit no tool reported): 1 request, the gate verifies (`LANE_PASS_OUTPUT`), `done` + verified. An empty diff: the nudge, no verify, the answer. Fails with the base's `loop.ts`. |
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` ("task run CLI …") | Real `bun src/cli.ts task run --output ndjson` at code tier in a scratch non-git dir against `startFakeLlm` always saying "Done.": exit 0, exactly 2 requests (the 2nd ends with the nudge), both `[operator] AGENT-17` Text frames, result `done` with summary "Done.". Fails on base. |
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` (review fixes) | `planWanted` and `stallKind(plan, task)` null for "What's your plan …?", "How would you fix …", "Outline the approach first.", "… don’t change anything yet.", "… without editing any files." ("Done." still a claim there); "I'll make sure to run the tests next time." null; `changedForStall` true for a successful `memory-store` / `memory-forget-me` (not in the catalog check); the guard remembers a change; the plan nudge says to change nothing when only a plan was asked for. Loop: stand-in `memory-store` ok → "Done!" → 2 requests, stored once, no AGENT-17 line; an answer beside a `files-read` call then "" → 2 requests, the answer is the summary; "Let me read README.md first." beside a read then "" → nudged (3 requests); a plan to a "What's your plan …? Don't change anything yet." task → 1 request; a failing `fledge:` command in attempt 1 (no git tree), "Done." in attempt 2 → no nudge; a stop while the diff is read → no nudge. runTask: a stop while the nudge round's request is in flight → 2 requests, cancelled, no verify. The first four fail on the first head (9e93cda); the stop cases pass on both. |
| `REQ-agent-087` | `tests/agent.safe3a-owner-shell.test.ts`, `tests/scheduler.owner-role.test.ts` | Their fake model ended on a plain "done" after changing nothing, which is now nudged (an extra request); the fake reply is now "ran it" / "The post was not approved, so nothing went out." so each test's request counts and summaries mean what they did. |

## Where these lessons go

- `specs/agent/context.md`
