---
change: bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge
artifact: docs
---

# Docs

`specs/discord/discord.spec.md` Public API, Invariants and Error Cases
describe the in-flight table, the recovery and its fallbacks;
`specs/discord/testing.md` lists the new test file. The module header of
`src/discord/inflight-replies.ts` and the `bridge.ts` header document the
behavior. No operator knob, slash command or env var, so no operator guide
change. The bridge logs one "restart recovery: N interrupted reply(ies)" line
when it recovers anything.
