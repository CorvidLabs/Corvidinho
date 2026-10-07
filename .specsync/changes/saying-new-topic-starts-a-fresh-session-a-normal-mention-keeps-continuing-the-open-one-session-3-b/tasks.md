---
change: saying-new-topic-starts-a-fresh-session-a-normal-mention-keeps-continuing-the-open-one-session-3-b
artifact: tasks
---

# Tasks

- [x] Capture SESSION-3.b with `hi` (`hi/session.md`, `INTENT.md`); `hi check` green.
- [x] `src/discord/new-topic.ts`: `newTopicRequest`, `NEW_TOPIC_ACK`.
- [x] `src/discord/types.ts`: `RouteAction` kind `new_topic` (`session`, `open?`, `prompt`).
- [x] `src/discord/message-router.ts`: `newTopicRoute` on the thread, reply, retained and @mention paths, after every gate.
- [x] `src/discord/session-store.ts`: `retire` (shared with `purgeIfExpired`), `endForNewTopic`, `supersede` (skipped by `getByUserChannel`).
- [x] `src/discord/bridge.ts`: wait on the open session's turn, gate re-check, park, run the request or post the ack; a stop during the wait reaches the open session's run; SAFE-13 drops a fresh session.
- [x] Tests: `tests/discord.new-topic.test.ts`; fail-on-base proof recorded in testing.md.
- [x] `docs/discord.md`; `discord.spec.md`; `specs/discord/testing.md`; deltas (Added REQ-discord-479, Modified REQ-discord-019).
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
