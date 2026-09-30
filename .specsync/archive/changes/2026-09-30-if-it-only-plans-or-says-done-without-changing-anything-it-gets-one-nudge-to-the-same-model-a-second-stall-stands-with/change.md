---
id: if-it-only-plans-or-says-done-without-changing-anything-it-gets-one-nudge-to-the-same-model-a-second-stall-stands-with
state: archived
type: feature
base_commit: 81ceb4a1423189b50ce25df34363b26b50426d1d
---

# If it only plans or says 'Done.' without changing anything, it gets one nudge to the same model; a second stall stands with an operator note (AGENT-17, nudge half)

## Intent

If it only plans or says 'Done.' without changing anything, it gets one nudge to the same model; a second stall stands with an operator note (AGENT-17, nudge half)

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- AGENT-17 (captured on main, Leif's 2026-09-28 interview round 2), the nudge half, holds: in every task run (chat, /session, /work, buttons, schedules, WATCH, delegate and council workers, the CLI) a final reply that the narrow stallKind heuristic calls only a plan or a short 'Done.'-style or empty claim gets exactly one harness nudge to the same model (a user message starting [Corvidinho harness — AGENT-17], never using up a tool round) when the round's catalog offers a state-changing tool, no SAFE-13 trip, not the read tier, and nothing changed (the verify gate's real git diff where there is a git tree, unreadable = changed, plus the changedState predicate over every tool result and any tool whose edits no result reports); one nudge per run; a second stall stands with an [operator] AGENT-17 Text note (no stronger-model step yet); Q&A, social replies, clarifying questions (AUTONOMY-1), 'let me know' and offers, AUTONOMY-7 declines and toy demos, and code are never nudged; tests/agent.stall-nudge.test.ts fails on the base sources and passes on the branch

## No-spec Rationale

Not applicable
