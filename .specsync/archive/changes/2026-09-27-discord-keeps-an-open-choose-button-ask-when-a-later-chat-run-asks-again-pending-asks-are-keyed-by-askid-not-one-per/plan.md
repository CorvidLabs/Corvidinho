---
change: discord-keeps-an-open-choose-button-ask-when-a-later-chat-run-asks-again-pending-asks-are-keyed-by-askid-not-one-per
artifact: plan
---

# Plan

1. Reproduce on main with a bridge fixture (open ask A, side-chat run asks B,
   press A).
2. `types.ts`: add `openAsks`.
3. `session-store.ts`: askId-keyed `setPendingAsk`, new `clearPendingAsk`
   and `findPendingAsk`; serialize/parse object-or-array in `pending_ask`.
4. `bridge.ts`: press lookup via `findPendingAsk`; clear only the pressed or
   answered ask; cancel unchanged.
5. Regression tests in `tests/discord.ask-ephemeral.test.ts` (fail on main,
   pass on branch); docs + spec prose; REQ-discord-044 delta.
6. `specsync check`, `bunx tsc --noEmit`, `bun test`, fledge verify.
