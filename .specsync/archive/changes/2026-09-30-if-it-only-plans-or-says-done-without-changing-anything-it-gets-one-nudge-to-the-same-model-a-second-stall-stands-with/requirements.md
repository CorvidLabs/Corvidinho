---
change: if-it-only-plans-or-says-done-without-changing-anything-it-gets-one-nudge-to-the-same-model-a-second-stall-stands-with
artifact: requirements
---

# Requirements

- AGENT-17 (captured on main, `hi/agent.md`, Leif's 2026-09-28 interview,
  round 2): "If it only plans, or says 'Done.' without changing anything, it
  gets one nudge, then moves to a stronger model I've configured." This
  change builds the nudge half; the move to a stronger model is not built
  (loop-guards-c), so AGENT-17 is partial.
- Kept: AGENT-16 / REQ-agent-086 (the repeat guard and `changedState`),
  AGENT-14 / AGENT-15 / REQ-agent-085 (the verify gate and its real diff),
  AGENT-11 / REQ-agent-080 (the model chain), SAFE-8 / SAFE-14 / SAFE-15
  (the spend guard), SAFE-13 / REQ-agent-071 (the injection drop),
  AUTONOMY-1 (clarifying questions), AUTONOMY-7 (declines and toy demos),
  MEMORY-9 / REQ-agent-067 (the recall follow-up runs first), AGENT-9 /
  REQ-agent-312 (soft-land).
- Added: REQ-agent-087.
- No new env var, config key, flag, slash command, HumanAsk reason, NDJSON
  field, table or schema version.
