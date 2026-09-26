---
change: safe-8-review-fixes-for-pr-160-issue-98-deliver-the-80-spend-warning-from-every-surface-via-a-bridge-outbox-re-arm
artifact: tasks
---

# Tasks

- [x] Reproduce the silent second crossing against `SpendLedger`
- [x] `src/agent/spend-alerts.ts`: `delivered_at`, per-cap `rearm` rows under 70%, `cap` ping rows, claims in IMMEDIATE transactions
- [x] `src/agent/spend-outbox.ts`: `takeWarning` / `release`, `claimCapPing`
- [x] `src/discord/spend-post.ts`: `askPingOwner`, `slashOwnerNotice`, `replyWithOwnerNotice`
- [x] `/work` and `/session start` handle `result.ask`; `WorkTaskStatus` `blocked`
- [x] Daemon logs `spend.warning` / `run.needs_human`
- [x] Tests in `tests/agent.spend-ask.test.ts` and `tests/discord.spend.test.ts`
- [x] Run `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`
