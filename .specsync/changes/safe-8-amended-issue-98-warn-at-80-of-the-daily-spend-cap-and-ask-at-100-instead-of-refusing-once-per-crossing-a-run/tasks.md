---
change: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
artifact: tasks
---

# Tasks

- [x] Merge `origin/main` into `claude/safe-spend-cap-98`, keeping both sides of every conflict
- [x] Add `spend-cap` to `HumanAskReason` and `askFromUnknown`; add `SpendWarning` and `TaskResult.spendWarning`
- [x] Add `src/agent/spend-notice.ts` (warning line, ask questions, doctor / status lines, validation)
- [x] Add `spend_alerts` and `SpendLedger.noteWarning` (once per cap value per 24 h, IMMEDIATE transaction)
- [x] Add `createSpendGuard` (`fetch` + `finish`); `SpendCapRefusal` carries the ask; keep `withSpendCap`
- [x] Add `readSpendSnapshot`; `spendDoctorCheck` always returns a line
- [x] Hook `createTaskExecute` (guard, Text warning, `onSpendWarning`, `finish`) and `task run` (`result.spendWarning`)
- [x] Update `doctor`, `--help` and `.env.example`
- [x] Discord: spend-cap headline / status / ping key; warning post helper; spawn client validation; bridge reply; scheduler post; `/status` line
- [x] Tests: `tests/agent.spend.test.ts` (updated), `tests/agent.spend-ask.test.ts`, `tests/discord.spend.test.ts`
- [x] Spec prose and `files:` lists; deltas for REQ-agent-098, REQ-cli-098, REQ-discord-098
- [x] Run `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`
