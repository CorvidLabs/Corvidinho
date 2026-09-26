---
change: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
artifact: plan
---

# Plan

1. Merge `origin/main` into `claude/safe-spend-cap-98` (brings in the
   AUTONOMY-1/2 ask path from #163); resolve conflicts keeping both sides.
2. Types: `HumanAskReason` + `spend-cap`; `SpendWarning`;
   `TaskResult.spendWarning`; `askFromUnknown` accepts `spend-cap`.
3. New `src/agent/spend-notice.ts` (pure text + validation).
4. `src/agent/spend.ts`: `spend_alerts` table and `SpendLedger.noteWarning`;
   `createSpendGuard` (`fetch` + `finish`), `SpendCapRefusal` carries the
   ask; `readSpendSnapshot`; `spendDoctorCheck` always returns a line.
5. Hooks: `createTaskExecute` (guard, `onSpendWarning`, `finish`),
   `task run` (`result.spendWarning`), doctor line, `--help`,
   `.env.example`.
6. Discord: ask-ping headline/status/ping key, warning post helper, spawn
   client validation, bridge reply + `/status` line, scheduler post.
7. Tests (mocked fetch, localhost mock LLM, fake gateway / sh bin), spec
   prose, deltas, artifacts; approve; `change check --commit`; audit,
   coverage, tsc, bun test, fledge verify.
