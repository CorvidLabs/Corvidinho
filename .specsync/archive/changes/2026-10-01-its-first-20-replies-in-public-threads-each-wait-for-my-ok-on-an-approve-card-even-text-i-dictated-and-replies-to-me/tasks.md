---
change: its-first-20-replies-in-public-threads-each-wait-for-my-ok-on-an-approve-card-even-text-i-dictated-and-replies-to-me
artifact: tasks
---

# Tasks

- [x] Confirm AUTONOMY-10 / 10.a are captured on main (no new capture); `hi check` passes.
- [x] `src/discord/public-reply-gate.ts`: count in `schema_meta`, public-thread lookup (fail closed), hold with the fixed line, `reply` card kind, consume-and-count, not-posted lines, stamp constant, test seams.
- [x] Gateway `isPublicThread` (live: channel fetch, types 11 / 10); `ThinkingStatus.hold`; `AgentRunChatOpts.replyPublicThread` and the always-written stamp.
- [x] Bridge: the `reply` kind on the engine; chat, ask-pick and thin-ack holds (pending ask and turn after the hold; ⏹ Stopped / bridge-closing paths kept); the scheduler poster; `close()` on stop; `publicReplies` in the slash context.
- [x] `holdSlashReply`; `/session start` and `/work` hold before the pending ask, the turn and the owner notice.
- [x] Scheduler `modelText` on result and ask posts; `discord-send-file` `mustAsk`; the must-ask boundary test lists it.
- [x] `tests/discord.public-reply-gate.test.ts` (28 tests, one real `task run` against the fake model); fail-on-base proof recorded in testing.md.
- [x] docs/discord.md, docs/DISCORD-GO-LIVE.md, spec prose, deltas and module testing evidence updated.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
