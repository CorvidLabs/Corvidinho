---
change: at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets
artifact: plan
---

# Plan

1. Read issue #98 and its comments, the interview record, pr-spend-card.json
   and the approvals and spend-caps rows of m34-defaults.md.
2. Capture SAFE-8.a with `hi` (own commit); `hi check` passes.
3. `src/agent/spend.ts`: `SpendReserveInput`, `reserveApproved` (shared fit
   check), the card constants and `spendCardFields`, `SpendApprovalOptions`,
   test hooks, and the guard's card path (owner lookup, one card at a time,
   re-fit, record, wait note, wait, consume, reserve; a no ends in the ask).
4. `src/agent/spend-notice.ts`: `SpendCardNo`, the card variant of
   `spendCapReachedAsk` without the reply note, `spendScopeLabel`.
5. `src/agent/execute.ts`: pass `approval` (task, project label, Text notes);
   a `SpendCapRefusal` is never a timeout failure. `src/agent/index.ts` exports.
6. `src/discord/spend-card.ts` (the `spend` kind) and its one registration in
   `src/discord/bridge.ts`; `src/discord/ask-ping.ts` comments.
7. Tests `tests/agent.spend-approve.test.ts` and `tests/discord.spend-card.test.ts`;
   fail-on-base proof (main's sources swapped in, plus a probe on main's APIs).
8. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/DAEMON.md`), spec
   prose and testing notes, deltas; approve, check, audit, coverage, `hi check`,
   tsc, `bun test`, fledge verify.
