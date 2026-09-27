# Lesson bundle — bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Bridge marks a reply interrupted after a restart: in-flight replies are recorded in the shared DB and the next bridge start edits the frozen progress embed to a failed interrupted status (or replies to the request message) instead of leaving it at working forever
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/inflight-replies.ts, src/discord/bridge.ts, src/store/db.ts, tests/discord.inflight-replies.test.ts, tests/watch.session-store.durable.test.ts, tests/discord.ask-ping.test.ts
- **Acceptance**: While the bridge works on a reply to a message it keeps one discord_inflight_replies row (session id, channel id, progress embed id once sent, request message id, start time) and deletes it on every exit path (done, failed exit, ask, worktree refused, thrown error); refused/ignored messages never record a row. On the next bridge start each leftover row is handled once, sequentially and best effort: the bot's own progress embed is edited to the red failed status 'interrupted: Corvidinho restarted before this reply finished — please send it again'; if there is no embed id or the edit fails, the bot replies to the request message with the same text in the same channel; the row is then deleted either way and startup never throws. With no leftover rows nothing is posted or edited. Schema v9 adds the table; a v8 DB migrates and keeps its rows. No new slash command or env var.

## Evidence

- Verification commit: `eb6fea0760cdacd9734a792190dec1d679b174b3`
- Base commit: `aef2cde685e9e9be6f0dc1c4311a916e33981afc`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Crash/restart-recovery audit of `origin/main` (confirmed bug). When the
Discord bridge dies or restarts mid-reply (the update helper's pidfile
SIGTERM, a crash, OOM), the thinking embed stays frozen forever at
"⏳ … · working… · Ns" and the user is never told the reply was lost.

Why: the progress message id lived only in the in-memory `ThinkingStatus`
(`src/discord/thinking-status.ts`, `messageId`, set in `start()`), created
per message in `src/discord/bridge.ts` `onMessage`. No table recorded
in-flight replies, so a new process had nothing to recover from. The only
restart recovery (`WorkStore.recoverAbandoned`, SESSION-WORKTREE-3) covers
/work task rows, not message replies.

HI served: DISCORD-3 (live status instead of a silent void; a frozen
"working…" embed is a silent void), AGENT-3 (an interrupted run should not
look like it is still going).

Constraints: no new slash command, no new env var; only the bot's own
progress message or a reply to the recorded request message in the same
channel; best effort, sequential, never throws out of startup.
Schema: `main` was already at v8 (`pending_ask`, #189) when this was cut,
so the new table is v9.

## From the change's design.md

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
  recorded the same way (request message = the ask stub the pick answered;
  with DISCORD-ASK-7 the stub is also the reused progress message).
- DISCORD-ASK-6/7 collapse (main #204/#208): the row is ended (idempotent)
  the moment `thinking.finalizeContent` succeeds, right after the fallback
  reply is posted, and right after `thinking.dispose()` on the dry path; the
  `finally` still ends it on every other exit. So a row still present at the
  next start always means a reply that never landed, and recovery never
  touches an answer that was already collapsed into its progress message.
- `startBridge`: next to `workStore.recoverAbandoned()`, snapshot the
  leftover rows (before any new reply can add one); after `gateway.start()`
  (REST needs the login token) run the recovery with the gateway
  `editEmbed` / `reply` and `mayPost` = the row's channel or parent channel
  is still allowlisted (DISCORD-5, same check as the router), then log one
  summary line.
- Scope: the @mention / reply chat path and the button-pick run record rows.
  /work and /session start embeds are not covered here.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-311` | `tests/discord.inflight-replies.test.ts` | 20 tests: schema v9 table + v8→v9 migration keeps rows; store lifecycle across a DB reopen (incl. the parent channel); row present with the progress embed id during the run and cleared after success, failed exit, ask, thrown error and worktree refusal; a thread message records the thread and its allowlisted parent; a button pick's resumed run records a row (request id = the ask stub) and clears it; ignored messages record nothing; crash simulation (bridge A hangs mid-reply, bridge B starts on the same DB) edits A's embed to the red interrupted status and deletes the row; failed edit → reply to the request message; no embed id → reply; a thread row with an allowlisted parent is recovered in the thread; a channel (and parent) no longer allowlisted → no edit, no reply, row deleted; edit and reply both throw → start succeeds, row deleted; no rows → no send/edit/reply; recovery is sequential (max 1 Discord call at a time) and `mayPost` false/throwing skips without a Discord call. On main (module and table missing) only the no-rows test passes; with the pre-review bridge the thread-parent, button-pick and allowlist tests fail; 20/20 after. After merging DISCORD-ASK-6/7 (#204/#208), 9 more: with `editMessage` the row is present while the progress message is edited into the answer / Choose stub and gone after (mention success, failed exit, button ask, button pick reusing the stub as progress); a refused collapse posts the fallback reply with the row present, then deletes it; a throwing collapse and the dry path delete it; a reply collapsed before a restart leaves nothing to recover; a crash mid button pick marks the reused stub interrupted. 29/29. |
| `REQ-discord-311` | `tests/watch.session-store.durable.test.ts` | `SCHEMA_VERSION` pinned to 9 and a fresh DB reports it. |
| `REQ-discord-311` | `tests/discord.ask-ping.test.ts` | The v7→v8 `pending_ask` migration test now expects the latest version (v8+) instead of exactly 8, so it still proves the v8 column with v9 on top. |

Also run: `bunx tsc --noEmit`, full `bun test`,
`specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/discord/context.md`
