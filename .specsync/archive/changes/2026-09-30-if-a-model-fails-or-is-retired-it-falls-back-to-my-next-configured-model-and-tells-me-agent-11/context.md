---
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
artifact: context
---

# Context

Issue #80 (M3 "Real dev teammate"), slice providers-3 of the M3/M4 plan.
Leif confirmed AGENT-11 in the 2026-09-28 interview (round 2: "#79/#80
providers: capture all four … AGENT-11 fallback chain with notice"); it is
already captured in `hi/agent.md`: "If a model fails or is retired, it falls
back to my next configured model and tells me." Nothing new is captured here.

What was wrong on main (507d97b): #320 (AGENT-13 / AGENT-10) made the model
keys ordered comma lists (`parseModelChain`, `modelChainForTier`) but called
only the head: a retired model (404 / 410), an outage or a malformed reply
failed the run, and docs, `.env.example` and specs said "only the first entry
is called for now".

Constraints: specs only through SpecSync; smallest change on #320's
`src/agent/providers.ts`; no retries or backoff (m34 default); never fail over
on a spend-cap stop, a Deny or a card lapse (round 4: a cap stop is not a model
failure); no persistence across processes; the owner learns of a failover in a
run not theirs from the reply note and an `llm.fallback` warn log line, no DM;
tokens and cost stay owner-only (DISCORD-15.a, SAFE-14.a); v1 off-chain;
`createTaskExecute`'s role / catalog gate code, `src/agent/tools.ts` and the
shell gate are untouched (safe3a-gate builds there in parallel); #232/#233
scope untouched. Out: an owner DM on failover (only if Leif confirms), retries,
cost-based routing, AGENT-12 (idle timeout / turn cap) and AGENT-17 escalation.
