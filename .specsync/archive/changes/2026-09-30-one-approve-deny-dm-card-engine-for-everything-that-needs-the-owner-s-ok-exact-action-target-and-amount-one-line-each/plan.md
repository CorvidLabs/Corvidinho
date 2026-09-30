---
change: one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each
artifact: plan
---

# Plan

1. Schema v14 (`src/store/db.ts`): `approval_requests`, `approval_codes`,
   `forget_requests.action_hash`; `SCRUB_TARGETS` gets `approval_requests`.
2. `src/approvals/code.ts` (issue / verify-and-consume / void / purge) and
   `src/approvals/store.ts` (`ApprovalStore`, action hash, classes).
3. `src/discord/approve-card.ts`: decisions `code` / `submit`, code-step
   buttons, code form, `formatApprovalCard`, `formatApprovalTextParts`.
4. `src/discord/approval-cards.ts`: the engine and `storedApprovalKind`.
5. `src/discord/forget-card.ts`: the `forget` kind (destructive) over
   `ForgetRequestStore` (+ `resetCard`, action hash) and
   `previewForgetTargets` (`src/memory/forget.ts`); `createForgetCards`
   kept as the one-kind engine.
6. `src/discord/bridge.ts`: route every `cvok:` interaction (typed text only
   from submit, owner re-check each time), start/stop the poll, keep the
   after-chat and tick passes, `deliverApprovalCards`.
7. `src/discord/gateway.ts`: `boundedContent` on the four paths;
   `rich-reply.ts` defang before split + `DISCORD_DM_MAX`; ask ephemeral
   bound.
8. Tests (new + forget tests through the code step), docs, spec prose,
   testing, deltas; verify.
