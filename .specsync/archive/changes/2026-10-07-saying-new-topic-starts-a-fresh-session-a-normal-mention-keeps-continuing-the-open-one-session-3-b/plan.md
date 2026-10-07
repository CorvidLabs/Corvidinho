---
change: saying-new-topic-starts-a-fresh-session-a-normal-mention-keeps-continuing-the-open-one-session-3-b
artifact: plan
---

# Plan

1. Capture SESSION-3.b with `hi` (own commit; `hi check`).
2. `src/discord/new-topic.ts`: `newTopicRequest` (the phrase at the start
   only) and `NEW_TOPIC_ACK`.
3. `RouteAction` kind `new_topic` (`types.ts`); `routeMessage` returns it,
   after every gate, on each path where the author's session would continue
   or an @mention would start one, creating the fresh session and
   superseding the open one (`message-router.ts`).
4. `SessionStore`: `retire` (idle expiry's steps, shared with
   `purgeIfExpired`), `endForNewTopic`, `supersede` (skipped by
   `getByUserChannel`).
5. Bridge: take the fresh session's turn, then the open session's turn (wait
   for its run), re-check the gates after a wait, park the open session, then
   run the request (or post the ack); a SAFE-13 refusal drops the fresh
   session.
6. Tests `tests/discord.new-topic.test.ts`; fail-on-base proof (swap the
   base's `message-router.ts`, `types.ts`, `session-store.ts`,
   `bridge.ts`; keep `new-topic.ts`; run; restore).
7. Docs (`docs/discord.md`), spec prose, module testing evidence, deltas.
8. `specsync change approve` → `change check --commit` → `change audit` →
   `specsync check --require-coverage 100` → `hi check` →
   `bunx tsc --noEmit` → `bun test` → `fledge lanes run verify
   --non-interactive`.
