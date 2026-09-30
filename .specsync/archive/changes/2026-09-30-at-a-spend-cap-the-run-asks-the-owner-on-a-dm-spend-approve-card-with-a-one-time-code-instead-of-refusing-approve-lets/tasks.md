---
change: at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets
artifact: tasks
---

# Tasks

- [x] Read #98 (body, comments, v0.0.36 rollup), the interview record (round 13), pr-spend-card.json and the m34 approvals and spend-caps defaults.
- [x] Capture SAFE-8.a with `hi` in its own commit; `hi check` passes.
- [x] `src/agent/spend.ts`: `reserveApproved` (with a shared fit / insert), `SPEND_CARD_*` constants, `spendCardFields`, `SpendApprovalOptions`, `setSpendCardTestHooks`, the guard's card path.
- [x] `src/agent/spend-notice.ts`: `SpendCardNo` / `SpendCardOutcome`, the card ask without the reply note, `spendScopeLabel`.
- [x] `src/agent/execute.ts` (approval wiring; `SpendCapRefusal` never a timeout failure) and `src/agent/index.ts` exports.
- [x] `src/discord/spend-card.ts`, its registration in `src/discord/bridge.ts` (nothing else there), `src/discord/ask-ping.ts` comments.
- [x] Tests: `tests/agent.spend-approve.test.ts` (18) and `tests/discord.spend-card.test.ts` (6).
- [x] Fail-on-base proof: with main's sources swapped in both files fail (they cannot load), and a probe on main's APIs records no card and makes no call; restored, all pass.
- [x] Docs: `docs/discord.md` ("The spend card", the engine intro, the must-ask table, the file map, the SAFE-14.a DM), `docs/DISCORD-GO-LIVE.md` (E.1 spend bullet, E.9 fallback note), `docs/DAEMON.md` (the daemon cannot DM the card).
- [x] Spec: deltas (REQ-agent-198 and REQ-discord-198 Added; REQ-agent-098 and REQ-agent-114 Modified), spec prose and files lists, testing notes.
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.
