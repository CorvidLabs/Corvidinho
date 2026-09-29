---
change: discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe
artifact: plan
---

# Plan

1. Re-check the gap on the stacked base (d589638): footer is model + plumbing
   only, `~tok` shows to everyone, answers are cut at 1800 / 1500, gateway
   slices at 1900.
2. `src/discord/rich-reply.ts` (split, plan, post, spend) and the footer /
   `ThinkingStatus` changes in `thinking-status.ts`.
3. Agent: `collectTaskRunStream` returns `usage`, optional `bodyMax`;
   `chatBodyFromTaskResult` optional `max`.
4. Discord spawn client (`bodyMax`, `usage`), bridge chat + pick,
   `/work`, `/session start`, `slash-finish.ts`, `spend-post.ts`,
   `ask-ping.ts` (`withSpendWarningPost` max), gateway (`embed`, 2000).
5. Tests: `tests/discord.rich-reply.unit.test.ts`,
   `tests/discord.rich-replies.test.ts`; prove the integration tests fail on
   the base sources; update footer assertions in the existing tests (time
   segment; owner runs add tokens / cost).
6. Docs (`docs/discord.md`), spec prose / `files:` / testing notes; deltas
   Added REQ-discord-075, Modified REQ-discord-457 and REQ-agent-073.
7. `specsync change approve`, `specsync change check --commit`,
   `specsync change audit`, `specsync check --require-coverage 100`,
   `hi check`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
