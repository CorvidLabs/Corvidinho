---
change: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
artifact: tasks
---

# Tasks

- [x] Repro on main: forward of a tracked bot message into a non-allowlisted channel spawns the agent and posts there.
- [x] Regression test `tests/discord.forward-channel.test.ts` that fails before the fix.
- [x] Own-channel allowlist gate before every `routeMessage` path; session channel no longer stands in.
- [x] Gateway: `replyReferenceMessageId` drops forwards and other-channel references.
- [x] Spec files list, Public API, invariant; delta REQ-discord-212 (Added).
- [x] Verify: specsync check, tsc, bun test, fledge verify lane.
