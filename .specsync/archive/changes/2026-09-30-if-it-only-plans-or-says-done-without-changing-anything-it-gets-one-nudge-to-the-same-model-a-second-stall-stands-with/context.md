---
change: if-it-only-plans-or-says-done-without-changing-anything-it-gets-one-nudge-to-the-same-model-a-second-stall-stands-with
artifact: context
---

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
