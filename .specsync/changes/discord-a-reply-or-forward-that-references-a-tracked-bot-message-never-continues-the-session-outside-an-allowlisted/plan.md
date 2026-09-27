---
change: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
artifact: plan
---

# Plan

1. Regression test `tests/discord.forward-channel.test.ts` (fails on main).
2. Own-channel gate at the top of `routeMessage`; drop the session-channel fallbacks.
3. `replyReferenceMessageId` in the gateway; MessageCreate uses it.
4. Spec: files list, Public API, invariant; delta REQ-discord-212 (Added).
5. `specsync change check --commit`, `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
