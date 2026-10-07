---
change: my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the
artifact: plan
---

# Plan

1. Capture SAFE-18.a with `hi` (own commit); `hi check` passes.
2. `src/memory/card.ts` (+ index exports); remove `src/memory/confirm.ts`.
3. `plugins/memory/commands.ts`: `ownerCard` replaces `twoPhase`; new
   descriptions; `--confirm` refused; fail closed without a bridge
   conversation.
4. `src/discord/approval-cards.ts` `memoryApprovalKind`; bridge registration;
   Discord spawn clears the token env; `src/agent/tools.ts` hint.
5. Tests: `tests/memory.forget-card.test.ts` (engine + fake model),
   `tests/memory.plugins.test.ts` (two-phase cases replaced),
   `tests/memory.spawn-env.test.ts` (regression), session-thread test without
   the token helper; fail-on-base proof (swap base sources in, run, restore).
6. Docs, spec prose / files lists, module testing evidence, deltas.
7. `specsync change approve`, `change check --commit`, `change audit`,
   `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
