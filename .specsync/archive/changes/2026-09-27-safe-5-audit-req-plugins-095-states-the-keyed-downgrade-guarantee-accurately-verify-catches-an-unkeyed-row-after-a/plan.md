---
change: safe-5-audit-req-plugins-095-states-the-keyed-downgrade-guarantee-accurately-verify-catches-an-unkeyed-row-after-a
artifact: plan
---

# Plan

1. Reproduce the whole-chain downgrade on the PR head (throwaway test, deleted).
2. Narrow the REQ-plugins-095 text and relink acceptance criterion; mirror it in the delta.
3. Same limit in the plugins spec SAFE-5 paragraph and the `src/audit/log.ts` module comment.
4. Add the keyless-refusal note to the go-live audit-key row.
5. Add a mixed-chain regression test for the narrowed criterion; prove it fails on main's `src/audit/log.ts`.
6. `specsync check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
