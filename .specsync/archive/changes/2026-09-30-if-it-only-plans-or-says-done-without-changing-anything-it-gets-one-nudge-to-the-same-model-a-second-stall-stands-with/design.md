---
change: if-it-only-plans-or-says-done-without-changing-anything-it-gets-one-nudge-to-the-same-model-a-second-stall-stands-with
artifact: design
---

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
