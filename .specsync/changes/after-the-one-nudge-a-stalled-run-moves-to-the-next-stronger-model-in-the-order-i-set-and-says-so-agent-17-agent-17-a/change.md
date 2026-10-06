---
id: after-the-one-nudge-a-stalled-run-moves-to-the-next-stronger-model-in-the-order-i-set-and-says-so-agent-17-agent-17-a
state: draft
type: feature
base_commit: 94c2e479b7b95812010e77a7c4812e94b4f497b7
---

# After the one nudge a stalled run moves to the next stronger model in the order I set, and says so (AGENT-17, AGENT-17.a)

## Intent

After the one nudge a stalled run moves to the next stronger model in the order I set, and says so (AGENT-17, AGENT-17.a)

## Affected Canonical Specs

- `agent`
- `cli`

## Acceptance Criteria

- AGENT-17 (on main) and AGENT-17.a (captured in this PR from Leif's 2026-09-28 interview, round 16) hold: in every task run (chat, /session, /work, buttons, schedules, WATCH, delegate workers, the CLI) a reply that still only plans, or says 'Done.' with nothing changed, after its one AGENT-17 nudge moves the rest of that run to the next model after the current one in the optional CORVIDINHO_LLM_MODEL_ORDER (same kind:model entries as the model list, weakest first) that the run's tier lists, has its key and has not failed in the run - the stalled reply is dropped and the same request goes to that model (no second nudge, no tool round used), once per run, with an [operator] AGENT-17 Text line and one plain closing line '(stronger model: <a> only planned | said it was done with nothing changed after the nudge, so <b> took over)' that clips keep; its calls go through the SAFE-8/SAFE-14 spend guard counted under its own model (AUTONOMY-8 asks apply); never a weaker or unordered model, never ranked by price or benchmark; with no order set, a current model not in the order, already at the top, or no stronger model available it does not move and the reply stands with an operator line naming why, the one nudge still happening; --help and .env.example list the key and the test preload unsets it; tests/agent.stall-escalate.test.ts (fake LLM: order set -> one nudge then one move with the notice; no order -> nudge only; at the top -> no move) fails on the base sources and passes on the branch

## No-spec Rationale

Not applicable
