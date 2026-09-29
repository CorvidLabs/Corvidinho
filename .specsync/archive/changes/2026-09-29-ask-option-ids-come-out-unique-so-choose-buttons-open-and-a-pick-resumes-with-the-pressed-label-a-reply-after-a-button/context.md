---
change: ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button
artifact: context
---

# Context

W12 bug sweep, wave 0 of Leif's 2026-09-28 interview ("W12 bug sweep (2
confirmed seeds)"; no new criteria). Two surviving sweep records
(`ask-option-id-collision`, `expired-button-ask-restated`), both
reproduced on `origin/main`:

1. `normalizeAskOptions` (`src/agent/ask-options.ts`) never
   de-duplicated option ids. A repeated explicit id, two ids equal once cut
   to 32 chars, or a position fallback (`String(i + 1)`, used for a missing,
   empty or secret-looking id and for plain string options) equal to an
   earlier id gave two options the same id. The option buttons then share
   one `custom_id` (`cvask:pick:<askId>:<id>`), which Discord rejects, so
   the Choose press fails; and `findOptionLabel` returns the first match,
   so a press on the second button resumed with the first label.
2. `onMessage` (`src/discord/bridge.ts`) checked only `session.pendingAsk`
   in the thin-ack/cancel branch, never `isAskExpired`. The newest button
   ask, once timed out, stayed pending (expiry was only acted on by a press
   or when promoting after a clear), so every thin reply restated it with a
   requester ping and a fresh Choose button whose press only answers "that
   choice expired", and the agent did not run.

Constraints: HI DISCORD-ASK-1/3/5 and REQ-discord-044/045 and REQ-agent-045
already say what should happen; nothing is captured here. #232/#233 scope is
untouched. A separate PR (branch `claude/w12-ask5-late-press-expired`)
handles a late *press* on a gone ask in `onComponent`; this change does not
touch `onComponent` or `SessionStore`. No new env var, config key, slash
command, table, column or schema version; `specs/` only through SpecSync.
