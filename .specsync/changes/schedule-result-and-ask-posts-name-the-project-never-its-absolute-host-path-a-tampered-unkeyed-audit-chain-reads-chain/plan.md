---
change: schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain
artifact: plan
---

# Plan

1. Regression tests (fail on the base): two cases in
   `tests/scheduler.ask-outbox.test.ts` (the step agent also records the
   prompt it was given) and one in `tests/audit.log.test.ts`.
2. `scheduleTitle` → `projectLabel`; `formatAuditLine` → BROKEN when
   `keyAvailable || keyedRows === 0`.
3. Specs: discord and plugins invariants and testing sections; deltas
   REQ-discord-353 and REQ-plugins-095 (Modified). `docs/discord.md`,
   `docs/DISCORD-GO-LIVE.md`.
4. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
