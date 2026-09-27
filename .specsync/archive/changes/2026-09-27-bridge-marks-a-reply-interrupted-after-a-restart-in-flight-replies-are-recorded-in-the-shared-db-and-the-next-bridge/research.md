---
change: bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge
artifact: research
---

# Research

- `src/discord/bridge.ts` `onMessage`: `new ThinkingStatus(...)` then
  `thinking.start()` sends the progress embed; exit paths are worktree
  refused (return), agent throw (rethrow), ask / ok / failed (done or fail +
  final reply). None persisted anything about the reply in flight.
- `src/discord/thinking-status.ts`: `progressMessageId` getter exists;
  `buildThinkingEmbed({ phase: "error", ... })` gives the red failed styling
  (`THINKING_COLORS.error`, footer `… · error`) that `fail()` uses.
- `src/discord/gateway.ts`: live `editEmbed` returns false on any error
  (message deleted, no access); `reply` returns null on error and uses
  `failIfNotExists: false`. REST needs `client.login` (in `gateway.start()`)
  first, so the Discord calls must come after start.
- `src/store/db.ts`: additive migrations keyed on `schema_meta.version`
  (v6 added a table with `CREATE TABLE IF NOT EXISTS`); tests pin
  `SCHEMA_VERSION` in `tests/watch.session-store.durable.test.ts`.
- Repro on `main`: the new `tests/discord.inflight-replies.test.ts` fails
  (no `discord_inflight_replies` table, no recovery module; a second bridge
  start on the same DB never edits the first bridge's frozen embed).
