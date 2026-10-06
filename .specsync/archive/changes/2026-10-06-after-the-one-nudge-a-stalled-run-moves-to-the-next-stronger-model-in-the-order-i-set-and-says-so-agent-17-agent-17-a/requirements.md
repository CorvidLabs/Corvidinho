---
change: after-the-one-nudge-a-stalled-run-moves-to-the-next-stronger-model-in-the-order-i-set-and-says-so-agent-17-agent-17-a
artifact: requirements
---

# Requirements

- AGENT-17 (on main, `hi/agent.md`, Leif's 2026-09-28 interview, round 2):
  "If it only plans, or says 'Done.' without changing anything, it gets one
  nudge, then moves to a stronger model I've configured."
- AGENT-17.a (captured in this change with `hi`, Leif's 2026-09-28
  interview record, round 16): "A stronger model is the next one in an order
  I set in the model list; with no order set it doesn't move, and the one
  nudge still happens."
- Added: REQ-agent-088 (the move to the next stronger model in the order).
- Modified: REQ-agent-087 (a stall after the nudge moves when REQ-agent-088
  finds a model, else stands with the reason; the stall guard's `escalate`
  step), REQ-cli-009 (help / `.env.example` list the key), REQ-cli-262 (the
  test preload unsets it).
- Kept: AGENT-11 / REQ-agent-080 (fallback chain, unchanged), AGENT-5 /
  REQ-agent-079 (per-tier lists), SAFE-8 / SAFE-14 / SAFE-16 / AUTONOMY-8
  (spend guard and asks apply to the new model), AGENT-16 / REQ-agent-086,
  SAFE-13, AUTONOMY-1 / AUTONOMY-7 (never a stall), GITHUB-9 authors (the
  stronger model is recorded as an author when it answers).
- One new optional env key (`CORVIDINHO_LLM_MODEL_ORDER`); no config key,
  flag, slash command, HumanAsk reason, NDJSON field, table or schema
  version.
