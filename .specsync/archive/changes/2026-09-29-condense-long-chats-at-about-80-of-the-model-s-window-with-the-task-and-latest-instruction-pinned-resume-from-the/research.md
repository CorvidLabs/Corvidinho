---
change: condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the
artifact: research
---

# Research

- Prompt path: the bridge builds the whole conversation part of the prompt
  (`withSessionThread` block + new message + pending-ask block), then
  prepends image, identity and memory blocks, and spawns
  `task run --task <prompt>` (`src/discord/agent-client.ts`). The child adds
  the system prompt, project instructions, SpecSync briefing and tool schemas;
  the bridge cannot see those, so it measures what it controls.
- The prompt travels as ONE argv item: Linux caps a single argument at
  MAX_ARG_STRLEN = 128 KiB. A JS string's UTF-8 is at most 3 bytes per UTF-16
  unit, so 32,000 chars stay under 96 KB, leaving room for the identity and
  memory blocks. Any window above ~10k tokens is capped there.
- Token estimate: the codebase already counts chars/4 (`approxTokens`,
  `src/plugins/toolCost.ts`, PLUGIN-6; the thinking embed's fallback). There
  is no configured window anywhere (`thinking-status.ts` only has an optional
  `contextWindow` field for display).
- Planning module selection (`planningSelectionText`, REQ-agent-004) drops a
  paragraph that starts with `[Corvidinho `; the summary must add no blank
  line.
- Expiry paths: `purgeIfExpired` (lazy, on every lookup), `loadFromDb`
  (rows expired while the bridge was down), `endSession` (worktree failure,
  abandoned /work). Each must keep the conversation before the rows go.
- `rescrubDatabase` selects `rowid, id, <cols>`: a new table needs an `id`
  column; JSON columns are scrubbed value by value (`scrubJsonText`).
- SQLite JSON1 (`json_each`) is available in bun:sqlite: answer-id and
  participant lookups need no second table.
- DISCORD-6 rate limit (10 messages / 60 s per user, real clock) bounds how
  many turns one bridge test can drive.
