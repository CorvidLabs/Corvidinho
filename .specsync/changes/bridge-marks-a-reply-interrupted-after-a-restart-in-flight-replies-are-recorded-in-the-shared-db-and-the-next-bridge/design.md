---
change: bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge
artifact: design
---

# Design

- Schema v9: `discord_inflight_replies(id, session_id, channel_id,
  parent_channel_id NULL, progress_message_id NULL, request_message_id,
  started_at)`; `parent_channel_id` is the allowlisted channel a thread
  reply belongs to (null outside threads). Ids and a
  timestamp only (no free text, so no SAFE-6 scrub target). No FK to
  `discord_sessions`: a session ended mid-run must not cascade the row away.
- New `src/discord/inflight-replies.ts`: `InflightReplyStore`
  (`begin` / `setProgressMessage` / `end` / `list`) and
  `recoverInterruptedReplies({ store, rows, editEmbed, reply })`, which for
  each row, one at a time: edits the progress embed to
  `buildThinkingEmbed({ phase: "error", description: "❌ interrupted: …" })`;
  if there is no embed id or the edit returns false / throws, replies to the
  request message in the row's channel with the same text; then deletes the
  row either way. An optional `mayPost(row)` gate runs first: false (or a
  throw) skips the row with no Discord call and still deletes it. Never
  throws; returns edited / replied / failed / skipped counts.
- `bridge.ts` `onMessage`: `begin` right before `thinking.start()`,
  `setProgressMessage` right after it, and a `try/finally` around the rest of
  the reply so `end` runs on every exit (done, failed exit, ask, worktree
  refused, thrown). All row writes go through a best-effort wrapper: a DB
  error logs a warning and the reply still runs.
- `bridge.ts` `onComponent` (DISCORD-ASK button pick): the resumed run is
  recorded the same way (request message = the ask stub the pick answered).
- `startBridge`: next to `workStore.recoverAbandoned()`, snapshot the
  leftover rows (before any new reply can add one); after `gateway.start()`
  (REST needs the login token) run the recovery with the gateway
  `editEmbed` / `reply` and `mayPost` = the row's channel or parent channel
  is still allowlisted (DISCORD-5, same check as the router), then log one
  summary line.
- Scope: the @mention / reply chat path and the button-pick run record rows.
  /work and /session start embeds are not covered here.
