---
change: if-it-only-plans-or-says-done-without-changing-anything-it-gets-one-nudge-to-the-same-model-a-second-stall-stands-with
artifact: design
---

# Design

- **Pure helpers** in `src/agent/loop-guards.ts` (next to AGENT-16):
  `stallKind(text)` → `"plan" | "done-claim" | null`; `nothingChanged`
  (async, takes the diff probe); `stallNudge`, `stallNudgedNote`,
  `stallStandsNote`; `createStallNudgeGuard` (`next()` → `"nudge"` once,
  then `"stand"`).
- **One predicate.** `changedState` now calls the new
  `isStateChangingTool(name)` (`STATE_CHANGING_TOOLS` or a `fledge:`
  plugin command), which AGENT-17 also uses for "the round's catalog offers a
  state-changing tool". The repeat guard already receives
  `changedState(name, result)` for every result in `after`; it now also
  remembers that a change happened (`sawChange()`), so AGENT-17 reads it
  without a second pass over results or an edit to the dispatch region.
- **"Changed"** = `sawChange()` (every tool result of the run, file or not:
  a GitHub comment changes no file), or a tool run whose edits no result
  reports (the shell, a Fledge command, a worker), or, with a git tree, a
  non-empty real diff since the gate's baseline. `ExecuteContext` gains the
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
  offers, declines, toy / demo / joke and deferrals. No "Let's", no "I need
  to", no "yes"-led replies (Q&A), no "Here's the plan" (Q&A about plans).
- **Alternatives rejected.** Classifying the task text (Q&A vs. work) —
  AGENT-17 is about the reply; a second `changedState` pass in the
  dispatch loop — the guard already sees every result; nudging per attempt
  — "one nudge" read as once per run (the conservative reading); escalating
  on the second stall — not built until "stronger" is decided.
