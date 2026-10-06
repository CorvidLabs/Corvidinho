---
change: after-the-one-nudge-a-stalled-run-moves-to-the-next-stronger-model-in-the-order-i-set-and-says-so-agent-17-agent-17-a
artifact: context
---

# Context

Issue #86 (loop guards). AGENT-17 is captured on main (Leif's 2026-09-28
interview, round 2): "If it only plans, or says 'Done.' without changing
anything, it gets one nudge, then moves to a stronger model I've
configured." #335 (REQ-agent-087) built the nudge; a second stall stood with
"moving to a stronger model is not built yet", because what "stronger" means
was not decided.

Leif decided it in round 16 (2026-10-06, recorded in the 2026-09-28
interview file): "an explicit order the owner sets in the model list; no
order set = no escalation (the one nudge still happens)". This change
captures that as AGENT-17.a with `hi` (first commit) and builds it:

> AGENT-17.a — A stronger model is the next one in an order I set in the
> model list; with no order set it doesn't move, and the one nudge still
> happens.

The model list is AGENT-13's (#320): `CORVIDINHO_LLM_MODEL` and the
per-tier keys, comma lists of `kind:model` entries parsed by
`parseModelChain` / `modelChainForTier` (`src/agent/providers.ts`); the list
order is AGENT-11's fallback chain (#325, `callChain`), not a strength order.

Constraints: HI-first, never rank by price or benchmarks, no new table or
schema bump, smallest optional config; spend on the new model must count
(AUTONOMY-8 asks apply); delegate / council workers follow the same rule
inside their own run. #232 / #233 scope untouched.
