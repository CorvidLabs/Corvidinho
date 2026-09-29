---
change: every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment
artifact: design
---

# Design

- Reuse `clipKeepingRoleNote(text, max, clip)` from `src/agent/task-summary.ts`
  (REQ-agent-333) at every cap; no parallel helper for the note itself.
- `src/discord/ask-ping.ts` (already imported by the scheduler and both slash
  handlers, and home of `ASK_REPLY_MAX` 1900):
  - `POST_SUMMARY_MAX = 1500` and `clipPostSummary(summary, headLength = 0)`
    = `clipKeepingRoleNote(summary, max(0, min(1500, 1900 - headLength)), plain head cut)`.
  - `appendPostLine` clips `content` to `room` with `clipKeepingRoleNote` and
    the old `…` cut (guarded so a zero budget yields "" rather than
    `slice(0, -1)`); without the note the output is byte-identical.
- Scheduler: `summary = clipPostSummary(result.summary)` (run row + ask
  context unchanged in shape); post `head + clipPostSummary(summary, head.length)`.
- `/work`: `summary = clipPostSummary(result.summary)` is still what the
  session thread records; the answer is `head + clipPostSummary(summary,
  head.length)` (asks keep `ask.content` as before). `/session start` the same.
- WATCH: `clipKeepingRoleNote(scrubSecrets(summary).trim(), 1200, head cut)` —
  scrub stays before the clip (REQ-watch-231).
- Trade-off: without the note every cut lands where it did before (a plain
  head cut at the same length; the `/work` fit equals what the gateway's
  1900 slice kept), so only summaries ending with the note change.
- No env var, config key, flag, slash command, table or schema change.
