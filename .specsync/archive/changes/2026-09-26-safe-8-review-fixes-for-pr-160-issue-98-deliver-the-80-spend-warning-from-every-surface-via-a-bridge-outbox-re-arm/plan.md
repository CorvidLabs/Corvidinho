---
change: safe-8-review-fixes-for-pr-160-issue-98-deliver-the-80-spend-warning-from-every-surface-via-a-bridge-outbox-re-arm
artifact: plan
---

# Plan

1. Reproduce finding 4 against `SpendLedger` (second crossing inside 24 h is
   silent) and confirm findings 1–3 in the code.
2. Move `spend_alerts` into `src/agent/spend-alerts.ts` with `delivered_at`,
   per-cap re-arm rows and cap ping rows; hook re-arm into `reserve` and
   `noteWarning`.
3. Add the outbox (`spend-outbox.ts`) and the Discord glue
   (`spend-post.ts`); wire the bridge chat reply, `/work`, `/session start`,
   schedule posts; `blocked` work status; daemon logs.
4. Ask text: operator action, no yes/no question, no reply hint; generic
   summary at the cap.
5. Tests; spec prose and deltas in the amended change (re-approve); this
   change for the uncovered paths; check, audit, coverage, tsc, bun test,
   fledge verify.
