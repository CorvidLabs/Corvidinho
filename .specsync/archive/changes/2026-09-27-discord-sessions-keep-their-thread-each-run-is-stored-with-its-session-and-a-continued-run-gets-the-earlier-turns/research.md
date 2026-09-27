---
change: discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns
artifact: research
---

# Research

- Entry points that run the agent on a Discord session: `bridge.ts`
  `onMessage` (start and `continue_session` from the router: reply to a
  tracked bot message, thread message, same user's @mention in the channel),
  `onComponent` (button pick resume), `command-handlers/session.ts`
  (`/session start`) and `command-handlers/work.ts` (`/work`). Scheduled
  runs and WATCH do not use Discord sessions.
- Prompt order today: pending-ask wrapper → image paths → identity →
  memory (each prepends a block). `humanText` is the raw message and the only
  SAFE-4 confirm-token source (`agent-client.ts`).
- Store precedent without a schema bump: `spend_ledger` / `spend_alerts`
  (`src/agent/spend.ts`), CREATE TABLE IF NOT EXISTS by the owning module,
  listed in `SCRUB_TARGETS` (REQ-discord-098). `rescrubDatabase` selects
  `rowid, id, <columns>`, so the table needs an `id` column.
- `discord_sessions` is written with `INSERT … ON CONFLICT DO UPDATE` (never
  REPLACE), so an ON DELETE CASCADE child is not wiped by `touch`.
- The Choose stub text (`formatAskStub`) does not include the question, so a
  button ask's answer turn needs the question and choices to read in context.
- Argv size: one `--task` argument is capped by Linux at 128 KiB; the 6000
  character block keeps well inside it next to the memory block.
