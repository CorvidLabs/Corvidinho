---
change: before-each-call-the-spend-guard-counts-a-worst-case-reply-toward-the-cap-the-model-s-listed-maximum-output-or-128k
artifact: tasks
---

# Tasks

- [x] Capture AUTONOMY-8.a with `hi` (own commit); `hi check` passes.
- [x] `src/agent/spend.ts`: `maxOutputTokens` on every priced model, `REPLY_RESERVE_DEFAULT_TOKENS`, `replyReserveTokens`, the worst-case estimate; header notes; `src/agent/index.ts` exports.
- [x] `tests/agent.spend-reserve.test.ts` (11 tests); `tests/agent.spend.test.ts` updated for the new estimate and table shape.
- [x] Fail-on-base proof recorded in testing.md (8 fail on main's sources, 11 pass on the branch).
- [x] docs/discord.md and docs/DISCORD-GO-LIVE.md; agent spec prose, delta (REQ-agent-298 added, REQ-agent-098 modified) and module testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
