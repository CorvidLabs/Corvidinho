---
change: discord-keeps-an-open-choose-button-ask-when-a-later-chat-run-asks-again-pending-asks-are-keyed-by-askid-not-one-per
artifact: tasks
---

# Tasks

- [x] Reproduce the replaced button ask on main (bridge fixture)
- [x] `SessionStub.openAsks` (types.ts)
- [x] askId-keyed `setPendingAsk`, `clearPendingAsk`, `findPendingAsk`; object-or-array `pending_ask` (session-store.ts)
- [x] Bridge press lookup by askId; clear only the pressed/answered ask (bridge.ts)
- [x] Regression tests (fail on main, pass on branch)
- [x] docs/discord.md, discord.spec.md prose + scenario, testing.md
- [x] REQ-discord-044 delta (Modified)
- [x] specsync check, tsc, bun test, fledge verify
