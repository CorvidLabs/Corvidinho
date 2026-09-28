---
change: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
artifact: tasks
---

# Tasks

- [x] Merge `origin/main` into `claude/safe-spend-cap-98`, keeping both sides of every conflict
- [x] Add `spend-cap` to `HumanAskReason` and `askFromUnknown`; add `SpendWarning` and `TaskResult.spendWarning`
- [x] Add `src/agent/spend-notice.ts` (warning line, ask questions, doctor / status lines, validation)
- [x] Add `spend_alerts` and `SpendLedger.noteWarning` (IMMEDIATE transaction)
- [x] Add `createSpendGuard` (`fetch` + `finish`); `SpendCapRefusal` carries the ask; keep `withSpendCap`
- [x] Add `readSpendSnapshot`; `spendDoctorCheck` always returns a line
- [x] Hook `createTaskExecute` (guard, Text warning, `onSpendWarning`, `finish`) and `task run` (`result.spendWarning`)
- [x] Update `doctor`, `--help` and `.env.example`
- [x] Discord: spend-cap headline / status / ping key; warning post helper; spawn client validation; bridge reply; scheduler post; `/status` line
- [x] Review: move `spend_alerts` to `src/agent/spend-alerts.ts` with `delivered_at`, per-cap `rearm` rows under 70% and `cap` ping rows
- [x] Review: add `src/agent/spend-outbox.ts` (`takeWarning` / `release`, `claimCapPing`) and wire it into the bridge chat reply, `/work`, `/session start` and schedule posts
- [x] Review: add `src/discord/spend-post.ts` (`askPingOwner`, `slashOwnerNotice`, `replyWithOwnerNotice`); `/work` and `/session start` handle `result.ask` (blocked, paused, fresh owner post); `WorkTaskStatus` `blocked`; `/status` counts it
- [x] Review: spend-cap questions end with the operator action (no yes/no question, no reply hint); generic `SPEND_CAP_SUMMARY`; CLI text prints the question; daemon logs `spend.warning` / `run.needs_human`
- [x] Tests: `tests/agent.spend.test.ts`, `tests/agent.spend-ask.test.ts`, `tests/discord.spend.test.ts` (re-arm, outbox, cross-process delivery, ping dedupe, `/work` / `/session`, schedule, daemon)
- [x] Spec prose and `files:` lists; deltas for REQ-agent-098, REQ-cli-098, REQ-discord-098
- [x] Run `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`
