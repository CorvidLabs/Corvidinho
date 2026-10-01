---
change: a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers
artifact: plan
---

# Plan

1. Read issue #98 and its comments, the interview record (round 13),
   pr-spend-caps-c.json and the spend-caps rows of m34-defaults.md.
2. Capture SAFE-16.a with `hi` (own commit); `hi check` passes.
3. Ledger: `unknown` status, `unknownCalls`, `covering`, `recordUnknown`,
   `settle` for unknown rows; trips and warnings carry the unknown count.
4. Guard: share the card wait; hold a covered unpriced call for an
   unknown-price card; approve → record `unknown` → send; no → the unpriced
   ask with the card outcome; no owner → the operator ask as before.
5. Text: `formatSpend` on every owner spend line, the card fields, the card
   variant of the unpriced ask, the unknown-price outcome line.
6. AUTONOMY-8 surfaces: WATCH records spend-cap stops and the bridge DMs them
   once per cap episode; a schedule's spend-cap stop gets the owner's
   Continue next to Cancel.
7. Tests: `tests/agent.spend-unknown.test.ts`, the cross-surface
   `tests/spend.surfaces.test.ts`, updated schedule and spend tests;
   fail-on-base proof.
8. Docs, spec prose and testing notes, deltas; approve, check, audit,
   coverage, `hi check`, tsc, `bun test`, fledge verify.
